const router = require('express').Router();
const postsRepo = require('../repositories/posts.repo');
const { extractPostKey, detectPostType } = require('../utils/postKey');
const { resolveFacebookUrl, isAllowedHost } = require('../utils/resolveShortUrl');
const {
  resolveNumericPostId,
  extractPfbid,
  isGraphConfigured,
} = require('../utils/resolveNumericPostId');

const EMPTY_NORMALIZED_MESSAGE =
  'تعذّر تطبيع الكلمة المفتاحية (الكلمة فارغة أو غير صالحة).';
const MANUAL_KEY_MESSAGE =
  'تعذّر تحويل الرابط المختصر إلى الرابط الكامل. افتح المنشور في المتصفح وانسخ الرابط الكامل من شريط العنوان، أو أدخل المعرّف يدويًا.';
const PFBID_MANUAL_KEY_MESSAGE =
  'تعذّر استخراج المعرّف الرقمي لهذا المنشور تلقائيًا. علّق على المنشور بحساب آخر وخذ الجزء الذي بعد _ من post_id في n8n، أو أدخله يدويًا.';
const GRAPH_DISABLED_NOTE =
  ' (البحث التلقائي غير مفعّل: لم يتم ضبط FB_PAGE_ACCESS_TOKEN)';
const INVALID_URL_MESSAGE = 'الرابط غير صالح، يجب أن يكون رابط فيسبوك';
const DUPLICATE_POST_MESSAGE = 'هذا المنشور مضاف مسبقًا';
const DUPLICATE_KEYWORD_MESSAGE = 'هذه الكلمة المفتاحية مضافة مسبقًا في هذا المنشور';

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return n;
}

function isPositiveInt(value) {
  return /^\d+$/.test(String(value));
}

function isValidFacebookUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (err) {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return isAllowedHost(url.hostname);
}

/** صيغ الرد: قائمة نصوص غير فارغة، بحد 10، كل واحدة ≤ 500، بلا تكرار. */
function parseVariants(input) {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, error: 'صيغ الرد يجب أن تكون قائمة نصية.' };
  }
  const cleaned = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'كل صيغة رد يجب أن تكون نصًا.' };
    }
    const s = raw.trim();
    if (!s) continue;
    if (s.length > 500) {
      return { ok: false, error: 'كل صيغة رد يجب ألا تتجاوز 500 حرف.' };
    }
    if (!cleaned.includes(s)) cleaned.push(s);
  }
  if (cleaned.length > 10) {
    return { ok: false, error: 'الحد الأقصى هو 10 صيغ رد.' };
  }
  return { ok: true, value: cleaned };
}

/** رسالة تعارض الكلمة المفتاحية (عقد n8n #3). */
function keywordConflictMessage(conflict) {
  return `هذه الكلمة المفتاحية مستعملة في منشور آخر نشط: «${conflict.title || conflict.post_url}»`;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** رسالة 422 المناسبة: خاصة بـ pfbid إن كان الرابط يحتويه، مع تنبيه إن كان البحث معطّلًا. */
function manualKeyMessageFor(url) {
  if (!extractPfbid(url)) return MANUAL_KEY_MESSAGE;
  return isGraphConfigured()
    ? PFBID_MANUAL_KEY_MESSAGE
    : PFBID_MANUAL_KEY_MESSAGE + GRAPH_DISABLED_NOTE;
}

/** يحوّل نتيجة resolveNumericPostId إلى قيمة key_resolved_via أو null. */
function keyResolvedViaOf(result) {
  if (!result) return null;
  if (result.via === 'direct') return 'graph-direct';
  if (result.via === 'scan') return 'graph-scan';
  return null;
}

/* ============================== SUMMARY ============================== */
// ملاحظة: يجب أن يُعلن قبل /:id حتى لا يبتلعه الراوتر.

router.get('/summary', async (req, res, next) => {
  try {
    const summary = await postsRepo.getSummary();
    return res.json(summary);
  } catch (err) {
    return next(err);
  }
});

/* =============================== LIST =============================== */

router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    let status = typeof req.query.status === 'string' ? req.query.status : 'all';
    if (!['all', 'active', 'inactive'].includes(status)) status = 'all';
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 200);

    const { rows, total } = await postsRepo.listPosts({ search, status, page, limit });
    return res.json({ items: rows, total, page, limit });
  } catch (err) {
    return next(err);
  }
});

