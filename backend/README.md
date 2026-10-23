# Backend — Dashboard "أكاديمية الخبير"

Backend (Express + PostgreSQL) لداشبورد التحكم في بوت أكاديمية الخبير (n8n + Postgres).
الداشبورد موجه لعميل واحد فقط (بلا حسابات)، لذا الحماية عبر **كلمة سر مشتركة واحدة** تُمكّن
شاشة تسجيل دخول بالـ frontend، ثم **JWT Bearer token** موقّع يُرسَل في كل طلب محمي.

## المتطلبات

- Node.js LTS
- قاعدة بيانات PostgreSQL (نفس قاعدة بيانات n8n — يدعم `DATABASE_URL` لاتصال Supabase pooler)

## التنصيب المحلي

```bash
npm install
```

## إعداد متغيرات البيئة

```bash
cp .env.example .env
```

ثم عبّئ القيم الفارغة. المتغيرات الإجبارية:

| المتغير                     | الوصف                                              |
| --------------------------- | -------------------------------------------------- |
| `DATABASE_URL` **أو** `DB_*` | اتصال القاعدة (الكامل أو `DB_HOST/PORT/NAME/USER/PASSWORD` + `DB_SSL`) |
| `DASHBOARD_PASSWORD_HASH`   | هاش bcrypt لكلمة سر الداشبورد                       |
| `JWT_SECRET`                | سر توقيع الـ JWT                                   |
| `FRONTEND_URL`              | أصل الواجهة المنشورة (لـ CORS) — يدعم فواصل لأكثر من دومين |

### قاعدة البيانات

يُفضَّل `DATABASE_URL` (يُفعِّل SSL تلقائيًا — مناسب لـ Supabase Transaction/Session pooler):

```bash
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

إن لم يُضبط، تُستعمل القيم الفردية `DB_*` مع `DB_SSL=true` عند الحاجة.

### توليد `DASHBOARD_PASSWORD_HASH`

كلمة السر المخزنة في السيرفر **مُشفَّرة فقط (bcrypt hash)** — النص الصريح لا يُحفظ في أي ملف
ولا في git. ولّد الهاش محليًا من كلمة السر التي تختارها (استبدل `YOUR_PASSWORD`):

```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 10))"
```

ضع الناتج في `DASHBOARD_PASSWORD_HASH` داخل `.env`. كلمة السر الحقيقية لا تُكتب في أي ملف.

### توليد `JWT_SECRET`

نص عشوائي طويل، يولَّد مرة واحدة فقط:

```bash
openssl rand -hex 32
```

ضع الناتج في `JWT_SECRET`. مدة الصلاحية الافتراضية `JWT_EXPIRES_IN=7d` (7 أيام)، وبعدها يُطلب
تسجيل الدخول مجددًا.

### `FRONTEND_URL`

أصل الواجهة المنشورة (Netlify URL) — يُقيَّد به CORS. ممنوع `*` في الإنتاج؛ إن نشرت الواجهة
على أكثر من دومين، اكتبها مفصولة بفواصل. أي أصل آخر → `403 Not allowed by CORS`.

### `DASHBOARD_API_KEY`

مفتاح ثابت (ولّده بـ `openssl rand -hex 32`) — **بديل برمجي فقط** للاستعمال الخارجي
(سكريبتات/تكاملات) عبر ترويسة `X-API-Key`. ماشي للداشبورد؛ الداشبورد دائمًا يستعمل JWT.
اختياري: إن لم يُضبط، يبقى القبول بالـ `X-API-Key` معطّلًا.

### Facebook Graph API

تُستعمل لاستخراج **المعرّف الرقمي** للمنشور تلقائيًا عندما يحتوي الرابط على رمز `pfbid`
بدل المعرّف الرقمي (مثال: `.../posts/pfbid0AbC...` أو `story_fbid=pfbid0AbC...`)، وللرد على
التعليقات عبر الـ Graph API.

- `FB_PAGE_ACCESS_TOKEN`: رمز وصول الصفحة (Page access token) — **نفس الرمز الذي يستعمله n8n**.
  - **اختياري لكن موصى به**: إن لم يُضبط، تبقى الميزة **معطّلة بصمت** ويعمل كل شيء كما قبل
    (يُطلب المعرّف يدويًا عند الحاجة). لا يُرسَل هذا الرمز أبدًا إلى الواجهة ولا يُسجَّل في اللوغات،
    ويُمرَّر فقط في ترويسة `Authorization: Bearer`.
- `FB_GRAPH_VERSION`: إصدار Graph API المستعمل في بحث `pfbid`. اختياري، والقيمة الافتراضية `v21.0`.
- `FB_API_VERSION`: إصدار Graph API المستعمل في إرسال الرسائل (`me/messages`) من شاشة الرد يدويًا.
  اختياري، والقيمة الافتراضية `v21.0`.

طريقة العمل عند إنشاء/تعديل منشور بلا معرّف يدوي:
`extractPostKey` (معرّف رقمي مباشر) ← محوّل الروابط المختصرة (`resolveShortUrl`) ←
`resolveNumericPostId` (بحث Graph API عن `pfbid`). عند النجاح يُخزَّن المعرّف الرقمي ويُرجَع
`{ key_resolved_via: "graph-direct" | "graph-scan" }` في الاستجابة، مع **الإبقاء على الرابط كما
أدخله المستخدم**.

### Google Sheets (صفحة الطلبات Orders) — OAuth2

نفس مبدأ credential "Google Sheets account" في n8n: تطبيق OAuth بدل Service Account.

1. أنشئ OAuth Client في Google Cloud Console > APIs & Services > Credentials ثم فعّل
   "Google Sheets API". أضف في Authorized redirect URIs:
   `http://127.0.0.1:3010/oauth2callback`
   وإن كان تطبيقك في وضع "Testing" أضف حسابك لقائمة Test users.
