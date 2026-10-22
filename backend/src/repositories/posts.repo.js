const pool = require('../config/db');

/**
 * أعمدة المنشور + الإحصائيات المجمّعة (keywords / comments / hits)
 * محسوبة فـ SQL عبر LEFT JOIN LATERAL — بلا N+1.
 */
const POST_COLUMNS = `
       p.id,
       p.title,
       p.post_url,
       p.post_key,
       p.post_type,
       p.platform,
       p.comment_reply_variants,
       p.comment_reply_index,
       p.is_active,
       p.created_at,
       p.updated_at,
       COALESCE(kk.keywords_count, 0)::int AS keywords_count,
       COALESCE(kk.active_keywords_count, 0)::int AS active_keywords_count,
       COALESCE(cc.comments_total, 0)::int AS comments_total,
       COALESCE(cc.comments_replied, 0)::int AS comments_replied,
       COALESCE(cc.comments_failed, 0)::int AS comments_failed,
       COALESCE(cc.comments_pending, 0)::int AS comments_pending,
       COALESCE(cc.comments_skipped, 0)::int AS comments_skipped,
       COALESCE(hh.hits_total, 0)::int AS hits_total,
       COALESCE(hh.hits_failed, 0)::int AS hits_failed`;

const POST_JOINS = `
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS keywords_count,
               COUNT(*) FILTER (WHERE k.is_active)::int AS active_keywords_count
          FROM bot_post_keywords k
         WHERE k.post_id = p.id
      ) kk ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS comments_total,
               COUNT(*) FILTER (WHERE c.reply_status = 'replied')::int AS comments_replied,
               COUNT(*) FILTER (WHERE c.reply_status = 'failed')::int AS comments_failed,
               COUNT(*) FILTER (WHERE c.reply_status = 'pending')::int AS comments_pending,
               COUNT(*) FILTER (WHERE c.reply_status = 'skipped')::int AS comments_skipped
          FROM bot_post_comments c
         WHERE c.post_id = p.id
      ) cc ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS hits_total,
               COUNT(*) FILTER (WHERE h.dm_status = 'failed')::int AS hits_failed
          FROM bot_keyword_hits h
          JOIN bot_post_keywords k2 ON k2.id = h.keyword_id
         WHERE k2.post_id = p.id
      ) hh ON TRUE`;

/** قائمة المنشورات مع بحث/فلترة وترقيم — مقيّضة بالمنصّة (الافتراضي فيسبوك). */
async function listPosts({ search, status, page, limit, platform = 'facebook' }) {
  const conditions = [];
  const params = [];
  let p = 1;

  conditions.push(`p.platform = $${p}`);
  params.push(platform);
  p += 1;

  if (search && search.trim() !== '') {
    const pattern = `%${search.trim()}%`;
    conditions.push(
      `(p.title ILIKE $${p} OR p.post_url ILIKE $${p} OR p.post_key ILIKE $${p})`
    );
    params.push(pattern);
    p += 1;
  }

  if (status === 'active') conditions.push('p.is_active = TRUE');
  else if (status === 'inactive') conditions.push('p.is_active = FALSE');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const query = `
    SELECT ${POST_COLUMNS},
           COUNT(*) OVER () AS __total
      FROM bot_posts p
      ${POST_JOINS}
      ${where}
     ORDER BY p.created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`;

  const result = await pool.query(query, params);
  const total = result.rows.length ? Number(result.rows[0].__total) : 0;
  const rows = result.rows.map(({ __total, ...row }) => row);
  return { rows, total };
}

/** منشور واحد + إحصائياته. */
async function getPostById(id) {
  const query = `
    SELECT ${POST_COLUMNS}
      FROM bot_posts p
      ${POST_JOINS}
     WHERE p.id = $1::bigint`;
  const result = await pool.query(query, [id]);
  return result.rows[0] || null;
}

