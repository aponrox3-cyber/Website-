// Offline viewer for a website copy made by Website Downloader.
// Usage:  node serve.js [port]      then open http://localhost:8080
// No packages needed. Pages, scripts, styles and saved API (GET) responses are
// answered from the files in this folder; unknown page addresses fall back to
// the main index.html so single-page apps can route on their own.
var http = require('http');
var fs = require('fs');
var path = require('path');

var root = __dirname;
var info = JSON.parse(fs.readFileSync(path.join(root, '_manifest.json'), 'utf8'));
var port = Number(process.argv[2]) || Number(process.env.PORT) || 8080;

// "host + path + query" -> stored file, for every host the site used.
var byKey = {};
var byPath = {};
Object.keys(info.entries).forEach(function (url) {
  var u = new URL(url);
  var host = u.hostname + (u.port ? ':' + u.port : '');
  byKey[host + u.pathname + u.search] = info.entries[url];
  if (!byPath[host + u.pathname]) byPath[host + u.pathname] = info.entries[url];
});
var mainHost = new URL(info.start).hostname + (new URL(info.start).port ? ':' + new URL(info.start).port : '');

var TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain',
  '.xml': 'application/xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg'
};

function find(host, u) {
  var hit = byKey[host + u.pathname + u.search] || byPath[host + u.pathname];
  if (hit) return hit;
  var p = u.pathname.replace(/\/$/, '');
  return byPath[host + p + '/'] || byPath[host + p + '/index.html'] || byPath[host + p + '.html'] || null;
}

function send(res, entry) {
  var file = path.join(root, entry.file);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    var type = (entry.type || '').split(';')[0] || TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
}

http.createServer(function (req, res) {
  var u, host = mainHost;
  try {
    u = new URL(req.url, 'http://localhost');
    // /__host/<host>/<path> reaches files that came from other servers (CDNs).
    var m = /^\/__host\/([^/]+)(\/.*)?$/.exec(u.pathname);
    if (m) { host = decodeURIComponent(m[1]); u = new URL(m[2] || '/', 'http://localhost'); }
  } catch (e) { res.writeHead(400); res.end('Bad request'); return; }
  var entry = find(host, u);
  if (!entry && !path.extname(u.pathname)) entry = find(mainHost, new URL('/', 'http://localhost'));
  if (!entry) { res.writeHead(404); res.end('Not in this copy: ' + u.pathname); return; }
  send(res, entry);
}).listen(port, '127.0.0.1', function () {
  console.log('Offline copy of ' + info.start + ' running at http://localhost:' + port);
});
