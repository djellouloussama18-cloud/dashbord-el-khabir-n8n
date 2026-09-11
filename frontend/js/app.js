/* =====================================================
   APP — Entry point, initializes auth gate + shell + router
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // يقرر فورًا: شاشة الدخول أو الداشبورد (بلا وميض — الواجهة مخفية من البداية بـ CSS)
  Auth.init();
  if (Auth.isTokenValid()) {
    Auth.boot();
  }
});