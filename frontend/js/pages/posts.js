/* =====================================================
   PAGE: Posts — إدارة منشورات فيسبوك + الكلمات المفتاحية
   المصادر:
     GET    /api/posts/summary
     GET    /api/posts
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

const PostsPage = {
  container: null,
  debounceTimer: null,
  toastContainer: null,

  state: {
    view: "list",
    list: { page: 1, limit: 10, search: "", status: "all", data: null, requestSeq: 0 },
    summary: null,
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

  openModal({ title, bodyNodes, footerNodes }) {
    const backdrop = this.el("div", "modal-backdrop");
    const modal = this.el("div", "modal");

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

  buildVariantEditor(initialVariants) {
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
            <h2 class="posts-title">المنشورات</h2>
            <span class="posts-subtitle">إدارة منشورات فيسبوك التي يرد عليها البوت في التعليقات</span>
          </div>
          <button type="button" class="posts-primary-btn" id="posts-add-btn">إضافة منشور</button>
        </header>

        <details class="posts-info-box">
          <summary>كيف يعمل الرد على المنشورات؟</summary>
          <p>عندما يعلّق شخص على منشور مفعَّل، يرد البوت بتعليق يطلب منه كتابة الكلمة المفتاحية في الخاص، وعند كتابتها يرسل له البوت الرسالة المخصصة. الكلمة المفتاحية يجب أن تكون فريدة عبر كل المنشورات النشطة.</p>
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
    };
    this.elRefs.status.value = this.state.list.status;
    this.elRefs.search.value = this.state.list.search;

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
    try {
      this.state.summary = await getPostsSummary();
    } catch (err) {
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
    head.appendChild(
      this.el("span", "post-type-badge post-type--" + post.post_type, this.typeLabel(post.post_type))
    );
    const link = this.el("a", "post-card-link", "فتح ↗");
    link.href = post.post_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", (e) => e.stopPropagation());
    head.appendChild(link);
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
    const urlInput = this.el("input", "form-input");
    urlInput.type = "text";
    urlInput.placeholder = "https://www.facebook.com/reel/1234567890123";
    urlInput.dir = "ltr";

    const titleInput = this.el("input", "form-input");
    titleInput.type = "text";
    titleInput.placeholder = "عنوان اختياري لديك فقط";

    const variants = this.buildVariantEditor([]);

    const kwInput = this.el("input", "form-input");
    kwInput.type = "text";
    kwInput.placeholder = "مثال: سعر";

    const dmInput = this.el("textarea", "form-textarea");
    dmInput.rows = 3;
    dmInput.maxLength = 2000;
    dmInput.placeholder = "الرسالة التي سيرسلها البوت في الخاص عند كتابة الكلمة";

    const dmCounter = this.el("div", "form-counter", "0 / 2000");
    dmInput.addEventListener("input", () => {
      dmCounter.textContent = dmInput.value.length + " / 2000";
    });
    const dmField = this.buildField("رسالة الخاص", dmInput);
    dmField.appendChild(dmCounter);

    const manualInput = this.el("input", "form-input");
    manualInput.type = "text";
    manualInput.placeholder = "مثال: 1234567890123";
    manualInput.dir = "ltr";
    const manualField = this.buildField(
      "معرّف المنشور (يدويًا)",
      manualInput,
      "لم نتعرّف على الرابط تلقائيًا. افتح المنشور الكامل وانسخ الرابط، أو أدخل المعرّف الرقمي يدويًا."
    );
    manualField.style.display = "none";

    const errorBox = this.el("div", "modal-error hidden");

    const body = [
      this.buildField("رابط المنشور *", urlInput, "رابط الريل أو الفيديو أو المنشور على فيسبوك."),
      this.buildField("العنوان (اختياري)", titleInput),
      this.buildField("صيغ رد التعليق", variants),
      this.el("div", "form-section-title", "كلمة مفتاحية أولى (اختياري)"),
      this.buildField("الكلمة المفتاحية", kwInput),
      dmField,
      manualField,
      errorBox,
    ];

    const submitBtn = this.el("button", "notes-btn primary", "إنشاء");
    submitBtn.type = "button";
    const cancelBtn = this.el("button", "notes-btn ghost", "إلغاء");
    cancelBtn.type = "button";

    const modal = this.openModal({
      title: "إضافة منشور",
      bodyNodes: body,
      footerNodes: [cancelBtn, submitBtn],
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

      const payload = {
        post_url: postUrl,
        title: titleInput.value.trim() || undefined,
        comment_reply_variants: variants.getVariants(),
      };
      if (manualField.style.display !== "none" && manualInput.value.trim()) {
        payload.post_key = manualInput.value.trim();
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "جارٍ فحص الرابط...";
      try {
        const created = await createPost(payload);

        if (created.resolved_from) {
          this.showToast("تم تحويل الرابط المختصر إلى الرابط الكامل تلقائيًا", "info");
        }

        if (created.key_resolved_via) {
          this.showToast("تم استخراج المعرّف الرقمي للمنشور تلقائيًا", "info");
        }

        let keywordFailed = false;
        const kw = kwInput.value.trim();
        if (kw) {
          try {
            await createKeyword(created.id, {
              keyword: kw,
              dm_message: dmInput.value.trim() || kw,
              stop_bot_after_send: true,
              is_active: true,
            });
          } catch (err) {
            keywordFailed = true;
            showError("تم إنشاء المنشور، لكن تعذّر إضافة الكلمة: " + (err.message || "خطأ"));
          }
        }

        this.showToast(
          keywordFailed ? "تم إنشاء المنشور (بدون الكلمة)" : "تم إنشاء المنشور",
          "success"
        );

        // عرض المعرّف المستخرج + إغلاق
        errorBox.classList.add("hidden");
        const successBox = this.el(
          "div",
          "modal-success",
          "معرّف المنشور: " + created.post_key
        );
        body.unshift(successBox);

        if (keywordFailed) {
          submitBtn.disabled = false;
          submitBtn.textContent = "إعادة المحاولة";
          return;
        }

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
    manualInput.placeholder = "1234567890123";
    const manualField = this.buildField(
      "معرّف المنشور (يدويًا)",
      manualInput,
      "لم نتعرّف على الرابط تلقائيًا — أدخل المعرّف الرقمي يدويًا."
    );
    manualField.style.display = "none";

    const variants = this.buildVariantEditor(post.comment_reply_variants || []);

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
    wrap.appendChild(this.buildField("رابط المنشور", urlInput));
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
          const currentIdx = (post.comment_reply_index || 0) + 1;
          post.comment_reply_index = currentIdx % total;
          rrIndex.textContent =
            "الرد التالي: رقم " + ((post.comment_reply_index || 0) + 1) + " من " + total;
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

    if (!d.keywords.length) {
      wrap.appendChild(this.el("div", "posts-empty", "لا توجد كلمات مفتاحية بعد."));
      this.detailRefs.content.appendChild(wrap);
      return;
    }

    const list = this.el("div", "keyword-list");
    d.keywords.forEach((kw) => list.appendChild(this.buildKeywordCard(kw)));
    wrap.appendChild(list);
    this.detailRefs.content.appendChild(wrap);
  },

  buildKeywordCard(kw) {
    const card = this.el("div", "keyword-card");

    const top = this.el("div", "keyword-card-top");
    top.appendChild(this.el("span", "keyword-text", kw.keyword));

    if (kw.stop_bot_after_send) {
      top.appendChild(this.el("span", "keyword-badge", "إيقاف البوت بعد الإرسال"));
    }
    top.appendChild(
      this.el("span", "keyword-hits", "إصابات: " + (kw.hits_count || 0))
    );
    card.appendChild(top);

    card.appendChild(this.el("div", "keyword-dm", this.truncate(kw.dm_message, 140)));

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
    dmInput.value = isEdit ? keyword.dm_message : "";
    dmInput.placeholder = "نص رسالة الخاص (≤ 2000 حرف)";

    const counter = this.el("div", "form-counter", dmInput.value.length + " / 2000");
    dmInput.addEventListener("input", () => {
      counter.textContent = dmInput.value.length + " / 2000";
    });
    const dmField = this.buildField("رسالة الخاص *", dmInput);
    dmField.appendChild(counter);

    const stopRow = this.el("div", "form-switch-row");
    stopRow.appendChild(this.el("span", "form-label", "إيقاف البوت بعد إرسال الرسالة"));
    const stopSwitch = this.buildSwitch(isEdit ? keyword.stop_bot_after_send : true, () => {});
    stopRow.appendChild(stopSwitch);

    const stopHint = this.el(
      "div",
      "form-hint",
      "إذا كان مفعّلًا، يتوقف البوت عن التفاعل مع هذا العميل بعد إرسال الرسالة."
    );

    const activeRow = this.el("div", "form-switch-row");
    activeRow.appendChild(this.el("span", "form-label", "الكلمة مفعّلة"));
    const activeSwitch = this.buildSwitch(isEdit ? keyword.is_active : true, () => {});
    activeRow.appendChild(activeSwitch);

    const errorBox = this.el("div", "modal-error hidden");

    const body = [
      this.buildField("الكلمة المفتاحية *", kwInput),
      dmField,
      stopRow,
      stopHint,
      activeRow,
      errorBox,
    ];

    const submitBtn = this.el("button", "notes-btn primary", isEdit ? "حفظ" : "إضافة");
    submitBtn.type = "button";
    const cancelBtn = this.el("button", "notes-btn ghost", "إلغاء");
    cancelBtn.type = "button";

    const modal = this.openModal({
      title: isEdit ? "تعديل كلمة مفتاحية" : "إضافة كلمة مفتاحية",
      bodyNodes: body,
      footerNodes: [cancelBtn, submitBtn],
    });
    cancelBtn.addEventListener("click", () => modal.close());

    const showError = (msg) => {
      errorBox.textContent = msg;
      errorBox.classList.remove("hidden");
    };

    submitBtn.addEventListener("click", async () => {
      errorBox.classList.add("hidden");
      const kw = kwInput.value.trim();
      const dm = dmInput.value.trim();
      if (!kw) {
        showError("الكلمة المفتاحية مطلوبة.");
        kwInput.focus();
        return;
      }
      if (!dm) {
        showError("رسالة الخاص مطلوبة.");
        dmInput.focus();
        return;
      }

      const payload = {
        keyword: kw,
        dm_message: dm,
        stop_bot_after_send: stopSwitch.classList.contains("active"),
        is_active: activeSwitch.classList.contains("active"),
      };

      submitBtn.disabled = true;
      submitBtn.textContent = "جارٍ الحفظ…";
      try {
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
