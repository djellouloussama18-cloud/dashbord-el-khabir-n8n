# Backend — Dashboard "أكاديمية الخبير"

Backend (Express + PostgreSQL) لداشبورد التحكم في بوت أكاديمية الخبير (n8n + Postgres).
الداشبورد موجه لعميل واحد فقط (بلا حسابات)، لذا الحماية عبر **كلمة سر مشتركة واحدة** تُمكّن
شاشة تسجيل دخول بالـ frontend، ثم **JWT Bearer token** موقّع يُرسَل في كل طلب محمي.

## المتطلبات

- Node.js LTS
- قاعدة بيانات PostgreSQL (نفس قاعدة بيانات n8n)

## التنصيب المحلي

```bash
npm install
```

## إعداد متغيرات البيئة

```bash
cp .env.example .env
```

ثم عبّئ القيم الفارغة (الإجبارية: `DB_*`, `DASHBOARD_PASSWORD_HASH`, `JWT_SECRET`, `FRONTEND_URL`).

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
على أكثر من دومين، اكتبها مفصولة بفواصل.

## التشغيل محليًا

```bash
npm run dev   # nodemon
```

أو بدون إعادة تحميل تلقائية:

```bash
npm start
```

السيرفر يستمع على `PORT` من `.env` (افتراضيًا 3000).

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

| Method | Path                              | الحماية     | الوصف                                            |
| ------ | --------------------------------- | ----------- | ------------------------------------------------ |
| POST   | `/api/auth/login`                 | rate limit  | تسجيل الدخول: يرجّع `{ token }` (JWT لمدة 7 أيام) |
| GET    | `/api/health`                     | بلا         | فحص الحالة ووصل قاعدة البيانات (`db: true/false`) |
| GET    | `/api/conversations`              | JWT         | قائمة المحادثات (بحث/فلترة/ترقيم صفحات)          |
| GET    | `/api/conversations/:id`          | JWT         | تفاصيل محادثة + رسائل + أحداث                    |
| POST   | `/api/conversations/:id/toggle`   | JWT         | تشغيل/إيقاف البوت (`enabled: true/false`, اختياري `changed_by`) |
| POST   | `/api/conversations/:id/reply`    | JWT         | إرسال رد عبر المنصة وتسجيله                       |
| POST   | `/api/conversations/:id/pause`    | JWT         | إيقاف البوت مؤقتًا (دقائق)                       |
| POST   | `/api/conversations/:id/notes`    | JWT         | حفظ ملاحظة داخلية ≤ 2000 حرف                     |
| GET    | `/api/conversations/:id/order`    | JWT         | آخر طلبية مرتبطة بالمحادثة                       |
| GET    | `/api/stats`                      | JWT         | إحصائيات مختصرة للوحة                            |
| GET    | `/api/analytics`                  | JWT         | تحليلات (يومي/أسبوعي)                            |
| GET    | `/api/contacts`                   | JWT         | قائمة جهات الاتصال + فلاتر                       |
| GET    | `/api/orders`                     | JWT         | الطلبيات من Google Sheets (بحث/فلترة/ترقيم)      |
| PATCH  | `/api/orders/:orderNumber/status` | JWT         | تحديث حالة طلبية في الشيت                        |

## النشر على Railway / Render

1. ادفع المشروع إلى GitHub (ملف `Procfile`: `web: node src/server.js`).
2. أنشئ خدمة جديدة واربطها بالمستودع.
3. عرّف نفس متغيرات `.env` في إعدادات الخدمة (وخصوصًا `DB_SSL=true` إذا قاعدة البيانات على نفس المنصة).
4. Railway: حدد `web` كـ process type. Render: سيكشف تلقائيًا `npm start` من package.json.
5. شغّل الخدمة. تحقق من `GET /api/health` ثم من `POST /api/auth/login`.
6. ملاحظة: `DASHBOARD_PASSWORD_HASH` يجب أن يولَّد على جهازك ثم يُنسخ إلى إعدادات الخدمة
   (لا تُرسل كلمة السر النصية أبدًا).

## هيكل المشروع

```
backend/
├── src/
│   ├── config/db.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── health.routes.js
│   │   ├── conversations.routes.js
│   │   ├── stats.routes.js
│   │   ├── analytics.routes.js
│   │   ├── contacts.routes.js
│   │   └── orders.routes.js
│   ├── app.js
│   └── server.js
├── .env.example
├── .gitignore
├── Procfile
└── package.json
```