/* ============================== CREATE ============================== */

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const postUrl = trimString(body.post_url);
    if (!postUrl) {
      return res.status(400).json({ error: 'رابط المنشور مطلوب.' });
    }
    if (!isValidFacebookUrl(postUrl)) {
      return res.status(400).json({ error: INVALID_URL_MESSAGE });
    }

    let postKey = null;
    let resolvedUrl = postUrl;
    let resolvedFrom = null;
    let keyResolvedVia = null;
    const manualKey = trimString(body.post_key);
    if (manualKey) {
      if (!/^\d{8,}$/.test(manualKey)) {
        return res.status(400).json({ error: 'معرّف المنشور يجب أن يكون أرقامًا فقط (8 أرقام على الأقل).' });
      }
      postKey = manualKey;
    } else {
      const resolution = await resolveFacebookUrl(postUrl);
      if (resolution.resolved) {
        resolvedUrl = resolution.url;
        resolvedFrom = postUrl;
      }
      postKey = extractPostKey(resolvedUrl);
      if (!postKey && extractPfbid(resolvedUrl)) {
        const numeric = await resolveNumericPostId(resolvedUrl);
        if (numeric) {
          postKey = numeric.post_key;
          keyResolvedVia = keyResolvedViaOf(numeric);
        }
      }
      if (!postKey) {
        return res.status(422).json({ error: manualKeyMessageFor(resolvedUrl), needs_manual_key: true });
      }
    }

    const postType = detectPostType(resolvedUrl);

    let title = null;
    if (body.title !== undefined && body.title !== null) {
      if (typeof body.title !== 'string') {
        return res.status(400).json({ error: 'العنوان يجب أن يكون نصًا.' });
      }
      const t = body.title.trim();
      title = t === '' ? null : t;
    }

    let isActive = true;
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return res.status(400).json({ error: 'حقل التفعيل يجب أن يكون صحيحًا/خطأ.' });
      }
      isActive = body.is_active;
    }

    const variants = parseVariants(body.comment_reply_variants);
    if (!variants.ok) {
      return res.status(400).json({ error: variants.error });
    }

    const existing = await postsRepo.findPostByKey(postKey);
    if (existing) {
      return res.status(409).json({ error: DUPLICATE_POST_MESSAGE });
    }

    const post = await postsRepo.createPost({
      title,
      postUrl: resolvedUrl,
      postKey,
      postType,
      variants: variants.value,
      isActive,
    });
    if (resolvedFrom || keyResolvedVia) {
      const payload = { ...post };
      if (resolvedFrom) payload.resolved_from = resolvedFrom;
      if (keyResolvedVia) payload.key_resolved_via = keyResolvedVia;
      return res.status(201).json(payload);
    }
    return res.status(201).json(post);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: DUPLICATE_POST_MESSAGE });
    }
    return next(err);
  }
});

/* ============================== KEYWORDS ============================== */
// ملاحظة: درجة "/keywords/:keywordId" (مقطعان) لا تتعارض مع "/:id"، لكن نعلنها هنا للأمان.

router.post('/:id/keywords', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const post = await postsRepo.getPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const body = req.body || {};
    const keyword = trimString(body.keyword);
    if (!keyword) {
      return res.status(400).json({ error: 'الكلمة المفتاحية مطلوبة.' });
    }
    if (keyword.length > 100) {
      return res.status(400).json({ error: 'الكلمة المفتاحية يجب ألا تتجاوز 100 حرف.' });
    }

    const dmMessage = trimString(body.dm_message);
    if (!dmMessage) {
      return res.status(400).json({ error: 'رسالة الخاص مطلوبة.' });
    }
    if (dmMessage.length > 2000) {
      return res.status(400).json({ error: 'رسالة الخاص يجب ألا تتجاوز 2000 حرف.' });
    }

    let stopBotAfterSend = true;
    if (body.stop_bot_after_send !== undefined) {
      if (typeof body.stop_bot_after_send !== 'boolean') {
        return res.status(400).json({ error: 'حقل إيقاف البوت يجب أن يكون صحيحًا/خطأ.' });
      }
      stopBotAfterSend = body.stop_bot_after_send;
    }

    let isActive = true;
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return res.status(400).json({ error: 'حقل التفعيل يجب أن يكون صحيحًا/خطأ.' });
      }
      isActive = body.is_active;
    }

    const normalized = await postsRepo.normalizeKeyword(keyword);
    if (!normalized) {
      return res.status(400).json({ error: EMPTY_NORMALIZED_MESSAGE });
    }

    if (isActive && post.is_active) {
      const conflict = await postsRepo.findConflictingKeyword(normalized);
      if (conflict) {
        return res.status(409).json({ error: keywordConflictMessage(conflict) });
      }
    }

    const created = await postsRepo.createKeyword(id, {
      keyword,
      keywordNormalized: normalized,
      dmMessage,
      stopBotAfterSend,
      isActive,
    });
    return res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: DUPLICATE_KEYWORD_MESSAGE });
    }
    if (err.code === '23503') {
      return res.status(409).json({ error: 'المنشور غير موجود.' });
    }
    return next(err);
  }
});

