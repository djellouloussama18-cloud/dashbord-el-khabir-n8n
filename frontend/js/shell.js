/* =====================================================
   SHELL — Sidebar, topbar, global interactions
   ===================================================== */

const Shell = {
  sidebar: null,
  overlay: null,
  hamburgerBtn: null,
  navItems: null,

  init() {
    this.sidebar = document.getElementById("sidebar");
    this.overlay = document.getElementById("sidebar-overlay");
    this.hamburgerBtn = document.getElementById("hamburger-btn");
    this.navItems = this.sidebar.querySelectorAll(".nav-item");
    this.bindSearchShortcut();
    this.bindNotificationBtn();
    this.bindDrawer();
    this.bindMobileSearch();
  },

  setActiveRoute(route) {
    this.navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.route === route);
    });
    this.closeDrawer();
  },

  updateConversationCount(count) {
    const badge = document.getElementById("conv-count-badge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "" : "none";
    }
  },

  openDrawer() {
    this.sidebar.classList.add("drawer-open");
    this.overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  },

  closeDrawer() {
    this.sidebar.classList.remove("drawer-open");
    this.overlay.classList.remove("active");
    document.body.style.overflow = "";
  },

  toggleDrawer() {
    if (this.sidebar.classList.contains("drawer-open")) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  },

  bindDrawer() {
    if (this.hamburgerBtn) {
      this.hamburgerBtn.addEventListener("click", () => this.toggleDrawer());
    }
    if (this.overlay) {
      this.overlay.addEventListener("click", () => this.closeDrawer());
    }
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) this.closeDrawer();
    });
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

  bindMobileSearch() {
    const btn = document.getElementById("mobile-search-btn");
    const search = document.getElementById("topbar-search");
    if (!btn || !search) return;
    btn.addEventListener("click", () => {
      const isOpen = search.classList.contains("mobile-open");
      search.classList.toggle("mobile-open", !isOpen);
      if (!isOpen) {
        const input = document.getElementById("global-search");
        if (input) input.focus();
      }
    });
  },
};
