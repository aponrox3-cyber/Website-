var spawn = require('child_process').spawn;
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var archive = require('../archiver');
var browserEngine = require('../browser');
var netguard = require('../netguard');

// DOWNLOAD_ENGINE: auto (default) = headless browser when it is installed, wget
// otherwise; browser = browser only; wget = wget only.
var ENGINE = ['auto', 'browser', 'wget'].indexOf(process.env.DOWNLOAD_ENGINE) !== -1 ? process.env.DOWNLOAD_ENGINE : 'auto';

/**
 * Every download gets its own directory under downloads/, which keeps two
 * people downloading the same site from writing into each other's files and
 * keeps cleanup from ever reaching outside this folder.
 */
var DOWNLOAD_ROOT = path.join(__dirname, '..', 'downloads');

// wget mirrors recursively, so without a ceiling a single request can fill the
// disk. Both limits can be raised through the environment.
// 0 (the default) means unlimited. Set DOWNLOAD_QUOTA (e.g. 500m, 2g) to cap it.
var QUOTA = process.env.DOWNLOAD_QUOTA || '0';
// 0 (the default) means no time limit. Set DOWNLOAD_TIMEOUT_MS to a number of
// milliseconds to bring a limit back.
var USER_AGENT = process.env.DOWNLOAD_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
var TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS) || 0;

/**
 * wget --mirror --convert-links --adjust-extension --page-requisites
 * --no-parent http://example.org
 * --mirror – Makes (among other things) the download recursive.
 * --convert-links – convert all the links (also to stuff like CSS stylesheets) to relative, so it will be suitable for offline viewing.
 * --adjust-extension – Adds suitable extensions to filenames (html or css) depending on their content-type.
 * --page-requisites – Download things like CSS style-sheets and images required to properly display the page offline.
 * --no-parent – When recurring do not ascend to the parent directory. It useful for restricting the download to only a portion of the site.
 */
module.exports = (socket, data, onFinished) => {
  var done = typeof onFinished === 'function' ? onFinished : function () {};
  var send = (payload) => socket.emit(data.token, payload);

  var target = parseTarget(data.website);
  if (!target) {
    send({ error: 'That does not look like a website address. Try something like https://example.com' });
    done();
    return null;
  }

  var jobId = crypto.randomBytes(8).toString('hex');
  var jobDir = path.join(DOWNLOAD_ROOT, jobId);
  try {
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (err) {
    send({ error: 'Could not create a working directory on the server: ' + err.message });
    done();
    return null;
  }

  var settled = false;
  var cancelled = false;
  var timedOut = false;
  var stderrTail = [];

  var runner = null; // whichever engine is running; has a stop() method

  var timer = TIMEOUT_MS > 0 ? setTimeout(() => {
    timedOut = true;
    if (runner) runner.stop();
  }, TIMEOUT_MS) : null;

  var fail = (message) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    removeJobDir(jobDir);
    send({ error: message });
    done();
  };

  // Engine 1: wget. Reads the files named in the HTML; fast, no extras needed.
  function startWget() {
    // spawn with an argument array: the address never reaches a shell, so it
    // cannot be used to run other commands. spawn (unlike execFile) does not
    // buffer output, so a download that runs for hours cannot hit a buffer
    // limit and be killed halfway.
    var child = spawn('wget', buildArgs(target), { cwd: jobDir });
    runner = { stop: function () { child.kill(); } };

    // Fires when wget itself cannot be started, which on a fresh machine almost
    // always means it is not installed.
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        fail('wget is not installed on the server. Install it and restart the app: ' +
             'apt install wget, brew install wget, or winget install JernejSimoncic.Wget');
        return;
      }
      fail('Could not start the download: ' + err.message);
    });

    child.stdout.on('data', function () {});

    child.stderr.on('data', (chunk) => {
      var text = chunk.toString();
      stderrTail = stderrTail.concat(text.split('\n')).slice(-60);
      send({ progress: text });
    });

    child.on('close', (code) => finalize(code));
  }

  // Engine 2: a real headless Chromium. Runs the site's JavaScript, so pages
  // that wget sees as empty are copied completely.
  function startBrowser() {
    var crawler = browserEngine({ target: target, dir: jobDir, send: send, scope: process.env.DOWNLOAD_SCOPE });
    runner = crawler;
    crawler.promise.then(() => finalize(0), (err) => {
      if (err && err.code === 'NO_BROWSER' && ENGINE !== 'browser') {
        send({ progress: 'Browser engine unavailable (' + err.message + '). Using wget instead. ' +
                         'For full JavaScript sites run: npm install playwright && npx playwright install chromium' });
        startWget();
        return;
      }
      stderrTail.push(err && err.message ? err.message : String(err));
      finalize(1);
    });
  }

  function finalize(code) {
    if (settled) return;
    if (timer) clearTimeout(timer);

    if (cancelled) {
      settled = true;
      removeJobDir(jobDir);
      done();
      return;
    }
    if (timedOut) {
      fail('The download took longer than ' + Math.round(TIMEOUT_MS / 1000) +
           ' seconds and was stopped. Try a smaller site or a specific page.');
      return;
    }

    // Trust the filesystem rather than wget's output. wget writes nothing at
    // all for an off-site redirect, a robots.txt exclusion or a 403, and the
    // previous approach of naming the folder from the first "Resolving" line
    // then archived a directory that was never created.
    if (countFiles(jobDir) === 0) {
      fail('Nothing could be downloaded from ' + target.hostname + '. ' +
           explainFailure(stderrTail, code));
      return;
    }

    settled = true;
    send({ progress: 'Converting' });

    var zipName = target.hostname.replace(/[^a-zA-Z0-9._-]/g, '_') + '-' + jobId;
    archive(jobDir, zipName, (err, name) => {
      removeJobDir(jobDir);
      if (err) {
        send({ error: 'The site downloaded but could not be compressed: ' + err.message });
      } else {
        send({ progress: 'Completed', file: name });
      }
      done();
    });
  }

  // Refuse private/internal addresses before anything is fetched.
  netguard.isPublicHost(target.hostname).then((ok) => {
    if (cancelled) {
      settled = true;
      if (timer) clearTimeout(timer);
      removeJobDir(jobDir);
      done();
      return;
    }
    if (!ok) {
      fail('Addresses on private or internal networks cannot be downloaded.');
      return;
    }
    if (ENGINE === 'wget') startWget(); else startBrowser();
  });

  return {
    cancel: function () {
      cancelled = true;
      if (runner) runner.stop();
    }
  };
};