/** إحصائيات مجمّعة للمنشور نفسه (نفس شكل القائمة). */
function statsFromPost(post) {
  return {
    keywords_count: post.keywords_count,
    active_keywords_count: post.active_keywords_count,
    comments_total: post.comments_total,
    comments_replied: post.comments_replied,
    comments_failed: post.comments_failed,
    comments_pending: post.comments_pending,
    comments_skipped: post.comments_skipped,
    hits_total: post.hits_total,
    hits_failed: post.hits_failed,
  };
}

/**
 * إيجاد منشور بنفس post_key داخل منصّة محددة (لكشف التكرار).
 * التفرّد في القاعدة: UNIQUE (platform, post_key).
 */
async function findPostByKey(platform, key, excludeId = null) {
  let pf = platform;
  if (pf !== 'facebook' && pf !== 'instagram') {
    // استدعاء قديم بالصيغة findPostByKey(postKey, excludeId) — فيسبوك افتراضيًا.
    excludeId = key;
    key = platform;
    pf = 'facebook';
  }
  const result = await pool.query(
    `SELECT id FROM bot_posts
      WHERE platform = $1
        AND post_key = $2
        AND ($3::bigint IS NULL OR id <> $3::bigint)
      LIMIT 1`,
    [pf, key, excludeId]
  );
  return result.rows[0] || null;
}

async function createPost({ title, postUrl, postKey, postType, variants, isActive, platform = 'facebook' }) {
  const result = await pool.query(
    `INSERT INTO bot_posts (title, post_url, post_key, post_type, comment_reply_variants, is_active, platform)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, post_url, post_key, post_type, platform, comment_reply_variants, comment_reply_index, is_active, created_at, updated_at`,
    [title, postUrl, postKey, postType, variants, isActive, platform]
  );
  return result.rows[0];
}

/**
 * إنشاء المنشور + الكلمة المفتاحية الأولى (مع مرفقها) في معاملة واحدة:
 * أي فشل في التحقق أو الإدراج يترك بلا منشور نصيف.
 * firstKeyword = { keyword, keywordNormalized, dmMessage, stopBotAfterSend, isActive, mediaUrl, mediaType }
 */
