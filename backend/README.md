# Backend — Dashboard "أكاديمية الخبير"

Backend (Express + PostgreSQL) لداشبورد التحكم في بوت أكاديمية الخبير (n8n + Postgres).
الحماية تتم بمفتاح API ثابت واحد (`X-API-Key`) لأن الداشبورد موجه لعميل واحد فقط، بلا حسابات
ولا صفحات تسجيل دخول.

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

ثم عبّئ القيم الفارغة (المتغيرات الإجبارية: `DB_*`, `DASHBOARD_API_KEY`).

### توليد `DASHBOARD_API_KEY`

ولّد مفتاحًا عشوائيًا طويلًا مرة واحدة فقط (لا تقاسمه مع أي طرف):

```bash
openssl rand -hex 32
```

ضع الناتج في `DASHBOARD_API_KEY` داخل `.env`، وفي `frontend/config.js` ضع نفس القيمة في `API_KEY`.

## التشغيل محليًا

```bash
npm run dev   # nodemon
```

أو بدون إعادة تحميل تلقائية:

```bash
npm start
```

السيرفر يستمع على `PORT` من `.env` (افتراضيًا 3000).

## الحماية

كل النقاط تحتاج header `X-API-Key` بقيمة `DASHBOARD_API_KEY` — ما عدا `/api/health` (فحص بسيط
للسيرفر متاح بلا مفتاح). الاستجابة عند غياب/خطأ في المفتاح: `401 { "error": "Unauthorized" }`.

مثال:

```
X-API-Key: 0123456789abcdef...
```

## النقاط المتاحة

| Method | Path                              | الوصف                                            |
| ------ | --------------------------------- | ------------------------------------------------ |
| GET    | `/api/health`                     | فحص الحالة ووصل قاعدة البيانات (`db: true/false`) |
| GET    | `/api/conversations`              | قائمة المحادثات (بحث/فلترة/ترقيم صفحات)          |
| GET    | `/api/conversations/:id`          | تفاصيل محادثة + رسائل + أحداث                    |
| POST   | `/api/conversations/:id/toggle`   | تشغيل/إيقاف البوت (`enabled: true/false`, اختياري `changed_by`) |
| POST   | `/api/conversations/:id/notes`    | حفظ ملاحظة داخلية ≤ 2000 حرف                     |
| GET    | `/api/stats`                      | إحصائيات مختصرة للوحة                            |

## النشر على Railway / Render

1. ادفع المشروع إلى GitHub (ملف `Procfile`: `web: node src/server.js`).
2. أنشئ خدمة جديدة واربطها بالمستودع.
3. عرّف نفس متغيرات `.env` في إعدادات الخدمة (وخصوصًا `DB_SSL=true` إذا قاعدة البيانات على نفس المنصة).
4. Railway: حدد `web` كـ process type. Render: سيكشف تلقائيًا `npm start` من package.json.
5. ضع قيمة `DASHBOARD_API_KEY` نفسها في `frontend/config.js` عند نشر الواجهة.
6. شغّل الخدمة. تحقق من `GET /api/health`.

## هيكل المشروع

```
backend/
├── src/
│   ├── config/db.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── errorHandler.js
│   ├── routes/
│   │   ├── health.routes.js
│   │   ├── conversations.routes.js
│   │   └── stats.routes.js
│   ├── app.js
│   └── server.js
├── .env.example
├── .gitignore
├── Procfile
└── package.json
```