/**
 * Builds the wget command line for a full, offline-browsable copy of a site.
 *
 * Besides the basic mirror options this adds what real sites need:
 *  - robots=off, browser user agent and compression: many sites refuse or
 *    cut down answers to the default wget identity
 *  - retries with back-off and per-connection timeouts: a slow or flaky
 *    server no longer ends the whole job
 *  - subdomains of the site (cdn., assets., www.) are followed so images,
 *    scripts and fonts hosted there are saved too
 *  - --content-disposition, --restrict-file-names=windows and
 *    --trust-server-names: correct names for downloads and for URLs with
 *    query strings or characters that are illegal on some systems
 *  - --no-parent is only applied to the "page" scope; the default "site" scope
 *    copies the whole site even when you start from a sub-page
 *
 * Environment: DOWNLOAD_SCOPE=page keeps the copy under the starting folder,
 * DOWNLOAD_WAIT=<seconds> pauses between requests for strict servers.
 */
function buildArgs(target) {
  var host = target.hostname;
  var baseDomain = host.replace(/^www\./i, '');
  var args = [
    '--mirror',
    '--convert-links',
    '--adjust-extension',
    '--page-requisites',
    '--no-if-modified-since',
    '--execute', 'robots=off',
    '--user-agent=' + USER_AGENT,
    '--header=Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '--header=Accept-Language: en-US,en;q=0.9',
    '--compression=auto',
    '--content-disposition',
    '--trust-server-names',
    '--restrict-file-names=windows',
    '--tries=5',
    '--waitretry=5',
    '--retry-connrefused',
    '--retry-on-http-error=429,500,502,503,504',
    '--connect-timeout=30',
    '--read-timeout=60',
    '--dns-timeout=30',
    '--max-redirect=20',
    '--level=inf',
    '--span-hosts',
    '--domains=' + baseDomain,
    '--quota=' + QUOTA
  ];
  if (process.env.DOWNLOAD_SCOPE === 'page') args.push('--no-parent');
  if (Number(process.env.DOWNLOAD_WAIT) > 0) {
    args.push('--wait=' + Number(process.env.DOWNLOAD_WAIT), '--random-wait');
  }
  args.push(target.href);
  return args;
}

/**
 * Accepts what the user typed and returns a URL only if it is a real http(s)
 * address. Anything else is rejected before it reaches wget.
 */
function parseTarget(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  var raw = input.trim();
  var url;
  try {
    // Only assume http:// when no scheme was given at all. Prefixing a value
    // that already has one turns file:///etc/passwd into a request for a host
    // called "file" instead of rejecting it.
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'http://' + raw);
  } catch (err) {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  return url;
}

/**
 * wget's closing lines are usually a summary, so the last line is rarely the
 * reason anything failed. Prefer the last line that actually looks like one.
 */
function explainFailure(lines, exitCode) {
  var interesting = /failed|unable|refused|denied|ERROR \d|error \d|robots|No such|not found|forbidden|timed out|giving up|Unsupported scheme/i;
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = lines[i].trim();
    if (line && interesting.test(line)) return line;
  }
  if (exitCode === 8) return 'The server refused the request (it may block automated downloads).';
  return 'wget exited with code ' + exitCode + ' without saving any files.';
}

function countFiles(directory) {
  var total = 0;
  var entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (err) {
    return 0;
  }
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].isDirectory()) {
      total += countFiles(path.join(directory, entries[i].name));
    } else {
      total++;
    }
  }
  return total;
}

/**
 * Deletes a single job directory. The guard matters: the previous version
 * joined an empty string onto the app root and recursively deleted the whole
 * application whenever the hostname had not been captured yet.
 */
function removeJobDir(directory) {
  var resolved = path.resolve(directory);
  var root = path.resolve(DOWNLOAD_ROOT);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    console.error('Refusing to delete a path outside the downloads folder: ' + resolved);
    return;
  }
  fs.rm(resolved, { recursive: true, force: true }, (err) => {
    if (err) console.error('Could not clean up ' + resolved + ': ' + err.message);
  });
}

module.exports._test = { parseTarget: parseTarget, buildArgs: buildArgs };