async function createPostWithFirstKeyword({
  title,
  postUrl,
  postKey,
  postType,
  variants,
  isActive,
  platform = 'facebook',
  firstKeyword = null,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const postResult = await client.query(
      `INSERT INTO bot_posts (title, post_url, post_key, post_type, comment_reply_variants, is_active, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, post_url, post_key, post_type, platform, comment_reply_variants, comment_reply_index, is_active, created_at, updated_at`,
      [title, postUrl, postKey, postType, variants, isActive, platform]
    );
    const post = postResult.rows[0];

    let keyword = null;
    if (firstKeyword) {
      const keywordResult = await client.query(
        `INSERT INTO bot_post_keywords
           (post_id, keyword, keyword_normalized, dm_message, stop_bot_after_send, is_active, media_type, media_url)
         VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, post_id, keyword, keyword_normalized, dm_message,
                   stop_bot_after_send, is_active, hits_count, platform,
                   media_type, media_url,
                   created_at, updated_at`,
        [
          post.id,
          firstKeyword.keyword,
          firstKeyword.keywordNormalized,
          firstKeyword.dmMessage,
          firstKeyword.stopBotAfterSend,
          firstKeyword.isActive,
          firstKeyword.mediaType === undefined ? null : firstKeyword.mediaType,
          firstKeyword.mediaUrl === undefined ? null : firstKeyword.mediaUrl,
        ]
      );
      keyword = keywordResult.rows[0];
    }

    await client.query('COMMIT');
    return { post, keyword };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const POST_UPDATE_COLUMNS = {
  title: 'title',
  post_url: 'post_url',
  post_key: 'post_key',
  post_type: 'post_type',
  comment_reply_variants: 'comment_reply_variants',
  is_active: 'is_active',
};

/** تعديل ديناميكي — دائمًا updated_at = NOW(). */
async function updatePost(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;

  Object.keys(POST_UPDATE_COLUMNS).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${POST_UPDATE_COLUMNS[key]} = $${p}`);
      params.push(fields[key]);
      p += 1;
    }
  });

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await pool.query(
    `UPDATE bot_posts
        SET ${sets.join(', ')}
      WHERE id = $${p}::bigint
      RETURNING id, title, post_url, post_key, post_type, platform, comment_reply_variants, comment_reply_index, is_active, created_at, updated_at`,
    params
  );
  return result.rows[0] || null;
}

/** حذف المنشور وكلماته داخل معاملة واحدة (الفشل عبر FK يرمي 23503). */
async function deletePost(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bot_post_keywords WHERE post_id = $1::bigint', [id]);
    const result = await client.query(
      'DELETE FROM bot_posts WHERE id = $1::bigint RETURNING id',
      [id]
    );
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ============================ KEYWORDS ============================ */

/** تطبيع الكلمة عبر دالة SQL (ممنوع إعادة تنفيذها فـ JS). */
async function normalizeKeyword(keyword) {
  const result = await pool.query('SELECT public.normalize_keyword($1::text) AS n', [keyword]);
  return result.rows[0] ? result.rows[0].n : null;
}

/**
 * كشف تعارض كلمة مفتاحية نشطة تنتمي لمنشور نشط (عقد n8n #3).
 * excludeKeywordId لاستثناء الكلمة نفسها عند التعديل.
 * القاعدة العالمية تعمل لمنشورات فيسبوك فقط؛ إنستغرام لا تعارض بين المنشورات
 * (التفرّد داخل المنشور فقط عبر قيد القاعدة) — تُرجع null بلا استعلام.
 */
async function findConflictingKeyword(normalized, excludeKeywordId = null, platform = 'facebook') {
  if (platform === 'instagram') return null;
  const result = await pool.query(
    `SELECT p.title, p.post_url
       FROM bot_post_keywords k
       JOIN bot_posts p ON p.id = k.post_id
      WHERE k.keyword_normalized = $1
        AND k.is_active = TRUE
        AND p.is_active = TRUE
        AND p.platform = 'facebook'
        AND ($2::bigint IS NULL OR k.id <> $2::bigint)
      LIMIT 1`,
    [normalized, excludeKeywordId]
  );
  return result.rows[0] || null;
}

/**
 * كشف تعارض عند إعادة تفعيل المنشور: هل توجد كلمة نشطة فـ هذا المنشور
 * تتشارك نفس keyword_normalized مع كلمة نشطة فـ منشور آخر نشط؟
 * لمنشورات فيسبوك فقط — إنستغرام يُرجع null (لا تعارض بين المنشورات).
 */
async function findReactivationConflict(postId, platform = 'facebook') {
  if (platform === 'instagram') return null;
  const result = await pool.query(
    `SELECT o.title, o.post_url, k.keyword
       FROM bot_post_keywords k
       JOIN bot_post_keywords k2
         ON k2.keyword_normalized = k.keyword_normalized
        AND k2.is_active = TRUE
        AND k2.id <> k.id
       JOIN bot_posts o ON o.id = k2.post_id AND o.is_active = TRUE
                          AND o.platform = 'facebook'
      WHERE k.post_id = $1::bigint
        AND k.is_active = TRUE
      LIMIT 1`,
    [postId]
  );
  return result.rows[0] || null;
}

async function listKeywords(postId) {
  const result = await pool.query(
    `SELECT id, post_id, keyword, keyword_normalized, dm_message,
            stop_bot_after_send, is_active, hits_count, platform,
            media_type, media_url,
            created_at, updated_at
       FROM bot_post_keywords
      WHERE post_id = $1::bigint
      ORDER BY id ASC`,
    [postId]
  );
  return result.rows;
}

async function getKeywordById(id) {
  const result = await pool.query(
    `SELECT k.id, k.post_id, k.keyword, k.keyword_normalized, k.dm_message,
            k.stop_bot_after_send, k.is_active, k.hits_count, k.platform,
            k.media_type, k.media_url,
            k.created_at, k.updated_at,
            p.title AS post_title, p.post_url AS post_url, p.is_active AS post_is_active
       FROM bot_post_keywords k
       JOIN bot_posts p ON p.id = k.post_id
      WHERE k.id = $1::bigint`,
    [id]
  );
  return result.rows[0] || null;
}

async function createKeyword(postId, data) {
  const result = await pool.query(
    `INSERT INTO bot_post_keywords
       (post_id, keyword, keyword_normalized, dm_message, stop_bot_after_send, is_active, media_type, media_url)
     VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, post_id, keyword, keyword_normalized, dm_message,
               stop_bot_after_send, is_active, hits_count, platform,
               media_type, media_url,
               created_at, updated_at`,
    [
      postId,
      data.keyword,
      data.keywordNormalized,
      data.dmMessage,
      data.stopBotAfterSend,
      data.isActive,
      data.mediaType === undefined ? null : data.mediaType,
      data.mediaUrl === undefined ? null : data.mediaUrl,
    ]
  );
  return result.rows[0];
}

const KEYWORD_UPDATE_COLUMNS = {
  keyword: 'keyword',
  keyword_normalized: 'keyword_normalized',
  dm_message: 'dm_message',
  stop_bot_after_send: 'stop_bot_after_send',
  is_active: 'is_active',
  media_type: 'media_type',
  media_url: 'media_url',
};

async function updateKeyword(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;

  Object.keys(KEYWORD_UPDATE_COLUMNS).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${KEYWORD_UPDATE_COLUMNS[key]} = $${p}`);
      params.push(fields[key]);
      p += 1;
    }
  });

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await pool.query(
    `UPDATE bot_post_keywords
        SET ${sets.join(', ')}
      WHERE id = $${p}::bigint
      RETURNING id, post_id, keyword, keyword_normalized, dm_message,
                stop_bot_after_send, is_active, hits_count, platform,
                media_type, media_url,
                created_at, updated_at`,
    params
  );
  return result.rows[0] || null;
}

