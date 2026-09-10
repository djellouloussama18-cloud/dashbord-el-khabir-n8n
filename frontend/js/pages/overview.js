/* =====================================================
   PAGE: Overview — Order status stats cards
                     + Bot/conversation activity
                     + Charts (last 7 days)
   ===================================================== */

const OverviewPage = {
  container: null,
  el: {},
  stats: null,
  activity: null,
  charts: [],

  CARD_CONFIG: [
    { key: "total",           statusKey: "total",           label: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0637\u0644\u0628\u0627\u062A", icon: "\uD83D\uDCE6", mod: "total" },
    { key: "Pending",         statusKey: "Pending",         label: "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631",   icon: "\u23F3",          mod: "pending" },
    { key: "Confirmed",       statusKey: "Confirmed",       label: "\u0645\u0624\u0643\u062F\u0629",            icon: "\u2705",          mod: "confirmed" },
    { key: "Shipped",         statusKey: "Shipped",         label: "\u062A\u0645 \u0627\u0644\u0634\u062D\u0646",   icon: "\uD83D\uDE9A",    mod: "shipped" },
    { key: "At Office",       statusKey: "At Office",       label: "\u0641\u064A \u0627\u0644\u0645\u0643\u062A\u0628",   icon: "\uD83C\uDFE2",    mod: "at-office" },
    { key: "Delivered",       statusKey: "Delivered",       label: "\u062A\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644", icon: "\uD83C\uDF89",    mod: "delivered" },
    { key: "Cancelled",       statusKey: "Cancelled",       label: "\u0645\u0644\u063A\u0627\u0629",            icon: "\u274C",          mod: "cancelled" },
    { key: "Returned",        statusKey: "Returned",        label: "\u0645\u0631\u062C\u0639\u0629",            icon: "\uD83D\uDD19",    mod: "returned" },
    { key: "No Answer 1",     statusKey: "No Answer 1",     label: "\u0644\u0627 \u064A\u0631\u062F 1",         icon: "\uD83D\uDCDE",    mod: "no-answer-1" },
    { key: "No Answer 2",     statusKey: "No Answer 2",     label: "\u0644\u0627 \u064A\u0631\u062F 2",         icon: "\uD83D\uDCFB",    mod: "no-answer-2" },
    { key: "No Answer 3",     statusKey: "No Answer 3",     label: "\u0644\u0627 \u064A\u0631\u062F 3",         icon: "\uD83D\uDEAB",    mod: "no-answer-3" },
  ],

  ACTIVITY_CARD_CONFIG: [
    { key: "total",       label: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A", icon: "\uD83D\uDCAC", mod: "act-total" },
    { key: "activeToday", label: "\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0646\u0634\u0637\u0629 \u0627\u0644\u064A\u0648\u0645",  icon: "\uD83D\uDFE2", mod: "act-active" },
    { key: "botEnabled",  label: "\u0627\u0644\u0628\u0648\u062A \u0645\u0641\u0639\u0644",             icon: "\uD83E\uDD16", mod: "act-bot-on" },
    { key: "botDisabled", label: "\u0627\u0644\u0628\u0648\u062A \u0645\u062A\u0648\u0642\u0641",            icon: "\uD83D\uDD34", mod: "act-bot-off" },
    { key: "messages",    label: "\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u064A\u0648\u0645",            icon: "\u2709\uFE0F",    mod: "act-messages" },
  ],

  render(container) {
    this.container = container;
    this.container.innerHTML = "";
    var wrapper = document.createElement("div");
    wrapper.className = "overview-page";
    wrapper.setAttribute("dir", "rtl");

    var header = document.createElement("header");
    header.className = "overview-header";
    var title = document.createElement("h2");
    title.className = "overview-title";
    title.textContent = "\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629";
    var subtitle = document.createElement("span");
    subtitle.className = "overview-subtitle";
    subtitle.textContent = "\u0645\u0644\u062E\u0635 \u062D\u0627\u0644\u0627\u062A \u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0648\u0646\u0634\u0627\u0637 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0648\u0627\u0644\u0628\u0648\u062A";
    header.appendChild(title);
    header.appendChild(subtitle);

    var body = document.createElement("div");
    body.className = "overview-body";

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    this.container.appendChild(wrapper);

    this.el.body = body;
    this.load();
    return () => this.destroy();
  },

  destroy() {
    this.destroyCharts();
    this.el.body = null;
  },

  destroyCharts() {
    this.charts.forEach(function (chart) {
      if (chart && typeof chart.destroy === "function") {
        chart.destroy();
      }
    });
    this.charts = [];
  },

  async load() {
    this.renderLoading();
    try {
      var results = await Promise.all([getOrderStats(), getOverviewActivity()]);
      this.stats = results[0];
      this.activity = results[1];
      this.renderContent();
    } catch (err) {
      this.renderError(err.message);
    }
  },

  renderLoading() {
    this.destroyCharts();
    this.el.body.textContent = "";

    var grid = document.createElement("div");
    grid.className = "stats-grid";
    for (var i = 0; i < 11; i++) {
      var sk = document.createElement("div");
      sk.className = "stat-card stat-card--skeleton";
      grid.appendChild(sk);
    }
    this.el.body.appendChild(grid);

    var actSection = document.createElement("section");
    actSection.className = "overview-section";
    var actTitle = document.createElement("h3");
    actTitle.className = "overview-section-title";
    actTitle.textContent = "\u0646\u0634\u0627\u0637 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0648\u0627\u0644\u0628\u0648\u062A";
    actSection.appendChild(actTitle);

    var actGrid = document.createElement("div");
    actGrid.className = "stats-grid activity-stats-grid";
    for (var j = 0; j < 5; j++) {
      var sk2 = document.createElement("div");
      sk2.className = "stat-card stat-card--skeleton";
      actGrid.appendChild(sk2);
    }
    actSection.appendChild(actGrid);
    this.el.body.appendChild(actSection);

    var chartsSection = document.createElement("section");
    chartsSection.className = "overview-section";
    var chartsTitle = document.createElement("h3");
    chartsTitle.className = "overview-section-title";
    chartsTitle.textContent = "\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629";
    chartsSection.appendChild(chartsTitle);

    var chartsWrap = document.createElement("div");
    chartsWrap.className = "charts-section";
    var c1 = document.createElement("div");
    c1.className = "chart-card chart-card--skeleton";
    var c2 = document.createElement("div");
    c2.className = "chart-card chart-card--skeleton";
    chartsWrap.appendChild(c1);
    chartsWrap.appendChild(c2);
    chartsSection.appendChild(chartsWrap);
    this.el.body.appendChild(chartsSection);
  },

  renderError(msg) {
    this.el.body.textContent = "";
    var box = document.createElement("div");
    box.className = "overview-error";

    var text = document.createElement("span");
    text.textContent = "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A: " + (msg || "\u062E\u0637\u0623 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641");

    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "notes-btn primary";
    retry.textContent = "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629";
    retry.addEventListener("click", () => this.load());

    box.appendChild(text);
    box.appendChild(retry);
    this.el.body.appendChild(box);
  },

  renderContent() {
    this.el.body.textContent = "";
    this.renderCards(this.stats);
    this.renderActivity(this.activity);
    this.renderCharts(this.activity);
  },

  buildCard(icon, value, label, mod) {
    var card = document.createElement("div");
    card.className = "stat-card stat-card--" + mod;

    var ic = document.createElement("span");
    ic.className = "stat-card-icon";
    ic.textContent = icon;

    var val = document.createElement("span");
    val.className = "stat-card-value";
    val.textContent = Number.isFinite(value) ? value.toLocaleString("en-US") : "0";

    var lbl = document.createElement("span");
    lbl.className = "stat-card-label";
    lbl.textContent = label;

    card.appendChild(ic);
    card.appendChild(val);
    card.appendChild(lbl);
    return card;
  },

  buildSection(title) {
    var section = document.createElement("section");
    section.className = "overview-section";
    var h3 = document.createElement("h3");
    h3.className = "overview-section-title";
    h3.textContent = title;
    section.appendChild(h3);
    return section;
  },

  renderCards(stats) {
    var total = stats.total || 0;
    var byStatus = stats.byStatus || {};

    var grid = document.createElement("div");
    grid.className = "stats-grid";

    this.CARD_CONFIG.forEach((cfg) => {
      var count = cfg.key === "total" ? total : (byStatus[cfg.statusKey] || 0);
      grid.appendChild(this.buildCard(cfg.icon, count, cfg.label, cfg.mod));
    });

    this.el.body.appendChild(grid);
  },

  renderActivity(activity) {
    var conv = (activity && activity.conversations) || {};
    var msg = (activity && activity.messages) || {};

    var values = {
      total: conv.total,
      activeToday: conv.activeToday,
      botEnabled: conv.botEnabled,
      botDisabled: conv.botDisabled,
      messages: msg.totalToday,
    };

    var section = this.buildSection("\u0646\u0634\u0627\u0637 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0648\u0627\u0644\u0628\u0648\u062A");
    var grid = document.createElement("div");
    grid.className = "stats-grid activity-stats-grid";

    this.ACTIVITY_CARD_CONFIG.forEach((cfg) => {
      var count = values[cfg.key];
      grid.appendChild(this.buildCard(cfg.icon, count, cfg.label, cfg.mod));
    });

    section.appendChild(grid);
    this.el.body.appendChild(section);
  },

  formatDateLabel(dateStr) {
    if (!dateStr) return "";
    const d = String(dateStr).indexOf("T") !== -1
      ? new Date(dateStr)
      : new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return dateStr;
    try {
      return new Intl.DateTimeFormat("ar", { day: "numeric", month: "numeric" }).format(d);
    } catch (err) {
      return d.getDate() + "/" + (d.getMonth() + 1);
    }
  },

  buildChartCard(title, seriesLabel, points, color, mod) {
    var card = document.createElement("div");
    card.className = "chart-card chart-card--" + mod;

    var head = document.createElement("div");
    head.className = "chart-card-head";

    var t = document.createElement("span");
    t.className = "chart-card-title";
    t.textContent = title;
    head.appendChild(t);

    var legend = document.createElement("span");
    legend.className = "chart-card-legend";
    var dot = document.createElement("span");
    dot.className = "chart-card-legend-dot";
    dot.style.background = color;
    legend.appendChild(dot);
    legend.appendChild(document.createTextNode(" " + seriesLabel));
    head.appendChild(legend);

    card.appendChild(head);

    var wrap = document.createElement("div");
    wrap.className = "chart-card-wrap";
    var canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", title);
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    if (typeof Chart === "undefined") {
      var note = document.createElement("div");
      note.className = "chart-card-empty";
      note.textContent = "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629";
      wrap.appendChild(note);
      return card;
    }

    var labels = [];
    var data = [];
    (points || []).forEach((p) => {
      labels.push(this.formatDateLabel(p.date));
      data.push(Number(p.count) || 0);
    });

    var bgColor = color + "2E";

    var chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: seriesLabel,
          data: data,
          borderColor: color,
          backgroundColor: bgColor,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: color,
          pointBorderColor: "rgba(255,255,255,0.25)",
          pointBorderWidth: 1,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            rtl: true,
            backgroundColor: "#151515",
            borderColor: "rgba(255,255,255,0.14)",
            borderWidth: 1,
            titleColor: "rgba(255,255,255,0.9)",
            bodyColor: "rgba(255,255,255,0.9)",
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                var v = Number(ctx.parsed.y) || 0;
                return " " + seriesLabel + " \u00B7 " + v.toLocaleString("en-US");
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "rgba(255,255,255,0.55)", font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.08)" },
            ticks: {
              color: "rgba(255,255,255,0.55)",
              precision: 0,
              font: { size: 11 },
            },
          },
        },
      },
    });

    this.charts.push(chart);
    return card;
  },

  renderCharts(activity) {
    var msgs = (activity && activity.messages && activity.messages.last7Days) || [];
    var orders = (activity && activity.ordersConfirmed && activity.ordersConfirmed.last7Days) || [];

    var section = this.buildSection("\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0628\u064A\u0627\u0646\u064A\u0629");
    var grid = document.createElement("div");
    grid.className = "charts-section";

    grid.appendChild(this.buildChartCard(
      "\u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u062E\u0644\u0627\u0644 \u0622\u062E\u0631 7 \u0623\u064A\u0627\u0645",
      "\u0627\u0644\u0631\u0633\u0627\u0626\u0644",
      msgs,
      "#F97316",
      "messages"
    ));
    grid.appendChild(this.buildChartCard(
      "\u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0624\u0643\u062F\u0629 \u062E\u0644\u0627\u0644 \u0622\u062E\u0631 7 \u0623\u064A\u0627\u0645",
      "\u0627\u0644\u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0624\u0643\u062F\u0629",
      orders,
      "#22C55E",
      "orders"
    ));

    section.appendChild(grid);
    this.el.body.appendChild(section);
  },
};

Router.register("overview", {
  render: function (container) { return OverviewPage.render(container); },
  destroy: function () { return OverviewPage.destroy(); },
});