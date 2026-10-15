const { extractPostKey } = require('./postKey');

const ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.watch',
  'fb.me',
  'fb.com',
]);

const TRACKING_PARAMS = new Set([
  'fbclid',
  'mibextid',
  'gclid',
  '__tn__',
  'ref',
  'source',
  'src',
  'assoc_id',
  'igshid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'hc_ref',
  'msclkid',
]);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 6000;

function isAllowedHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  if (h.endsWith('.facebook.com')) return true;
  if (h.endsWith('.fb.watch') || h.endsWith('.fb.me') || h.endsWith('.fb.com')) return true;
  return false;
}

function parseAllowedHttpsUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!isAllowedHost(u.hostname)) return null;
    return u;
  } catch (e) {
    return null;
  }
}

function isLoginWall(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return true;
  }
  const path = u.pathname.toLowerCase();
  if (path.startsWith('/login') || path.startsWith('/checkpoint')) return true;
  if (u.searchParams.has('next')) return true;
  if (/[?&]next=/i.test(raw)) return true;
  return false;
}

function stripTrackingParams(raw) {
  try {
    const u = new URL(raw);
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch (e) {
    return raw;
  }
}

async function fetchHop(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (res.body && typeof res.body.cancel === 'function') {
      res.body.cancel().catch(() => {});
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follows Facebook short/share link redirects (fb.watch, /share/r|v|p, fb.me)
 * until the URL contains an extractable post key.
 *
 * Returns { url, resolved }. Never throws. Only https Facebook hosts are
 * fetched (SSRF protection). When no key is extractable, the original input
 * is returned untouched with resolved=false.
 */
async function resolveFacebookUrl(inputUrl) {
  if (typeof inputUrl !== 'string' || inputUrl.trim() === '') {
    return { url: inputUrl, resolved: false };
  }

  if (extractPostKey(inputUrl) !== null) {
    return { url: inputUrl, resolved: false };
  }

  if (!parseAllowedHttpsUrl(inputUrl)) {
    return { url: inputUrl, resolved: false };
  }

  let current = inputUrl;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    let res;
    try {
      res = await fetchHop(current);
    } catch (e) {
      return { url: inputUrl, resolved: false };
    }

    if (res.status < 300 || res.status >= 400) {
      if (extractPostKey(current) !== null) {
        return { url: stripTrackingParams(current), resolved: true };
      }
      return { url: current, resolved: false };
    }

    const location = res.headers.get('location');
    if (!location) {
      return { url: current, resolved: false };
    }

    let nextUrl;
    let nextParsed;
    try {
      nextParsed = new URL(location, current);
      nextUrl = nextParsed.toString();
    } catch (e) {
      return { url: inputUrl, resolved: false };
    }

    if (!isAllowedHost(nextParsed.hostname) || nextParsed.protocol !== 'https:') {
      return { url: current, resolved: false };
    }

    if (isLoginWall(nextUrl)) {
      return { url: inputUrl, resolved: false };
    }

    current = nextUrl;

    if (extractPostKey(current) !== null) {
      return { url: stripTrackingParams(current), resolved: true };
    }
  }

  return { url: inputUrl, resolved: false };
}

module.exports = { resolveFacebookUrl, isAllowedHost };