async function deleteKeyword(id) {
  const result = await pool.query(
    'DELETE FROM bot_post_keywords WHERE id = $1::bigint RETURNING id',
    [id]
  );
  return result.rows[0] || null;
}

/* ============================ COMMENTS ============================ */

async function countCommentsByStatus(postId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE reply_status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE reply_status = 'replied')::int AS replied,
            COUNT(*) FILTER (WHERE reply_status = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE reply_status = 'skipped')::int AS skipped
       FROM bot_post_comments
      WHERE post_id = $1::bigint`,
    [postId]
  );
  return result.rows[0] || { total: 0, pending: 0, replied: 0, failed: 0, skipped: 0 };
}

async function listComments(postId, { status, search, page, limit }) {
  const conditions = ['post_id = $1::bigint'];
  const params = [postId];
  let p = 2;

  if (['pending', 'replied', 'failed', 'skipped'].includes(status)) {
    conditions.push(`reply_status = $${p}`);
    params.push(status);
    p += 1;
  }

  if (search && search.trim() !== '') {
    const pattern = `%${search.trim()}%`;
    conditions.push(`(commenter_name ILIKE $${p} OR comment_text ILIKE $${p})`);
    params.push(pattern);
    p += 1;
  }

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const query = `
    SELECT id, post_id, comment_id, commenter_id, commenter_name, comment_text,
           reply_status, reply_text, replied_at, error_message, created_at,
           COUNT(*) OVER () AS __total
      FROM bot_post_comments
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${p} OFFSET $${p + 1}`;

  const result = await pool.query(query, params);
  const total = result.rows.length ? Number(result.rows[0].__total) : 0;
  const rows = result.rows.map(({ __total, ...row }) => row);
  return { rows, total };
}

/* ============================== HITS ============================== */

async function listHits(postId, { page, limit }) {
  const offset = (page - 1) * limit;
  const query = `
    SELECT h.id,
           k.keyword,
           h.client_id,
           cs.customer_name,
           h.matched_text,
           h.dm_status,
           h.created_at,
           COUNT(*) OVER () AS __total
      FROM bot_keyword_hits h
      JOIN bot_post_keywords k ON k.id = h.keyword_id
      LEFT JOIN conversation_state cs ON cs.client_id = h.client_id::text
     WHERE k.post_id = $1::bigint
     ORDER BY h.created_at DESC
     LIMIT $2 OFFSET $3`;

  const result = await pool.query(query, [postId, limit, offset]);
  const total = result.rows.length ? Number(result.rows[0].__total) : 0;
  const rows = result.rows.map(({ __total, ...row }) => row);
  return { rows, total };
}

/* ============================ ROUND-ROBIN VARIANTS ============================ */

/**
 * يختار الرد التالي بالتناوب (Round-Robin) بشكل atomic.
 * يعيد نص الرد، أو null إذا لم تكن هناك صيغ.
 */
async function getNextVariant(postId) {
  // CTE atomic: نحسب الـ index الجديد ونحدّث ونرجع النص في خطوة واحدة
  const result = await pool.query(
    `WITH updated AS (
       UPDATE bot_posts
          SET comment_reply_index =
                CASE
                  WHEN array_length(comment_reply_variants, 1) IS NULL OR
                       array_length(comment_reply_variants, 1) = 0
                  THEN 0
                  ELSE (comment_reply_index + 1) % array_length(comment_reply_variants, 1)
                END,
              updated_at = NOW()
        WHERE id = $1::bigint
       RETURNING comment_reply_variants, comment_reply_index
     )
     SELECT
       comment_reply_variants,
       comment_reply_index,
       CASE
         WHEN array_length(comment_reply_variants, 1) IS NULL OR
              array_length(comment_reply_variants, 1) = 0
         THEN NULL
         ELSE comment_reply_variants[comment_reply_index + 1]
       END AS variant_text
     FROM updated`,
    [postId]
  );
  if (!result.rows.length) return null;
  return result.rows[0].variant_text || null;
}

/**
 * يعيد comment_reply_index إلى 0 عند تعديل صيغ الرد.
 */
async function resetVariantIndex(postId) {
  await pool.query(
    `UPDATE bot_posts SET comment_reply_index = 0, updated_at = NOW() WHERE id = $1::bigint`,
    [postId]
  );
}

/* ============================ SUMMARY ============================ */

/** إحصائيات مجمّعة مقيّضة بمنصّة واحدة (الافتراضي فيسبوك) — نفس شكل الاستجابة. */
async function getSummary(platform = 'facebook') {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM bot_posts WHERE platform = $1) AS total_posts,
       (SELECT COUNT(*)::int FROM bot_posts WHERE platform = $1 AND is_active) AS active_posts,
       (SELECT COUNT(*)::int
          FROM bot_post_comments c
          JOIN bot_posts p ON p.id = c.post_id
         WHERE p.platform = $1) AS total_comments,
       (SELECT COUNT(*)::int
          FROM bot_post_comments c
          JOIN bot_posts p ON p.id = c.post_id
         WHERE p.platform = $1 AND c.reply_status = 'replied') AS replied_comments,
       (SELECT COUNT(*)::int
          FROM bot_post_comments c
          JOIN bot_posts p ON p.id = c.post_id
         WHERE p.platform = $1 AND c.reply_status = 'failed') AS failed_comments,
       (SELECT COUNT(*)::int
          FROM bot_keyword_hits h
          JOIN bot_post_keywords k ON k.id = h.keyword_id
          JOIN bot_posts p ON p.id = k.post_id
         WHERE p.platform = $1) AS total_hits`,
    [platform]
  );
  return result.rows[0];
}

module.exports = {
  listPosts,
  getPostById,
  statsFromPost,
  findPostByKey,
  createPost,
  createPostWithFirstKeyword,
  updatePost,
  deletePost,
  normalizeKeyword,
  findConflictingKeyword,
  findReactivationConflict,
  listKeywords,
  getKeywordById,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  countCommentsByStatus,
  listComments,
  listHits,
  getSummary,
  getNextVariant,
  resetVariantIndex,
};