2. املأ `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET`، ثم شغّل:

   ```bash
   node scripts/google-oauth.js
   ```

   ليفتح شاشة الموافقة ويكتب `GOOGLE_REFRESH_TOKEN` تلقائيًا في `.env`. الصلاحية المطلوبة
   read + write (لتحديث حالة الطلبيات) — لذا إن كان توكنك قديمًا من نسخة "readonly" فأعد
   تشغيل السكريبت.
3. الحساب المرتبط بالتوكن يجب أن يرى الشيت (شارك الشيت معه كـ Viewer على الأقل).

| المتغير             | الوصف                                                        |
| ------------------- | ------------------------------------------------------------ |
| `GOOGLE_SHEET_ID`   | معرف الشيت (الافتراضي: شيت الطلبات الحالي)                    |
| `GOOGLE_SHEET_TAB`  | اسم تبويب الطلبات (الافتراضي `ORDER`)                        |

### Supabase Storage (رفع الوسائط — اختياري)

تُستخدم فقط لو أردت رفع ملفات الوسائط من الداشبورد بدل استضافة الرابط خارجيًا. بدون هذه
المتغيرات تعمل كل الوظائف الأخرى، ويعرض `/api/media/upload` خطأ `503` وتُخفي الواجهة زر
الرفع تلقائيًا.

| المتغير                     | الوصف                                                                   |
| --------------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`              | رابط مشروع Supabase (مثال: `https://xxxx.supabase.co`)                   |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service role — **سريّ**: لا يُوضع في الواجهة ولا يُطبع في اللوج    |
| `SUPABASE_MEDIA_BUCKET`     | اسم الـ bucket العام (الافتراضي: `voice-messages`)                       |

> يجب أن يكون الـ bucket **عامًا (public)** حتى يعمل الرابط المُعاد مع معاينة الواجهة
> وإرسال الملف عبر Messenger. مجلد الرفع داخله: `dashboard-media/`.

## التشغيل محليًا

```bash
npm run dev   # nodemon
```

أو بدون إعادة تحميل تلقائية:

```bash
npm start
```

السيرفر يستمع على `PORT` من `.env` (افتراضيًا 3000؛ راجع `frontend/js/config.js` حيث يشير
الواجهة محليًا إلى `http://localhost:3001`).

## الحماية (Login Gate)

