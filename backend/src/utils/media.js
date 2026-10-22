const https = require('https');
const dns = require('dns').promises;
const net = require('net');

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif'];
const VIDEO_EXT = ['.mp4'];
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif'];
const ALLOWED_VIDEO_MIME = ['video/mp4'];

/**
 * مضيفات صفحات المشاركة (ليست روابط مباشرة للملف) — تُرفض حتى لو كان الامتداد صحيحًا.
 * تُطابق النطاق الرئيسي وكل نطاقاته الفرعية.
 */
const DISALLOWED_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'onedrive.live.com',
  'sharepoint.com',
  '1drv.ms',
];

function hostMatchesBlockedList(hostname) {
  const host = normalizeHostname(hostname);
  return DISALLOWED_HOSTS.some(
    (blocked) => host === blocked || host.endsWith('.' + blocked)
  );
}

/** يزيل الأقواس من عناوين IPv6 ([::1] → ::1) ويحوّل الاسم إلى أحرف صغيرة. */
function normalizeHostname(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

/* ============================ عناوين IP ============================ */

function parseIPv4(ip) {
  const parts = String(ip).split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4) return null;
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIPv4(ip) {
  const p = parseIPv4(ip);
  if (!p) return true; // عنوان غير صالح → يُعامل كمحظور
  const [a, b, c] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** يوسّع عنوان IPv6 إلى 8 مجموعات hex (بدون zone id). */
function expandIPv6(ip) {
  const clean = String(ip).toLowerCase().split('%')[0];

  // الشكل المختصر مع IPv4 في النهاية (مثل ::ffff:127.0.0.1) → نحوّله إلى مجموعتين hex
  let parts = clean.split(':');
  const lastIdx = parts.length - 1;
  if (parts[lastIdx] && parts[lastIdx].indexOf('.') !== -1) {
    const v4 = parseIPv4(parts[lastIdx]);
    if (!v4) return null;
    parts = parts
      .slice(0, lastIdx)
      .concat(
        ((((v4[0] << 8) | v4[1]) >>> 0).toString(16)),
        ((((v4[2] << 8) | v4[3]) >>> 0).toString(16))
      );
  }

  const [head, tail] = parts.join(':').split('::');
  const headParts = head ? head.split(':').filter((x) => x !== '') : [];
  const tailParts = tail !== undefined ? tail.split(':').filter((x) => x !== '') : [];
  let groups;
  if (tail === undefined) {
    groups = headParts;
  } else {
    const fill = 8 - headParts.length - tailParts.length;
    if (fill < 0) return null;
    groups = headParts.concat(Array(fill).fill('0'), tailParts);
  }
  if (groups.length !== 8) return null;
  return groups;
}

function isPrivateIPv6(ip) {
  const groups = expandIPv6(ip);
  if (!groups) return true;
  const nums = groups.map((g) => parseInt(g, 16) || 0);

  // ::ffff:a.b.c.d  →  نترجمها إلى IPv4 ونطبّق نفس القواعد
  const isV4Mapped =
    nums[0] === 0 &&
    nums[1] === 0 &&
    nums[2] === 0 &&
    nums[3] === 0 &&
    nums[4] === 0 &&
    nums[5] === 0xffff;
  if (isV4Mapped) {
    const a = (nums[6] >> 8) & 0xff;
    const b = nums[6] & 0xff;
    const c = (nums[7] >> 8) & 0xff;
    const d = nums[7] & 0xff;
    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }

  if (nums.every((n) => n === 0)) return true; // ::
  if (nums.slice(0, 7).every((n) => n === 0) && nums[7] === 1) return true; // ::1
  if ((nums[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (unique local)
  if ((nums[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((nums[0] & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  if (nums[0] === 0x0100 && nums[1] === 0 && nums[2] === 0 && nums[3] === 0) return true; // 100::/64
  if (nums[0] === 0x2001 && nums[1] === 0x0db8) return true; // 2001:db8::/32 (docs)
  if (nums[0] === 0x0064 && nums[1] === 0xff9b) return true; // 64:ff9b::/96
  return false;
}

/** هل العنوان داخل شبكة خاصة/محجوبة (loopback, link-local, private...)؟ */
function isPrivateIp(ip) {
  if (!ip) return false;
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

/* ============================ الرابط ============================ */

function getExtensionWithoutQuery(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname.toLowerCase();
    const dot = pathname.lastIndexOf('.');
    if (dot === -1) return '';
    return pathname.substring(dot);
  } catch (e) {
    return '';
  }
}

function autoDetectTypeFromUrl(url) {
  const ext = getExtensionWithoutQuery(url);
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return null;
}

/** تحقّق شكلي من الرابط (بدون أي طلب شبكة). */
function validateMediaUrl(rawUrl) {
  if (rawUrl === null || rawUrl === undefined) {
    return { ok: true, url: null, type: null };
  }
  if (typeof rawUrl !== 'string') {
    return { ok: false, error: 'رابط الوسائط يجب أن يكون نصاً.' };
  }
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return { ok: true, url: null, type: null };
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: 'رابط الوسائط طويل جداً (الحد الأقصى 2000 حرف).' };
  }
  let u;
  try {
    u = new URL(trimmed);
  } catch (e) {
    return { ok: false, error: 'رابط الوسائط غير صالح.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, error: 'يجب أن يكون رابط الوسائط HTTPS فقط.' };
  }
  if (u.username || u.password) {
    return { ok: false, error: 'لا يُسمح ببيانات الاعتماد في رابط الوسائط.' };
  }
  const hostname = normalizeHostname(u.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, error: 'لا يُسمح بالروابط المحلية.' };
  }
  if (hostMatchesBlockedList(hostname)) {
    return {
      ok: false,
      error:
        'يجب أن يكون رابط مباشر للملف، وليس صفحة مشاركة (مثل Google Drive أو Dropbox).',
    };
  }
  if (isPrivateIp(hostname)) {
    return { ok: false, error: 'لا يُسمح بالروابط إلى عناوين IP الخاصة.' };
  }
  return { ok: true, url: trimmed, parsed: u };
}

/**
 * يحل اسم المضيف ويمنع العناوين الخاصة.
 * يعيد { address, family } للاستعمال في تثبيت اتصال HTTP (حماية من DNS rebinding)
 * أو { blocked: true } إذا كان العنوان محظورًا.
 */
async function resolvePublicAddress(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return { blocked: true };
  if (net.isIP(host)) {
    if (isPrivateIp(host)) return { blocked: true };
    return { address: host, family: net.isIPv4(host) ? 4 : 6 };
  }
  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch (e) {
    return { unresolved: true };
  }
  if (!records || !records.length) return { unresolved: true };
  const publicRecord = records.find((r) => !isPrivateIp(r.address));
  if (!publicRecord) return { blocked: true };
  return { address: publicRecord.address, family: publicRecord.family };
}

/**
 * يبني خيارات طلب HTTPS مثبَّتًا على العنوان الذي تحقّقنا منه:
 * الاتصال يذهب إلى الـ IP مباشرةً (حماية من DNS rebinding) مع الحفاظ على
 * اسم المضيف في ترويسة Host وفي SNI حتى تُتحقَّق شهادة TLS بشكل صحيح.
 */
function buildPinnedRequestOptions(u, address, timeoutMs) {
  const hostHeader = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  return {
    protocol: 'https:',
    hostname: address,
    port: u.port || 443,
    path: `${u.pathname}${u.search}`,
    method: 'HEAD',
    servername: u.hostname,
    headers: {
      Host: hostHeader,
      'User-Agent': 'ElKhabirAcademyBot/1.0',
    },
    timeout: timeoutMs,
  };
}

function checkExtensionMatches(type, url) {
  const ext = getExtensionWithoutQuery(url);
  if (type === 'image') {
    if (!IMAGE_EXT.includes(ext)) {
      return {
        ok: false,
        error: 'امتداد الملف يجب أن يتطابق مع نوع الصورة (.jpg, .jpeg, .png, .gif).',
      };
    }
    return { ok: true };
  }
  if (type === 'video') {
    if (!VIDEO_EXT.includes(ext)) {
      return {
        ok: false,
        error: 'امتداد الملف يجب أن يتطابق مع نوع الفيديو (.mp4).',
      };
    }
    return { ok: true };
  }
  return { ok: false, error: 'نوع الوسائط غير صالح.' };
}

/**
 * فحص الرابط بطلب HEAD آمن (SSRF-safe):
 * يحل الـ DNS، يمنع العناوين الخاصة، يثبّت الاتصال على العنوان المُتحقَّق منه،
 * ويتبع حتى تحويلين (redirects) كحد أقصى.
 */
async function headCheck(url, type, timeoutMs = 5000) {
  const warnings = [];
  try {
    new URL(url);
  } catch (e) {
    return { ok: false, error: 'رابط غير صالح' };
  }

  const doRequest = async (currentUrl, redirectsLeft) => {
    let u;
    try {
      u = new URL(currentUrl);
    } catch (e) {
      throw new Error('bad-url');
    }
    if (u.protocol !== 'https:') {
      throw new Error('not-https');
    }
    const resolved = await resolvePublicAddress(u.hostname);
    if (resolved.blocked) {
      throw new Error('private-address');
    }
    if (resolved.unresolved) {
      throw new Error('dns-failed');
    }

    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        buildPinnedRequestOptions(u, resolved.address, timeoutMs),
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            let nextUrl = res.headers.location;
            try {
              nextUrl = new URL(nextUrl, u).toString();
            } catch (e) {
              /* رابط تحويل غير صالح → نستخدم الرد الحالي */
            }
            res.resume();
            resolve({ redirect: nextUrl });
            return;
          }
          resolve({ res });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });
      req.end();
    });

    if (result.redirect) {
      return doRequest(result.redirect, redirectsLeft - 1);
    }
    return result.res;
  };

  try {
    const res = await doRequest(url, 2);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return { ok: false, error: `فشل التحقق من الرابط (رمز الحالة: ${res.statusCode})` };
    }
    const contentType = (res.headers['content-type'] || '').toLowerCase();
    if (type === 'image' && !contentType.startsWith('image/')) {
      return { ok: false, error: 'نوع المحتوى غير متطابق مع صورة.' };
    }
    if (type === 'video' && !contentType.startsWith('video/')) {
      return { ok: false, error: 'نوع المحتوى غير متطابق مع فيديو.' };
    }
    const sizeHeader = res.headers['content-length'];
    let size = null;
    if (sizeHeader) {
      const n = parseInt(sizeHeader, 10);
      if (!Number.isNaN(n)) {
        size = n;
        if (type === 'image' && size > IMAGE_MAX_BYTES) {
          return { ok: false, error: 'حجم الصورة يتجاوز الحد المسموح (8 ميغابايت).' };
        }
        if (type === 'video' && size > VIDEO_MAX_BYTES) {
          return { ok: false, error: 'حجم الفيديو يتجاوز الحد المسموح (25 ميغابايت).' };
        }
      }
    } else {
      warnings.push('تعذر تحديد حجم الملف من الرأس، تأكد من أنه ضمن الحدود المسموحة.');
    }
    return { ok: true, type, size, warnings };
  } catch (e) {
    if (e.message === 'private-address') {
      return { ok: false, error: 'رابط غير مسموح به (عنوان خاص أو محجوب)' };
    }
    if (e.message === 'not-https') {
      return { ok: false, error: 'يجب أن يكون رابط الوسائط HTTPS فقط.' };
    }
    if (e.message === 'dns-failed') {
      warnings.push('تعذر حل اسم المضيف، تم السماح بالرابط مع تحذير.');
      return { ok: true, type, size: null, warnings };
    }
    if (e.message === 'timeout') {
      warnings.push('انتهت مهلة التحقق، تم السماح بالرابط مع تحذير.');
      return { ok: true, type, size: null, warnings };
    }
    warnings.push('لم يتمكن الخادم من الاستجابة للتحقق، تم السماح بالرابط مع تحذير.');
    return { ok: true, type, size: null, warnings };
  }
}

module.exports = {
  IMAGE_EXT,
  VIDEO_EXT,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  DISALLOWED_HOSTS,
  hostMatchesBlockedList,
  isPrivateIp,
  getExtensionWithoutQuery,
  autoDetectTypeFromUrl,
  validateMediaUrl,
  checkExtensionMatches,
  resolvePublicAddress,
  headCheck,
};
