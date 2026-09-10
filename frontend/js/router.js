/* =====================================================
   HASH ROUTER — Lightweight client-side routing
   ===================================================== */

const Router = {
  routes: {},
  currentRoute: null,
  currentCleanup: null,

  register(path, { render, destroy }) {
    this.routes[path] = { render, destroy };
  },

  navigate(path) {
    if (this.currentRoute === path) return;
    window.location.hash = "#/" + path;
  },

  async handleRoute() {
    const hash = window.location.hash.replace(/^#\/?/, "") || "conversations";
    const route = this.routes[hash];

    if (!route) {
      window.location.hash = "#/conversations";
      return;
    }

    // Destroy previous page
    if (this.currentCleanup && this.routes[this.currentRoute]) {
      const prev = this.routes[this.currentRoute];
      if (prev.destroy) prev.destroy();
    }

    this.currentRoute = hash;
    const outlet = document.getElementById("app-outlet");
    outlet.textContent = "";

    // Update sidebar active state
    Shell.setActiveRoute(hash);

    // Render new page
    if (route.render) {
      this.currentCleanup = route.render(outlet);
    }
  },

  init() {
    window.addEventListener("hashchange", () => this.handleRoute());
    this.handleRoute();
  },
};
