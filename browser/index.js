/**
 * Browser engine: copies a website the way a visitor's browser receives it.
 *
 * wget only downloads files that are written in the HTML. Modern sites (React,
 * Vue, Next.js, Lovable, ...) build their pages with JavaScript, so wget sees a
 * nearly empty shell. This engine drives a real headless Chromium through
 * Playwright and therefore saves:
 *
 *  - every file the browser actually loads: HTML, JS bundles, CSS, fonts,
 *    images, JSON/API (GET) responses, manifests, ... from the site and its CDNs
 *  - the fully rendered page (after JavaScript ran and lazy content loaded)
 *  - every page it can reach: links in the rendered page, sitemap.xml, robots
 *  - original source code, rebuilt from JavaScript/CSS source maps when the
 *    site publishes them (folder _sources/)
 *  - a manifest (_manifest.json) and a tiny offline server (serve.js) so the
 *    copy can be opened and tested on your own computer
 *
 * What no tool can copy: server-side code, databases and secrets. Those never
 * leave the server, only their output does.
 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var netguard = require('../netguard');

var USER_AGENT = process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

var CONCURRENCY = Math.max(1, Number(process.env.CRAWL_CONCURRENCY) || 3);
var MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES) || 0;          // 0 = unlimited
var MAX_QUERY_VARIANTS = Number(process.env.CRAWL_MAX_QUERY_VARIANTS) || 20;
var PAGE_TIMEOUT_MS = Number(process.env.CRAWL_PAGE_TIMEOUT_MS) || 60000;
var KEEP_VENDOR_SOURCES = process.env.CRAWL_VENDOR_SOURCES === '1';

var FILE_LIKE = /\.(pdf|zip|gz|tgz|rar|7z|exe|dmg|apk|mp4|webm|mov|mp3|wav|ogg|png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?|woff2?|ttf|otf|eot|map)$/i;

var MIME_EXT = {
  'text/html': '.html', 'application/json': '.json', 'text/css': '.css',
  'application/javascript': '.js', 'text/javascript': '.js', 'image/svg+xml': '.svg',
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'text/plain': '.txt', 'application/xml': '.xml', 'text/xml': '.xml'
};

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* try next */ }
  try { return require('playwright-chromium'); } catch (e) { /* none */ }
  return null;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function short(text) { return crypto.createHash('sha1').update(text).digest('hex').slice(0, 8); }

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