1. `POST /api/auth/login` يستقبل `{ password }` ويرجّع `{ token }` عند النجاح.
   - مقارنة عبر `bcrypt.compare` (لا يوجد نص صريح في أي مكان).
   - محمي بـ **rate limit: 5 محاولات كل 15 دقيقة لكل IP** (الاستجابة `429` برسالة عامة).
   - كلمة سر خاطئة → `401 { error: "كلمة السر غير صحيحة" }` (رسالة عامة بلا تفاصيل).
2. كل نقاط الـ API المحمية تشترط `Authorization: Bearer <token>` (التحقق من التوقيع والصلاحية
   عبر `jwt.verify` في `middleware/auth.js`). عند غياب/خطأ التوكن → `401 { error: "Unauthorized" }`.
   - `/api/health` تبقى بلا حماية (فحص بسيط للسيرفر).
3. `X-API-Key` ما زال مقبولًا كـ **بديل برمجي فقط** (سكريبتات/تكاملات خارجية) — ماشي للداشبورد.

## النقاط المتاحة

جميع المسارات أدناه محمية بـ JWT (إلا ما هو مذكور).

| Method | Path                              | الوصف                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------- |
| POST   | `/api/auth/login`                 | rate limit — تسجيل الدخول: يرجّع `{ token }` (JWT لمدة 7 أيام)         |
| GET    | `/api/health`                     | بلا حماية — فحص الحالة ووصل قاعدة البيانات (`db: true/false`)          |
| GET    | `/api/conversations`              | قائمة المحادثات (بحث/فلترة/ترقيم صفحات)                               |
| GET    | `/api/conversations/:id`          | تفاصيل محادثة + رسائل + أحداث                                          |
| POST   | `/api/conversations/:id/toggle`   | تشغيل/إيقاف البوت (`enabled: true/false`, اختياري `changed_by`)       |
| POST   | `/api/conversations/:id/reply`    | إرسال رد يدوي عبر Graph API وتسجيله                                   |
| POST   | `/api/conversations/:id/pause`    | إيقاف البوت مؤقتًا (دقائق → `bot_paused_until`)                       |
| POST   | `/api/conversations/:id/notes`    | حفظ ملاحظة داخلية ≤ 2000 حرف                                          |
| GET    | `/api/conversations/:id/order`    | آخر طلبية مرتبطة بالمحادثة                                             |
| GET    | `/api/stats`                      | إحصائيات مختصرة للوحة                                                  |
| GET    | `/api/analytics`                  | تحليلات (يومي/أسبوعي)                                                  |
| GET    | `/api/contacts`                   | قائمة جهات الاتصال + فلاتر                                              |
| GET    | `/api/contacts/states`            | قائمة الولايات لملء فلاتر الواجهة                                      |
| GET    | `/api/orders`                     | الطلبيات من Google Sheets (بحث/فلترة/ترقيم)                             |
| GET    | `/api/orders/statuses`            | الحالات المتاحة (لقوائم التحديث في الواجهة)                             |
| GET    | `/api/orders/stats`               | ملخص الطلبيات حسب الحالة                                                |
| PATCH  | `/api/orders/:orderNumber/status` | تحديث حالة طلبية في الشيت                                              |
| GET    | `/api/posts/summary`              | ملخص المنشورات للوحة (عدد نشط/موقوف… قبل مسار `/:id`)                 |
| GET    | `/api/posts`                      | قائمة منشورات التعليقات التلقائية (بحث/حالة/ترقيم)                      |
| POST   | `/api/posts`                      | إنشاء منشور (استخراج المفتاح تلقائيًا من الرابط) + كلمة مفتاحية أولى اختيارية |
| GET    | `/api/posts/:id`                  | منشور + كلماته المفتاحية + إحصاءاته                                     |
| PATCH  | `/api/posts/:id`                  | تعديل منشور (عنوان/رابط/صيغ رد/تفعيل)                                  |
| DELETE | `/api/posts/:id`                  | حذف منشور (409 عند وجود سجلات مرتبطة — عطّله بدلًا من ذلك)             |
| POST   | `/api/posts/:id/keywords`         | إضافة كلمة مفتاحية (رد خاص اختياري + إيقاف البوت + مرفق وسائط اختياريًا) |
| PATCH  | `/api/posts/keywords/:keywordId`  | تعديل كلمة مفتاحية (بما فيها `dm_message` و `media_url` / `media_type`)  |
| DELETE | `/api/posts/keywords/:keywordId`  | حذف كلمة مفتاحية                                                        |
| POST   | `/api/posts/:id/next-variant`     | اختيار صيغة الرد التالية بالتناوب (Round-Robin) وتحديث العداد            |
| GET    | `/api/posts/:id/comments`         | تعليقات المنشور (حالات: pending/replied/failed/skipped + بحث + ترقيم)   |
| GET    | `/api/posts/:id/hits`             | إصابات (hits) المنشور (ترقيم صفحات)                                     |
| POST   | `/api/media/check`                | فحص رابط وسائط (HEAD آمن) → `{ ok, type, size, warnings[] }`             |
| POST   | `/api/media/upload`               | رفع ملف وسائط (multipart) إلى Supabase Storage → `{ url, media_type, size }` |
| GET    | `/api/media/upload-availability`  | هل الرفع مفعّل على الخادم؟ → `{ available: true/false }`                 |

