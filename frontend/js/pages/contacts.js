/* =====================================================
   PAGE: Contacts — CRM list with search, filters, pagination
   Source: GET /api/contacts (conversation_state + event_log from Postgres)
   ===================================================== */

const ContactsPage = {
  container: null,
  el: {},

  state: {
    page: 1,
    limit: 20,
    search: "",
    state: "",
    botEnabled: "",
    hasOrdered: "",
    states: [],
    data: null,
    requestSeq: 0,
  },

  debounceTimer: null,

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="contacts-page" dir="rtl">
        <header class="contacts-header">
          <h2 class="contacts-title">جهات الاتصال</h2>
          <span class="contacts-subtitle">إدارة الزبائن (CRM) — الاسم و client_id و الحالة من قاعدة البيانات المحلية</span>
        </header>

        <div class="contacts-toolbar">
          <div class="contacts-search-box">
            <input
              type="text"
              class="contacts-search-input"
              id="contacts-search-input"
              placeholder="بحث بالاسم أو client_id..."
              autocomplete="off"
            />
          </div>

          <select class="orders-select contacts-select" id="contacts-state-select">
            <option value="">كل الحالات (state)</option>
          </select>

          <div class="contacts-toggle" id="contacts-bot-toggle" role="group" aria-label="حالة البوت">
            <button type="button" class="contacts-toggle-btn active" data-value="">الكل</button>
            <button type="button" class="contacts-toggle-btn" data-value="true">مفعّل</button>
            <button type="button" class="contacts-toggle-btn" data-value="false">موقوف</button>
          </div>

          <div class="contacts-toggle" id="contacts-ordered-toggle" role="group" aria-label="فلترة الطلبات">
            <button type="button" class="contacts-toggle-btn active" data-value="">الكل</button>
            <button type="button" class="contacts-toggle-btn" data-value="true">عنده طلبات</button>
            <button type="button" class="contacts-toggle-btn" data-value="false">بدون طلبات</button>
          </div>
        </div>

        <div class="contacts-table-wrap" id="contacts-table-wrap"></div>

        <footer class="contacts-footer" id="contacts-footer"></footer>
      </div>
    `;

    this.el.searchInput = this.container.querySelector("#contacts-search-input");
    this.el.stateSelect = this.container.querySelector("#contacts-state-select");
    this.el.botToggle = this.container.querySelector("#contacts-bot-toggle");
    this.el.orderedToggle = this.container.querySelector("#contacts-ordered-toggle");
    this.el.tableWrap = this.container.querySelector("#contacts-table-wrap");
    this.el.footer = this.container.querySelector("#contacts-footer");

    this.bindEvents();
    this.loadStates();
    this.load();

    return () => this.destroy();
  },

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.state.requestSeq += 1;
  },

  bindEvents() {
    this.el.searchInput.addEventListener("input", () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.state.search = this.el.searchInput.value.trim();
        this.state.page = 1;
        this.load();
      }, 400);
    });

    this.el.stateSelect.addEventListener("change", () => {
      this.state.state = this.el.stateSelect.value;
      this.state.page = 1;
      this.load();
    });

    this.bindToggleGroup(this.el.botToggle, "botEnabled");
    this.bindToggleGroup(this.el.orderedToggle, "hasOrdered");
  },

  bindToggleGroup(groupEl, stateKey) {
    groupEl.addEventListener("click", (event) => {
      const btn = event.target.closest(".contacts-toggle-btn");
      if (!btn) return;
      this.state[stateKey] = btn.dataset.value;
      this.state.page = 1;
      groupEl.querySelectorAll(".contacts-toggle-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      this.load();
    });
  },

  async loadStates() {
    try {
      const res = await getContactStates();
      if (res && Array.isArray(res.states) && res.states.length) {
        this.state.states = res.states;
      }
    } catch (err) {
      // نبقى على قائمة فارغة + خيار "كل الحالات"
    }
    this.fillStateOptions();
  },

  fillStateOptions() {
    this.el.stateSelect.textContent = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "كل الحالات (state)";
    this.el.stateSelect.appendChild(all);

    this.state.states.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      this.el.stateSelect.appendChild(opt);
    });

    if (this.state.state) {
      this.el.stateSelect.value = this.state.state;
    }
  },

  async load() {
    const seq = ++this.state.requestSeq;
    this.renderLoading();

    try {
      const data = await getContacts({
        page: this.state.page,
        limit: this.state.limit,
        search: this.state.search || undefined,
        state: this.state.state || undefined,
        bot_enabled: this.state.botEnabled || undefined,
        has_ordered: this.state.hasOrdered || undefined,
      });
      if (seq !== this.state.requestSeq) return;
      this.state.data = data;
      this.renderTable(data);
      this.renderFooter(data);
    } catch (err) {
      if (seq !== this.state.requestSeq) return;
      this.state.data = null;
      this.renderError(err.message);
      this.renderFooter(null);
    }
  },

  renderLoading() {
    this.el.tableWrap.textContent = "";
    const table = document.createElement("table");
    table.className = "contacts-table";
    table.appendChild(this.buildHead());
    table.appendChild(this.skeletonBody());
    this.el.tableWrap.appendChild(table);
  },

  skeletonBody() {
    const tbody = document.createElement("tbody");
    for (let i = 0; i < 5; i++) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      const sk = document.createElement("div");
      sk.className = "orders-skeleton-row";
      for (let j = 0; j < 6; j++) {
        const cell = document.createElement("div");
        cell.className = "skeleton-pulse";
        sk.appendChild(cell);
      }
      td.appendChild(sk);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    return tbody;
  },

  buildHead() {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    const cols = ["العميل", "الحالة", "اللغة", "آخر رسالة", "الطلبات المؤكدة", "البوت"];
    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  },

  buildCell(text, classes) {
    const td = document.createElement("td");
    if (classes) td.className = classes;
    td.textContent = text === undefined || text === null || text === "" ? "—" : String(text);
    return td;
  },

  languageLabel(lang) {
    const v = String(lang || "").toLowerCase();
    if (v === "ar") return "عربي";
    if (v === "fr") return "فرنسي";
    if (v === "msa") return "فصحى";
    return lang || "—";
  },

  formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const date = d.toLocaleDateString("ar-DZ", { day: "2-digit", month: "2-digit", year: "numeric" });
    const time = d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" });
    return date + " " + time;
  },

  truncate(text, max) {
    if (!text) return "—";
    max = max || 45;
    const s = String(text);
    return s.length > max ? s.slice(0, max) + "…" : s;
  },

  openContact(clientId) {
    if (typeof window.requestOpenConversation === "function") {
      window.requestOpenConversation(clientId);
    }
    Router.navigate("conversations");
  },

  renderTable(data) {
    this.el.tableWrap.textContent = "";
    const contacts = data.contacts || [];

    if (!contacts.length) {
      const empty = document.createElement("div");
      empty.className = "contacts-empty";
      empty.textContent = "لا توجد نتائج مطابقة";
      this.el.tableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "contacts-table";
    table.appendChild(this.buildHead());

    const tbody = document.createElement("tbody");
    contacts.forEach((c) => {
      const tr = document.createElement("tr");
      tr.className = "contacts-row";
      tr.addEventListener("click", () => this.openContact(c.client_id));
      tr.title = "فتح المحادثة";

      // العميل (الاسم + client_id)
      const tdClient = document.createElement("td");
      const name = document.createElement("div");
      name.className = "contacts-client-name";
      name.textContent = c.customer_name || "بدون اسم";
      const id = document.createElement("div");
      id.className = "contacts-client-id";
      id.textContent = c.client_id;
      tdClient.appendChild(name);
      tdClient.appendChild(id);

      // الحالة
      const tdState = document.createElement("td");
      const stateBadge = document.createElement("span");
      stateBadge.className = "contacts-state-badge";
      stateBadge.textContent = c.state || "—";
      tdState.appendChild(stateBadge);

      // آخر رسالة
      const tdLast = document.createElement("td");
      const preview = document.createElement("div");
      preview.className = "contacts-preview";
      preview.textContent = this.truncate(c.last_message_preview);
      const date = document.createElement("div");
      date.className = "contacts-last-date";
      date.textContent = this.formatDate(c.last_message_at);
      tdLast.appendChild(preview);
      tdLast.appendChild(date);

      // الطلبات المؤكدة
      const tdOrders = document.createElement("td");
      const count = document.createElement("div");
      count.className = "contacts-orders-count" + (c.orders_confirmed_count > 0 ? " has" : "");
      count.textContent = c.orders_confirmed_count || 0;
      const lastOrder = document.createElement("div");
      lastOrder.className = "contacts-last-date";
      lastOrder.textContent = c.last_order_at ? this.formatDate(c.last_order_at) : "بدون طلب";
      tdOrders.appendChild(count);
      tdOrders.appendChild(lastOrder);

      // البوت
      const tdBot = document.createElement("td");
      const chip = document.createElement("span");
      chip.className = "analytics-bot-chip " + (c.bot_enabled ? "is-on" : "is-off");
      chip.textContent = c.bot_enabled ? "مفعّل" : "موقوف";
      tdBot.appendChild(chip);

      tr.appendChild(tdClient);
      tr.appendChild(tdState);
      tr.appendChild(this.buildCell(this.languageLabel(c.language), "contacts-lang"));
      tr.appendChild(tdLast);
      tr.appendChild(tdOrders);
      tr.appendChild(tdBot);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    this.el.tableWrap.appendChild(table);
  },

  renderError(msg) {
    this.el.tableWrap.textContent = "";
    const box = document.createElement("div");
    box.className = "contacts-error";

    const text = document.createElement("span");
    text.textContent = "تعذّر تحميل جهات الاتصال: " + (msg || "خطأ غير معروف");

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "notes-btn primary";
    retry.textContent = "إعادة المحاولة";
    retry.addEventListener("click", () => this.load());

    box.appendChild(text);
    box.appendChild(retry);
    this.el.tableWrap.appendChild(box);
  },

  renderFooter(data) {
    const footer = this.el.footer;
    footer.textContent = "";
    if (!data) return;

    const total = data.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / data.limit));

    const count = document.createElement("span");
    count.className = "orders-count";
    count.textContent = "إجمالي: " + total + " جهة اتصال";

    const controls = document.createElement("div");
    controls.className = "orders-pagination";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "orders-page-btn";
    prev.textContent = "السابق";
    prev.disabled = data.page <= 1;
    prev.addEventListener("click", () => {
      this.state.page = Math.max(1, data.page - 1);
      this.load();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.className = "orders-page-btn";
    next.textContent = "التالي";
    next.disabled = data.page >= totalPages;
    next.addEventListener("click", () => {
      this.state.page = Math.min(totalPages, data.page + 1);
      this.load();
    });

    const info = document.createElement("span");
    info.className = "orders-page-info";
    info.textContent = "صفحة " + data.page + " من " + totalPages;

    controls.appendChild(prev);
    controls.appendChild(info);
    controls.appendChild(next);

    footer.appendChild(count);
    footer.appendChild(controls);
  },
};

Router.register("contacts", {
  render: (container) => ContactsPage.render(container),
  destroy: () => ContactsPage.destroy(),
});