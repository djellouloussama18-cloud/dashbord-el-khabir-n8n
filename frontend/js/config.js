// يكتشف تلقائيًا البيئة: localhost → backend محلي، غير ذلك → production
const BACKEND_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : "https://dashbord-el-khabir-academy.onrender.com";

// لا سري (secret) ولا كلمة سر فالكود إطلاقًا.
// المصادقة عبر JWT Bearer token يُخزَّن فـ localStorage بعد تسجيل الدخول الناجح.