function cleanSegment(seg) {
  var out = seg.replace(/[<>:"|?*\\\x00-\x1f]/g, '_').replace(/^\.+$/, '_');
  if (out.length > 120) {
    var ext = path.extname(out).slice(0, 10);
    out = out.slice(0, 100) + '-' + short(seg) + ext;
  }
  return out;
}

function hostFolder(u) {
  return u.hostname + (u.port ? '+' + u.port : '');
}

/** Maps a URL (and its content type) to a relative path inside the copy. */
function relativeFileFor(u, contentType, forceHtml) {
  var type = (contentType || '').split(';')[0].trim().toLowerCase();
  var p = safeDecode(u.pathname);
  var segs = p.split('/').filter(Boolean).map(cleanSegment);
  var isHtml = forceHtml || type === 'text/html' || type === 'application/xhtml+xml';
  var endsWithSlash = /\/$/.test(p) || segs.length === 0;

  if (endsWithSlash) {
    segs.push('index.html');
  } else {
    var last = segs[segs.length - 1];
    var hasExt = /\.[a-z0-9]{1,8}$/i.test(last);
    if (isHtml && !/\.html?$/i.test(last)) {
      // /about  ->  about/index.html  (so /about/team can still exist)
      segs.push('index.html');
    } else if (!hasExt) {
      segs[segs.length - 1] = last + (MIME_EXT[type] || '.bin');
    }
  }
  if (u.search) {
    var name = segs[segs.length - 1];
    var ext = path.extname(name);
    segs[segs.length - 1] = name.slice(0, name.length - ext.length) + '@' + short(u.search) + ext;
  }
  return path.join.apply(path, [hostFolder(u)].concat(segs));
}

function writeInside(root, rel, data) {
  var full = path.resolve(root, rel);
  if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('path escapes the download folder');
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  return rel;
}

/** Writes the original source files hidden inside a source map. */
function extractSources(root, host, map) {
  var count = 0;
  if (!map || !Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) return 0;
  map.sources.forEach(function (source, i) {
    var content = map.sourcesContent[i];
    if (typeof content !== 'string') return;
    var name = String(source).replace(/^[a-z][a-z0-9+.-]*:\/\/\/?/i, '');
    var parts = name.split(/[\\/]+/).filter(function (s) { return s && s !== '.' && s !== '..'; });
    if (!parts.length) return;
    if (!KEEP_VENDOR_SOURCES && parts.indexOf('node_modules') !== -1) return;
    try {
      writeInside(root, path.join.apply(path, ['_sources', host].concat(parts.map(cleanSegment))), content);
      count++;
    } catch (e) { /* skip unwritable name */ }
  });
  return count;
}

/**
 * Crawls the site. Resolves when finished or stopped; rejects with
 * code NO_BROWSER when no usable Chromium exists (the caller then falls back
 * to wget).
 *
 * options: { target: URL, dir, send(payload), scope: 'site'|'page' }
 * returns: { promise, stop() }
 */
module.exports = function crawl(options) {
  var target = options.target;
  var dir = options.dir;
  var send = options.send;
  var scope = options.scope === 'page' ? 'page' : 'site';

  var stopped = false;
  var browser = null;
  var stop = function () {
    stopped = true;
    if (browser) browser.close().catch(function () {});
  };

  var promise = (async function () {
    var pw = loadPlaywright();
    if (!pw) {
      var missing = new Error('Playwright is not installed');
      missing.code = 'NO_BROWSER';
      throw missing;
    }
    try {
      browser = await pw.chromium.launch({ headless: true });
    } catch (err) {
      var noBrowser = new Error('Chromium could not be started: ' + String(err.message).split('\n')[0]);
      noBrowser.code = 'NO_BROWSER';
      throw noBrowser;
    }
    if (stopped) { await browser.close().catch(function () {}); return; }

    var baseDomain = target.hostname.replace(/^www\./i, '').toLowerCase();
    var startFolder = target.pathname.replace(/[^/]*$/, '');

    var context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block' // so every request is visible to us
    });

    // Block requests (including redirects) to private/internal addresses.
    if (netguard.enabled) {
      await context.route('**/*', async function (route) {
        try {
          var ru = new URL(route.request().url());
          if (/^https?:$/.test(ru.protocol) && !(await netguard.isPublicHost(ru.hostname))) {
            return await route.abort('blockedbyclient');
          }
          await route.continue();
        } catch (e) { /* page already closed */ }
      });
    }

    var manifest = {};          // url -> { file, type }
    var saved = new Set();      // urls already stored
    var partial = new Set();    // urls the browser only fetched in ranges (video/audio)
    var savedCount = 0;

    function save(url, body, contentType, forceHtml, folder) {
      var u;
      try { u = new URL(url); } catch (e) { return; }
      var rel = relativeFileFor(u, contentType, forceHtml);
      if (folder) rel = path.join(folder, rel);
      try {
        writeInside(dir, rel, body);
      } catch (e) {
        try { rel = writeInside(dir, path.join('_other', short(url) + '-' + cleanSegment(path.basename(rel))), body); }
        catch (e2) { return; }
      }
      if (!folder) {
        manifest[url] = { file: rel.split(path.sep).join('/'), type: contentType || '' };
        savedCount++;
        send({ progress: '200 OK  ' + url });
      }
    }

    // Every response the browser receives is stored exactly as delivered.
    context.on('response', async function (res) {
      try {
        if (res.request().method() !== 'GET') return;
        var url = res.url();
        if (!/^https?:/i.test(url) || saved.has(url)) return;
        var status = res.status();
        if (status === 206) { partial.add(url); return; }
        if (status < 200 || status >= 300 || status === 204) return;
        saved.add(url);
        var body = await res.body();
        save(url, body, res.headers()['content-type']);
      } catch (e) { /* redirects and aborted requests have no body */ }
    });

    async function fetchAndSave(url, rejectHtml) {
      if (saved.has(url)) return null;
      try {
        if (!(await netguard.isPublicHost(new URL(url).hostname))) return null;
        var res = await context.request.get(url, { timeout: PAGE_TIMEOUT_MS, maxRedirects: 10 });
        if (!res.ok()) return null;
        // Single-page apps answer every unknown address with their home page;
        // that is not a real robots.txt or sitemap.
        if (rejectHtml && /text\/html/i.test(res.headers()['content-type'] || '')) return null;
        saved.add(url);
        var body = await res.body();
        save(url, body, res.headers()['content-type']);
        return { body: body, type: res.headers()['content-type'] || '' };
      } catch (e) { return null; }
    }

    // ---- crawl queue ----------------------------------------------------
    var seen = new Set();
    var queryVariants = {};
    var queue = [];
    var pagesDone = 0;
    var pagesStarted = 0;

    function inScope(u) {
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      var h = u.hostname.toLowerCase();
      if (h !== baseDomain && h !== 'www.' + baseDomain) return false;
      if (scope === 'page' && !u.pathname.startsWith(startFolder)) return false;
      return true;
    }

    function enqueue(raw, base) {
      var u;
      try { u = new URL(raw, base); } catch (e) { return; }
      u.hash = '';
      if (!inScope(u)) return;
      Array.from(u.searchParams.keys()).forEach(function (k) {
        if (/^(utm_|fbclid$|gclid$|ref$)/i.test(k)) u.searchParams.delete(k);
      });
      var key = u.href;
      if (seen.has(key)) return;
      if (u.search) {
        var n = queryVariants[u.pathname] = (queryVariants[u.pathname] || 0) + 1;
        if (n > MAX_QUERY_VARIANTS) return;
      }
      seen.add(key);
      queue.push(key);
    }

    enqueue(target.href);

    // robots.txt and sitemaps often list pages that nothing links to.
    async function readSitemap(url, depth) {
      if (depth > 3 || stopped) return;
      var got = await fetchAndSave(url, true);
      if (!got) return;
      var text = got.body.toString('utf8');
      var re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi, m;
      while ((m = re.exec(text))) {
        var loc = m[1].replace(/&amp;/g, '&');
        if (/\.xml(\.gz)?$/i.test(loc) && /sitemap/i.test(loc)) await readSitemap(loc, depth + 1);
        else enqueue(loc, url);
      }
    }
    var origin = target.origin;
    var robots = await fetchAndSave(origin + '/robots.txt', true);
    var maps = ['/sitemap.xml'];
    if (robots) {
      robots.body.toString('utf8').split(/\r?\n/).forEach(function (line) {
        var m = /^\s*sitemap:\s*(\S+)/i.exec(line);
        if (m) maps.push(m[1]);
      });
    }
    for (var s = 0; s < maps.length && !stopped; s++) {
      await readSitemap(new URL(maps[s], origin).href, 0);
    }

    async function autoScroll(page) {
      try {
        await page.evaluate(function () {
          return new Promise(function (resolve) {
            var y = 0, steps = 0, atBottom = 0;
            var timer = setInterval(function () {
              window.scrollBy(0, 700); y += 700; steps++;
              var h = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight);
              atBottom = y >= h ? atBottom + 1 : 0;
              if (atBottom >= 3 || steps > 80) { clearInterval(timer); window.scrollTo(0, 0); resolve(); }
            }, 150);
          });
        });
      } catch (e) { /* page navigated away */ }
    }

    async function processPage(page, url) {
      if (FILE_LIKE.test(new URL(url).pathname)) {
        await fetchAndSave(url);
        return;
      }
      send({ progress: 'Opening page ' + (++pagesStarted) + ' (' + queue.length + ' waiting): ' + url });
      try {
        await page.goto(url, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
      } catch (e) {
        if (!/Download is starting/i.test(String(e.message))) { /* keep what loaded */ }
      }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(function () {});
      await autoScroll(page);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(function () {});
      await sleep(500);

      var finalUrl = page.url();
      if (/^https?:/i.test(finalUrl)) {
        seen.add(finalUrl);
        var html = await page.content();
        // The page after JavaScript ran, next to the untouched original.
        save(finalUrl, Buffer.from(html, 'utf8'), 'text/html', true, '_rendered');
        var links = await page.evaluate(function () {
          var out = [];
          document.querySelectorAll('a[href], area[href], iframe[src], link[rel~="next"], link[rel~="prev"]').forEach(function (el) {
            out.push(el.href || el.src);
          });
          return out;
        }).catch(function () { return []; });
        links.forEach(function (l) { enqueue(l, finalUrl); });
      }
    }

    var active = 0;
    async function worker() {
      var page = await context.newPage();
      page.setDefaultTimeout(PAGE_TIMEOUT_MS);
      while (!stopped) {
        if (MAX_PAGES && pagesDone >= MAX_PAGES) break;
        var next = queue.shift();
        if (!next) {
          if (active === 0) break;
          await sleep(200);
          continue;
        }
        active++;
        try { await processPage(page, next); }
        catch (e) { send({ progress: 'Skipped ' + next + ' (' + String(e.message).split('\n')[0] + ')' }); }
        pagesDone++;
        active--;
      }
      await page.close().catch(function () {});
    }

    var workers = [];
    for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
    await Promise.all(workers);
    if (stopped) return;

    // Video/audio come in ranges; fetch the complete files now.
    var partialList = Array.from(partial).filter(function (u) { return !saved.has(u); });
    for (var p = 0; p < partialList.length && !stopped; p++) await fetchAndSave(partialList[p]);

    // ---- source maps -> original source code -----------------------------
    send({ progress: 'Looking for source maps (original source code)' });
    var sourceFiles = 0;
    var entries = Object.keys(manifest);
    for (var i = 0; i < entries.length && !stopped; i++) {
      var url = entries[i];
      var entry = manifest[url];
      if (!/javascript|css/i.test(entry.type) && !/\.(m?js|css)$/i.test(url.split('?')[0])) continue;
      var tail;
      try {
        var text = fs.readFileSync(path.join(dir, entry.file), 'utf8');
        tail = text.slice(-1000);
      } catch (e) { continue; }
      var found = /[#@]\s*sourceMappingURL=([^\s*'"]+)/.exec(tail);
      if (!found) continue;
      var mapRef = found[1];
      var mapJson = null;
      try {
        if (/^data:/i.test(mapRef)) {
          var b64 = /;base64,(.*)$/i.exec(mapRef);
          if (b64) mapJson = JSON.parse(Buffer.from(b64[1], 'base64').toString('utf8'));
        } else {
          var got = await fetchAndSave(new URL(mapRef, url).href);
          if (got) mapJson = JSON.parse(got.body.toString('utf8'));
        }
      } catch (e) { mapJson = null; }
      if (mapJson) sourceFiles += extractSources(dir, new URL(url).hostname, mapJson);
    }

    // ---- manifest + offline kit -------------------------------------------
    var info = {
      start: target.href,
      mainHost: hostFolder(target),
      savedAt: new Date().toISOString(),
      files: savedCount,
      pages: pagesDone,
      sourceFiles: sourceFiles,
      entries: manifest
    };
    fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify(info, null, 2));
    try {
      fs.copyFileSync(path.join(__dirname, 'offline-server.js'), path.join(dir, 'serve.js'));
      fs.writeFileSync(path.join(dir, 'READ-ME-FIRST.txt'), readme(info));
    } catch (e) { /* kit is a bonus */ }
    send({ progress: 'Finished: ' + savedCount + ' files, ' + pagesDone + ' pages, ' + sourceFiles + ' original source files' });
  })();

  promise = promise.then(
    function () { return browser && browser.close().catch(function () {}); },
    function (err) {
      if (browser) browser.close().catch(function () {});
      throw err;
    }
  );

  return { promise: promise, stop: stop };
};

function readme(info) {
  return [
    'Website copy of ' + info.start,
    'Saved ' + info.savedAt,
    '',
    'WHAT IS INSIDE',
    '  ' + info.mainHost + '/      files of the site exactly as the server sent them',
    '  other host folders/        files from CDNs and other servers the site uses',
    '  _rendered/                 every page after JavaScript ran (what a visitor sees)',
    '  _sources/                  original source code rebuilt from source maps (if the site published them)',
    '  _manifest.json             list of every saved URL and where it is stored',
    '',
    'OPEN IT ON YOUR COMPUTER',
    '  1. Install Node.js (https://nodejs.org)',
    '  2. In this folder run:  node serve.js',
    '  3. Open http://localhost:8080',
    '',
    'NOT INCLUDED',
    '  Server-side code, databases and secrets never reach the browser, so no',
    '  downloader can copy them. POST requests (forms, logins) are not saved.',
    ''
  ].join('\n');
}

module.exports.available = function () { return !!loadPlaywright(); };
