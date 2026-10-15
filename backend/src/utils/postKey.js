/**
 * استخراج معرّف المنشور (post_key) ونوعه من رابط فيسبوك.
 * نفس المنطق المستعمل فـ n8n — ممنوع إعادة تنفيذ التطبيع هنا.
 */

const POST_KEY_PATTERNS = [
  /\/reel\/(\d{8,})/,
  /\/videos\/(?:[^\/]+\/)?(\d{8,})/,
  /[?&]v=(\d{8,})/,
  /story_fbid=(\d{8,})/,
  /\/posts\/(\d{8,})/,
  /\/permalink\/(\d{8,})/,
];

/** أول نمط يطابق (معرّف رقمي بـ 8 أرقام أو أكثر) أو null. */
function extractPostKey(url) {
  if (typeof url !== 'string') return null;
  for (const pattern of POST_KEY_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/** 'reel' إذا طابق /reel/، 'video' إذا طابق /videos/ أو v=، وإلا 'post'. */
function detectPostType(url) {
  if (typeof url !== 'string') return 'post';
  if (/\/reel\//.test(url)) return 'reel';
  if (/\/videos\//.test(url) || /[?&]v=/.test(url)) return 'video';
  return 'post';
}

module.exports = { extractPostKey, detectPostType };
