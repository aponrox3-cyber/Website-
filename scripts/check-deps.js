/**
 * Dependency check, run at startup (bin/www) and by setup-ubuntu.sh.
 *
 * A half-finished "npm install" (dropped connection, Ctrl+C, low disk) leaves
 * node_modules incomplete. The app then starts fine and only fails when the
 * missing package is first needed, e.g. "Cannot find module 'hbs'" on the first
 * page load. This walks the whole installed tree, repairs it with npm install
 * when something is missing, and says plainly what to do if that fails.
 *
 * Set SKIP_AUTO_INSTALL=1 to report problems without running npm.
 */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');

function findPkg(fromDir, name) {
  var dir = fromDir;
  for (;;) {
    var p = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(p)) return p;
    var up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

/** Returns { direct: [...], indirect: [...] } of packages that are not installed. */
function findMissing() {
  var direct = [], indirect = [];
  var seen = new Set();
  var rootPkg = readJson(path.join(ROOT, 'package.json')) || {};

  function walk(pkgFile, pkg, isRoot) {
    Object.keys(pkg.dependencies || {}).forEach(function (dep) {
      var found = findPkg(path.dirname(pkgFile), dep);
      if (!found) {
        (isRoot ? direct : indirect).push(isRoot ? dep : dep + ' (needed by ' + pkg.name + ')');
        return;
      }
      if (seen.has(found)) return;
      seen.add(found);
      var sub = readJson(found);
      if (!sub) { (isRoot ? direct : indirect).push(dep + ' (corrupt package.json)'); return; }
      walk(found, sub, false);
    });
  }
  walk(path.join(ROOT, 'package.json'), rootPkg, true);
  return { direct: direct, indirect: indirect };
}

module.exports = function ensureDependencies() {
  var missing = findMissing();
  if (!missing.direct.length && !missing.indirect.length) return true;

  var all = missing.direct.concat(missing.indirect);
  console.error('Some required packages are not installed: ' + all.slice(0, 8).join(', ') + (all.length > 8 ? ', ...' : ''));

  if (process.env.SKIP_AUTO_INSTALL !== '1') {
    console.error('Repairing with "npm install" ...');
    try {
      cp.execSync('npm install --no-audit --no-fund', { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      console.error('npm install did not finish: ' + String(e.message).split('\n')[0]);
    }
    missing = findMissing();
    if (!missing.direct.length && !missing.indirect.length) {
      console.error('Repaired. Continuing.');
      return true;
    }
  }

  if (missing.direct.length) {
    console.error('\nCannot start: ' + missing.direct.join(', ') + ' still missing.');
    console.error('Fix it by running these in the project folder:');
    console.error('  rm -rf node_modules');
    console.error('  npm install');
    console.error('Then start again with: npm start');
    console.error('(If npm install shows network errors, check your internet connection and retry.)');
    process.exit(1);
  }
  // Only a nested package is missing: warn, but let the app try to run.
  console.error('Warning: some nested packages are missing; if you see errors run "npm install".');
  return false;
};

if (require.main === module) {
  if (module.exports()) console.log('All dependencies are installed.');
}
