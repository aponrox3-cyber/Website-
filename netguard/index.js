var dns = require('dns').promises;
var net = require('net');

/**
 * Server-side request forgery guard.
 *
 * The app fetches whatever address a visitor types, from the server's own
 * network position. Without a check, "http://localhost:3000", "http://10.0.0.5"
 * or the cloud metadata address 169.254.169.254 would be downloaded and handed
 * back as a zip. Hosts that resolve to private, loopback or link-local
 * addresses are therefore refused.
 *
 * Running the app on your own machine to copy a local site? Start it with
 * ALLOW_PRIVATE_HOSTS=1.
 */
var ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_HOSTS === '1';

var blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
].forEach(function (r) { blocked.addSubnet(r[0], r[1], 'ipv4'); });
[
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
].forEach(function (r) { blocked.addSubnet(r[0], r[1], 'ipv6'); });

function isPrivateIp(ip) {
  var family = net.isIP(ip);
  if (!family) return true; // not an address we understand: refuse
  if (family === 6) {
    // ::ffff:127.0.0.1 is just IPv4 in disguise
    var mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return isPrivateIp(mapped[1]);
    return blocked.check(ip, 'ipv6');
  }
  return blocked.check(ip, 'ipv4');
}

var cache = new Map(); // hostname -> { ok, until }
var CACHE_MS = 60 * 1000;

/** Resolves true when every address the host points to is public. */
async function isPublicHost(hostname) {
  if (ALLOW_PRIVATE) return true;
  var host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  if (host === 'localhost' || host.endsWith('.localhost')) return false;

  var hit = cache.get(host);
  if (hit && hit.until > Date.now()) return hit.ok;

  var ok;
  try {
    var addresses = await dns.lookup(host, { all: true });
    ok = addresses.length > 0 && addresses.every(function (a) { return !isPrivateIp(a.address); });
  } catch (err) {
    // Unresolvable: let the downloader report its own "could not resolve" error.
    ok = true;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(host, { ok: ok, until: Date.now() + CACHE_MS });
  return ok;
}

module.exports = { isPublicHost: isPublicHost, isPrivateIp: isPrivateIp, enabled: !ALLOW_PRIVATE };
