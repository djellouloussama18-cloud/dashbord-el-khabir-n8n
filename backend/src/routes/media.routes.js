const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  autoDetectTypeFromUrl,
  checkExtensionMatches,
  headCheck,
  validateMediaUrl,
} = require('../utils/media');

// أقصى 30 طلب لكل 10 دقائق لكل IP (فحص رابط + رفع ملف).
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'طلبات كثيرة. أعد المحاولة بعد 10 دقائق.' });
  },
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(IMAGE_MAX_BYTES, VIDEO_MAX_BYTES),
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) return cb(null, true);
    if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('نوع الملف غير مسموح به. يُسمح بالصور JPG/PNG/GIF والفيديو MP4 فقط.'));
  },
});

/** يغلّف multer ليعيد أخطاء عربية واضحة (400) بدل خطأ عام 500. */
function uploadSingle(field) {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: 'حجم الملف يتجاوز الحد المسموح (صورة 8 ميغابايت / فيديو 25 ميغابايت).',
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'الحقل المتوقع لرفع الملف هو "file".' });
        }
        return res.status(400).json({ error: 'تعذّر استقبال الملف.' });
      }
      return res.status(400).json({ error: err.message || 'تعذّر استقبال الملف.' });
    });
  };
}

function detectTypeFromMime(mime) {
  if (ALLOWED_IMAGE_MIME.includes(mime)) return 'image';
  if (ALLOWED_VIDEO_MIME.includes(mime)) return 'video';
  return null;
}

function extFromMime(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'video/mp4') return '.mp4';
  return '';
}

/** يرفع الملف إلى Supabase Storage عبر REST API ويُرجع الرابط العام. */
function uploadToSupabase({ buffer, contentType, originalName }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || 'voice-messages';

  if (!supabaseUrl || !serviceKey) {
    const err = new Error('supabase_not_configured');
    err.status = 503;
    return Promise.reject(err);
  }

  const type = detectTypeFromMime(contentType);
  const ext = extFromMime(contentType) || path.extname(originalName || '').toLowerCase();
  const filename = `dashboard-media/${crypto.randomUUID()}${ext}`;
  const base = supabaseUrl.replace(/\/$/, '');
  const uploadUrl = `${base}/storage/v1/object/${bucket}/${filename}`;

  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(uploadUrl);
    } catch (e) {
      const err = new Error('supabase_bad_url');
      err.status = 500;
      return reject(err);
    }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method: 'POST',
        timeout: 60000,
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
      },
      (res) => {
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              url: `${base}/storage/v1/object/public/${bucket}/${filename}`,
              media_type: type,
              size: buffer.length,
            });
            return;
          }
          const err = new Error('supabase_upload_failed');
          err.status = 502;
          err.statusCode = res.statusCode;
          reject(err);
        });
        res.resume();
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.write(buffer);
    req.end();
  });
}

/** يخبر الواجهة هل الرفع إلى التخزين مفعّل (بدون كشف أي مفتاح). */
router.get('/upload-availability', (req, res) => {
  const available = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return res.json({ available });
});

router.post('/check', limiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    let type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';

    const validation = validateMediaUrl(url);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    if (!validation.url) {
      return res.status(400).json({ error: 'يجب توفير رابط الوسائط.' });
    }
    if (!type) {
      type = autoDetectTypeFromUrl(validation.url);
    }
    if (type !== 'image' && type !== 'video') {
      return res.status(400).json({ error: 'نوع الوسائط غير صالح أو غير قابل للكشف.' });
    }
    const extCheck = checkExtensionMatches(type, validation.url);
    if (!extCheck.ok) {
      return res.status(400).json({ error: extCheck.error });
    }
    const result = await headCheck(validation.url, type, 5000);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({
      ok: true,
      type: result.type || type,
      size: result.size === undefined ? null : result.size,
      warnings: result.warnings || [],
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/upload', limiter, uploadSingle('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم رفع أي ملف.' });
    }
    const mime = req.file.mimetype;
    const type = detectTypeFromMime(mime);
    if (!type) {
      return res.status(400).json({ error: 'نوع الملف غير مسموح به.' });
    }
    if (type === 'image' && req.file.size > IMAGE_MAX_BYTES) {
      return res.status(400).json({ error: 'حجم الصورة يتجاوز الحد المسموح (8 ميغابايت).' });
    }
    if (type === 'video' && req.file.size > VIDEO_MAX_BYTES) {
      return res.status(400).json({ error: 'حجم الفيديو يتجاوز الحد المسموح (25 ميغابايت).' });
    }

    try {
      const result = await uploadToSupabase({
        buffer: req.file.buffer,
        contentType: mime,
        originalName: req.file.originalname,
      });
      return res.status(201).json(result);
    } catch (err) {
      if (err.message === 'supabase_not_configured') {
        return res.status(503).json({
          error: 'رفع الملفات غير مفعل على الخادم. يرجى إعداد متغيرات Supabase.',
        });
      }
      if (err.message === 'supabase_upload_failed') {
        return res.status(502).json({
          error: `فشل رفع الملف إلى التخزين (رمز الحالة: ${err.statusCode || '؟'}).`,
        });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
