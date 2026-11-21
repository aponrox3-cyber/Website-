/**
 * Site analyzer: turns a finished copy of a website into a "how it is built"
 * report. It only looks at what the server already sent to every visitor
 * (HTML, scripts, styles, headers, public files); it sends no extra requests.
 *
 * Works best on copies made by the browser engine (which also records response
 * headers and the live page's JavaScript globals). Copies made by wget are
 * analysed from their files alone.
 *
 * Writes _analysis/report.json and _analysis/report.html into the copy and
 * returns { report, summary }.
 */
var fs = require('fs');
var path = require('path');
var SIGNATURES = require('./signatures');
var render = require('./render');

var MAX_PAGES = 400;          // pages parsed in detail
var JS_FILES_SCANNED = 40;    // biggest scripts searched for clues
var JS_BYTES_PER_FILE = 400 * 1024;
var CSS_FILES_SCANNED = 30;

var EXT_CATEGORY = {
  html: 'html', htm: 'html', js: 'script', mjs: 'script', css: 'style',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', avif: 'image', ico: 'image',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font', eot: 'font',
  mp4: 'media', webm: 'media', mov: 'media', mp3: 'media', wav: 'media', ogg: 'media',
  json: 'data', xml: 'data', txt: 'data', csv: 'data', map: 'data', pdf: 'document', zip: 'other'
};

function categoryOf(file, type) {
  var t = String(type || '').split(';')[0].trim().toLowerCase();
  if (t === 'text/html' || t === 'application/xhtml+xml') return 'html';
  if (/javascript|ecmascript/.test(t)) return 'script';
  if (t === 'text/css') return 'style';
  if (t.indexOf('image/') === 0) return 'image';
  if (t.indexOf('font/') === 0 || /font-woff|vnd.ms-fontobject/.test(t)) return 'font';
  if (t.indexOf('video/') === 0 || t.indexOf('audio/') === 0) return 'media';
  if (t === 'application/json' || /xml$/.test(t)) return 'data';
  var ext = path.extname(file).slice(1).toLowerCase();
  return EXT_CATEGORY[ext] || 'other';
}

