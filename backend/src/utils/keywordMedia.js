/**
 * تحقق موحّد من مرفق الوسائط لكلمة مفتاحية.
 * يُستخدم في كل مكان تُقبل فيه وسائط الكلمة:
 *  - POST /api/posts/:id/keywords
 *  - PATCH /api/posts/keywords/:keywordId
 *  - POST /api/posts (الكلمة المفتاحية الأولى داخل نفس المعاملة)
 * لا تُكرَّر قواعد التحقق — هذا المصدر الوحيد.
 */
const {
  autoDetectTypeFromUrl,
  checkExtensionMatches,
  headCheck,
  validateMediaUrl,
} = require('./media');

/**
 * يقرأ media_url / media_type من كائن الطلب ويطبّق القواعد:
 *  - لا يوجد حقول ← لا وسائط (undefined).
 *  - الفارغ/ null في كليهما ← إزالة الوسائط (null).
 *  - رابط بلا نوع ← اكتشاف النوع تلقائيًا من الامتداد.
 *  - HTTPS فقط، بلا عناوين خاصة، بلا بيانات اعتماد.
 *  - تطابق الامتداد مع النوع.
 *  - فحص HEAD: نمنع فقط الإخفاقات القاطعة (رمز غير 2xx / نوع محتوى خاطئ / حجم كبير).
 *
 * @returns {Promise<{ok: boolean, mediaUrl?: string|null, mediaType?: string|null, error?: string, warnings?: string[]}>}
 */
async function validateKeywordMedia(body) {
  const hasUrl = Object.prototype.hasOwnProperty.call(body, 'media_url');
  const hasType = Object.prototype.hasOwnProperty.call(body, 'media_type');

  if (!hasUrl && !hasType) {
    return { ok: true, mediaUrl: undefined, mediaType: undefined };
  }

  let mediaUrlInput = hasUrl ? body.media_url : null;
  let mediaTypeInput = hasType ? body.media_type : null;

  if (mediaUrlInput === null || (typeof mediaUrlInput === 'string' && mediaUrlInput.trim() === '')) {
    mediaUrlInput = null;
  } else if (typeof mediaUrlInput === 'string') {
    mediaUrlInput = mediaUrlInput.trim();
  }

  if (mediaTypeInput === null || (typeof mediaTypeInput === 'string' && mediaTypeInput.trim() === '')) {
    mediaTypeInput = null;
  } else if (typeof mediaTypeInput === 'string') {
    mediaTypeInput = mediaTypeInput.trim().toLowerCase();
  }

  if (!mediaUrlInput && !mediaTypeInput) {
    return { ok: true, mediaUrl: null, mediaType: null };
  }

  if (!mediaUrlInput && mediaTypeInput) {
    return { ok: false, error: 'يجب توفير رابط الوسائط مع نوعها، أو إزالتهما معًا.' };
  }

  if (mediaUrlInput && !mediaTypeInput) {
    // النوع غير مُرسل: نكتشفه تلقائيًا من امتداد الملف.
    const detected = autoDetectTypeFromUrl(mediaUrlInput);
    if (!detected) {
      return { ok: false, error: 'تعذر الكشف عن نوع الوسائط من امتداد الرابط. يرجى تحديد النوع.' };
    }
    mediaTypeInput = detected;
  }

  const validation = validateMediaUrl(mediaUrlInput);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  if (mediaTypeInput !== 'image' && mediaTypeInput !== 'video') {
    return { ok: false, error: 'نوع الوسائط يجب أن يكون image أو video.' };
  }

  const extCheck = checkExtensionMatches(mediaTypeInput, validation.url);
  if (!extCheck.ok) {
    return { ok: false, error: extCheck.error };
  }

  const headResult = await headCheck(validation.url, mediaTypeInput, 5000);
  if (!headResult.ok) {
    return { ok: false, error: headResult.error };
  }

  return {
    ok: true,
    mediaUrl: validation.url,
    mediaType: mediaTypeInput,
    warnings: headResult.warnings || [],
  };
}

module.exports = { validateKeywordMedia };