### مرفق الوسائط (صورة أو فيديو) لكل كلمة مفتاحية

الكلمة المفتاحية يمكن أن تحمل **مرفقًا واحدًا فقط** (صورة **أو** فيديو) يُرسل بعد رسالة
الخاص. تُخزَّن في عمودين: `bot_post_keywords.media_type` (`image`/`video`) و
`bot_post_keywords.media_url`. العمودان إما أن يكونا `NULL` معًا أو غير `NULL` معًا
(قيد `bot_post_keywords_media_chk`).

- `media_url` و `media_type`: إما كلاهما موجود أو كلاهما فارغ (`null` / `""` = إزالة الوسائط).
- `media_url`: HTTPS فقط، رابط صالح، ≤ 2000 حرف، بلا بيانات اعتماد، ولا يشير إلى localhost
  أو عناوين IP خاصة.
- `media_type`: `image` أو `video`. إذا أُرسل `media_url` بدون `media_type` يُكتشف النوع
  تلقائيًا من امتداد الملف.
- الامتداد يجب أن يطابق النوع (مع تجاهل query string):
  `image` = `.jpg` `.jpeg` `.png` `.gif` — `video` = `.mp4`.
- روابط مشاركة Google Drive / Dropbox (وأمثالها) مرفوضة: **يجب أن يكون رابطًا مباشرًا
  عامًا للملف**.

### رسالة الخاص الاختيارية (`dm_message`)

- `dm_message` **اختيارية** لكل كلمة مفتاحية. إذا كانت فارغة (`null` / `""`):
  - يرد البوت على التعليق العام فقط، ولا يرسل رسالة خاصة ولا وسائط.
  - يُجبر `stop_bot_after_send` على `false` حتى لا يبقى إيقاف بلا رسالة.
  - لا يُسمح بإرفاق `media_url` / `media_type` إطلاقًا (خطأ `400`).
- إذا كانت الرسالة موجودة: نصية فقط، ≤ 2000 حرف.
- إذا وُجد مرفق وسائط: الرسالة **مطلوبة**، ≤ **640 حرفًا**، وتُرسل كقالب بأزرار
  (`شاهد الصورة` / `شاهد الفيديو`). لا يصل المرفق نفسه إلا بعد ضغط العميل على الزر
  (postback)، وليس مع الرسالة الأولى.

فحص الرابط (`POST /api/media/check`) يعمل بطلب `HEAD` بمهلة 5 ثوانٍ وحد أقصى 2 تحويلات
(redirects) مع حماية SSRF (حل DNS ثم حجب العناوين الخاصة/الاسترجاعية/الloopback). يشترط
الرد `200` وأن يبدأ `Content-Type` بـ `image/` أو `video/` مطابقًا للنوع، وأن يكون
`Content-Length` ضمن الحدود (صورة ≤ 8 ميغابايت، فيديو ≤ 25 ميغابايت). إذا لم يستجب
المضيف لطلب `HEAD` يُقبل الرابط مع **تحذير** (warnings).

رفع الملفات (`POST /api/media/upload`) — اختياري:
- `multipart/form-data` بحقل `file` (multer + memory storage).
- الأنواع المسموحة: `image/jpeg`, `image/png`, `image/gif`, `video/mp4`.
- الحدود: صورة ≤ 8 ميغابايت، فيديو ≤ 25 ميغابايت.
- الرفع يتم إلى Supabase Storage عبر Storage REST API داخل مجلد `dashboard-media/` باسم
  عشوائي (uuid + الامتداد الأصلي) ثم يُرجع الرابط العام.
