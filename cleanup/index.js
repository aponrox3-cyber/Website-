var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DOWNLOADS = path.join(ROOT, 'downloads');
var SITES = path.join(ROOT, 'public', 'sites');

// Finished zips are removed after this many minutes so the disk cannot fill up.
var TTL_MS = (Number(process.env.ZIP_TTL_MINUTES) || 60) * 60 * 1000;

/** Removes zips older than the time limit. */
function sweepZips() {
  fs.readdir(SITES, function (err, names) {
    if (err) return;
    names.forEach(function (name) {
      if (!/\.zip$/i.test(name)) return;
      var file = path.join(SITES, name);
      fs.stat(file, function (e, st) {
        if (!e && Date.now() - st.mtimeMs > TTL_MS) fs.unlink(file, function () {});
      });
    });
  });
}

/**
 * Call once at startup: clears working folders that a crash or restart left
 * behind (no job can be running yet), then sweeps old zips periodically.
 */
module.exports = function startCleanup() {
  try { fs.rmSync(DOWNLOADS, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  sweepZips();
  var timer = setInterval(sweepZips, 10 * 60 * 1000);
  timer.unref();
};
module.exports.sweepZips = sweepZips;