router.patch('/keywords/:keywordId', async (req, res, next) => {
  try {
    const { keywordId } = req.params;
    if (!isPositiveInt(keywordId)) {
      return res.status(404).json({ error: 'الكلمة المفتاحية غير موجودة.' });
    }

    const existing = await postsRepo.getKeywordById(keywordId);
    if (!existing) {
      return res.status(404).json({ error: 'الكلمة المفتاحية غير موجودة.' });
    }

    const body = req.body || {};
    const fields = {};

    let normalized = existing.keyword_normalized;
    if (Object.prototype.hasOwnProperty.call(body, 'keyword')) {
      const keyword = trimString(body.keyword);
      if (!keyword) {
        return res.status(400).json({ error: 'الكلمة المفتاحية مطلوبة.' });
      }
      if (keyword.length > 100) {
        return res.status(400).json({ error: 'الكلمة المفتاحية يجب ألا تتجاوز 100 حرف.' });
      }
      normalized = await postsRepo.normalizeKeyword(keyword);
      if (!normalized) {
        return res.status(400).json({ error: EMPTY_NORMALIZED_MESSAGE });
      }
      fields.keyword = keyword;
      fields.keyword_normalized = normalized;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'dm_message')) {
      const dmMessage = trimString(body.dm_message);
      if (!dmMessage) {
        return res.status(400).json({ error: 'رسالة الخاص مطلوبة.' });
      }
      if (dmMessage.length > 2000) {
        return res.status(400).json({ error: 'رسالة الخاص يجب ألا تتجاوز 2000 حرف.' });
      }
      fields.dm_message = dmMessage;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'stop_bot_after_send')) {
      if (typeof body.stop_bot_after_send !== 'boolean') {
        return res.status(400).json({ error: 'حقل إيقاف البوت يجب أن يكون صحيحًا/خطأ.' });
      }
      fields.stop_bot_after_send = body.stop_bot_after_send;
    }

    let isActive = existing.is_active;
    if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
      if (typeof body.is_active !== 'boolean') {
        return res.status(400).json({ error: 'حقل التفعيل يجب أن يكون صحيحًا/خطأ.' });
      }
      isActive = body.is_active;
      fields.is_active = isActive;
    }

    if (isActive && existing.post_is_active) {
      const conflict = await postsRepo.findConflictingKeyword(normalized, keywordId);
      if (conflict) {
        return res.status(409).json({ error: keywordConflictMessage(conflict) });
      }
    }

    const updated = await postsRepo.updateKeyword(keywordId, fields);
    return res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: DUPLICATE_KEYWORD_MESSAGE });
    }
    return next(err);
  }
});

router.delete('/keywords/:keywordId', async (req, res, next) => {
  try {
    const { keywordId } = req.params;
    if (!isPositiveInt(keywordId)) {
      return res.status(404).json({ error: 'الكلمة المفتاحية غير موجودة.' });
    }

    const deleted = await postsRepo.deleteKeyword(keywordId);
    if (!deleted) {
      return res.status(404).json({ error: 'الكلمة المفتاحية غير موجودة.' });
    }
    return res.json({ ok: true, id: deleted.id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'لا يمكن حذف الكلمة المفتاحية لوجود سجلات مرتبطة بها (إصابات)، قم بتعطيلها بدلًا من ذلك.',
      });
    }
    return next(err);
  }
});

