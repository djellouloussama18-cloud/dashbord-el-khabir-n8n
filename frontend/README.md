# Frontend — Dashboard "أكاديمية الخبير"

لوحة تحكم بلا تسجيل دخول (Vanilla JS + HTML + CSS فقط، بلا أي framework أو build tool).
تفتح مباشرة على `index.html` (sidebar + لوحة المحادثة).

## البنية

```
frontend/
├── index.html          # الصفحة الرئيسية والوحيدة
├── css/
│   └── style.css       # تنسيق RTL
├── js/
│   ├── config.js       # BACKEND_URL + API_KEY (يُعدَّل يدويًا)
│   ├── api.js          # apiFetch + دوال النداءات للـ backend
│   ├── dashboard.js    # القائمة: بحث، فلاتر، ترقيم صفحات
│   └── conversation.js # لوحة المحادثة: رسائل، ON/OFF، ملاحظات
└── README.md
```

## الإعداد

1. افتح `js/config.js` واضبط:

   ```js
   const BACKEND_URL = "https://your-backend-url.example.com";
   const API_KEY = "PUT_YOUR_DASHBOARD_API_KEY_HERE";
   ```

   - `BACKEND_URL`: رابط الـ backend المنشور.
   - `API_KEY`: نفس قيمة `DASHBOARD_API_KEY` الموجودة في `backend/.env` (ولّدها بـ `openssl rand -hex 32`).

2. كل الطلبات ترسل تلقائيًا header `X-API-Key`. الطلب الوحيد الذي لا يحتاج مفتاحًا هو `/api/health`.

## النشر على Netlify

من الجذر (المجلد الذي فيه `netlify.toml`):

```bash
netlify deploy --prod
```

`netlify.toml` مضبوط بـ `publish = "frontend"`، فلن تحتاج أي إعدادات إضافية. الرابط الرئيسي
يخدم `index.html` مباشرة.

## ملاحظات

- لا يوجد real-time/polling في هذه المرحلة — البيانات تُحضَّر عند فتح الصفحة وعند كل تفاعل.
- عناصر القائمة والرسائل تُبنى بـ `createElement`/`textContent` (ممنوع `innerHTML` مع بيانات
  من الـ backend لتجنب XSS).