- إذا لم تُضبط متغيرات Supabase يُرجع `503` برسالة واضحة وتُخفي الواجهة زر الرفع.
- **مفتاح service role لا يُعرض أبدًا للواجهة ولا يُسجَّل في اللوج.**

كلا نقطتي `/api/media/check` و `/api/media/upload` محميتان بـ **rate limit: 30 طلبًا كل
10 دقائق لكل IP**.

### الكلمة المفتاحية الأولى مع إنشاء المنشور (`POST /api/posts`)

يمكن إرسال الكلمة المفتاحية الأولى (مع مرفقها الاختياري) في **نفس طلب إنشاء المنشور**:

```json
{
  "post_url": "https://www.facebook.com/reel/1234567890123",
  "platform": "facebook",
  "comment_reply_variants": ["مرحبا"],
  "first_keyword": {
    "keyword": "سعر",
    "dm_message": "رسالة ترحيب",
    "stop_bot_after_send": true,
    "is_active": true,
    "media_url": "https://cdn.example.com/pic.jpg",
    "media_type": "image"
  }
}
```

- `first_keyword` **اختياري**: إن لم يُرسل يُنشأ المنشور فقط (السلوك السابق دون تغيير).
- الحقول: `keyword` (≤ 100 حرف، يُطبَّع نصّها)، `dm_message` (**اختياري**، `null`/فارغ =
  رد على التعليق فقط)، `stop_bot_after_send` و `is_active` (قيمة `true`/`false`،
  الافتراضي `true`؛ يُجبر الإيقاف على `false` عند غياب الرسالة)، `media_url` و `media_type`
  (اختياريان، **بنفس قواعد مرفق الوسائط** أعلاه، ولا يُسمح بهما بلا `dm_message`).
- مع مرفق وسائط: `dm_message` مطلوبة و ≤ 640 حرفًا؛ وبدونه ≤ 2000 حرف.
- **نفس المعاملة (transaction)**: المنشور والكلمة الأولى يُنشآن معًا. إذا فشل التحقق من
  الوسائط أو الرسالة أو ظهر تعارض في الكلمة النشطة يُرجع خطأ (`400` / `409`) **دون إنشاء أي سجل**.
- الرد `201` يضم `first_keyword` مع `media_type` و `media_url` عند وجوده.

### قواعد مهمة في منشورات التعليقات التلقائية

- صيغ الرد: حتى **10 صيغ**، كل واحدة ≤ 500 حرف، بلا تكرار — والعدّاد يُصفَّر عند تغيير الصيغ.
- الكلمة المفتاحية: ≤ 100 حرف، ويُطبَّع نصّها (`normalizeKeyword`)؛ **لا يمكن أن تكون الكلمة
  نفسها نشطة في منشورين في وقت واحد** (يرجع `409` باسم المنشور المتعارض).
- رسالة الخاص: اختيارية، ≤ 2000 حرف نصيًا، أو ≤ 640 حرفًا عند وجود مرفق وسائط. المعرّف
  اليدوي: أرقام فقط (8 على الأقل).
- روابط المنشورات: HTTPS فقط، ومضبوطة على قائمة مضيفات فيسبوك المسموحة (`isAllowedHost`) —
  حماية SSRF عند فتح الروابط المختصرة.

## المهام المجدولة (Cron)

`src/cron.js` يعمل داخل السيرفر نفسه (بلا مكتبات خارجية): يفحص كل **5 دقائق** البوتات
الموقوفة مؤقتًا (`bot_paused_until`) ويعيد تفعيلها تلقائيًا عند انتهاء المدة.

## النشر على Railway / Render

1. ادفع المشروع إلى GitHub (ملف `Procfile`: `web: node src/server.js`).
2. أنشئ خدمة جديدة واربطها بالمستودع.
3. عرّف نفس متغيرات `.env` في إعدادات الخدمة (وخصوصًا `DATABASE_URL` لاتصال Supabase pooler،
   أو `DB_SSL=true` إذا قاعدة البيانات على نفس المنصة).
