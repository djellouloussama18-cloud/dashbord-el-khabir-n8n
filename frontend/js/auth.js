/* =====================================================
   AUTH — Login gate (شاشة تسجيل الدخول)
   التحقق الحقيقي دائمًا من السيرفر (JWT verify).
   هنا فقط نعرض/نخفي الواجهة بناءً على وجود توكن صالح.
   ===================================================== */

const Auth = {
  TOKEN_KEY: "dashboard_token",
  _booted: false,

  getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (err) {
      return null;
    }
  },

  setToken(token) {
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
    } catch (err) {
      /* ignore */
    }
  },

  clearToken() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
    } catch (err) {
      /* ignore */
    }
  },

  // فك payload الـ JWT محليًا لقراءة exp فقط (بلا مكتبة خارجية).
  // هذا للعرض/الإخفاء فقط — التحقق من التوقيع يبقى فالسيرفر عبر jwt.verify.
  decodeTokenPayload(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4 !== 0) b64 += "=";
      const json = decodeURIComponent(
        atob(b64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  },

  isTokenValid() {
    const token = this.getToken();
    if (!token) return false;
    const payload = this.decodeTokenPayload(token);
    if (!payload || typeof payload.exp !== "number") return false;
    return payload.exp * 1000 > Date.now();
  },

  showLogin() {
    const loginEl = document.getElementById("auth-login");
    const appEl = document.getElementById("app");
    if (loginEl) loginEl.classList.remove("hidden");
    if (appEl) appEl.classList.add("hidden");
  },

  showDashboard() {
    const loginEl = document.getElementById("auth-login");
    const appEl = document.getElementById("app");
    if (loginEl) loginEl.classList.add("hidden");
    if (appEl) appEl.classList.remove("hidden");
  },

  // السيرفر رفض التوكن (انتهى أو عُدّل) → نمسحه ونرجع لشاشة الدخول
  handleUnauthorized() {
    this.clearToken();
    this.showLogin();
  },

  // تشغيل الـ shell + router مرة واحدة فقط بعد التأكد من التوكن
  boot() {
    if (this._booted) return;
    this._booted = true;
    if (typeof Shell !== "undefined" && typeof Shell.init === "function") Shell.init();
    if (typeof Router !== "undefined" && typeof Router.init === "function") Router.init();
  },

  logout() {
    this.handleUnauthorized();
    if (typeof window !== "undefined") {
      window.location.hash = "#/conversations";
    }
  },

  bindLogout() {
    const btn = document.getElementById("logout-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.logout();
      });
    }
  },

  bindLoginForm() {
    const form = document.getElementById("auth-form");
    if (!form) return;

    const input = document.getElementById("auth-password");
    const btn = document.getElementById("auth-submit");
    const errorEl = document.getElementById("auth-error");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.classList.add("hidden");
      errorEl.textContent = "";

      const password = (input.value || "").toString().trim();
      if (!password) {
        errorEl.textContent = "أدخل كلمة السر";
        errorEl.classList.remove("hidden");
        input.focus();
        return;
      }

      setLoading(true);

      try {
        const res = await fetch(BACKEND_URL + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          // رسالة عامة من السيرفر بدون تفاصيل تقنية
          errorEl.textContent =
            (data && data.error) || "تعذر تسجيل الدخول. أعد المحاولة.";
          errorEl.classList.remove("hidden");
          input.select();
          return;
        }

        if (!data || typeof data.token !== "string") {
          errorEl.textContent = "استجابة غير صالحة من السيرفر.";
          errorEl.classList.remove("hidden");
          return;
        }

        this.setToken(data.token);
        input.value = "";
        errorEl.classList.add("hidden");
        this.showDashboard();
        this.boot();
      } catch (err) {
        errorEl.textContent = "تعذر الاتصال بالخادم. تحقق من تشغيل الـ backend.";
        errorEl.classList.remove("hidden");
      } finally {
        setLoading(false);
      }
    });

    function setLoading(loading) {
      if (loading) {
        btn.disabled = true;
        btn.classList.add("loading");
        btn.textContent = "جارٍ الدخول...";
      } else {
        btn.disabled = false;
        btn.classList.remove("loading");
        btn.textContent = "دخول";
      }
    }
  },

  init() {
    if (this.isTokenValid()) {
      this.showDashboard();
    } else {
      this.clearToken();
      this.showLogin();
    }
    this.bindLoginForm();
    this.bindLogout();
  },
};