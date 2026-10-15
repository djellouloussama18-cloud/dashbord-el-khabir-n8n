const DEFAULT_GRAPH_VERSION = 'v21.0';
const REQUEST_TIMEOUT_MS = 6000;
const MAX_SCAN_PAGES = 10;

const PFBID_PATTERNS = [
  /\/posts\/(pfbid[A-Za-z0-9]+)/,
  /[?&]story_fbid=(pfbid[A-Za-z0-9]+)/,
];

/**
 * يستخرج رمز pfbid من رابط منشور فيسبوك، أو null إن لم يوجد.
 * هذه الأداة خاصة بروابط pfbid فقط؛ المعرّفات الرقمية يتولّاها extractPostKey.
 */
function extractPfbid(url) {
  if (typeof url !== 'string') return null;
  for (const pattern of PFBID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** هل تم ضبط رمز الصفحة؟ إن لا، الميزة معطّلة بصمت. */
function isGraphConfigured() {
  return getToken() !== '';
}

function getToken() {
  const raw = process.env.FB_PAGE_ACCESS_TOKEN;
  return typeof raw === 'string' ? raw.trim() : '';
}

function getVersion() {
  const raw = process.env.FB_GRAPH_VERSION;
  const value = typeof raw === 'string' ? raw.trim() : '';
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_GRAPH_VERSION;
}

/** يحوّل معرّف Graph (مثل "123_4567890123") إلى الجزء الرقمي الأخير فقط (8 خانات فأكثر). */
function digitsFromId(id) {
  if (typeof id !== 'string') return null;
  const idx = id.lastIndexOf('_');
  const candidate = idx === -1 ? id : id.slice(idx + 1);
  return /^\d{8,}$/.test(candidate) ? candidate : null;
}

/** طلب GET إلى Graph — الرمز في ترويسة Authorization فقط، ولا يُسجَّل أبدًا. لا يرمي أخطاء. */
async function graphGet(rawUrl, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** يزيل access_token من روابط الفلترة حتى لا يُرسَل الرمز في سلسلة الاستعلام. */
function sanitizeNextUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('access_token')) return u.toString();
    u.searchParams.delete('access_token');
    return u.toString();
  } catch (e) {
    return null;
  }
}

/**
 * يحاول استخراج المعرّف الرقمي للمنشور من رابط يحتوي pfbid عبر Graph API.
 * يُرجِع { post_key, via } حيث via = 'direct' | 'scan'، أو null عند أي فشل/انتهاء مهلة.
 * لا يرمي أبدًا. الرمز لا يُرسَل ولا يُسجَّل إطلاقًا خارج ترويسة Authorization.
 */
async function resolveNumericPostId(url) {
  const token = getToken();
  if (!token) return null;

  const pfbid = extractPfbid(url);
  if (!pfbid) return null;

  const version = getVersion();

  // المحاولة A (رخيصة): جلب المعرّف مباشرة من رمز pfbid.
  try {
    const directUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(pfbid)}?fields=id`;
    const direct = await graphGet(directUrl, token);
    if (direct && direct.ok && direct.json && direct.json.id) {
      const key = digitsFromId(direct.json.id);
      if (key) return { post_key: key, via: 'direct' };
    }
  } catch (e) {
    // نتجاهل ونجرّب المحاولة B.
  }

  // المحاولة B: مسح منشورات الصفحة صفحةً بصفحة حتى إيجاد permalink مطابق.
  try {
    let next = `https://graph.facebook.com/${version}/me/posts?fields=id,permalink_url&limit=100`;
    for (let page = 0; page < MAX_SCAN_PAGES && next; page += 1) {
      const res = await graphGet(next, token);
      if (!res || !res.ok || !res.json) break;

      const items = Array.isArray(res.json.data) ? res.json.data : [];
      for (const item of items) {
        if (item && typeof item.permalink_url === 'string' && item.permalink_url.includes(pfbid)) {
          const key = digitsFromId(item.id);
          if (key) return { post_key: key, via: 'scan' };
        }
      }

      const rawNext =
        res.json.paging && typeof res.json.paging.next === 'string' ? res.json.paging.next : null;
      if (!rawNext) break;

      let nextHost;
      let nextUrl;
      try {
        nextHost = new URL(rawNext).hostname.toLowerCase();
      } catch (e) {
        break;
      }
      if (nextHost !== 'graph.facebook.com') break;

      nextUrl = sanitizeNextUrl(rawNext);
      if (!nextUrl) break;
      next = nextUrl;
    }
  } catch (e) {
    return null;
  }

  return null;
}

module.exports = { resolveNumericPostId, extractPfbid, isGraphConfigured };
