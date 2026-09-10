const router = require('express').Router();
const {
  fetchOrdersRows,
  buildClient,
  getSheetTab,
} = require('../config/googleSheets');
const { google } = require('googleapis');

const CACHE_TTL_MS = 60 * 1000; // 60 ثانية

let cache = {
  rows: null,
  fetchedAt: 0,
};

const STATUSES = [
  'Pending',
  'Confirmed',
  'Shipped',
  'At Office',
  'Delivered',
  'Cancelled',
  'Returned',
  'No Answer 1',
  'No Answer 2',
  'No Answer 3',
];

function mapRow(row) {
  const at = (i) => (row && row[i] !== undefined ? String(row[i]) : '');
  return {
    date_time: at(0),
    order_number: at(1),
    full_name: at(2),
    wilaya: at(3),
    wilaya_code: at(4),
    city: at(5),
    delivery_type: at(6),
    phone: at(7),
    product_title: at(8),
    quantity: at(9),
    total_price: at(10),
    status: at(11),
    note: at(12),
  };
}

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

function matchesSearch(order, search) {
  const q = String(search).toLowerCase();
  if (order.full_name.toLowerCase().includes(q)) return true;
  if (order.order_number.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D+/g, '');
  if (digits && normalizePhone(order.phone).includes(digits)) return true;
  return false;
}

function pickFromCache() {
  if (cache.rows && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rows;
  }
  return null;
}

async function getCachedRows() {
  const existing = pickFromCache();
  if (existing) return existing;

  const rows = await fetchOrdersRows();
  cache = { rows, fetchedAt: Date.now() };
  return rows;
}

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').trim().toLowerCase();
    const status = (req.query.status || '').trim();

    let orders = (await getCachedRows()).map(mapRow);

    if (search) {
      orders = orders.filter((o) => matchesSearch(o, search));
    }

    if (status) {
      const statusFilter = status.toLowerCase();
      orders = orders.filter((o) => o.status.toLowerCase() === statusFilter);
    }

    const total = orders.length;
    const start = (page - 1) * limit;
    const paged = orders.slice(start, start + limit);

    return res.json({ orders: paged, total, page, limit });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  }
});

// يُصدَّر حتى يعرف الـ frontend أو لوحة الإعدادات الحالات المسموحة
router.get('/statuses', (req, res) => {
  return res.json({ statuses: STATUSES });
});

router.get('/stats', async (req, res, next) => {
  try {
    const orders = (await getCachedRows()).map(mapRow);
    const total = orders.length;

    const byStatus = {};
    STATUSES.forEach(s => {
      byStatus[s] = 0;
    });

    orders.forEach(o => {
      const s = String(o.status || '').trim();
      const matched = STATUSES.find(st => st.toLowerCase() === s.toLowerCase());
      if (matched) {
        byStatus[matched]++;
      }
    });

    return res.json({ total, byStatus });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  }
});

// تحديث حالة طلبية في الشيت (عمود Status = L)
// body: { status: "Pending" | "Confirmed" | ... }
router.patch('/:orderNumber/status', async (req, res, next) => {
  try {
    const orderNumber = String(req.params.orderNumber || '').trim();
    const requested = String((req.body && req.body.status) || '').trim();
    const status = STATUSES.find((s) => s.toLowerCase() === requested.toLowerCase());

    if (!status) {
      return res.status(400).json({
        error: 'حالة غير صالحة. الحالات المسموحة: ' + STATUSES.join('، '),
      });
    }

    if (!orderNumber) {
      return res.status(400).json({ error: 'رقم الطلبية مطلوب' });
    }

    // نقرأ دائمًا صفوفًا حديثة (بدون كاش) — فهرس الصف يتغير عند إضافة سطر من الفريق
    let rows;
    let indexes = [];
    try {
      rows = await fetchOrdersRows();
      rows.forEach((row, i) => {
        if (String(row[1] || '').trim() === orderNumber) indexes.push(i);
      });
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
    }

    if (!indexes.length) {
      return res.status(404).json({ error: 'الطلبية غير موجودة: ' + orderNumber });
    }

    const client = buildClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    try {
      // عمود L = Status، رقم الصف = فهرس الصف + 2 (الصف 1 هو العناوين)
      for (const idx of indexes) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID.trim(),
          range: `'${getSheetTab()}'!L${idx + 2}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[status]] },
        });
      }
    } catch (err) {
      return res.status(500).json({
        error:
          'تعذّر تحديث الحالة في Google Sheets. تأكد أن توكن OAuth له صلاحية كتابة ' +
          '(أعد توليده بـ `node scripts/google-oauth.js` بعد تحديث الصلاحية). — التفاصيل: ' +
          (err.message || err),
      });
    }

    // نحدّث الكاش فورًا بالقيم الجديدة (بدون استدعاء إضافي)
    indexes.forEach((idx) => {
      if (rows[idx] && rows[idx].length > 11) rows[idx][11] = status;
    });
    cache = { rows, fetchedAt: Date.now() };

    return res.json({
      success: true,
      order_number: orderNumber,
      status,
      updated_rows: indexes.length,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  }
});

module.exports = router;