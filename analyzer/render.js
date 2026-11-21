/** Renders the analysis report as one self-contained HTML page (no scripts). */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function bytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
function table(head, rows) {
  if (!rows.length) return '<p class="muted">Nothing found.</p>';
  return '<div class="scroll"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}
function list(items) {
  if (!items || !items.length) return '<p class="muted">Nothing found.</p>';
  return '<ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
}
function section(title, body) { return '<section><h2>' + esc(title) + '</h2>' + body + '</section>'; }

module.exports = function render(r) {
  var out = [];
  var byCat = {};
  r.technologies.forEach(function (t) { (byCat[t.category] = byCat[t.category] || []).push(t); });

  out.push(section('How this website is built', '<p class="lead">' + esc(r.headline) + '</p>' +
    '<p class="muted">Based only on what the server sends to every visitor. Server-side code, databases and secrets are never visible to any tool. Copy made with the ' + esc(r.engine) + ' engine' +
    (r.headers.recorded ? '' : '; response headers were not recorded, so hosting and server clues may be missing') + '.</p>'));

  out.push(section('Technology stack', Object.keys(byCat).length ? Object.keys(byCat).sort().map(function (c) {
    return '<h3>' + esc(c) + '</h3><div class="chips">' + byCat[c].map(function (t) {
      return '<span class="chip">' + esc(t.name) + (t.version ? ' <small>' + esc(t.version) + '</small>' : '') + '</span>';
    }).join('') + '</div>';
  }).join('') : '<p class="muted">No known technologies detected.</p>'));

  out.push(section('Overview', table(['Measure', 'Value'], [
    ['Start address', r.target], ['Pages saved', r.totals.pages], ['Files saved', r.totals.files],
    ['Total size', bytes(r.totals.bytes)], ['Hosts involved', r.totals.hosts],
    ['Single-page app (content built by JavaScript)', r.structure.singlePageApp ? 'yes' : 'no'],
    ['Original source files recovered', r.sources.available ? r.sources.files : 'none (site publishes no source maps)']
  ])));

  out.push(section('Pages and structure', table(['Page', 'Title', 'Description', 'H1', 'Words', 'Forms', 'Data'],
    r.pages.slice(0, 200).map(function (p) {
      var path; try { path = new URL(p.url).pathname + new URL(p.url).search; } catch (e) { path = p.url; }
      return [path, p.title, p.description, (p.h1 || []).join(' | '), p.words, p.forms, (p.structuredData || []).join(', ')];
    }))));

  out.push(section('Assets', table(['Type', 'Files', 'Size'], Object.keys(r.assets.byCategory).map(function (k) {
    return [k, r.assets.byCategory[k].files, bytes(r.assets.byCategory[k].bytes)];
  })) + '<h3>Largest files</h3>' + table(['File', 'Type', 'Size'], r.assets.largest.map(function (f) { return [f.url, f.type, bytes(f.bytes)]; })) +
    '<h3>Other servers used (CDNs, fonts, services)</h3>' + table(['Host', 'Files', 'Size'], r.assets.thirdPartyHosts.map(function (h) { return [h.host, h.files, bytes(h.bytes)]; }))));

  out.push(section('APIs and data', '<h3>Endpoints named in the JavaScript</h3>' + list(r.api.endpointsInCode) +
    '<h3>JSON data files loaded by the site</h3>' + list(r.api.dataFiles.map(function (d) { return d.url; })) +
    '<h3>Back-end services referenced</h3>' + list(r.api.externalServices)));

  out.push(section('Design', '<h3>Colours (most used)</h3><div class="chips">' + r.design.colors.map(function (c) {
    return '<span class="chip"><i class="sw" style="background:' + esc(/^#[0-9a-f]{6}$/.test(c.value) ? c.value : '#000') + '"></i>' + esc(c.value) + ' <small>' + c.count + '</small></span>';
  }).join('') + '</div><h3>Fonts</h3>' + list(r.design.fonts.map(function (f) { return f.value + ' (' + f.count + ')'; })) +
    '<h3>Google Fonts loaded</h3>' + list(r.design.googleFonts) +
    '<p class="muted">CSS custom properties (design tokens): ' + r.design.cssCustomProperties + '</p>'));

  var s = r.seo;
  out.push(section('SEO and site files', table(['Check', 'Result'], [
    ['HTTPS start address', s.https ? 'yes' : 'no'], ['robots.txt', s.robotsTxt ? 'found' : 'not found'],
    ['Sitemap files / URLs listed', s.sitemapFiles + ' / ' + s.sitemapUrls], ['Favicon', s.favicon ? 'yes' : 'no'],
    ['Web app manifest', s.webManifest ? 'yes' : 'no'], ['Mobile viewport tag', s.viewportMeta],
    ['Pages without a title', s.pagesWithoutTitle], ['Pages without a description', s.pagesWithoutDescription],
    ['Images missing alt text', s.imagesMissingAlt], ['Structured data types', s.structuredDataTypes.join(', ') || 'none']
  ])));

  var h = r.headers;
  out.push(section('Server response headers', table(['Item', 'Value'], [
    ['Server', h.server || 'not disclosed'], ['X-Powered-By', h.poweredBy || 'not disclosed'], ['Compression', h.compression || 'none seen'],
    ['Cache-Control', h.cacheControl || 'not seen'], ['Cookies set (names)', h.cookiesSet.join(', ') || 'none'],
    ['Security headers present', h.present.join(', ') || 'none'], ['Security headers missing', h.missing.join(', ') || 'none']
  ])));

  if (r.sources.available) {
    out.push(section('Original source code (from source maps)', '<p>' + r.sources.files + ' files in <code>_sources/</code>' +
      (r.sources.typescript ? ', written in TypeScript' : '') + '.</p><h3>Folders</h3>' +
      table(['Folder', 'Files'], r.sources.folders.map(function (f) { return [f.value, f.count]; })) +
      '<h3>File types</h3>' + table(['Extension', 'Files'], r.sources.extensions.map(function (f) { return [f.value, f.count]; })) +
      '<h3>Config files</h3>' + list(r.sources.notableFiles) + '<h3>Dependencies listed</h3>' + list(r.sources.dependencies)));
  }

  out.push(section('Links to other sites', table(['Domain', 'Links'], r.structure.externalDomains.map(function (d) { return [d.value, d.count]; }))));

  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Site analysis: ' + esc(r.target) + '</title><style>' +
    'body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f5f7fa;color:#1d2733}main{max-width:1000px;margin:0 auto;padding:24px 16px}' +
    'h1{margin:0 0 4px}section{background:#fff;border:1px solid #dde3ea;border-radius:10px;padding:16px 20px;margin:16px 0}' +
    'h2{margin:0 0 10px;font-size:19px}h3{margin:16px 0 6px;font-size:14px;color:#52606d;text-transform:uppercase;letter-spacing:.04em}' +
    '.lead{font-size:17px}.muted{color:#6b7785}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}' +
    'th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #e8ecf1;vertical-align:top;word-break:break-word}th{background:#f0f3f7}' +
    '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:#eaf2fb;border:1px solid #c7dbf2;border-radius:999px;padding:3px 11px;font-size:13px}' +
    '.chip small{color:#52606d}.sw{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;border:1px solid #0003;vertical-align:-1px}' +
    'ul{margin:4px 0;padding-left:20px}li{word-break:break-all}code{background:#eef1f5;padding:1px 5px;border-radius:4px}' +
    '</style></head><body><main><h1>Website analysis</h1><p class="muted">' + esc(r.target) + ' &middot; ' + esc(r.generatedAt) + '</p>' +
    out.join('') + '</main></body></html>';
};