/* ============================ SINGLE POST ============================ */

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const post = await postsRepo.getPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const keywords = await postsRepo.listKeywords(id);
    return res.json({ post, keywords, stats: postsRepo.statsFromPost(post) });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const post = await postsRepo.getPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const body = req.body || {};
    const fields = {};

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      if (body.title !== null && typeof body.title !== 'string') {
        return res.status(400).json({ error: 'العنوان يجب أن يكون نصًا.' });
      }
      const t = body.title === null ? '' : body.title.trim();
      fields.title = t === '' ? null : t;
    }

    const urlSent = Object.prototype.hasOwnProperty.call(body, 'post_url');
    let newUrl = post.post_url;
    let resolvedFrom = null;
    let keyResolvedVia = null;
    if (urlSent) {
      newUrl = trimString(body.post_url);
      if (!newUrl || !isValidFacebookUrl(newUrl)) {
        return res.status(400).json({ error: INVALID_URL_MESSAGE });
      }
      fields.post_url = newUrl;
    }

    let newKey = post.post_key;
    const manualKeySent = Object.prototype.hasOwnProperty.call(body, 'post_key');
    if (manualKeySent && trimString(body.post_key)) {
      const mk = trimString(body.post_key);
      if (!/^\d{8,}$/.test(mk)) {
        return res.status(400).json({ error: 'معرّف المنشور يجب أن يكون أرقامًا فقط (8 أرقام على الأقل).' });
      }
      newKey = mk;
      fields.post_key = mk;
    } else if (urlSent && !manualKeySent) {
      const resolution = await resolveFacebookUrl(newUrl);
      if (resolution.resolved) {
        resolvedFrom = newUrl;
        newUrl = resolution.url;
        fields.post_url = newUrl;
      }
      let extracted = extractPostKey(newUrl);
      if (!extracted && extractPfbid(newUrl)) {
        const numeric = await resolveNumericPostId(newUrl);
        if (numeric) {
          extracted = numeric.post_key;
          keyResolvedVia = keyResolvedViaOf(numeric);
        }
      }
      if (!extracted) {
        return res.status(422).json({ error: manualKeyMessageFor(newUrl), needs_manual_key: true });
      }
      newKey = extracted;
      fields.post_key = extracted;
    }

    if (urlSent) {
      fields.post_type = detectPostType(newUrl);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'comment_reply_variants')) {
      const variants = parseVariants(body.comment_reply_variants);
      if (!variants.ok) {
        return res.status(400).json({ error: variants.error });
      }
      fields.comment_reply_variants = variants.value;
    }

    let activating = false;
    if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
      if (typeof body.is_active !== 'boolean') {
        return res.status(400).json({ error: 'حقل التفعيل يجب أن يكون صحيحًا/خطأ.' });
      }
      fields.is_active = body.is_active;
      activating = body.is_active === true && post.is_active !== true;
    }

    if (newKey !== post.post_key) {
      const dup = await postsRepo.findPostByKey(newKey, id);
      if (dup) {
        return res.status(409).json({ error: DUPLICATE_POST_MESSAGE });
      }
    }

    if (activating) {
      const conflict = await postsRepo.findReactivationConflict(id);
      if (conflict) {
        return res.status(409).json({ error: keywordConflictMessage(conflict) });
      }
    }

    const updated = await postsRepo.updatePost(id, fields);

    // إعادة عداد Round-Robin إلى 0 إذا تغيّرت صيغ الرد
    if (Object.prototype.hasOwnProperty.call(fields, 'comment_reply_variants')) {
      await postsRepo.resetVariantIndex(id);
    }

    if (resolvedFrom || keyResolvedVia) {
      const payload = { ...updated };
      if (resolvedFrom) payload.resolved_from = resolvedFrom;
      if (keyResolvedVia) payload.key_resolved_via = keyResolvedVia;
      return res.json(payload);
    }
    return res.json(updated);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: DUPLICATE_POST_MESSAGE });
    }
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const deleted = await postsRepo.deletePost(id);
    if (!deleted) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }
    return res.json({ ok: true, id: deleted.id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'لا يمكن حذف المنشور لوجود سجلات مرتبطة به، قم بتعطيله بدلًا من ذلك.',
      });
    }
    return next(err);
  }
});

/* ========================= NEXT VARIANT (Round-Robin) ========================= */

/**
 * POST /api/posts/:id/next-variant
 * يختار الرد التالي بالتناوب ويُحدّث العداد في قاعدة البيانات.
 * الاستجابة: { variant: "نص الرد" } أو { variant: null } إن لم تكن هناك صيغ.
 */
router.post('/:id/next-variant', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const post = await postsRepo.getPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const variant = await postsRepo.getNextVariant(id);
    return res.json({ variant });
  } catch (err) {
    return next(err);
  }
});

/* ============================== COMMENTS ============================== */

router.get('/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const post = await postsRepo.getPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const search = typeof req.query.search === 'string' ? req.query.search : '';
    let status = typeof req.query.status === 'string' ? req.query.status : 'all';
    if (!['all', 'pending', 'replied', 'failed', 'skipped'].includes(status)) status = 'all';
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 200);

    const [result, counts] = await Promise.all([
      postsRepo.listComments(id, { status, search, page, limit }),
      postsRepo.countCommentsByStatus(id),
    ]);

    return res.json({
      items: result.rows,
      total: result.total,
      page,
      limit,
      counts,
    });
  } catch (err) {
    return next(err);
  }
});

/* ================================ HITS ================================ */

router.get('/:id/hits', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const post = await postsRepo.getPostById(id);
    if (!post) {
      return res.status(404).json({ error: 'المنشور غير موجود.' });
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 200);

    const result = await postsRepo.listHits(id, { page, limit });
    return res.json({ items: result.rows, total: result.total, page, limit });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
