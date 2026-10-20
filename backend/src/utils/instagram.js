/**
 * أدوات روابط إنستغرام: التحقّق من الرابط، استخراج الـ shortcode، ونوع المنشور.
 * لا نداءات شبكة إطلاقًا — لا يفتح الرابط ولا يتبع أي redirect ولا Graph API.
 */

const ALLOWED_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
]);

/** shortcode صالح: 5 أحرف فأكثر من A-Z a-z 0-9 _ - (حساس لحالة الأحرف). */
const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,}$/;
/** معرّف وسائط رقمي (media id): 8 أرقام على الأقل. */
const MEDIA_ID_RE = /^\d{8,}$/;

/** مسار المنشور مع اسم المستخدم الاختياري: /p/، /reel/، /reels/، /tv/. */
const SHORTCODE_PATH_RE =
  /^(?:\/[A-Za-z0-9._-]+)?\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})\/?$/;

const STORIES_UNSUPPORTED_CODE = 'STORIES_UNSUPPORTED';
const STORIES_UNSUPPORTED_MESSAGE =
  'روابط الستوري (Stories) غير مدعومة — استخدم رابط المنشور (Post) أو الريل (Reel).';

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'mibextid',
  'igshid',
  'igsh',
  'ref',
  'source',
  'src',
  'assoc_id',
  '__tn__',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

/** مضيفات مسموحة: القيم المذكورة حرفيًا + أي subdomain لـ instagram.com. */
function isAllowedInstagramHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  return h.endsWith('.instagram.com');
}

/** رابط HTTPS صالح على مضيف إنستغرام مسموح. */
function isValidInstagramUrl(url) {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return isAllowedInstagramHost(parsed.hostname);
}

function pathnameOf(url) {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).pathname;
  } catch (e) {
    return null;
  }
}

/** رابط ستوري: /stories/... */
function isInstagramStoriesUrl(url) {
  const path = pathnameOf(url);
  if (path === null) return false;
  return /\/stories(\/|$)/.test(path);
}

/**
 * يستخرج الـ shortcode من رابط منشور إنستغرام:
 * /p/<code>/، /reel/<code>/، /reels/<code>/، /tv/<code>/،
 * والصيغ المسبوقة باسم المستخدم: /<username>/p/<code>/ و /<username>/reel/<code>/.
 * يتجاهل الـ query string والشرطة المائلة النهائية. لا يُحوَّل إلى أحرف صغيرة أبدًا.
 * يرمي Error بـ code = STORIES_UNSUPPORTED_CODE إذا كان الرابط ستوري.
 * يعيد null إن لم يجد shortcode.
 */
function extractInstagramShortcode(url) {
  const path = pathnameOf(url);
  if (path === null) return null;
  if (isInstagramStoriesUrl(url)) {
    const err = new Error(STORIES_UNSUPPORTED_MESSAGE);
    err.code = STORIES_UNSUPPORTED_CODE;
    throw err;
  }
  const match = path.match(SHORTCODE_PATH_RE);
  return match ? match[1] : null;
}

/** 'reel' لـ /reel/ أو /reels/، 'video' لـ /tv/، وإلا 'post'. */
function detectInstagramPostType(url) {
  const path = pathnameOf(url);
  if (path === null) return 'post';
  if (/\/reel\//.test(path) || /\/reels\//.test(path)) return 'reel';
  if (/\/tv\//.test(path)) return 'video';
  return 'post';
}

/** مفتاح يدوي مقبول: shortcode أو معرّف رقمي (8 أرقام على الأقل). */
function isValidInstagramKey(key) {
  if (typeof key !== 'string') return false;
  return SHORTCODE_RE.test(key) || MEDIA_ID_RE.test(key);
}

/** يزيل معاملات التتبّع (igshid، utm_* ...) ويبقي بقية الرابط كما هو. */
function stripInstagramTrackingParams(raw) {
  try {
    const u = new URL(raw);
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch (e) {
    return raw;
  }
}

module.exports = {
  STORIES_UNSUPPORTED_CODE,
  STORIES_UNSUPPORTED_MESSAGE,
  isValidInstagramUrl,
  isInstagramStoriesUrl,
  extractInstagramShortcode,
  detectInstagramPostType,
  isValidInstagramKey,
  stripInstagramTrackingParams,
};
