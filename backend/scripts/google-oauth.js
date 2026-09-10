/*
 * إعداد OAuth2 لشيت الطلبات (مثل credential في n8n).
 *
 * الاستعمال:
 *   1) فعّل Google Sheets API + جهّز OAuth Client في Google Cloud Console،
 *      وأضف http://127.0.0.1:3010/oauth2callback إلى Authorized redirect URIs.
 *   2) تأكد أن GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET موجودان في backend/.env
 *   3) شغّل:  node scripts/google-oauth.js
 *
 * يفتح خادم مؤقت على 127.0.0.1:3010، يفتح لك شاشة الموافقة،
 * ويخزّن GOOGLE_REFRESH_TOKEN في .env تلقائيًا.
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const PORT = Number(process.env.GOOGLE_OAUTH_PORT || 3010);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
// قراءة + كتابة (مطلوب لتحديث حالة الطلبيات؛ يطلب إعادة موافقة لمنح التوكن القديم)
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const ENV_PATH = path.join(__dirname, '..', '.env');

function fail(message) {
  console.error('✖ ' + message);
  process.exit(1);
}

function upsertEnv(key, value) {
  let lines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    : [];

  let quoted = value;
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    quoted = '"' + value.replace(/"/g, '\\"') + '"';
  }

  const pattern = new RegExp('^' + key + '=');
  if (lines.some((l) => pattern.test(l))) {
    lines = lines.map((l) => (pattern.test(l) ? key + '=' + quoted : l));
  } else {
    lines.push(key + '=' + quoted);
    if (!lines.some((l) => l === '') && lines.length > 0) lines.push('');
  }

  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
  console.log('✔ ' + key + ' = <' + String(value).length + ' حرفًا> خُزّن في .env');
}

function openBrowser(url) {
  let cmd = null;
  if (process.platform === 'win32') cmd = 'start "" "' + url + '"';
  else if (process.platform === 'darwin') cmd = 'open "' + url + '"';
  else cmd = 'xdg-open "' + url + '"';

  require('child_process').exec(cmd, () => {});
}

async function main() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    fail(
      'GOOGLE_CLIENT_ID أو GOOGLE_CLIENT_SECRET مفقودان في .env — أضفهما أولاً ثم أعد التشغيل.'
    );
  }

  const oauth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [SCOPE],
    redirect_uri: REDIRECT_URI,
  });

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, REDIRECT_URI);
    if (urlObj.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      error
        ? '✖ رُفض التخويل: ' + error + ' <script>setTimeout(()=>window.close(),3000)</script>'
        : '✔ تم التخويل بنجاح! يمكنك إغلاق هذه النافذة. <script>setTimeout(()=>window.close(),1500)</script>'
    );

    server.close();

    if (error) {
      console.error('✖ رجع خطأ من Google: ' + error);
      process.exit(1);
    }
    if (!code) {
      fail('لم يُستلم authorization code من Google.');
    }

    try {
      const { tokens } = await oauth.getToken({ code, redirect_uri: REDIRECT_URI });
      if (!tokens.refresh_token) {
        fail('لم يُرجع Google refresh_token — يجب إزالة التطبيق من حسابك أو وضع "Testing" مضبوط.');
      }
      upsertEnv('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
      console.log('');
      console.log('✔ اكتمل الإعداد. أعد تشغيل السيرفر ثم افتح #/orders.');
    } catch (err) {
      fail('فشل تبادل الرمز مع Google: ' + (err.message || err));
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('افتح الرابط التالي في متصفحك وسجّل الدخول بحساب جوجل الذي يرى شيت الطلبات:');
    console.log(authUrl);
    console.log('');
    openBrowser(authUrl);
  });

  server.setTimeout(5 * 60 * 1000, () => {
    console.error('✖ انتهت المهلة (5 دقائق) بدون تخويل.');
    process.exit(1);
  });
}

main().catch((err) => fail(err.message || err));