4. Railway: حدد `web` كـ process type. Render: سيكشف تلقائيًا `npm start` من package.json.
5. شغّل الخدمة. تحقق من `GET /api/health` ثم من `POST /api/auth/login`.
6. ملاحظة: `DASHBOARD_PASSWORD_HASH` يجب أن يولَّد على جهازك ثم يُنسخ إلى إعدادات الخدمة
   (لا تُرسل كلمة السر النصية أبدًا).

> يقدّم السيرفر ملفات الواجهة الثابتة أيضًا (`express.static` لـ `frontend/`)، فيمكن نشر
> الاثنين معًا من دومين واحد؛ لكن النشر المعتاد: الواجهة على Netlify والسيرفر على Render.

## الهيكل والتثبيتات (Migrations)

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js               # اتصال pg (DATABASE_URL أو DB_*)
│   │   └── googleSheets.js     # عميل Google Sheets (OAuth2 + refresh token)
│   ├── middleware/
│   │   ├── auth.js             # JWT Bearer + بديل X-API-Key
│   │   └── errorHandler.js
│   ├── repositories/           # كل استعلامات SQL
│   │   ├── conversations.repo.js
│   │   ├── posts.repo.js
│   │   ├── contacts.repo.js
│   │   ├── analytics.repo.js
│   │   └── stats.repo.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── health.routes.js
│   │   ├── conversations.routes.js
│   │   ├── stats.routes.js
│   │   ├── analytics.routes.js
│   │   ├── contacts.routes.js
│   │   ├── orders.routes.js       # الطلبيات: يقرأ/يكتب الشيت مباشرة عبر googleSheets.js
│   │   ├── posts.routes.js
│   │   └── media.routes.js        # فحص رابط الوسائط + رفع الملفات (Supabase Storage)
│   ├── utils/
│   │   ├── postKey.js            # استخراج المعرّف من روابط فيسبوك
│   │   ├── resolveShortUrl.js    # فك الروابط المختصرة (قائمة مضيفات مسموحة)
│   │   ├── resolveNumericPostId.js # بحث pfbid عبر Graph API
│   │   └── media.js              # قواعد روابط الوسائط + فحص HEAD آمن (SSRF)
│   ├── cron.js                 # إعادة تفعيل البوتات الموقوفة (كل 5 دقائق)
│   ├── app.js                  # Express app: CORS مضيّق + helmet + static
│   └── server.js               # نقطة التشغيل (startCronJobs + listen)
├── migrations/                 # SQL: فهارس، bot_paused_until، عدّاد صيغ الرد
│   ├── 002_indexes.sql
│   ├── 003_add_bot_paused_until.sql
│   ├── 004_add_variant_index.sql
│   ├── 005_instagram_platform.sql
│   ├── 006_add_keyword_media.sql  # media_type + media_url (+ CHECK idempotent)
│   └── 007_dm_message_optional.sql # dm_message اختيارية + قيد الوسائط/الطول
├── scripts/
│   ├── google-oauth.js          # توليد GOOGLE_REFRESH_TOKEN تلقائيًا
│   ├── run-migrations.js         # تشغيل كل ملفات migrations/ بالترتيب
│   └── check-media-columns.js   # التأكد من وجود عمودَي media_* والقيد في القاعدة
├── .env.example
├── .gitignore
├── Procfile
└── package.json
```

شغّل ملفات `migrations/*.sql` على قاعدة البيانات بالترتيب (مرة واحدة لكل ملف عند التحديث).

```bash
cd backend
npm install
node scripts/run-migrations.js   # يشغّل كل الملفات بالترتيب (idempotent)
```

> كل ملف migration آمن لإعادة التشغيل (`IF NOT EXISTS` / `DO $$`): `006_add_keyword_media.sql`
> يضيف `media_type` و `media_url` إلى `bot_post_keywords` مع القيد `bot_post_keywords_media_chk`.
> `007_dm_message_optional.sql` يجعل `dm_message` اختيارية ويضيف
> `bot_post_keywords_dm_media_chk` (وسائط فقط مع رسالة غير فارغة ≤ 640 حرفًا).
> للتحقّق: `node scripts/check-media-columns.js`.
