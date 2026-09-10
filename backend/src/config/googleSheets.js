const { google } = require('googleapis');

// صلاحية القراءة/الكتابة (مطلوبة لتحديث حالة الطلبية في الشيت)
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// اسم تبويب الطلبات داخل الشيت (قابل للتغيير عبر env)
function getSheetTab() {
  return (process.env.GOOGLE_SHEET_TAB || 'ORDER').trim();
}

function hasCredentials() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  const sheetId = (process.env.GOOGLE_SHEET_ID || '').trim();
  return Boolean(clientId && clientSecret && refreshToken && sheetId);
}

/**
 * عميل OAuth2 (نفس مبدأ credential مثل n8n): يحمل client_id/client_secret
 * و refresh_token، ويتجدد access_token تلقائيًا عند كل استدعاء.
 */
function buildClient() {
  if (!hasCredentials()) {
    const err = new Error(
      'إعدادات Google Sheets ناقصة: تأكد من GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET و GOOGLE_REFRESH_TOKEN و GOOGLE_SHEET_ID في .env ' +
        '(ولّد الـ refresh token عبر `node scripts/google-oauth.js`)'
    );
    err.status = 500;
    throw err;
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID.trim(),
    process.env.GOOGLE_CLIENT_SECRET.trim()
  );

  client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN.trim(),
  });

  return client;
}

/**
 * رابط شاشة الموافقة (consent) للحصول على رمز التخويل.
 * @param {string} redirectUri مثال: http://127.0.0.1:3010/oauth2callback
 */
function getAuthorizationUrl(redirectUri) {
  const client = new google.auth.OAuth2(
    (process.env.GOOGLE_CLIENT_ID || '').trim(),
    (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    redirectUri
  );

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SHEETS_SCOPE],
    redirect_uri: redirectUri,
  });
}

/**
 * يستبدل رمز التخويل (authorization code) بتوكنز، منها refresh_token.
 */
async function exchangeCode(code, redirectUri) {
  const client = new google.auth.OAuth2(
    (process.env.GOOGLE_CLIENT_ID || '').trim(),
    (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    redirectUri
  );

  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  return tokens;
}

/**
 * يجلب كل الصفوف من تبويب الطلبات (نطاق 'ORDER'!A2:M — يهمل صف العناوين).
 * @returns {Promise<Array<Array<string|number|null>>>} مصفوفة الصفوف الخام
 */
async function fetchOrdersRows() {
  const client = buildClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID.trim(),
      range: `'${getSheetTab()}'!A2:M`,
    });

    return response.data.values || [];
  } catch (err) {
    const wrapped = new Error(
      'تعذّر الاتصال بـ Google Sheets أو الوصول إلى الشيت. ' +
        'تأكد أن الحساب المرتبط بالـ refresh_token له صلاحية مشاهدة الشيت، ' +
        'وأن الـ refresh_token سليم (أعد توليده بـ `node scripts/google-oauth.js`). ' +
        '— التفاصيل: ' +
        (err.message || err)
    );
    wrapped.status = 500;
    throw wrapped;
  }
}

module.exports = {
  fetchOrdersRows,
  buildClient,
  getSheetTab,
  hasCredentials,
  getAuthorizationUrl,
  exchangeCode,
  SHEETS_SCOPE,
};