function readText(dir, rel, limit) {
  try {
    var fd = fs.openSync(path.join(dir, rel), 'r');
    try {
      var size = fs.fstatSync(fd).size;
      var len = Math.min(size, limit || size);
      var buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 0);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch (e) { return ''; }
}

function walk(dir, rel, out) {
  var entries;
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (e) { return; }
  entries.forEach(function (e) {
    var r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(dir, r, out); else out.push(r);
  });
}

function loadEntries(dir, target) {
  var info = null;
  try { info = JSON.parse(fs.readFileSync(path.join(dir, '_manifest.json'), 'utf8')); } catch (e) { /* wget copy */ }
  var entries = [];
  if (info && info.entries) {
    Object.keys(info.entries).forEach(function (url) {
      var e = info.entries[url];
      entries.push({ url: url, file: e.file, type: e.type || '', headers: e.headers || {}, status: e.status });
    });
  } else {
    var files = [];
    walk(dir, '', files);
    files.forEach(function (f) {
      if (f.charAt(0) === '_') return;
      var parts = f.split('/');
      parts[0] = parts[0].replace(/\+(\d+)$/, ':$1');   // wget writes host:port as host+port
      entries.push({ url: 'http://' + parts.join('/').replace(/@/g, '?'), file: f, type: '', headers: {} });
    });
  }
  entries.forEach(function (e) {
    try { e.size = fs.statSync(path.join(dir, e.file)).size; } catch (err) { e.size = 0; }
    e.cat = categoryOf(e.file, e.type);
    try { e.host = new URL(e.url).hostname.toLowerCase(); } catch (err) { e.host = e.host || ''; }
  });
  return { info: info, entries: entries };
}

// ---------------------------------------------------------------- HTML parsing

function attrs(tag) {
  var out = {}, re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
  return out;
}

function decode(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '));
}

function parsePage(html, url, mainHosts) {
  var page = { url: url };
  var t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  page.title = t ? decode(t[1]).slice(0, 200) : '';
  var meta = {};
  (html.match(/<meta\b[^>]*>/gi) || []).forEach(function (tag) {
    var a = attrs(tag);
    var key = (a.name || a.property || a['http-equiv'] || '').toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = decode(a.content).slice(0, 300);
  });
  page.description = meta.description || '';
  page.robots = meta.robots || '';
  page.generator = meta.generator || '';
  page.viewport = !!meta.viewport;
  page.ogTitle = meta['og:title'] || '';
  page.ogImage = meta['og:image'] || '';
  page.twitterCard = meta['twitter:card'] || '';
  var lang = /<html[^>]*\blang=["']?([\w-]+)/i.exec(html);
  page.lang = lang ? lang[1] : '';
  var canon = /<link\b[^>]*rel=["']?canonical["']?[^>]*>/i.exec(html);
  page.canonical = canon ? (attrs(canon[0]).href || '') : '';
  page.h1 = (html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []).slice(0, 3).map(function (h) { return stripTags(h).slice(0, 150); });
  page.headings = { h1: (html.match(/<h1\b/gi) || []).length, h2: (html.match(/<h2\b/gi) || []).length, h3: (html.match(/<h3\b/gi) || []).length };

  var types = [];
  (html.match(/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []).forEach(function (s) {
    try {
      var data = JSON.parse(s.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, ''));
      (Array.isArray(data) ? data : (data['@graph'] || [data])).forEach(function (d) {
        if (d && d['@type']) types = types.concat(d['@type']);
      });
    } catch (e) { /* invalid JSON-LD */ }
  });
  page.structuredData = types.filter(function (x, i) { return typeof x === 'string' && types.indexOf(x) === i; }).slice(0, 10);

  var internal = [], external = [];
  (html.match(/<a\b[^>]*href=[^>]*>/gi) || []).forEach(function (tag) {
    var href = attrs(tag).href;
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) return;
    try {
      var u = new URL(href, url);
      if (!/^https?:$/.test(u.protocol)) return;
      if (mainHosts.indexOf(u.hostname.toLowerCase()) !== -1) internal.push(u.pathname); else external.push(u.hostname.toLowerCase());
    } catch (e) { /* ignore */ }
  });
  page.internalLinks = internal.length;
  page.externalLinks = external;
  var imgs = html.match(/<img\b[^>]*>/gi) || [];
  page.images = imgs.length;
  page.imagesMissingAlt = imgs.filter(function (i) { var a = attrs(i); return a.alt === undefined || a.alt === ''; }).length;
  page.forms = (html.match(/<form\b/gi) || []).length;
  page.inputs = (html.match(/<(?:input|textarea|select)\b/gi) || []).length;
  page.scripts = (html.match(/<script\b/gi) || []).length;
  page.words = stripTags(html).split(' ').filter(Boolean).length;
  return page;
}

// ---------------------------------------------------------------- helpers

function count(list) {
  var m = {};
  list.forEach(function (x) { if (x) m[x] = (m[x] || 0) + 1; });
  return Object.keys(m).map(function (k) { return { value: k, count: m[k] }; })
    .sort(function (a, b) { return b.count - a.count; });
}

function firstGroup(m) {
  if (!m) return null;
  for (var i = 1; i < m.length; i++) if (m[i]) return m[i];
  return null;
}

var GENERIC_FONTS = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[\w-]+|inherit|initial|unset|-apple-system|blinkmacsystemfont|var\(.*\)|emoji|math)$/i;

// ---------------------------------------------------------------- main

module.exports = function analyze(dir, target, options) {
  options = options || {};
  var loaded = loadEntries(dir, target);
  var info = loaded.info, entries = loaded.entries;
  var runtime = (info && info.runtime) || {};
  var cookies = ((info && info.cookies) || []).join(' ');

  var startHost = (target.hostname || '').toLowerCase();
  var base = startHost.replace(/^www\./, '');
  var mainHosts = [base, 'www.' + base];
  var isMain = function (e) { return mainHosts.indexOf(e.host) !== -1; };

  // ---- pages (main site only), preferring the JavaScript-rendered copy
  var htmlEntries = entries.filter(function (e) { return e.cat === 'html' && isMain(e) && e.file.indexOf('_rendered/') !== 0; });
  var pages = [];
  var homeRaw = '', homeEntry = null;
  htmlEntries.slice(0, MAX_PAGES).forEach(function (e) {
    var rendered = path.join('_rendered', e.file).split(path.sep).join('/');
    var haveRendered = fs.existsSync(path.join(dir, rendered));
    var html = readText(dir, haveRendered ? rendered : e.file, 1.5 * 1024 * 1024);
    var page = parsePage(html, e.url, mainHosts);
    page.size = e.size;
    page.status = e.status || null;
    page.rendered = haveRendered;
    page.file = e.file;
    pages.push(page);
    var p; try { p = new URL(e.url).pathname; } catch (err) { p = ''; }
    if (!homeEntry && (p === '/' || /^\/(?:index\.html?)?$/.test(p))) {
      homeEntry = e;
      homeRaw = readText(dir, e.file, 600 * 1024) + '\n' + (haveRendered ? html.slice(0, 600 * 1024) : '');
    }
  });
  if (!homeEntry && htmlEntries.length) {
    homeEntry = htmlEntries[0];
    homeRaw = readText(dir, homeEntry.file, 600 * 1024);
  }

  // ---- text corpus for technology detection
  var scripts = entries.filter(function (e) { return e.cat === 'script'; }).sort(function (a, b) { return b.size - a.size; });
  var styles = entries.filter(function (e) { return e.cat === 'style'; }).sort(function (a, b) { return b.size - a.size; });
  var jsText = scripts.slice(0, JS_FILES_SCANNED).map(function (e) { return readText(dir, e.file, JS_BYTES_PER_FILE); }).join('\n');
  var cssText = styles.slice(0, CSS_FILES_SCANNED).map(function (e) { return readText(dir, e.file, 300 * 1024); }).join('\n');
  var urlText = entries.map(function (e) { return e.url; }).join('\n');
  var blob = homeRaw + '\n' + urlText + '\n' + jsText.slice(0, 6 * 1024 * 1024);

  var allHeaders = {};
  entries.forEach(function (e) { Object.keys(e.headers || {}).forEach(function (k) { if (!(k in allHeaders)) allHeaders[k] = e.headers[k]; }); });
  var homeHeaders = (homeEntry && homeEntry.headers) || {};
  Object.keys(homeHeaders).forEach(function (k) { allHeaders[k] = homeHeaders[k]; });
  var headerText = Object.keys(allHeaders).map(function (k) { return k + ': ' + allHeaders[k]; }).join('\n');

  // ---- technologies
  var tech = [], seen = {};
  SIGNATURES.forEach(function (s) {
    var hit = (s.rt && runtime[s.rt]) || (s.re && s.re.test(blob)) || (s.h && s.h.test(headerText)) || (s.ck && s.ck.test(cookies));
    if (!hit || seen[s.n]) return;
    seen[s.n] = true;
    var version = null;
    if (s.rt && typeof runtime[s.rt] === 'string') version = runtime[s.rt];
    if (!version && s.n === 'React' && runtime.reactVersion) version = runtime.reactVersion;
    if (!version && s.n === 'jQuery' && runtime.jquery) version = runtime.jquery;
    if (!version && s.v) version = firstGroup(s.v.exec(blob));
    if (!version && /^(?:nginx|Apache|LiteSpeed|Caddy|PHP)$/.test(s.n)) {
      version = firstGroup(new RegExp('(?:server|x-powered-by):\\s*' + s.n + '/([\\d.]+)', 'i').exec(headerText));
    }
    tech.push({ name: s.n, category: s.c, version: version });
  });
  var techByCategory = {};
  tech.forEach(function (t) { (techByCategory[t.category] = techByCategory[t.category] || []).push(t); });

  // ---- assets
  var byCat = {}, totalBytes = 0;
  entries.forEach(function (e) {
    var c = byCat[e.cat] = byCat[e.cat] || { files: 0, bytes: 0 };
    c.files++; c.bytes += e.size; totalBytes += e.size;
  });
  var largest = entries.slice().sort(function (a, b) { return b.size - a.size; }).slice(0, 15)
    .map(function (e) { return { url: e.url, type: e.cat, bytes: e.size }; });
  var thirdParty = {};
  entries.forEach(function (e) {
    if (isMain(e) || !e.host) return;
    var h = thirdParty[e.host] = thirdParty[e.host] || { host: e.host, files: 0, bytes: 0 };
    h.files++; h.bytes += e.size;
  });
  var thirdPartyList = Object.keys(thirdParty).map(function (k) { return thirdParty[k]; })
    .sort(function (a, b) { return b.files - a.files; }).slice(0, 30);

  // ---- API endpoints and data files
  var dataFiles = entries.filter(function (e) {
    return e.cat === 'data' && /json/i.test(e.type + e.file) && !/\.map$|_manifest|package(?:-lock)?\.json|manifest\.json$/i.test(e.file);
  }).slice(0, 50).map(function (e) { return { url: e.url, bytes: e.size }; });
  var endpoints = {};
  var epRe = /["'`](\/(?:api|graphql|rest|trpc|v\d)\/[\w\-./{}$:]*|https?:\/\/[\w.-]+\/(?:api|graphql|rest|trpc|v\d)[\w\-./]*)["'`]/g, em;
  while ((em = epRe.exec(jsText)) && Object.keys(endpoints).length < 80) endpoints[em[1]] = true;
  var thirdApis = (jsText.match(/https?:\/\/[\w.-]*(?:supabase\.co|firebaseio\.com|execute-api\.[\w.-]+\.amazonaws\.com|appspot\.com|workers\.dev|vercel\.app|netlify\.app|herokuapp\.com)[\w\-./]*/g) || []);
  thirdApis = count(thirdApis).slice(0, 20).map(function (x) { return x.value; });

  // ---- design: colours and fonts
  var cssAll = cssText + '\n' + (homeRaw.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
  var colors = count((cssAll.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) || []).map(function (c) {
    c = c.toLowerCase();
    return c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
  })).slice(0, 12);
  var fontNames = [];
  (cssAll.match(/font-family\s*:\s*[^;}{]+/gi) || []).forEach(function (decl) {
    decl.replace(/font-family\s*:\s*/i, '').split(',').forEach(function (f) {
      f = f.replace(/!important/i, '').replace(/["']/g, '').trim();
      if (f && !GENERIC_FONTS.test(f)) fontNames.push(f);
    });
  });
  var gf = /fonts\.googleapis\.com\/css2?\?([^"'\s)]+)/gi, gm;
  var googleFonts = [];
  while ((gm = gf.exec(blob))) {
    (gm[1].match(/family=([^&:;]+)/g) || []).forEach(function (f) { googleFonts.push(decodeURIComponent(f.slice(7)).replace(/\+/g, ' ')); });
  }
  var customProps = (cssAll.match(/--[\w-]+\s*:/g) || []).length;

  // ---- SEO / site-level
  var robots = entries.filter(function (e) { return isMain(e) && /(?:^|\/)robots\.txt$/i.test(e.file); })[0];
  var sitemaps = entries.filter(function (e) { return isMain(e) && /sitemap[^/]*\.xml$/i.test(e.file); });
  var sitemapUrls = 0;
  sitemaps.forEach(function (e) { sitemapUrls += (readText(dir, e.file, 2 * 1024 * 1024).match(/<loc>/gi) || []).length; });
  var seo = {
    https: /^https:/i.test(target.href),
    robotsTxt: !!robots,
    robotsPreview: robots ? readText(dir, robots.file, 3000).split(/\r?\n/).slice(0, 20) : [],
    sitemapFiles: sitemaps.length,
    sitemapUrls: sitemapUrls,
    favicon: /<link[^>]+rel=["'](?:shortcut )?icon/i.test(homeRaw) || entries.some(function (e) { return /favicon\.(?:ico|png|svg)$/i.test(e.file); }),
    webManifest: /manifest\.(?:webmanifest|json)/i.test(homeRaw),
    viewportMeta: pages.length ? pages.filter(function (p) { return p.viewport; }).length + '/' + pages.length + ' pages' : 'n/a',
    pagesWithoutTitle: pages.filter(function (p) { return !p.title; }).length,
    pagesWithoutDescription: pages.filter(function (p) { return !p.description; }).length,
    imagesMissingAlt: pages.reduce(function (n, p) { return n + p.imagesMissingAlt; }, 0),
    structuredDataTypes: count([].concat.apply([], pages.map(function (p) { return p.structuredData; }))).slice(0, 10).map(function (x) { return x.value; })
  };

  // ---- response headers (informational)
  var wanted = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];
  var headerReport = {
    server: allHeaders.server || null,
    poweredBy: allHeaders['x-powered-by'] || null,
    compression: allHeaders['content-encoding'] || null,
    cacheControl: allHeaders['cache-control'] || null,
    cookiesSet: (allHeaders['set-cookie-names'] || '').split(',').filter(Boolean),
    present: wanted.filter(function (h) { return homeHeaders[h] || allHeaders[h]; }),
    missing: wanted.filter(function (h) { return !(homeHeaders[h] || allHeaders[h]); }),
    recorded: !!Object.keys(allHeaders).length
  };

  // ---- original source code (from source maps)
  var sources = { available: false };
  var srcFiles = [];
  walk(dir, '_sources', srcFiles);
  if (srcFiles.length) {
    var rel = srcFiles.map(function (f) { return f.split('/').slice(1).join('/'); });  // drop "_sources/"
    var exts = count(rel.map(function (f) { return path.extname(f).toLowerCase() || '(none)'; })).slice(0, 10);
    var tops = count(rel.map(function (f) { return f.split('/').slice(0, 3).join('/'); })).slice(0, 25);
    var notable = rel.filter(function (f) { return /(?:^|\/)(?:package\.json|vite\.config|next\.config|tailwind\.config|tsconfig|webpack\.config|svelte\.config|nuxt\.config)/i.test(f); }).slice(0, 15);
    var deps = [];
    srcFiles.filter(function (f) { return /(?:^|\/)package\.json$/.test(f); }).slice(0, 2).forEach(function (f) {
      try {
        var pj = JSON.parse(readText(dir, f, 200 * 1024));
        deps = deps.concat(Object.keys(pj.dependencies || {}), Object.keys(pj.devDependencies || {}));
      } catch (e) { /* ignore */ }
    });
    sources = {
      available: true, files: rel.length, extensions: exts, folders: tops, notableFiles: notable,
      typescript: rel.some(function (f) { return /\.tsx?$/.test(f); }),
      dependencies: deps.slice(0, 60),
      sample: rel.slice(0, 60)
    };
  }

  // ---- site structure and external links
  var routes = pages.map(function (p) { try { return new URL(p.url).pathname; } catch (e) { return p.url; } }).sort();
  var externalDomains = count([].concat.apply([], pages.map(function (p) { return p.externalLinks; }))).slice(0, 20);
  var spa = !!(runtime.react || runtime.vue || runtime.angular || runtime.next || runtime.nuxt) &&
    pages.length > 0 && pages.every(function (p) { return p.words < 40; });

  // ---- plain-language summary
  var names = function (cat) { return (techByCategory[cat] || []).map(function (t) { return t.name + (t.version ? ' ' + t.version : ''); }); };
  var parts = [];
  var fw = names('JavaScript framework').concat(names('CMS'), names('Site builder'), names('E-commerce'));
  if (fw.length) parts.push('built with ' + fw.join(', ')); else parts.push('looks like a hand-written or static site');
  var bt = names('Build tool'); if (bt.length) parts.push('bundled by ' + bt.join(', '));
  var css = names('CSS framework'); if (css.length) parts.push('styled with ' + css.join(', '));
  var host = names('CDN / hosting').concat(names('Web server')); if (host.length) parts.push('served via ' + host.join(', '));
  var be = names('Back-end language').concat(names('Back-end framework')); if (be.length) parts.push('back end hints: ' + be.join(', '));
  var headline = base + ' ' + parts.join('; ') + '. ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') +
    ' and ' + entries.length + ' file' + (entries.length === 1 ? '' : 's') + ' were saved.' + (spa ? ' Content is generated by JavaScript in the browser.' : '');

  var report = {
    generatedAt: new Date().toISOString(),
    target: target.href,
    headline: headline,
    engine: info ? 'browser' : 'wget',
    runtime: runtime,
    technologies: tech,
    totals: { files: entries.length, bytes: totalBytes, pages: pages.length, hosts: Object.keys(thirdParty).length + 1 },
    assets: { byCategory: byCat, largest: largest, thirdPartyHosts: thirdPartyList },
    api: { dataFiles: dataFiles, endpointsInCode: Object.keys(endpoints), externalServices: thirdApis },
    design: {
      colors: colors, fonts: count(fontNames).slice(0, 10), googleFonts: count(googleFonts).map(function (x) { return x.value; }),
      cssCustomProperties: customProps, themeColor: runtime.themeColor || null
    },
    seo: seo,
    headers: headerReport,
    sources: sources,
    structure: { routes: routes.slice(0, 300), externalDomains: externalDomains, singlePageApp: spa },
    pages: pages.slice(0, MAX_PAGES)
  };

  var summary = {
    headline: headline,
    technologies: tech.map(function (t) { return { name: t.name, version: t.version, category: t.category }; }),
    pages: pages.length, files: entries.length, bytes: totalBytes,
    apiEndpoints: report.api.endpointsInCode.length + dataFiles.length,
    sourceFiles: sources.available ? sources.files : 0
  };

  try {
    var out = path.join(dir, '_analysis');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    var htmlReport = render(report);
    fs.writeFileSync(path.join(out, 'report.html'), htmlReport);
    if (options.publicCopy) {
      fs.mkdirSync(path.dirname(options.publicCopy), { recursive: true });
      fs.writeFileSync(options.publicCopy, htmlReport);
    }
  } catch (e) { /* the report is a bonus; never fail the download over it */ }

  return { report: report, summary: summary };
};
