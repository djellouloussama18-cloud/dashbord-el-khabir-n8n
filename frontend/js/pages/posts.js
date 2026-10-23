/* =====================================================
   PAGE: Posts — إدارة منشورات فيسبوك/إنستغرام + الكلمات المفتاحية
   المصادر:
      GET    /api/posts/summary?platform=facebook|instagram
      GET    /api/posts?platform=facebook|instagram
      POST   /api/posts
      GET    /api/posts/:id
      PATCH  /api/posts/:id
      DELETE /api/posts/:id
      POST   /api/posts/:id/keywords
      PATCH  /api/posts/keywords/:keywordId
      DELETE /api/posts/keywords/:keywordId
      GET    /api/posts/:id/comments
      GET    /api/posts/:id/hits
    ملاحظة: التعليقات والإصابات تُكتب من n8n — الواجهة تقرأها فقط.
    ===================================================== */

function readStoredPostsPlatform() {
  try {
    const v = localStorage.getItem("posts_platform");
    if (v === "facebook" || v === "instagram") return v;
  } catch (err) {
    /* ignore */
  }
  return "facebook";
}

const PostsPage = {
  container: null,
  debounceTimer: null,
  toastContainer: null,

  state: {
    view: "list",
    platform: readStoredPostsPlatform(),
    list: { page: 1, limit: 10, search: "", status: "all", data: null, requestSeq: 0 },
    summary: null,
    summarySeq: 0,
    detail: null,
  },

  /* =====================================================
     HELPERS
     ===================================================== */

  el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  },

  formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const date = d.toLocaleDateString("ar-DZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Africa/Algiers",
    });
    const time = d.toLocaleTimeString("ar-DZ", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Algiers",
    });
    return date + " " + time;
  },

  truncate(text, max) {
    if (text === undefined || text === null || text === "") return "—";
    const s = String(text);
    max = max || 60;
    return s.length > max ? s.slice(0, max) + "…" : s;
  },

  dmMessageText(dmMessage) {
    const text = typeof dmMessage === "string" ? dmMessage.trim() : "";
    return text ? this.truncate(text, 140) : "بدون رسالة خاص";
  },

  mediaAttached(media) {
    return !!media && media.type !== "none";
  },

  updateDmCounter(counter, length, hasMedia) {
    if (!counter) return;
    const max = hasMedia ? 640 : 2000;
    counter.textContent = length + " / " + max;
    counter.classList.toggle("is-warning", hasMedia && length > 640);
  },

  validateDmMessageClient(value, hasMedia) {
    const dm = typeof value === "string" ? value.trim() : "";
    if (hasMedia && !dm) {
      return { ok: false, error: "الرسالة مطلوبة عند إرفاق صورة أو فيديو" };
    }
    if (hasMedia && dm.length > 640) {
      return {
        ok: false,
        error: "الرسالة يجب ألا تتجاوز 640 حرفًا عند إرفاق وسائط",
      };
    }
    if (dm.length > 2000) {
      return { ok: false, error: "رسالة الخاص يجب ألا تتجاوز 2000 حرف." };
    }
    return { ok: true, value: dm };
  },

  setFieldError(errorEl, message) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.classList.toggle("hidden", !message);
  },

  syncStopBotSwitch(stopSwitch, noteEl, hasMessage) {
    if (!stopSwitch) return;
    if (!hasMessage) {
      if (!stopSwitch.classList.contains("disabled")) {
        stopSwitch.dataset.wasActive = stopSwitch.classList.contains("active")
          ? "1"
          : "0";
      }
      stopSwitch.classList.remove("active");
      stopSwitch.setAttribute("aria-checked", "false");
      stopSwitch.classList.add("disabled");
      stopSwitch.setAttribute("aria-disabled", "true");
      if (noteEl) noteEl.classList.remove("hidden");
      return;
    }
    stopSwitch.classList.remove("disabled");
    stopSwitch.removeAttribute("aria-disabled");
    if (stopSwitch.dataset.wasActive === "1") {
      stopSwitch.classList.add("active");
      stopSwitch.setAttribute("aria-checked", "true");
    }
    delete stopSwitch.dataset.wasActive;
    if (noteEl) noteEl.classList.add("hidden");
  },

  typeLabel(type) {
    if (type === "reel") return "ريل";
    if (type === "video") return "فيديو";
    return "منشور";
  },

  statusLabel(status) {
    return (
      { pending: "قيد الانتظار", replied: "تم الرد", failed: "فشل", skipped: "تم التخطي" }[
        status
      ] || status || "—"
    );
  },

  statusTone(status) {
    return (
      { pending: "is-pending", replied: "is-replied", failed: "is-failed", skipped: "is-skipped" }[
        status
      ] || ""
    );
  },

  dmStatusLabel(status) {
    if (status === "sent") return "أُرسلت";
    if (status === "failed") return "فشلت";
    return status || "—";
  },

  /* ---- platform helpers ---- */

  platformName(platform) {
    return platform === "instagram" ? "Instagram" : "Facebook";
  },

  platformTexts(platform) {
    if (platform === "instagram") {
      return {
        subtitle:
          "إدارة منشورات إنستغرام (منشور / ريل / فيديو) التي يرد عليها البوت في التعليقات",
        info:
          "عندما يعلّق شخص على منشور مفعَّل ويتضمن تعليقه إحدى كلماته المفتاحية، يرسل البوت أولًا الرسالة كرد خاص (DM) على التعليق، ثم يكتب ردًا عامًا تحت التعليق بإحدى صيغ الرد. الكلمة المفتاحية فريدة داخل المنشور نفسه فقط — يمكن استعمال نفس الكلمة في منشورات إنستغرام أخرى. الرد الخاص يعمل فقط خلال المدة المسموحة بعد كتابة التعليق (حد ميتا). الستوري غير مدعومة.",
      };
    }
    return {
      subtitle: "إدارة منشورات فيسبوك التي يرد عليها البوت في التعليقات",
      info:
        "عندما يعلّق شخص على منشور مفعَّل، يرد البوت بتعليق يطلب منه كتابة الكلمة المفتاحية في الخاص، وعند كتابتها يرسل له البوت الرسالة المخصصة. الكلمة المفتاحية يجب أن تكون فريدة عبر كل المنشورات النشطة.",
    };
  },

  persistPlatform() {
    try {
      localStorage.setItem("posts_platform", this.state.platform);
    } catch (err) {
      /* ignore */
    }
  },

  buildPlatformBadge(platform) {
    const p = platform === "instagram" ? "instagram" : "facebook";
    return this.el("span", "platform-badge platform-badge--" + p, this.platformName(p));
  },

  buildPlatformTabs() {
    const wrap = this.el("div", "posts-platform-tabs");
    wrap.id = "posts-platform-tabs";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "اختر المنصة");
    const icons = {
      facebook:
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v3H6v4h3v8h4v-8h3l1-4h-4V9c0-.6.4-1 1-1z"/></svg>',
      instagram:
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    };
    [["facebook", "Facebook"], ["instagram", "Instagram"]].forEach(([key, label]) => {
      const btn = this.el(
        "button",
        "posts-platform-tab" + (this.state.platform === key ? " active" : "")
      );
      btn.type = "button";
      btn.dataset.platform = key;
      btn.setAttribute("aria-pressed", this.state.platform === key ? "true" : "false");
      const icon = this.el("span", "posts-platform-tab-icon");
      icon.innerHTML = icons[key];
      btn.appendChild(icon);
      btn.appendChild(this.el("span", null, label));
      btn.addEventListener("click", () => this.setPlatform(key));
      wrap.appendChild(btn);
    });
    return wrap;
  },

  updatePlatformTabs() {
    const tabs = this.elRefs && this.elRefs.platformTabs;
    if (!tabs) return;
    tabs.querySelectorAll(".posts-platform-tab").forEach((btn) => {
      const active = btn.dataset.platform === this.state.platform;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  },

  applyPlatformTexts() {
    if (!this.elRefs) return;
    const t = this.platformTexts(this.state.platform);
    if (this.elRefs.subtitle) this.elRefs.subtitle.textContent = t.subtitle;
    if (this.elRefs.infoText) this.elRefs.infoText.textContent = t.info;
  },

  setPlatform(platform) {
    if (platform !== "facebook" && platform !== "instagram") return;
    if (this.state.platform === platform) return;
    this.state.platform = platform;
    this.persistPlatform();
    this.state.list.page = 1;
    this.state.list.search = "";
    this.state.list.status = "all";
    if (this.elRefs) {
      if (this.elRefs.search) this.elRefs.search.value = "";
      if (this.elRefs.status) this.elRefs.status.value = "all";
    }
    this.updatePlatformTabs();
    this.applyPlatformTexts();
    this.loadSummary();
    this.loadList();
  },

  showToast(message, type) {
    type = type || "info";
    if (!this.toastContainer) {
      this.toastContainer = this.el("div", "toast-container");
      document.body.appendChild(this.toastContainer);
    }
    const toast = this.el("div", "toast " + type);
    const icons = { success: "\u2714", error: "\u2716", info: "\u2139\uFE0F" };
    toast.appendChild(this.el("span", "toast-icon", icons[type] || icons.info));
    toast.appendChild(this.el("span", null, message));
    const dismiss = this.el("button", "toast-dismiss", "\u00D7");
    dismiss.type = "button";
    dismiss.addEventListener("click", () => toast.remove());
    toast.appendChild(dismiss);
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 3500);
  },

  /* =====================================================
     MODAL + FORM WIDGETS
     ===================================================== */

  openModal({ title, bodyNodes, footerNodes, onClose, scrollable = false }) {
    const backdrop = this.el("div", "modal-backdrop");
    const modal = this.el("div", "modal" + (scrollable ? " modal-scroll" : ""));

    const header = this.el("div", "modal-header");
    header.appendChild(this.el("h3", "modal-title", title));
    const closeBtn = this.el("button", "modal-close", "\u00D7");
    closeBtn.type = "button";
    header.appendChild(closeBtn);

    const body = this.el("div", "modal-body");
    (bodyNodes || []).forEach((n) => body.appendChild(n));

    const footer = this.el("div", "modal-footer");
    (footerNodes || []).forEach((n) => footer.appendChild(n));

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    let closed = false;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (onClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) close();
    });

    return { backdrop, modal, body, footer, close };
  },

  confirmModal(message, confirmLabel, onConfirm) {
    const text = this.el("p", "modal-text", message);

    const cancelBtn = this.el("button", "notes-btn ghost", "إلغاء");
    cancelBtn.type = "button";
    const confirmBtn = this.el("button", "notes-btn danger", confirmLabel || "تأكيد");
    confirmBtn.type = "button";

    const modal = this.openModal({
      title: "تأكيد",
      bodyNodes: [text],
      footerNodes: [cancelBtn, confirmBtn],
    });

    cancelBtn.addEventListener("click", () => modal.close());
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      try {
        await onConfirm();
        modal.close();
      } catch (err) {
        confirmBtn.disabled = false;
        this.showToast(err.message || "تعذّر إتمام العملية", "error");
      }
    });
  },

  buildSwitch(active, onChange) {
    const sw = this.el("div", "toggle-switch" + (active ? " active" : ""));
    sw.setAttribute("role", "switch");
    sw.setAttribute("tabindex", "0");
    sw.setAttribute("aria-checked", active ? "true" : "false");

    const toggle = () => {
      if (sw.classList.contains("disabled")) return;
      const next = !sw.classList.contains("active");
      sw.classList.toggle("active", next);
      sw.setAttribute("aria-checked", next ? "true" : "false");
      onChange(next);
    };
    sw.addEventListener("click", toggle);
    sw.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    return sw;
  },

  buildField(labelText, inputEl, hintText) {
    const field = this.el("div", "form-field");
    const label = this.el("label", "form-label", labelText);
    field.appendChild(label);
    field.appendChild(inputEl);
    if (hintText) field.appendChild(this.el("div", "form-hint", hintText));
    return field;
  },

  buildVariantEditor(initialVariants, hintText) {
    const wrap = this.el("div", "variant-editor");
    const rows = this.el("div", "variant-rows");
    const addBtn = this.el("button", "variant-add-btn", "+ إضافة صيغة");
    addBtn.type = "button";

    const addRow = (value) => {
      if (rows.children.length >= 10) {
        this.showToast("الحد الأقصى هو 10 صيغ رد", "error");
        return;
      }
      const row = this.el("div", "variant-row");
      const input = this.el("input", "variant-input");
      input.type = "text";
      input.value = value || "";
      input.placeholder = "صيغة الرد… مثال: أهلًا! اكتب {keyword} في الخاص";
      const del = this.el("button", "variant-remove-btn", "\u00D7");
      del.type = "button";
      del.title = "حذف الصيغة";
      del.addEventListener("click", () => row.remove());
      row.appendChild(input);
      row.appendChild(del);
      rows.appendChild(row);
    };

    addBtn.addEventListener("click", () => addRow(""));
    (initialVariants || []).forEach((v) => addRow(v));

    wrap.appendChild(rows);
    wrap.appendChild(addBtn);
    wrap.appendChild(
      this.el(
        "div",
        "form-hint",
        hintText ||
          "استعمل {keyword} للكلمة المفتاحية الأولى و{keywords} لكل الكلمات. إذا تركت الصيغ فارغة يستعمل البوت صيغًا افتراضية."
      )
    );
    wrap.getVariants = () =>
      Array.from(rows.querySelectorAll(".variant-input"))
        .map((i) => i.value.trim())
        .filter(Boolean);
    return wrap;
  },

  /* =====================================================
     LIFE-CYCLE
     ===================================================== */

  render(container) {
    this.teardownToast();
    this.container = container;
    this.state.view = "list";
    this.state.detail = null;
    this.container.textContent = "";
    this.renderListShell();
    this.loadSummary();
    this.loadList();
    return () => this.destroy();
  },

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.state.list.requestSeq += 1;
    this.state.summarySeq += 1;
    if (this.state.detail) {
      this.state.detail.comments.seq += 1;
      this.state.detail.hits.seq += 1;
    }
    this.teardownToast();
  },

  teardownToast() {
    if (this.toastContainer && this.toastContainer.parentNode) {
      this.toastContainer.remove();
    }
    this.toastContainer = null;
  },

  /* =====================================================
     LIST VIEW
     ===================================================== */

  renderListShell() {
    this.container.innerHTML = `
      <div class="posts-page" dir="rtl">
        <header class="posts-header">
          <div class="posts-header-text">
            <h2 class="posts-title">Auto Comments</h2>
            <span class="posts-subtitle" id="posts-subtitle"></span>
          </div>
          <div class="posts-platform-tabs" id="posts-platform-tabs" role="group" aria-label="اختر المنصة"></div>
          <button type="button" class="posts-primary-btn" id="posts-add-btn">إضافة منشور</button>
        </header>

        <details class="posts-info-box">
          <summary>كيف يعمل الرد على المنشورات؟</summary>
          <p id="posts-info-text"></p>
        </details>

        <div class="stats-grid" id="posts-stats"></div>

        <div class="posts-toolbar">
          <div class="posts-search-box">
            <input type="text" class="posts-search-input" id="posts-search-input"
              placeholder="بحث بالعنوان أو الرابط أو المعرّف..." autocomplete="off" />
          </div>
          <select class="orders-select posts-select" id="posts-status-select">
            <option value="all">الكل</option>
            <option value="active">نشط</option>
            <option value="inactive">معطّل</option>
          </select>
        </div>

        <div class="posts-list" id="posts-list"></div>
        <footer class="posts-footer" id="posts-footer"></footer>
      </div>
    `;

    this.elRefs = {
      stats: this.container.querySelector("#posts-stats"),
      list: this.container.querySelector("#posts-list"),
      footer: this.container.querySelector("#posts-footer"),
      search: this.container.querySelector("#posts-search-input"),
      status: this.container.querySelector("#posts-status-select"),
      add: this.container.querySelector("#posts-add-btn"),
      platformTabs: this.container.querySelector("#posts-platform-tabs"),
      subtitle: this.container.querySelector("#posts-subtitle"),
      infoText: this.container.querySelector("#posts-info-text"),
    };
    this.elRefs.status.value = this.state.list.status;
    this.elRefs.search.value = this.state.list.search;

    // مبدّل المنصة (segmented control)
    const platformTabs = this.buildPlatformTabs();
    this.elRefs.platformTabs.replaceWith(platformTabs);
    this.elRefs.platformTabs = platformTabs;
    this.applyPlatformTexts();

    this.elRefs.add.addEventListener("click", () => this.openCreateModal());
    this.elRefs.search.addEventListener("input", () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.state.list.search = this.elRefs.search.value.trim();
        this.state.list.page = 1;
        this.loadList();
      }, 400);
    });
    this.elRefs.status.addEventListener("change", () => {
      this.state.list.status = this.elRefs.status.value;
      this.state.list.page = 1;
      this.loadList();
    });
  },

  async loadSummary() {
    const seq = ++this.state.summarySeq;
    try {
      const data = await getPostsSummary(this.state.platform);
      if (seq !== this.state.summarySeq) return;
      this.state.summary = data;
    } catch (err) {
      if (seq !== this.state.summarySeq) return;
      this.state.summary = null;
    }
    if (this.state.view === "list" && this.elRefs) this.renderStats();
  },

  renderStats() {
    const s = this.state.summary || {};
    this.elRefs.stats.textContent = "";
    const defs = [
      ["\uD83D\uDCC4", s.total_posts, "إجمالي المنشورات", "post-total"],
      ["\u2705", s.active_posts, "المنشورات النشطة", "post-active"],
      ["\uD83D\uDCAC", s.total_comments, "إجمالي التعليقات", "post-comments"],
      ["\u21A9", s.replied_comments, "تم الرد عليها", "post-replied"],
      ["\u26A0", s.failed_comments, "فشل الرد", "post-failed"],
      ["\uD83D\uDD11", s.total_hits, "مرات استعمال الكلمات", "post-hits"],
    ];
    defs.forEach((d) => {
      const card = this.el("div", "stat-card stat-card--" + d[3]);
      card.appendChild(this.el("span", "stat-card-icon", d[0]));
      card.appendChild(this.el("span", "stat-card-value", String(d[1] != null ? d[1] : 0)));
      card.appendChild(this.el("span", "stat-card-label", d[2]));
      this.elRefs.stats.appendChild(card);
    });
  },

  async loadList() {
    const seq = ++this.state.list.requestSeq;
    this.renderListLoading();
    try {
      const data = await listPosts({
        page: this.state.list.page,
        limit: this.state.list.limit,
        search: this.state.list.search || undefined,
        status: this.state.list.status,
        platform: this.state.platform,
      });
      if (seq !== this.state.list.requestSeq) return;
      this.state.list.data = data;
      this.renderPosts(data);
      this.renderListFooter(data);
    } catch (err) {
      if (seq !== this.state.list.requestSeq) return;
      this.state.list.data = null;
      this.renderListError(err.message);
      this.renderListFooter(null);
    }
  },

  renderListLoading() {
    const list = this.elRefs.list;
    list.textContent = "";
    for (let i = 0; i < 3; i++) {
      const card = this.el("div", "post-card post-card--skeleton");
      card.appendChild(this.el("div", "skeleton-pulse posts-sk-title"));
      card.appendChild(this.el("div", "skeleton-pulse posts-sk-line"));
      card.appendChild(this.el("div", "skeleton-pulse posts-sk-line short"));
      list.appendChild(card);
    }
  },

  renderListError(msg) {
    const list = this.elRefs.list;
    list.textContent = "";
    const box = this.el("div", "posts-error");
    box.appendChild(this.el("span", null, "تعذّر تحميل المنشورات: " + (msg || "خطأ غير معروف")));
    const retry = this.el("button", "notes-btn primary", "إعادة المحاولة");
    retry.type = "button";
    retry.addEventListener("click", () => this.loadList());
    box.appendChild(retry);
    list.appendChild(box);
  },

  renderPosts(data) {
    const list = this.elRefs.list;
    list.textContent = "";
    const posts = (data && data.items) || [];

    if (!posts.length) {
      list.appendChild(this.el("div", "posts-empty", "لا توجد منشورات مطابقة"));
      return;
    }

    posts.forEach((post) => list.appendChild(this.buildPostCard(post)));
  },

  buildPostCard(post) {
    const card = this.el("article", "post-card");

    const main = this.el("div", "post-card-main");

    const head = this.el("div", "post-card-head");
    head.appendChild(this.el("h3", "post-card-title", post.title || post.post_key));
    head.appendChild(this.buildPlatformBadge(post.platform));
    head.appendChild(
      this.el("span", "post-type-badge post-type--" + post.post_type, this.typeLabel(post.post_type))
    );
    if (post.post_url && String(post.post_url).startsWith("https://")) {
      const link = this.el("a", "post-card-link", "فتح ↗");
      link.href = post.post_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.addEventListener("click", (e) => e.stopPropagation());
      head.appendChild(link);
    }
    main.appendChild(head);

    main.appendChild(this.el("div", "post-card-sub", "المعرّف: " + post.post_key));
    main.appendChild(this.el("div", "post-card-url", this.truncate(post.post_url, 70)));

    const stats = this.el("div", "post-mini-stats");
    const mini = [
      ["كلمات مفتاحية", post.keywords_count],
      ["تعليقات", post.comments_total],
      ["تم الرد", post.comments_replied],
      ["فشل", post.comments_failed],
      ["إصابات", post.hits_total],
    ];
    mini.forEach(([label, value]) => {
      const item = this.el("div", "post-mini-stat");
      item.appendChild(this.el("span", "post-mini-value", String(value != null ? value : 0)));
      item.appendChild(this.el("span", "post-mini-label", label));
      stats.appendChild(item);
    });
    main.appendChild(stats);

    if (post.is_active && post.active_keywords_count === 0) {
      main.appendChild(
        this.el("div", "post-warn-badge", "لا توجد كلمة مفتاحية نشطة — لن يرد البوت")
      );
    }

    const side = this.el("div", "post-card-side");
    const sw = this.buildSwitch(post.is_active, (next) => this.togglePostActive(post, sw, next));
    side.appendChild(sw);

    card.appendChild(main);
    card.appendChild(side);
    card.addEventListener("click", () => this.openDetail(post.id));
    return card;
  },

  async togglePostActive(post, sw, next) {
    sw.classList.add("disabled");
    try {
      await updatePost(post.id, { is_active: next });
      post.is_active = next;
      this.showToast(next ? "تم تفعيل المنشور" : "تم تعطيل المنشور", "success");
      this.renderPosts(this.state.list.data);
    } catch (err) {
      sw.classList.toggle("active", !next);
      sw.setAttribute("aria-checked", String(!next));
      this.showToast(err.message || "تعذّر تحديث المنشور", "error");
    } finally {
      sw.classList.remove("disabled");
    }
  },

  renderListFooter(data) {
    const footer = this.elRefs.footer;
    footer.textContent = "";
    if (!data) return;

    const total = data.total || 0;
    const limit = data.limit || this.state.list.limit;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const count = this.el("span", "orders-count", "إجمالي: " + total + " منشور");
    const controls = this.el("div", "orders-pagination");

    const prev = this.el("button", "orders-page-btn", "السابق");
    prev.type = "button";
    prev.disabled = data.page <= 1;
    prev.addEventListener("click", () => {
      this.state.list.page = Math.max(1, data.page - 1);
      this.loadList();
    });

    const info = this.el("span", "orders-page-info", "صفحة " + data.page + " من " + totalPages);

    const nextBtn = this.el("button", "orders-page-btn", "التالي");
    nextBtn.type = "button";
    nextBtn.disabled = data.page >= totalPages;
    nextBtn.addEventListener("click", () => {
      this.state.list.page = Math.min(totalPages, data.page + 1);
      this.loadList();
    });

    controls.appendChild(prev);
    controls.appendChild(info);
    controls.appendChild(nextBtn);
    footer.appendChild(count);
    footer.appendChild(controls);
  },

  /* =====================================================
     CREATE POST MODAL
     ===================================================== */

  openCreateModal() {
    const platform = this.state.platform;
    const isIg = platform === "instagram";

    const urlInput = this.el("input", "form-input");
    urlInput.type = "text";
    urlInput.placeholder = isIg
      ? "https://www.instagram.com/reel/XXXXXXXXXXX/"
      : "https://www.facebook.com/reel/1234567890123";
    urlInput.dir = "ltr";

    const titleInput = this.el("input", "form-input");
    titleInput.type = "text";
    titleInput.placeholder = "عنوان اختياري لديك فقط";

    const variants = this.buildVariantEditor(
      [],
      isIg
        ? "استعمل {keyword} للكلمة المفتاحية الأولى و{keywords} لكل الكلمات و{username} لاسم المعلّق. إذا تركت الصيغ فارغة يستعمل البوت صيغًا افتراضية."
        : undefined
    );

    const kwInput = this.el("input", "form-input");
    kwInput.type = "text";
    kwInput.placeholder = "مثال: سعر";

    const dmInput = this.el("textarea", "form-textarea");
    dmInput.rows = 3;
    dmInput.maxLength = 2000;
    dmInput.placeholder = "الرسالة التي سيرسلها البوت في الخاص عند كتابة الكلمة";

    const dmCounter = this.el("div", "form-counter", "0 / 2000");
    const dmField = this.buildField(
      "رسالة الخاص",
      dmInput,
      "اختياري — اتركها فارغة للرد على التعليق فقط بدون إرسال رسالة في الخاص"
    );
    dmField.appendChild(dmCounter);

    // خطأ خاص بحقل رسالة الخاص (يظهر أسفل الحقل)
    const dmError = this.el("div", "field-error hidden");
    dmField.appendChild(dmError);

    const manualInput = this.el("input", "form-input");
    manualInput.type = "text";
    manualInput.placeholder = isIg ? "مثال: Cabc123XYZ" : "مثال: 1234567890123";
    manualInput.dir = "ltr";
    const manualField = this.buildField(
      isIg ? "الـ Shortcode أو المعرّف الرقمي للوسائط" : "معرّف المنشور (يدويًا)",
      manualInput,
      isIg
        ? "الـ Shortcode هو الجزء من الرابط بعد /p/ أو /reel/. لم نتعرّف على الرابط تلقائيًا — افتح المنشور الكامل وانسخ الرابط أو أدخل المعرّف الرقمي للوسائط."
        : "لم نتعرّف على الرابط تلقائيًا. افتح المنشور الكامل وانسخ الرابط، أو أدخل المعرّف الرقمي يدويًا."
    );
    manualField.style.display = "none";

    const errorBox = this.el("div", "modal-error hidden");

    /* ---------- الكلمة المفتاحية الأولى: مرفق وسائط + معاينة ---------- */
    // نفس مكوّن نموذج الكلمة المفتاحية (بلا تكرار).
    // let لأنها تُستعمل داخل refreshFirstKeywordUi قبل إسناد قيمتها.
    let mediaField = null;

    // المعاينة مطوية افتراضيًا على الشاشات الصغيرة (النافذة طويلة).
    const previewPanel = this.buildCustomerPreviewPanel({
      collapsed: typeof window !== "undefined" && window.innerWidth < 768,
    });

    const showDmError = (msg) => this.setFieldError(dmError, msg);

    const refreshFirstKeywordUi = () => {
      const media = mediaField ? mediaField.getValue() : { type: "none", url: "" };
      const hasMedia = this.mediaAttached(media);
      this.updateDmCounter(dmCounter, dmInput.value.length, hasMedia);
      previewPanel.update({
        post: { comment_reply_variants: variants.getVariants() },
        dmMessage: dmInput.value.trim(),
        mediaUrl: hasMedia ? media.url : "",
        mediaType: hasMedia ? media.type : "",
      });
    };

    mediaField = this.createMediaField({
      initialType: "none",
      initialUrl: "",
      onChange: () => refreshFirstKeywordUi(),
      onBusyChange: (busy) => {
        submitBtn.disabled = busy;
      },
    });

    // قسم الوسائط لا معنى له بدون كلمة مفتاحية → نخفيه حتى تُكتب الكلمة.
    const syncMediaVisibility = () => {
      const hasKeyword = !!kwInput.value.trim();
      mediaField.setVisible(hasKeyword);
      previewPanel.element.classList.toggle("hidden", !hasKeyword);
      if (!hasKeyword) showDmError("");
    };
    const resetFirstKeyword = () => {
      kwInput.value = "";
      dmInput.value = "";
      showDmError("");
      mediaField.destroy();
      mediaField.setValue({ type: "none", url: "" });
      syncMediaVisibility();
      refreshFirstKeywordUi();
    };
    kwInput.addEventListener("input", syncMediaVisibility);
    dmInput.addEventListener("input", () => {
      showDmError("");
      refreshFirstKeywordUi();
    });

    const body = [
      this.buildField(
        "رابط المنشور *",
        urlInput,
        isIg
          ? "روابط مدعومة: منشور (/p/)، ريل (/reel/)، فيديو (/tv/). الستوري غير مدعوم."
          : "رابط الريل أو الفيديو أو المنشور على فيسبوك."
      ),
      this.buildField("العنوان (اختياري)", titleInput),
      this.buildField("صيغ رد التعليق", variants),
      this.el("div", "form-section-title", "كلمة مفتاحية أولى (اختياري)"),
      this.buildField("الكلمة المفتاحية", kwInput),
      dmField,
      mediaField.element,
      previewPanel.element,
      manualField,
      errorBox,
    ];
    syncMediaVisibility();
    refreshFirstKeywordUi();

    const submitBtn = this.el("button", "notes-btn primary", "إنشاء");
    submitBtn.type = "button";
    const cancelBtn = this.el("button", "notes-btn ghost", "إلغاء");
    cancelBtn.type = "button";

    const modal = this.openModal({
      title: "إضافة منشور — " + this.platformName(platform),
      bodyNodes: body,
      footerNodes: [cancelBtn, submitBtn],
      scrollable: true,
      onClose: () => {
        // تنظيف كامل عند الإغلاق (تفادي بقاء مرفق أو رسالة في النموذج)
        resetFirstKeyword();
      },
    });

    cancelBtn.addEventListener("click", () => modal.close());

    const showError = (msg) => {
      errorBox.textContent = msg;
      errorBox.classList.remove("hidden");
    };

    submitBtn.addEventListener("click", async () => {
      errorBox.classList.add("hidden");
      const postUrl = urlInput.value.trim();
      if (!postUrl) {
        showError("رابط المنشور مطلوب.");
        urlInput.focus();
        return;
      }
      if (isIg && !postUrl.startsWith("https://")) {
        showError("رابط إنستغرام يجب أن يبدأ بـ https://");
        urlInput.focus();
        return;
      }

      const kw = kwInput.value.trim();
      const dm = dmInput.value.trim();
      const media = mediaField.getValue();
      const hasMedia = media.type !== "none";

      // مرفق بلا كلمة مفتاحية → لا معنى له
      if (hasMedia && !kw) {
        showError("أدخل الكلمة المفتاحية أولاً، أو أزل مرفق الوسائط.");
        kwInput.focus();
        return;
      }

      if (kw) {
        const dmCheck = this.validateDmMessageClient(dm, hasMedia);
        if (!dmCheck.ok) {
          showDmError(dmCheck.error);
          dmInput.focus();
          return;
        }
      }

      if (hasMedia) {
        const check = mediaField.validate();
        if (!check.ok) {
          showError(check.error);
          return;
        }
      }

      const payload = {
        post_url: postUrl,
        platform: platform,
        title: titleInput.value.trim() || undefined,
        comment_reply_variants: variants.getVariants(),
      };
      if (manualField.style.display !== "none" && manualInput.value.trim()) {
        payload.post_key = manualInput.value.trim();
      }
      if (kw) {
        // الكلمة الأولى + مرفقها — تُنشأ مع المنشور في نفس المعاملة
        payload.first_keyword = {
          keyword: kw,
          dm_message: dm || null,
          stop_bot_after_send: !!dm,
          is_active: true,
          media_url: hasMedia ? media.url : null,
          media_type: hasMedia ? media.type : null,
        };
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "جارٍ فحص الرابط...";
      try {
        if (hasMedia) {
          // فحص الرابط من الخادم قبل الحفظ (والخادم يتحقق مرة أخرى داخل المعاملة)
          const verified = await mediaField.verifyLink();
          if (!verified.ok) {
            showError(verified.error);
            submitBtn.disabled = false;
            submitBtn.textContent = "إنشاء";
            return;
          }
          if (verified.skipped && verified.error) {
            this.showToast("تعذّر فحص الرابط مسبقًا، سيتحقق الخادم عند الحفظ.", "info");
          }
        }

        const created = await createPost(payload);

        if (created.resolved_from) {
          this.showToast("تم تحويل الرابط المختصر إلى الرابط الكامل تلقائيًا", "info");
        }

        if (created.key_resolved_via) {
          this.showToast("تم استخراج المعرّف تلقائيًا من الرابط", "info");
        }

        this.showToast(
          created.first_keyword ? "تم إنشاء المنشور مع الكلمة المفتاحية" : "تم إنشاء المنشور",
          "success"
        );

        // تنظيف قسم الكلمة المفتاحية بعد الحفظ (تفادي بقاء بيانات في النموذج)
        resetFirstKeyword();

        // عرض المعرّف المستخرج + إغلاق
        errorBox.classList.add("hidden");
        const successBox = this.el(
          "div",
          "modal-success",
          "معرّف المنشور: " +
            created.post_key +
            (isIg ? " · " + this.typeLabel(created.post_type) : "")
        );
        body.unshift(successBox);

        submitBtn.remove();
        cancelBtn.textContent = "إغلاق";
        cancelBtn.classList.remove("ghost");
        cancelBtn.classList.add("primary");
        this.loadSummary();
        this.loadList();
      } catch (err) {
        if (err.data && err.data.needs_manual_key) {
          manualField.style.display = "";
          showError(err.message);
          manualInput.focus();
        } else {
          showError(err.message || "تعذّر إنشاء المنشور.");
        }
        submitBtn.disabled = false;
        submitBtn.textContent = "إنشاء";
      }
    });
  },

  /* =====================================================
     DETAIL VIEW
     ===================================================== */

  async openDetail(id) {
    this.state.view = "detail";
    this.state.detail = {
      id,
      post: null,
      keywords: [],
      keywordFilter: "all",
      stats: null,
      tab: "settings",
      comments: { status: "all", search: "", page: 1, data: null, seq: 0 },
      hits: { page: 1, data: null, seq: 0 },
    };
    this.container.textContent = "";
    this.container.appendChild(this.el("div", "posts-loading", "جارٍ التحميل…"));
    try {
      const res = await getPost(id);
      if (this.state.view !== "detail" || !this.state.detail || this.state.detail.id !== id) return;
      this.state.detail.post = res.post;
      this.state.detail.keywords = res.keywords || [];
      this.state.detail.stats = res.stats;
      this.renderDetail();
    } catch (err) {
      this.container.textContent = "";
      const box = this.el("div", "posts-error");
      box.appendChild(this.el("span", null, "تعذّر تحميل المنشور: " + (err.message || "خطأ")));
      const back = this.el("button", "notes-btn primary", "رجوع");
      back.type = "button";
      back.addEventListener("click", () => this.render(this.container));
      box.appendChild(back);
      this.container.appendChild(box);
    }
  },

  renderDetail() {
    const d = this.state.detail;
    this.container.textContent = "";
    this.container.innerHTML = `
      <div class="posts-page" dir="rtl">
        <header class="posts-header">
          <div class="posts-detail-head">
            <button type="button" class="posts-back-btn" id="posts-back">→ رجوع</button>
            <div class="posts-header-text">
              <h2 class="posts-title" id="posts-detail-title"></h2>
              <span class="posts-subtitle" id="posts-detail-sub"></span>
            </div>
          </div>
        </header>
        <div class="posts-tabs" id="posts-tabs"></div>
        <div class="posts-tab-content" id="posts-tab-content"></div>
      </div>
    `;

    this.detailRefs = {
      back: this.container.querySelector("#posts-back"),
      title: this.container.querySelector("#posts-detail-title"),
      sub: this.container.querySelector("#posts-detail-sub"),
      tabs: this.container.querySelector("#posts-tabs"),
      content: this.container.querySelector("#posts-tab-content"),
    };

    this.detailRefs.back.addEventListener("click", () => this.render(this.container));
    this.renderDetailHeader();
    this.renderTabs();
    this.renderDetailContent();
  },

  renderDetailHeader() {
    const post = this.state.detail.post;
    this.detailRefs.title.textContent = post.title || post.post_key;
    this.detailRefs.sub.textContent =
      this.platformName(post.platform) +
      " · " +
      this.typeLabel(post.post_type) +
      " · المعرّف: " +
      post.post_key +
      " · " +
      (post.is_active ? "نشط" : "معطّل");
  },

  renderTabs() {
    const d = this.state.detail;
    const tabs = [
      ["settings", "الإعدادات"],
      ["keywords", "الكلمات المفتاحية"],
      ["comments", "التعليقات"],
      ["hits", "سجل الكلمات"],
    ];
    this.detailRefs.tabs.textContent = "";
    tabs.forEach(([key, label]) => {
      const btn = this.el("button", "posts-tab" + (d.tab === key ? " active" : ""), label);
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (this.state.detail.tab === key) return;
        this.state.detail.tab = key;
        this.renderTabs();
        this.renderDetailContent();
      });
      this.detailRefs.tabs.appendChild(btn);
    });
  },

  renderDetailContent() {
    const d = this.state.detail;
    this.detailRefs.content.textContent = "";
    if (d.tab === "settings") this.renderSettingsTab();
    else if (d.tab === "keywords") this.renderKeywordsTab();
    else if (d.tab === "comments") this.renderCommentsTab();
    else if (d.tab === "hits") this.renderHitsTab();
  },

  /* ---------------- SETTINGS TAB ---------------- */

  renderSettingsTab() {
    const post = this.state.detail.post;
    const isIg = post.platform === "instagram";
    const wrap = this.el("div", "posts-settings");

    const titleInput = this.el("input", "form-input");
    titleInput.type = "text";
    titleInput.value = post.title || "";

    const urlInput = this.el("input", "form-input");
    urlInput.type = "text";
    urlInput.value = post.post_url;
    urlInput.dir = "ltr";

    const manualInput = this.el("input", "form-input");
    manualInput.type = "text";
    manualInput.dir = "ltr";
    manualInput.placeholder = isIg ? "Cabc123XYZ" : "1234567890123";
    const manualField = this.buildField(
      isIg ? "الـ Shortcode أو المعرّف الرقمي للوسائط" : "معرّف المنشور (يدويًا)",
      manualInput,
      isIg
        ? "الـ Shortcode هو الجزء من الرابط بعد /p/ أو /reel/. لم نتعرّف على الرابط تلقائيًا — أدخله يدويًا."
        : "لم نتعرّف على الرابط تلقائيًا — أدخل المعرّف الرقمي يدويًا."
    );
    manualField.style.display = "none";

    const variants = this.buildVariantEditor(
      post.comment_reply_variants || [],
      isIg
        ? "استعمل {keyword} للكلمة المفتاحية الأولى و{keywords} لكل الكلمات و{username} لاسم المعلّق. إذا تركت الصيغ فارغة يستعمل البوت صيغًا افتراضية."
        : undefined
    );

    const activeRow = this.el("div", "form-switch-row");
    activeRow.appendChild(this.el("span", "form-label", "المنشور نشط"));
    const sw = this.buildSwitch(post.is_active, (next) => {
      sw.dataset.pending = String(next);
      sw.classList.toggle("active", next);
      sw.setAttribute("aria-checked", String(next));
    });
    activeRow.appendChild(sw);

    const errorBox = this.el("div", "modal-error hidden");

    const saveBtn = this.el("button", "notes-btn primary", "حفظ التغييرات");
    saveBtn.type = "button";

    errorBox.style.marginBottom = "8px";

    wrap.appendChild(this.buildField("العنوان", titleInput));
    const urlField = this.buildField("رابط المنشور", urlInput);
    const platformRow = this.el("div", "posts-platform-readonly");
    platformRow.appendChild(this.el("span", "form-label", "المنصة"));
    platformRow.appendChild(this.buildPlatformBadge(post.platform));
    urlField.appendChild(platformRow);
    wrap.appendChild(urlField);
    wrap.appendChild(this.buildField("صيغ رد التعليق", variants));

    // ── مؤشر Round-Robin ──
    const variantCount = (post.comment_reply_variants || []).length;
    if (variantCount > 0) {
      const rrBox = this.el("div", "variant-rr-box");
      const rrInfo = this.el("div", "variant-rr-info");
      rrInfo.appendChild(this.el("span", "variant-rr-icon", "🔄"));
      rrInfo.appendChild(
        this.el("span", "variant-rr-label",
          "التوزيع الدوري مفعّل — " + variantCount + " صيغ رد")
      );
      const rrIndex = this.el("span", "variant-rr-index",
        "الرد التالي: رقم " + ((post.comment_reply_index || 0) + 1) + " من " + variantCount
      );
      rrBox.appendChild(rrInfo);
      rrBox.appendChild(rrIndex);

      const previewBtn = this.el("button", "notes-btn ghost variant-preview-btn", "معاينة الرد التالي ▶");
      previewBtn.type = "button";
      const previewResult = this.el("div", "variant-preview-result hidden");
      rrBox.appendChild(previewBtn);
      rrBox.appendChild(previewResult);
      wrap.appendChild(rrBox);

      previewBtn.addEventListener("click", async () => {
        previewBtn.disabled = true;
        previewBtn.textContent = "جارٍ الجلب…";
        try {
          const res = await getNextPostVariant(post.id);
          previewResult.textContent = res.variant || "(لا توجد صيغ)";
          previewResult.classList.remove("hidden");
          // تحديث مؤشر الرد التالي
          const total = (post.comment_reply_variants || []).length;
          if (total > 0) {
            const currentIdx = (post.comment_reply_index || 0) + 1;
            post.comment_reply_index = currentIdx % total;
            rrIndex.textContent =
              "الرد التالي: رقم " + ((post.comment_reply_index || 0) + 1) + " من " + total;
          }
        } catch (err) {
          this.showToast(err.message || "تعذّر جلب الرد", "error");
        } finally {
          previewBtn.disabled = false;
          previewBtn.textContent = "معاينة الرد التالي ▶";
        }
      });
    }

    wrap.appendChild(manualField);
    wrap.appendChild(activeRow);
    wrap.appendChild(errorBox);
    wrap.appendChild(saveBtn);
    this.detailRefs.content.appendChild(wrap);

    const showError = (msg) => {
      errorBox.textContent = msg;
      errorBox.classList.remove("hidden");
    };

    saveBtn.addEventListener("click", async () => {
      errorBox.classList.add("hidden");
      const url = urlInput.value.trim();
      if (!url) {
        showError("رابط المنشور مطلوب.");
        return;
      }
      if (isIg && !url.startsWith("https://")) {
        showError("رابط إنستغرام يجب أن يبدأ بـ https://");
        return;
      }
      const payload = {
        title: titleInput.value.trim(),
        post_url: url,
        comment_reply_variants: variants.getVariants(),
        is_active: sw.classList.contains("active"),
      };
      if (manualField.style.display !== "none" && manualInput.value.trim()) {
        payload.post_key = manualInput.value.trim();
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "جارٍ الحفظ…";
      try {
        const updated = await updatePost(post.id, payload);
        this.state.detail.post = Object.assign({}, post, updated);
        this.renderDetailHeader();
        this.showToast("تم حفظ التغييرات", "success");
      } catch (err) {
        if (err.data && err.data.needs_manual_key) {
          manualField.style.display = "";
          showError(err.message);
        } else {
          showError(err.message || "تعذّر الحفظ.");
        }
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "حفظ التغييرات";
      }
    });

    // Danger zone
    const danger = this.el("div", "posts-danger-zone");
    danger.appendChild(this.el("div", "posts-danger-title", "منطقة الخطر"));
    danger.appendChild(
      this.el(
        "div",
        "posts-danger-text",
        "حذف المنشور يزيل كلماته المفتاحية. إذا كانت هناك تعليقات أو إصابات مرتبطة به فسيفشل الحذف — عطّله بدلًا من ذلك."
      )
    );
    const delBtn = this.el("button", "notes-btn danger", "حذف المنشور");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => {
      this.confirmModal(
        "هل أنت متأكد من حذف هذا المنشور وكل كلماته المفتاحية؟",
        "حذف نهائيًا",
        async () => {
          await deletePost(post.id);
          this.showToast("تم حذف المنشور", "success");
          this.state.view = "list";
          this.render(this.container);
        }
      );
    });
    danger.appendChild(delBtn);
    this.detailRefs.content.appendChild(danger);
  },

  /* =====================================================
     MEDIA ATTACHMENT — مرفق الوسائط (صورة أو فيديو)
     ===================================================== */

  mediaTypeLabel(type) {
    if (type === "image") return "صورة";
    if (type === "video") return "فيديو";
    return "بدون وسائط";
  },

  detectMediaTypeFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const pathname = u.pathname.toLowerCase();
      const dot = pathname.lastIndexOf(".");
      if (dot === -1) return null;
      const ext = pathname.substring(dot);
      if ([".jpg", ".jpeg", ".png", ".gif"].indexOf(ext) !== -1) return "image";
      if (ext === ".mp4") return "video";
      return null;
    } catch (err) {
      return null;
    }
  },

  formatMediaSize(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "غير معروف";
    const n = Number(bytes);
    if (n < 1024) return n + " بايت";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " كيلوبايت";
    return (n / (1024 * 1024)).toFixed(2) + " ميغابايت";
  },

  mediaCheckErrorText(err) {
    const status = err && err.status;
    if (status === 429) {
      return "طلبات فحص كثيرة. انتظر قليلًا ثم أعد المحاولة، أو ارفع الملف مباشرة إن كان الرفع متاحًا.";
    }
    if (status === 400 && err && err.message) {
      return (
        err.message +
        " تأكد أن الرابط مباشر وعام ويشير إلى ملف صورة أو فيديو صالح."
      );
    }
    if (!status || status >= 500) {
      return "تعذّر فحص الرابط الآن. تأكد أن الرابط مباشر وعام ويبدأ بـ https://، أو ارفع الملف مباشرة إن كان الرفع متاحًا.";
    }
    return (
      (err && err.message) ||
      "تعذّر فحص الرابط. تأكد أنه رابط مباشر وعام ويشير إلى ملف صحيح."
    );
  },

  /** نفس قواعد الخادم (تقريبًا) للتحقق من الرابط قبل الإرسال. */
  validateMediaUrlClient(rawUrl, type) {
    const url = (rawUrl || "").trim();
    if (!url) return { ok: false, error: "رابط الوسائط مطلوب." };
    if (url.length > 2000) {
      return { ok: false, error: "رابط الوسائط طويل جداً (الحد الأقصى 2000 حرف)." };
    }
    let u;
    try {
      u = new URL(url);
    } catch (err) {
      return { ok: false, error: "رابط غير صالح. تأكد من نسخ الرابط كاملًا." };
    }
    if (u.protocol !== "https:") {
      return { ok: false, error: "يجب أن يبدأ الرابط بـ https://" };
    }
    if (u.username || u.password) {
      return { ok: false, error: "لا يُسمح ببيانات الاعتماد داخل الرابط." };
    }
    const host = u.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
    if (host === "localhost" || host.endsWith(".localhost")) {
      return { ok: false, error: "لا يُسمح بالروابط المحلية." };
    }
    if (this.isPrivateMediaHost(host)) {
      return { ok: false, error: "لا يُسمح بالروابط إلى عناوين IP الخاصة." };
    }
    const shareHosts = [
      "drive.google.com",
      "docs.google.com",
      "dropbox.com",
      "onedrive.live.com",
      "sharepoint.com",
      "1drv.ms",
    ];
    const isShareHost = shareHosts.some((h) => host === h || host.endsWith("." + h));
    if (isShareHost) {
      return {
        ok: false,
        error: "يجب أن يكون رابط مباشر للملف، وليس صفحة مشاركة (مثل Google Drive أو Dropbox).",
      };
    }
    if (type === "image") {
      if (this.detectMediaTypeFromUrl(url) !== "image") {
        return { ok: false, error: "امتداد الصورة يجب أن يكون .jpg أو .jpeg أو .png أو .gif." };
      }
    } else if (type === "video") {
      if (this.detectMediaTypeFromUrl(url) !== "video") {
        return { ok: false, error: "امتداد الفيديو يجب أن يكون .mp4." };
      }
    }
    return { ok: true };
  },

  /** فحص مبسّط لعنوان المضيف: هل هو IP خاص؟ (نفس قواعد الخادم) */
  isPrivateMediaHost(host) {
    const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isIPv4) {
      const p = host.split(".").map((n) => parseInt(n, 10));
      if (p.some((n) => n < 0 || n > 255)) return true;
      const [a, b, c] = p;
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 192 && b === 0 && c === 0) return true;
      if (a === 192 && b === 0 && c === 2) return true;
      if (a === 198 && (b === 18 || b === 19)) return true;
      if (a === 198 && b === 51 && c === 100) return true;
      if (a === 203 && b === 0 && c === 113) return true;
      if (a >= 224) return true;
      return false;
    }
    if (host.indexOf(":") !== -1) {
      if (host === "::1" || host === "::") return true;
      if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return true;
      if (host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.")) return true;
      if (host.startsWith("::ffff:192.168.")) return true;
      return false;
    }
    return false;
  },

  /**
   * يبني معاينة الوسائط داخل host باستخدام createElement فقط (بدون innerHTML).
   */
  renderMediaPreview(host, url, type) {
    host.textContent = "";
    if (!url || !type) return;

    const wrap = this.el("div", "media-preview");
    const loading = this.el("div", "media-preview-loading", "جارٍ تحميل المعاينة…");
    wrap.appendChild(loading);

    let node;
    let readyEvent;
    if (type === "video") {
      node = document.createElement("video");
      node.controls = true;
      node.preload = "metadata";
      node.playsInline = true;
      node.muted = true;
      readyEvent = "loadedmetadata";
    } else {
      node = document.createElement("img");
      node.alt = "معاينة الوسائط";
      // لا نستعمل loading="lazy": العنصر مخفي حتى يكتمل التحميل، وقد لا يبدأ التحميل أصلًا.
      readyEvent = "load";
    }
    node.className = "media-preview-el";
    node.hidden = true;

    node.addEventListener(readyEvent, () => {
      loading.remove();
      node.hidden = false;
    });
    node.addEventListener("error", () => {
      loading.remove();
      node.remove();
      wrap.appendChild(
        this.el(
          "div",
          "media-preview-error",
          "لم تُحمّل المعاينة هنا (قد يمنع الموقع العرض المباشر أو يتطلب الرابط تسجيل دخول). عند الحفظ سيتحقق الخادم من الرابط."
        )
      );
    });

    wrap.appendChild(node);
    host.appendChild(wrap);
    node.src = url;
  },

  buildMediaTypeSelector(initialType, onChange) {
    const wrap = this.el("div", "media-type-seg");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "نوع الوسائط");
    const buttons = {};
    [
      { value: "none", label: "بدون" },
      { value: "image", label: "صورة" },
      { value: "video", label: "فيديو" },
    ].forEach((opt) => {
      const btn = this.el(
        "button",
        "media-type-btn" + (opt.value === initialType ? " active" : ""),
        opt.label
      );
      btn.type = "button";
      btn.setAttribute("aria-pressed", opt.value === initialType ? "true" : "false");
      btn.addEventListener("click", () => {
        Object.keys(buttons).forEach((key) => {
          buttons[key].classList.toggle("active", key === opt.value);
          buttons[key].setAttribute("aria-pressed", key === opt.value ? "true" : "false");
        });
        onChange(opt.value);
      });
      buttons[opt.value] = btn;
      wrap.appendChild(btn);
    });
    return { wrap, buttons };
  },

  /** فقاعة محادثة Messenger مبسّطة. */
  buildMessengerBubble(kind, text) {
    const bubble = this.el("div", "messenger-bubble " + kind);
    bubble.appendChild(this.el("span", "messenger-bubble-text", text));
    return bubble;
  },

  /** معاينة "كيف يرى العميل": رد التعليق العام ثم رسالة الخاص ثم زر/وسائط. */
  buildCustomerPreview(post, dmMessage, mediaUrl, mediaType) {
    const panel = this.el("div", "customer-preview");
    panel.appendChild(this.el("div", "customer-preview-title", "كيف يرى العميل"));

    const thread = this.el("div", "messenger-thread");
    const message = typeof dmMessage === "string" ? dmMessage.trim() : "";
    const hasMedia = !!mediaUrl && !!mediaType;

    const variants = (post && post.comment_reply_variants) || [];
    const sample = variants.length
      ? String(variants[0])
      : "أهلًا! اكتب {keyword} في الخاص لنرسل لك التفاصيل.";
    const commentText = sample
      .replace(/\{keyword\}/g, "الكلمة المفتاحية")
      .replace(/\{username\}/g, "العميل");
    thread.appendChild(this.buildMessengerBubble("public", commentText));

    if (!message) {
      thread.appendChild(
        this.el("div", "messenger-muted-note", "لن تُرسل رسالة في الخاص")
      );
      panel.appendChild(thread);
      panel.appendChild(
        this.el(
          "div",
          "form-hint",
          "الرد يقتصر على التعليق العام. أضف رسالة في الخاص إذا أردت إرسال تفاصيل أو مرفق للعميل."
        )
      );
      return panel;
    }

    const dmBubble = this.buildMessengerBubble("dm", message);
    if (hasMedia) {
      const buttonLabel =
        mediaType === "video" ? "📹 شاهد الفيديو" : "🖼️ شاهد الصورة";
      dmBubble.appendChild(this.el("span", "messenger-reply-button", buttonLabel));
    }
    thread.appendChild(dmBubble);

    // لا نعاين إلا رابطًا مباشرًا صالحًا (رسالة الفحص/الحفظ تشرح سبب الرفض لغير الصالح)
    if (hasMedia && this.validateMediaUrlClient(mediaUrl, mediaType).ok) {
      thread.appendChild(
        this.el(
          "div",
          "messenger-media-caption",
          "يصل المرفق بعد ضغط العميل على الزر"
        )
      );
      const mediaBubble = this.el("div", "messenger-bubble dm media");
      const holder = this.el("div", "messenger-media-holder");
      mediaBubble.appendChild(holder);
      thread.appendChild(mediaBubble);
      this.renderMediaPreview(holder, mediaUrl, mediaType);
    }

    panel.appendChild(thread);
    panel.appendChild(
      this.el(
        "div",
        "form-hint",
        hasMedia
          ? "1) رد عام على التعليق — 2) رسالة في الخاص — 3) زر المرفق — 4) يصل المرفق بعد ضغط العميل."
          : "1) رد عام على التعليق — 2) رسالة في الخاص (نصية فقط)."
      )
    );
    return panel;
  },

  /**
   * لوحة معاينة "كيف يرى العميل" قابلة للطي/ال展開 — تُحدَّث مباشرة.
   * collapsed = true تعني مطوية عند الفتح (افتراضيًا على الشاشات الصغيرة).
   */
  buildCustomerPreviewPanel({ collapsed = false } = {}) {
    const wrap = this.el("div", "customer-preview-panel");
    const toggle = this.el("button", "customer-preview-toggle");
    toggle.type = "button";
    const host = this.el("div", "customer-preview-host");

    let isCollapsed = !!collapsed;
    const render = () => {
      toggle.textContent = (isCollapsed ? "▸ " : "▾ ") + "كيف يرى العميل";
      toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      host.classList.toggle("hidden", isCollapsed);
    };

    toggle.addEventListener("click", () => {
      isCollapsed = !isCollapsed;
      render();
    });

    const update = ({ post, dmMessage, mediaUrl, mediaType } = {}) => {
      host.textContent = "";
      host.appendChild(
        this.buildCustomerPreview(post, dmMessage || "", mediaUrl || "", mediaType || "")
      );
    };

    wrap.appendChild(toggle);
    wrap.appendChild(host);
    render();

    return {
      element: wrap,
      update,
      collapse: () => {
        isCollapsed = true;
        render();
      },
    };
  },

  /* ---------------- KEYWORDS TAB ---------------- */

  renderKeywordsTab() {
    const d = this.state.detail;
    const wrap = this.el("div", "posts-keywords");

    const head = this.el("div", "posts-section-head");
    head.appendChild(
      this.el("span", "posts-section-title", "الكلمات المفتاحية (" + d.keywords.length + ")")
    );
    const addBtn = this.el("button", "notes-btn primary", "إضافة كلمة");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => this.openKeywordModal(null));
    head.appendChild(addBtn);
    wrap.appendChild(head);

    if (d.post && d.post.platform === "instagram") {
      wrap.appendChild(
        this.el(
          "div",
          "posts-info-note",
          "الكلمة المفتاحية فريدة داخل المنشور فقط، ويمكن استعمال نفس الكلمة في منشورات إنستغرام أخرى."
        )
      );
    }

    if (!d.keywords.length) {
      wrap.appendChild(this.el("div", "posts-empty", "لا توجد كلمات مفتاحية بعد."));
      this.detailRefs.content.appendChild(wrap);
      return;
    }

    // فلتر سريع: الكلمات التي تحتوي وسائط / بدون وسائط
    const withMedia = d.keywords.filter((kw) => !!kw.media_url).length;
    const filters = [
      { value: "all", label: "الكل", count: d.keywords.length },
      { value: "media", label: "بوسائط", count: withMedia },
      { value: "none", label: "بدون وسائط", count: d.keywords.length - withMedia },
    ];
    const chips = this.el("div", "posts-chips");
    filters.forEach((f) => {
      const chip = this.el(
        "button",
        "posts-chip" + (d.keywordFilter === f.value ? " active" : ""),
        f.label + " (" + f.count + ")"
      );
      chip.type = "button";
      chip.addEventListener("click", () => {
        d.keywordFilter = f.value;
        this.renderDetailContent();
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);

    const visible = d.keywords.filter((kw) => {
      if (d.keywordFilter === "media") return !!kw.media_url;
      if (d.keywordFilter === "none") return !kw.media_url;
      return true;
    });

    if (!visible.length) {
      wrap.appendChild(
        this.el("div", "posts-empty", "لا توجد كلمات مطابقة لهذا الفلتر.")
      );
      this.detailRefs.content.appendChild(wrap);
      return;
    }

    const list = this.el("div", "keyword-list");
    visible.forEach((kw) => list.appendChild(this.buildKeywordCard(kw)));
    wrap.appendChild(list);
    this.detailRefs.content.appendChild(wrap);
  },

  buildKeywordCard(kw) {
    const card = this.el("div", "keyword-card");

    const top = this.el("div", "keyword-card-top");
    top.appendChild(this.el("span", "keyword-text", kw.keyword));

    if (!kw.dm_message) {
      top.appendChild(this.el("span", "keyword-reply-only-badge", "رد فقط"));
    }
    if (kw.dm_message && kw.stop_bot_after_send) {
      top.appendChild(this.el("span", "keyword-badge", "إيقاف البوت بعد الإرسال"));
    }
    if (kw.media_url && kw.media_type) {
      const badge = this.el("button", "keyword-media-badge " + kw.media_type);
      badge.type = "button";
      badge.title = "معاينة الوسائط المرفقة";
      badge.appendChild(this.el("span", "keyword-media-icon"));
      badge.appendChild(this.el("span", null, this.mediaTypeLabel(kw.media_type)));
      badge.addEventListener("click", () => this.openMediaPreviewModal(kw));
      top.appendChild(badge);
    }
    top.appendChild(
      this.el("span", "keyword-hits", "إصابات: " + (kw.hits_count || 0))
    );
    card.appendChild(top);

    const dmText = this.dmMessageText(kw.dm_message);
    const dmLine = this.el(
      "div",
      "keyword-dm" + (kw.dm_message ? "" : " muted"),
      dmText
    );
    card.appendChild(dmLine);

    const actions = this.el("div", "keyword-actions");

    const activeWrap = this.el("div", "keyword-active");
    activeWrap.appendChild(this.el("span", "keyword-active-label", "مفعّلة"));
    const sw = this.buildSwitch(kw.is_active, async (next) => {
      sw.classList.add("disabled");
      try {
        await updateKeyword(kw.id, { is_active: next });
        kw.is_active = next;
        this.showToast(next ? "تم تفعيل الكلمة" : "تم تعطيل الكلمة", "success");
      } catch (err) {
        sw.classList.toggle("active", !next);
        sw.setAttribute("aria-checked", String(!next));
        this.showToast(err.message || "تعذّر التحديث", "error");
      } finally {
        sw.classList.remove("disabled");
      }
    });
    activeWrap.appendChild(sw);
    actions.appendChild(activeWrap);

    const editBtn = this.el("button", "keyword-btn", "تعديل");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => this.openKeywordModal(kw));
    actions.appendChild(editBtn);

    const delBtn = this.el("button", "keyword-btn danger", "حذف");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => {
      this.confirmModal(
        "حذف الكلمة المفتاحية «" + kw.keyword + "»؟",
        "حذف",
        async () => {
          try {
            await deleteKeyword(kw.id);
            this.showToast("تم حذف الكلمة", "success");
            await this.reloadKeywords();
          } catch (err) {
            this.showToast(err.message || "تعذّر الحذف", "error");
          }
        }
      );
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    return card;
  },

  /** نافذة معاينة الوسائط المرفقة بالكلمة المفتاحية. */
  openMediaPreviewModal(kw) {
    const holder = this.el("div", "media-modal-holder");
    const body = [
      this.el(
        "div",
        "form-hint",
        "الكلمة: " + kw.keyword + " — النوع: " + this.mediaTypeLabel(kw.media_type)
      ),
      holder,
    ];
    const closeBtn = this.el("button", "notes-btn ghost", "إغلاق");
    closeBtn.type = "button";
    const modal = this.openModal({
      title: "معاينة الوسائط",
      bodyNodes: body,
      footerNodes: [closeBtn],
    });
    closeBtn.addEventListener("click", () => modal.close());
    this.renderMediaPreview(holder, kw.media_url, kw.media_type);
  },

  async reloadKeywords() {
    if (this.state.view !== "detail" || !this.state.detail) return;
    try {
      const res = await getPost(this.state.detail.id);
      this.state.detail.post = res.post;
      this.state.detail.keywords = res.keywords || [];
      this.state.detail.stats = res.stats;
      this.renderDetailHeader();
      if (this.state.detail.tab === "keywords") this.renderDetailContent();
      this.loadSummary();
    } catch (err) {
      this.showToast(err.message || "تعذّر تحديث الكلمات", "error");
    }
  },

  openKeywordModal(keyword) {
    const isEdit = !!keyword;
    const postId = this.state.detail.id;

    const kwInput = this.el("input", "form-input");
    kwInput.type = "text";
    kwInput.maxLength = 100;
    kwInput.value = isEdit ? keyword.keyword : "";
    kwInput.placeholder = "الكلمة المفتاحية (≤ 100 حرف)";

    const dmInput = this.el("textarea", "form-textarea");
    dmInput.rows = 4;
    dmInput.maxLength = 2000;
    dmInput.value = isEdit && keyword.dm_message ? keyword.dm_message : "";
    dmInput.placeholder = "نص رسالة الخاص (اختياري — حتى 2000 حرف)";

    const counter = this.el("div", "form-counter", dmInput.value.length + " / 2000");
    const dmField = this.buildField(
      "رسالة الخاص",
      dmInput,
      "اختياري — اتركها فارغة للرد على التعليق فقط بدون إرسال رسالة في الخاص"
    );
    dmField.appendChild(counter);

    const dmError = this.el("div", "field-error hidden");
    dmField.appendChild(dmError);

    const stopRow = this.el("div", "form-switch-row");
    stopRow.appendChild(this.el("span", "form-label", "إيقاف البوت بعد إرسال الرسالة"));
    const stopSwitch = this.buildSwitch(
      isEdit ? !!keyword.dm_message && !!keyword.stop_bot_after_send : true,
      () => {}
    );
    stopRow.appendChild(stopSwitch);

    const stopHint = this.el(
      "div",
      "form-hint",
      "إذا كان مفعّلًا، يتوقف البوت عن التفاعل مع هذا العميل بعد إرسال الرسالة."
    );
    const stopNoDmNote = this.el(
      "div",
      "form-hint hidden",
      "هذا الخيار يعمل فقط عند إرسال رسالة في الخاص، لذا هو معطّل عندما لا توجد رسالة."
    );

    const activeRow = this.el("div", "form-switch-row");
    activeRow.appendChild(this.el("span", "form-label", "الكلمة مفعّلة"));
    const activeSwitch = this.buildSwitch(isEdit ? keyword.is_active : true, () => {});
    activeRow.appendChild(activeSwitch);

    const errorBox = this.el("div", "modal-error hidden");

    const submitBtn = this.el("button", "notes-btn primary", isEdit ? "حفظ" : "إضافة");
    submitBtn.type = "button";

    /* ---------- معاينة "كيف يرى العميل" ---------- */
    const previewPanel = this.buildCustomerPreviewPanel({ collapsed: false });
    // let (وليست const) لأن حقل الوسائط يبني نفسه ويحدّث المعاينة أثناء الإنشاء
    let mediaField = null;
    const refreshPreview = () => {
      const media = mediaField ? mediaField.getValue() : { type: "none", url: "" };
      const hasMedia = this.mediaAttached(media);
      const hasMessage = !!dmInput.value.trim();
      this.updateDmCounter(counter, dmInput.value.length, hasMedia);
      this.syncStopBotSwitch(stopSwitch, stopNoDmNote, hasMessage);
      stopHint.classList.toggle("hidden", !hasMessage);
      previewPanel.update({
        post: this.state.detail.post,
        dmMessage: dmInput.value.trim(),
        mediaUrl: hasMedia ? media.url : "",
        mediaType: hasMedia ? media.type : "",
      });
    };

    const showDmError = (msg) => this.setFieldError(dmError, msg);

    /* ---------- قسم مرفق الوسائط (نفس المكوّن المستعمل في نافذة إضافة منشور) ---------- */
    mediaField = this.createMediaField({
      initialType: isEdit && keyword.media_type ? keyword.media_type : "none",
      initialUrl: isEdit && keyword.media_url ? keyword.media_url : "",
      onChange: refreshPreview,
      onBusyChange: (busy) => {
        submitBtn.disabled = busy;
      },
    });

    const body = [
      this.buildField("الكلمة المفتاحية *", kwInput),
      dmField,
      mediaField.element,
      previewPanel.element,
      stopRow,
      stopHint,
      stopNoDmNote,
    ];
    if (this.state.detail.post && this.state.detail.post.platform === "instagram") {
      body.push(
        this.el(
          "div",
          "form-hint",
          "تُرسل الرسالة كرد خاص على التعليق، لذا تعمل فقط خلال المدة المسموحة بعد كتابة التعليق."
        )
      );
    }
    body.push(activeRow, errorBox);

    const cancelBtn = this.el("button", "notes-btn ghost", "إلغاء");
    cancelBtn.type = "button";

    const modal = this.openModal({
      title: isEdit ? "تعديل كلمة مفتاحية" : "إضافة كلمة مفتاحية",
      bodyNodes: body,
      footerNodes: [cancelBtn, submitBtn],
      onClose: () => {
        mediaField.destroy();
      },
    });
    cancelBtn.addEventListener("click", () => modal.close());

    const showError = (msg) => {
      errorBox.textContent = msg;
      errorBox.classList.remove("hidden");
    };

    dmInput.addEventListener("input", () => {
      showDmError("");
      refreshPreview();
    });
    refreshPreview();

    submitBtn.addEventListener("click", async () => {
      errorBox.classList.add("hidden");
      showDmError("");
      const kw = kwInput.value.trim();
      const dm = dmInput.value.trim();
      if (!kw) {
        showError("الكلمة المفتاحية مطلوبة.");
        kwInput.focus();
        return;
      }

      const media = mediaField.getValue();
      const hasMedia = media.type !== "none";

      const dmCheck = this.validateDmMessageClient(dm, hasMedia);
      if (!dmCheck.ok) {
        showDmError(dmCheck.error);
        dmInput.focus();
        return;
      }

      if (hasMedia) {
        const check = this.validateMediaUrlClient(media.url, media.type);
        if (!check.ok) {
          showError(check.error);
          return;
        }
      }

      const payload = {
        keyword: kw,
        dm_message: dmCheck.value || null,
        stop_bot_after_send: dmCheck.value
          ? stopSwitch.classList.contains("active")
          : false,
        is_active: activeSwitch.classList.contains("active"),
        media_url: hasMedia ? media.url : null,
        media_type: hasMedia ? media.type : null,
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "جارٍ الحفظ…";
      try {
        if (media.type !== "none") {
          // فحص الرابط من الخادم قبل الحفظ (والخادم يتحقق مرة أخرى عند الإنشاء/التعديل)
          const verified = await mediaField.verifyLink();
          if (!verified.ok) {
            showError(verified.error);
            submitBtn.disabled = false;
            submitBtn.textContent = isEdit ? "حفظ" : "إضافة";
            return;
          }
          if (verified.skipped && verified.error) {
            this.showToast("تعذّر فحص الرابط مسبقًا، سيتحقق الخادم عند الحفظ.", "info");
          }
        }
        if (isEdit) await updateKeyword(keyword.id, payload);
        else await createKeyword(postId, payload);
        modal.close();
        this.showToast(isEdit ? "تم تحديث الكلمة" : "تمت إضافة الكلمة", "success");
        await this.reloadKeywords();
      } catch (err) {
        showError(err.message || "تعذّر الحفظ.");
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? "حفظ" : "إضافة";
      }
    });
  },

  /**
   * حقل الوسائط — مكوّن واحد يُعاد استعماله في:
   *   1) نموذج الكلمة المفتاحية (إضافة/تعديل).
   *   2) نافذة "إضافة منشور" (الكلمة المفتاحية الأولى).
   * لا تكرار: كل المنطق (النوع، الرابط، الرفع، المعاينة، الفحص) هنا.
   *
   * @returns {{element: HTMLElement, getValue: Function, setValue: Function,
   *            validate: Function, verifyLink: Function, isBusy: Function,
   *            setVisible: Function, destroy: Function}}
   */
  createMediaField({
    initialType = null,
    initialUrl = "",
    onChange = null,
    onBusyChange = null,
    uploadEnabled = true,
  } = {}) {
    const state = {
      type: initialType === "image" || initialType === "video" ? initialType : "none",
      url: initialUrl || "",
      busy: false,
      // آخر رابط تم فحصه بنجاح (لتفادي تكرار الطلب عند الحفظ)
      checkedUrl: "",
      checkedType: "",
    };

    const node = this.el("div", "media-section");
    node.appendChild(this.el("div", "form-label", "مرفق وسائط (اختياري)"));

    const seg = this.buildMediaTypeSelector(state.type, (next) => {
      state.type = next;
      if (next === "none") {
        state.url = "";
        urlInput.value = "";
      }
      setCheckMessage("");
      refresh();
    });
    node.appendChild(seg.wrap);

    // صف الرابط + زر الرفع
    const urlRow = this.el("div", "media-url-row");
    const urlInput = this.el("input", "form-input media-url-input");
    urlInput.type = "url";
    urlInput.dir = "ltr";
    urlInput.placeholder = "https://.../file.jpg";
    urlInput.value = state.url;
    urlInput.addEventListener("input", () => {
      state.url = urlInput.value.trim();
      const detected = this.detectMediaTypeFromUrl(state.url);
      if (detected && detected !== state.type) {
        state.type = detected;
        Object.keys(seg.buttons).forEach((k) => {
          seg.buttons[k].classList.toggle("active", k === detected);
          seg.buttons[k].setAttribute("aria-pressed", k === detected ? "true" : "false");
        });
      }
      setCheckMessage("");
      refresh();
    });
    urlRow.appendChild(urlInput);

    const uploadBtn = this.el("button", "keyword-btn media-upload-btn", "رفع ملف");
    uploadBtn.type = "button";
    uploadBtn.title = "الطريقة الموصى بها: رفع الملف مباشرة";
    const fileInput = this.el("input", "media-file-input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/gif,video/mp4";
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) doUpload(file);
      fileInput.value = "";
    });
    uploadBtn.addEventListener("click", () => fileInput.click());
    urlRow.appendChild(uploadBtn);
    urlRow.appendChild(fileInput);
    node.appendChild(urlRow);

    node.appendChild(
      this.el(
        "div",
        "form-hint",
        "يجب أن يكون رابطًا مباشرًا عامًا للملف (HTTPS). الأفضل رفع الملف مباشرة إن كان الرفع متاحًا"
      )
    );

    // شريط التقدم
    const progress = this.el("div", "media-progress hidden");
    const progressBar = this.el("div", "media-progress-bar");
    progress.appendChild(progressBar);
    node.appendChild(progress);

    node.appendChild(
      this.el(
        "div",
        "form-hint",
        "الصور حتى 8 ميغابايت (jpg/png/gif)، والفيديوهات حتى 25 ميغابايت (mp4). روابط Google Drive أو صفحات المشاركة لن تعمل."
      )
    );

    // المعاينة المباشرة
    const previewHost = this.el("div", "media-preview-host");
    node.appendChild(previewHost);

    // أزرار: فحص الرابط / إزالة الوسائط
    const actions = this.el("div", "media-actions");
    const checkBtn = this.el("button", "keyword-btn", "فحص الرابط");
    checkBtn.type = "button";
    const removeBtn = this.el("button", "keyword-btn danger", "إزالة الوسائط");
    removeBtn.type = "button";
    actions.appendChild(checkBtn);
    actions.appendChild(removeBtn);
    node.appendChild(actions);

    const checkMsg = this.el("div", "media-check-msg hidden");
    node.appendChild(checkMsg);

    const setCheckMessage = (text, tone) => {
      checkMsg.textContent = text || "";
      checkMsg.className = "media-check-msg" + (text ? " " + (tone || "info") : " hidden");
    };

    const submitGuard = { busy: false };

    const setBusy = (busy) => {
      state.busy = busy;
      submitGuard.busy = busy;
      uploadBtn.disabled = busy;
      checkBtn.disabled = busy;
      removeBtn.disabled = busy || state.type === "none";
      urlInput.disabled = busy;
      progress.classList.toggle("hidden", !busy);
      if (onBusyChange) onBusyChange(busy);
    };

    let previewTimer = null;
    const clearPreviewTimer = () => {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    };

    const refresh = () => {
      removeBtn.disabled = state.busy || state.type === "none";
      if (onChange) onChange({ type: state.type, url: state.url });

      // معاينة مؤجلة: لا نُطلق طلب تحميل مع كل حرف أثناء الكتابة
      clearPreviewTimer();
      const url = state.url;
      const type = state.type;
      previewHost.textContent = "";

      // لا نحاول معاينة رابط غير مباشر/غير صالح — رسالة الفحص/الحفظ هي التي توضح السبب
      if (type === "none" || !url) return;
      if (!this.validateMediaUrlClient(url, type).ok) return;

      previewTimer = setTimeout(() => {
        previewTimer = null;
        if (state.type !== type || state.url !== url) return;
        this.renderMediaPreview(previewHost, url, type);
      }, 400);
    };

    const activateType = (type) => {
      Object.keys(seg.buttons).forEach((k) => {
        seg.buttons[k].classList.toggle("active", k === type);
        seg.buttons[k].setAttribute("aria-pressed", k === type ? "true" : "false");
      });
    };

    removeBtn.addEventListener("click", () => {
      state.type = "none";
      state.url = "";
      state.checkedUrl = "";
      state.checkedType = "";
      urlInput.value = "";
      activateType("none");
      setCheckMessage("");
      refresh();
    });

    checkBtn.addEventListener("click", async () => {
      if (state.type === "none") {
        setCheckMessage("اختر نوع الوسائط أولاً (صورة أو فيديو).", "error");
        return;
      }
      const check = this.validateMediaUrlClient(state.url, state.type);
      if (!check.ok) {
        setCheckMessage(check.error, "error");
        return;
      }
      setBusy(true);
      setCheckMessage("جارٍ فحص الرابط…", "info");
      try {
        const res = await checkMediaLink(state.url, state.type);
        const size = res && res.size ? this.formatMediaSize(res.size) : "غير معروف";
        const warnings = (res && res.warnings) || [];
        const summary =
          "الرابط صالح — النوع: " +
          this.mediaTypeLabel(res.type) +
          " — الحجم: " +
          size;
        setCheckMessage(
          warnings.length ? summary + " — " + warnings.join(" ") : summary,
          warnings.length ? "warning" : "success"
        );
        state.checkedUrl = state.url;
        state.checkedType = state.type;
      } catch (err) {
        state.checkedUrl = "";
        state.checkedType = "";
        setCheckMessage(this.mediaCheckErrorText(err), "error");
      } finally {
        setBusy(false);
      }
    });

    const doUpload = async (file) => {
      const max = file.type === "video/mp4" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
      if (file.size > max) {
        setCheckMessage(
          file.type === "video/mp4"
            ? "حجم الفيديو يتجاوز 25 ميغابايت."
            : "حجم الصورة يتجاوز 8 ميغابايت.",
          "error"
        );
        return;
      }
      setBusy(true);
      setCheckMessage("جارٍ رفع الملف…", "info");
      try {
        const res = await uploadMedia(file);
        state.url = res.url;
        urlInput.value = res.url;
        if (res.media_type) {
          state.type = res.media_type;
          activateType(res.media_type);
        }
        setCheckMessage(
          "تم رفع الملف بنجاح — الحجم: " + this.formatMediaSize(res.size),
          "success"
        );
        // الملف المرفوع من عندنا — لا داعي لفحصه قبل الحفظ
        state.checkedUrl = state.url;
        state.checkedType = state.type;
        refresh();
      } catch (err) {
        if (err && err.status === 503) {
          uploadBtn.classList.add("hidden");
          fileInput.classList.add("hidden");
        }
        setCheckMessage(err.message || "تعذّر رفع الملف.", "error");
      } finally {
        setBusy(false);
      }
    };

    // إخفاء زر الرفع إن لم يكن الرفع مفعّلًا على الخادم
    if (uploadEnabled && typeof getMediaUploadAvailability === "function") {
      getMediaUploadAvailability()
        .then((res) => {
          if (res && res.available === false) {
            uploadBtn.classList.add("hidden");
            fileInput.classList.add("hidden");
          }
        })
        .catch(() => {
          /* نُبقي الزر ظاهرًا ونكتفي برسالة الخطأ عند المحاولة */
        });
    } else if (!uploadEnabled) {
      uploadBtn.classList.add("hidden");
      fileInput.classList.add("hidden");
    }

    refresh();

    return {
      element: node,
      getValue: () => ({ type: state.type, url: state.url }),
      setValue: ({ type, url } = {}) => {
        state.type = type === "image" || type === "video" ? type : "none";
        state.url = typeof url === "string" ? url : "";
        state.checkedUrl = "";
        state.checkedType = "";
        urlInput.value = state.url;
        activateType(state.type);
        setCheckMessage("");
        refresh();
      },
      /** تحقق سريع من جهة العميل (نفس قواعد الخادم تقريبًا). */
      validate: () => {
        if (state.type === "none") return { ok: true };
        return this.validateMediaUrlClient(state.url, state.type);
      },
      /**
       * التحقق من الرابط عبر نقطة الفحص قبل الحفظ.
       * يعيد { ok, error } — عند فشل الفحص بسبب رابط غير صالح نمنع الحفظ،
       * أما انقطاع الشبكة/تحديد الطلبات فنكمل الحفظ لأن الخادم يتحقق بدوره.
       */
      verifyLink: async () => {
        if (state.type === "none" || !state.url) return { ok: true };
        if (state.checkedUrl === state.url && state.checkedType === state.type) {
          return { ok: true };
        }
        try {
          const res = await checkMediaLink(state.url, state.type);
          if (res && res.ok === false) {
            return { ok: false, error: res.error || "تعذّر التحقق من الرابط." };
          }
          state.checkedUrl = state.url;
          state.checkedType = state.type;
          return { ok: true, warnings: (res && res.warnings) || [] };
        } catch (err) {
          const status = err && err.status;
          if (status === 400) {
            return {
              ok: false,
              error:
                (err.message || "الرابط غير صالح.") +
                " تأكد أن الرابط مباشر وعام ويشير إلى ملف صورة أو فيديو صالح.",
            };
          }
          return {
            ok: true,
            skipped: true,
            error: this.mediaCheckErrorText(err),
          };
        }
      },
      isBusy: () => submitGuard.busy,
      setVisible: (visible) => {
        node.classList.toggle("hidden", !visible);
      },
      /** تنظيف كامل (إغلاق النافذة / إتمام الحفظ) — لا روابط مؤقتة معلّقة. */
      destroy: () => {
        clearPreviewTimer();
        previewHost.textContent = "";
        state.url = "";
        state.checkedUrl = "";
        state.checkedType = "";
        state.type = "none";
      },
    };
  },

  /* ---------------- COMMENTS TAB ---------------- */

  renderCommentsTab() {
    const c = this.state.detail.comments;
    const wrap = this.el("div", "posts-comments");

    const chips = this.el("div", "posts-chips");
    wrap.appendChild(chips);
    c.chipsEl = chips;

    const searchBox = this.el("div", "posts-search-box");
    const search = this.el("input", "posts-search-input");
    search.type = "text";
    search.placeholder = "بحث بالاسم أو نص التعليق...";
    search.value = c.search;
    searchBox.appendChild(search);
    wrap.appendChild(searchBox);

    const listWrap = this.el("div", "comments-list");
    wrap.appendChild(listWrap);
    c.listEl = listWrap;

    const footer = this.el("footer", "posts-footer");
    wrap.appendChild(footer);
    c.footerEl = footer;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    search.addEventListener("input", () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        c.search = search.value.trim();
        c.page = 1;
        this.loadComments();
      }, 400);
    });

    this.detailRefs.content.appendChild(wrap);
    this.loadComments();
  },

  renderCommentChips(counts, activeStatus) {
    const chips = this.state.detail.comments.chipsEl;
    if (!chips) return;
    chips.textContent = "";
    const defs = [
      ["all", "الكل", counts ? counts.total : 0],
      ["pending", "قيد الانتظار", counts ? counts.pending : 0],
      ["replied", "تم الرد", counts ? counts.replied : 0],
      ["failed", "فشل", counts ? counts.failed : 0],
      ["skipped", "تم التخطي", counts ? counts.skipped : 0],
    ];
    defs.forEach(([value, label, count]) => {
      const chip = this.el(
        "button",
        "posts-chip" + (activeStatus === value ? " active" : ""),
        label + " (" + (count || 0) + ")"
      );
      chip.type = "button";
      chip.addEventListener("click", () => {
        if (this.state.detail.comments.status === value) return;
        this.state.detail.comments.status = value;
        this.state.detail.comments.page = 1;
        this.renderCommentChips(
          this.state.detail.comments.data ? this.state.detail.comments.data.counts : null,
          value
        );
        this.loadComments();
      });
      chips.appendChild(chip);
    });
  },

  async loadComments() {
    const c = this.state.detail.comments;
    const seq = ++c.seq;
    if (c.listEl) c.listEl.textContent = "";
    if (c.listEl) c.listEl.appendChild(this.el("div", "posts-loading", "جارٍ التحميل…"));
    try {
      const data = await listPostComments(this.state.detail.id, {
        status: c.status,
        search: c.search || undefined,
        page: c.page,
        limit: 20,
      });
      if (seq !== c.seq || this.state.detail.tab !== "comments") return;
      c.data = data;
      this.renderCommentChips(data.counts, c.status);
      this.renderComments(data);
      this.renderSectionFooter(c.footerEl, data, (page) => {
        c.page = page;
        this.loadComments();
      });
    } catch (err) {
      if (seq !== c.seq) return;
      if (c.listEl) {
        c.listEl.textContent = "";
        c.listEl.appendChild(this.el("div", "posts-error", err.message || "خطأ"));
      }
    }
  },

  renderComments(data) {
    const list = this.state.detail.comments.listEl;
    list.textContent = "";
    const items = (data && data.items) || [];
    if (!items.length) {
      list.appendChild(this.el("div", "posts-empty", "لا توجد تعليقات مطابقة."));
      return;
    }
    items.forEach((cm) => list.appendChild(this.buildCommentCard(cm)));
  },

  buildCommentCard(cm) {
    const card = this.el("div", "comment-card");

    const head = this.el("div", "comment-head");
    head.appendChild(this.el("span", "comment-author", cm.commenter_name || "معلّق"));
    head.appendChild(
      this.el(
        "span",
        "comment-status " + this.statusTone(cm.reply_status),
        this.statusLabel(cm.reply_status)
      )
    );
    head.appendChild(this.el("span", "comment-date", this.formatDate(cm.created_at)));
    card.appendChild(head);

    card.appendChild(this.el("div", "comment-text", cm.comment_text || "—"));

    if (cm.reply_text) {
      const reply = this.el("div", "comment-reply");
      reply.appendChild(this.el("span", "comment-reply-label", "رد البوت: "));
      reply.appendChild(this.el("span", null, cm.reply_text));
      card.appendChild(reply);
    }

    if (cm.reply_status === "failed" && cm.error_message) {
      card.appendChild(this.el("div", "comment-error", cm.error_message));
    }

    if (cm.replied_at) {
      card.appendChild(
        this.el("div", "comment-date", "تم الرد: " + this.formatDate(cm.replied_at))
      );
    }

    return card;
  },

  /* ---------------- HITS TAB ---------------- */

  renderHitsTab() {
    const h = this.state.detail.hits;
    const wrap = this.el("div", "posts-hits");
    const tableWrap = this.el("div", "posts-table-wrap");
    wrap.appendChild(tableWrap);
    const footer = this.el("footer", "posts-footer");
    wrap.appendChild(footer);
    h.tableWrap = tableWrap;
    h.footerEl = footer;
    this.detailRefs.content.appendChild(wrap);
    this.loadHits();
  },

  async loadHits() {
    const h = this.state.detail.hits;
    const seq = ++h.seq;
    if (h.tableWrap) h.tableWrap.textContent = "";
    if (h.tableWrap) h.tableWrap.appendChild(this.el("div", "posts-loading", "جارٍ التحميل…"));
    try {
      const data = await listPostHits(this.state.detail.id, { page: h.page, limit: 20 });
      if (seq !== h.seq || this.state.detail.tab !== "hits") return;
      h.data = data;
      this.renderHits(data);
      this.renderSectionFooter(h.footerEl, data, (page) => {
        h.page = page;
        this.loadHits();
      });
    } catch (err) {
      if (seq !== h.seq) return;
      if (h.tableWrap) {
        h.tableWrap.textContent = "";
        h.tableWrap.appendChild(this.el("div", "posts-error", err.message || "خطأ"));
      }
    }
  },

  renderHits(data) {
    const wrap = this.state.detail.hits.tableWrap;
    wrap.textContent = "";
    const items = (data && data.items) || [];
    if (!items.length) {
      wrap.appendChild(this.el("div", "posts-empty", "لا توجد إصابات مسجّلة."));
      return;
    }

    const table = this.el("table", "posts-table");
    const thead = this.el("thead");
    const trh = this.el("tr");
    ["الوقت", "الكلمة", "العميل", "النص المطابق", "الحالة"].forEach((t) => {
      trh.appendChild(this.el("th", null, t));
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = this.el("tbody");
    items.forEach((hit) => {
      const tr = this.el("tr");
      tr.appendChild(this.el("td", null, this.formatDate(hit.created_at)));
      tr.appendChild(this.el("td", null, hit.keyword || "—"));
      tr.appendChild(this.el("td", null, hit.customer_name || hit.client_id || "—"));
      tr.appendChild(this.el("td", null, hit.matched_text || "—"));
      const tdStatus = this.el("td");
      tdStatus.appendChild(
        this.el(
          "span",
          "comment-status " + (hit.dm_status === "failed" ? "is-failed" : "is-replied"),
          this.dmStatusLabel(hit.dm_status)
        )
      );
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  },

  /* ---------------- PAGINATION FOOTER (shared) ---------------- */

  renderSectionFooter(footer, data, onPage) {
    if (!footer) return;
    footer.textContent = "";
    if (!data) return;

    const total = data.total || 0;
    const limit = data.limit || 20;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const count = this.el("span", "orders-count", "إجمالي: " + total);
    const controls = this.el("div", "orders-pagination");

    const prev = this.el("button", "orders-page-btn", "السابق");
    prev.type = "button";
    prev.disabled = data.page <= 1;
    prev.addEventListener("click", () => onPage(Math.max(1, data.page - 1)));

    const info = this.el("span", "orders-page-info", "صفحة " + data.page + " من " + totalPages);

    const nextBtn = this.el("button", "orders-page-btn", "التالي");
    nextBtn.type = "button";
    nextBtn.disabled = data.page >= totalPages;
    nextBtn.addEventListener("click", () => onPage(Math.min(totalPages, data.page + 1)));

    controls.appendChild(prev);
    controls.appendChild(info);
    controls.appendChild(nextBtn);
    footer.appendChild(count);
    footer.appendChild(controls);
  },
};

Router.register("posts", {
  render: (container) => PostsPage.render(container),
  destroy: () => PostsPage.destroy(),
});
