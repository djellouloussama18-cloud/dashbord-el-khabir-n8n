/* =====================================================
   SHELL — Sidebar, topbar, global interactions
   ===================================================== */

const Shell = {
  sidebar: null,
  navItems: null,

  init() {
    this.sidebar = document.getElementById("sidebar");
    this.navItems = this.sidebar.querySelectorAll(".nav-item");
    this.bindSearchShortcut();
    this.bindNotificationBtn();
  },

  setActiveRoute(route) {
    this.navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.route === route);
    });
  },

  updateConversationCount(count) {
    const badge = document.getElementById("conv-count-badge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "" : "none";
    }
  },

  bindSearchShortcut() {
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        const input = document.getElementById("global-search");
        if (input) input.focus();
      }
    });
  },

  bindNotificationBtn() {
    const btn = document.getElementById("notification-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      // Placeholder for notification dropdown
    });
  },
};
