/* =====================================================
   PAGE: Orders — Google Sheets table with search/filter/pagination
   ===================================================== */

const FALLBACK_ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Shipped",
  "At Office",
  "Delivered",
  "Cancelled",
  "Returned",
  "No Answer 1",
  "No Answer 2",
  "No Answer 3",
];

const OrdersPage = {
  container: null,
  el: {},

  state: {
    page: 1,
    limit: 15,
    search: "",
    status: "",
    statuses: FALLBACK_ORDER_STATUSES.slice(),
    data: null,
    requestSeq: 0,
  },

  openMenu: null,

  debounceTimer: null,

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="orders-page" dir="rtl">
        <header class="orders-header">
          <h2 class="orders-title">الطلبات</h2>
          <span class="orders-subtitle">جدول طلبات العملاء — مصدر البيانات: Google Sheets (قراءة فقط)</span>
        </header>

        <div class="orders-toolbar">
          <div class="orders-search-box">
            <input
              type="text"
              class="orders-search-input"
              id="orders-search-input"
              placeholder="بحث بالاسم، الهاتف أو رقم الطلب..."
              autocomplete="off"
            />
          </div>
          <select class="orders-select" id="orders-status-select">
            <option value="">كل الحالات</option>
          </select>
        </div>

        <div class="orders-table-wrap" id="orders-table-wrap"></div>

        <footer class="orders-footer" id="orders-footer"></footer>
      </div>
    `;

    this.el.searchInput = this.container.querySelector("#orders-search-input");
    this.el.statusSelect = this.container.querySelector("#orders-status-select");
    this.el.tableWrap = this.container.querySelector("#orders-table-wrap");
    this.el.footer = this.container.querySelector("#orders-footer");

    this.bindEvents();
    this.loadStatuses();
    this.load();

    return () => this.destroy();
  },

  destroy() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.closeMenu();
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

    this.el.statusSelect.addEventListener("change", () => {
      this.state.status = this.el.statusSelect.value;
      this.state.page = 1;
      this.load();
    });
  },

  async loadStatuses() {
    try {
      const res = await getOrderStatuses();
      if (res && Array.isArray(res.statuses) && res.statuses.length) {
        this.state.statuses = res.statuses;
        this.optionsAll();
      }
    } catch (err) {
      // استخدام القائمة الاحتياطية الثابتة
    }
  },

  optionsAll() {
    this.el.statusSelect.textContent = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "كل الحالات";
    this.el.statusSelect.appendChild(all);
    this.state.statuses.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      this.el.statusSelect.appendChild(opt);
    });
    if (this.state.status) {
      this.el.statusSelect.value = this.state.status;
    }
  },

  async load() {
    const seq = ++this.state.requestSeq;
    this.renderLoading();

    try {
      const data = await getOrders({
        page: this.state.page,
        limit: this.state.limit,
        search: this.state.search,
        status: this.state.status,
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
    table.className = "orders-table";

    const tables = this.buildHead();
    table.appendChild(tables);
    table.appendChild(this.skeletonBody());

    this.el.tableWrap.appendChild(table);
  },

  skeletonBody() {
    const tbody = document.createElement("tbody");
    for (let i = 0; i < 6; i++) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 11;
      const sk = document.createElement("div");
      sk.className = "orders-skeleton-row";
      for (let j = 0; j < 11; j++) {
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
    const cols = [
      "التاريخ",
      "رقم الطلب",
      "الاسم",
      "الهاتف",
      "الولاية",
      "البلدية",
      "نوع التوصيل",
      "المنتج",
      "الكمية",
      "المجموع",
      "الحالة",
    ];
    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  },

  statusToneClass(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "delivered") return "is-delivered";
    if (value === "pending") return "is-pending";
    if (["cancelled", "returned"].includes(value)) return "is-cancelled";
    return "";
  },

  /* =====================================================
     STATUS DROPDOWN
     مكوّن مخصص (button + ul/li) عوض <select> الأصلي:
     - القائمة المفتوحة بخلفية غامقة صلبة ونص أبيض (بلا اعتماد
       على استايل المتصفح الأصلي للمنصة المنسدلة، اللي كيبان شفاف).
     - التحديث للـ API و التلوين حسب الحالة بقيا بنفس المنطق السابق.
     ===================================================== */

  statusDropdown(order) {
    const wrap = document.createElement("div");
    wrap.className = "orders-status-dd";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "orders-status-select" + (this.statusToneClass(order.status) ? " " + this.statusToneClass(order.status) : "");
    trigger.textContent = order.status || "—";
    trigger.title = "تغيير حالة الطلبية";

    trigger.addEventListener("click", () => {
      if (trigger.disabled) return;
      if (this.openMenu && this.openMenu.owner === wrap) {
        this.closeMenu();
        return;
      }
      this.openStatusMenu(wrap, trigger, order);
    });

    wrap.appendChild(trigger);
    return wrap;
  },

  openStatusMenu(wrap, trigger, order) {
    this.closeMenu();

    const rect = trigger.getBoundingClientRect();
    const list = document.createElement("ul");
    list.className = "orders-status-menu";
    list.setAttribute("role", "listbox");

    this.state.statuses.forEach((s) => {
      const li = document.createElement("li");
      li.className = "orders-status-menu-item" + (this.statusToneClass(s) ? " " + this.statusToneClass(s) : "");
      if (s === order.status) li.classList.add("is-current");
      li.setAttribute("role", "option");
      li.setAttribute("data-status", s);

      const dot = document.createElement("span");
      dot.className = "orders-dd-dot";
      li.appendChild(dot);

      const label = document.createElement("span");
      label.textContent = s;
      li.appendChild(label);

      li.addEventListener("click", () => {
        this.closeMenu();
        this.applyStatusChange(order, trigger, s);
      });

      list.appendChild(li);
    });

    document.body.appendChild(list);

    // التموضع يدوياً باش القائمة ما تتعقصش داخل الجدول (overflow: auto)
    const spaceBelow = window.innerHeight - rect.bottom;
    let top = rect.bottom + 6;
    if (list.offsetHeight > spaceBelow && rect.top > spaceBelow) {
      top = Math.max(8, rect.top - list.offsetHeight - 6);
    }
    list.style.top = Math.round(top) + "px";
    list.style.right = Math.max(8, Math.round(window.innerWidth - rect.right)) + "px";
    list.style.maxHeight = Math.min(240, Math.max(140, window.innerHeight - top - 12)) + "px";

    trigger.classList.add("is-open");

    const teardown = () => {
      if (!list.parentNode) return;
      list.remove();
      trigger.classList.remove("is-open");
      this.openMenu = null;
      window.removeEventListener("scroll", onScrollHandler, true);
      window.removeEventListener("resize", onResizeHandler);
      document.removeEventListener("keydown", onKeyHandler);
      document.removeEventListener("mousedown", onDownHandler);
    };

    const onScrollHandler = (e) => {
      if (list.contains(e.target) || e.target === list) return;
      this.closeMenu();
    };
    const onResizeHandler = () => this.closeMenu();
    const onKeyHandler = (e) => {
      if (e.key === "Escape") this.closeMenu();
    };
    const onDownHandler = (e) => {
      if (!list.contains(e.target) && !wrap.contains(e.target)) {
        this.closeMenu();
      }
    };

    window.addEventListener("scroll", onScrollHandler, true);
    window.addEventListener("resize", onResizeHandler);
    document.addEventListener("keydown", onKeyHandler);
    document.addEventListener("mousedown", onDownHandler);

    this.openMenu = { el: list, teardown, owner: wrap };
  },

  closeMenu() {
    if (this.openMenu && this.openMenu.teardown) {
      const t = this.openMenu.teardown;
      this.openMenu = null;
      t();
    }
  },

  applyStatusChange(order, trigger, next) {
    const previous = order.status || "";
    trigger.disabled = true;
    trigger.classList.remove("is-delivered", "is-pending", "is-cancelled");
    const nextCls = this.statusToneClass(next);
    if (nextCls) trigger.classList.add(nextCls);
    trigger.textContent = next;
    trigger.title = "جارٍ الحفظ…";

    updateOrderStatus(order.order_number, next)
      .then(() => {
        order.status = next;
        trigger.title = "تغيير حالة الطلبية";
      })
      .catch((err) => {
        order.status = previous;
        trigger.classList.remove("is-delivered", "is-pending", "is-cancelled");
        const prevCls = this.statusToneClass(previous);
        if (prevCls) trigger.classList.add(prevCls);
        trigger.textContent = previous;
        trigger.title = "تغيير حالة الطلبية";
        this.showToast("تعذّر تحديث حالة الطلبية: " + (err.message || "خطأ"));
      })
      .finally(() => {
        trigger.disabled = false;
      });
  },

  showToast(msg) {
    const toast = document.createElement("div");
    toast.className = "orders-toast";
    toast.textContent = msg;
    this.el.tableWrap.prepend(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  },

  buildCell(text, classes) {
    const td = document.createElement("td");
    if (classes) td.className = classes;
    td.textContent = (text === undefined || text === null || text === "") ? "—" : String(text);
    return td;
  },

  renderTable(data) {
    this.el.tableWrap.textContent = "";
    const orders = data.orders || [];

    if (!orders.length) {
      const empty = document.createElement("div");
      empty.className = "orders-empty";
      empty.textContent = "لا توجد نتائج مطابقة";
      this.el.tableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "orders-table";
    table.appendChild(this.buildHead());

    const tbody = document.createElement("tbody");
    orders.forEach((o) => {
      const tr = document.createElement("tr");
      tr.appendChild(this.buildCell(o.date_time));
      tr.appendChild(this.buildCell(o.order_number));
      tr.appendChild(this.buildCell(o.full_name));
      tr.appendChild(this.buildCell(o.phone, "orders-cell-num"));
      tr.appendChild(this.buildCell(o.wilaya));
      tr.appendChild(this.buildCell(o.city));
      tr.appendChild(this.buildCell(o.delivery_type));
      tr.appendChild(this.buildCell(o.product_title));
      tr.appendChild(this.buildCell(o.quantity));
      tr.appendChild(this.buildCell(o.total_price, "orders-cell-num"));
      const tdStatus = document.createElement("td");
      tdStatus.appendChild(this.statusDropdown(o));
      tr.appendChild(tdStatus);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    this.el.tableWrap.appendChild(table);
  },

  renderError(msg) {
    this.el.tableWrap.textContent = "";
    const box = document.createElement("div");
    box.className = "orders-error";

    const text = document.createElement("span");
    text.textContent = "تعذّر تحميل الطلبات: " + (msg || "خطأ غير معروف");

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
    count.textContent = "إجمالي: " + total + " طلب";

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

Router.register("orders", {
  render: (container) => OrdersPage.render(container),
  destroy: () => OrdersPage.destroy(),
});