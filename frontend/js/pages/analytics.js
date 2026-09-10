/* =====================================================
   PAGE: Analytics — KPIs, daily/weekly toggle, chart, bot status
   ===================================================== */

const AnalyticsPage = {
  container: null,
  el: {},

  state: {
    period: "daily",
    range: 7,
    data: null,
    requestSeq: 0,
  },

  onResize: null,

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="analytics-page" dir="rtl">
        <header class="analytics-header">
          <h2 class="analytics-title">التحليلات</h2>
          <span class="analytics-subtitle">مؤشرات التفاعل والتحويل عبر الوقت من قاعدة البيانات</span>
        </header>

        <div class="analytics-toolbar">
          <div class="analytics-toggle" id="analytics-toggle">
            <button type="button" class="analytics-toggle-btn active" data-period="daily">يومي</button>
            <button type="button" class="analytics-toggle-btn" data-period="weekly">أسبوعي</button>
          </div>
        </div>

        <div class="analytics-body" id="analytics-body"></div>
      </div>
    `;

    this.el.toggle = this.container.querySelector("#analytics-toggle");
    this.el.body = this.container.querySelector("#analytics-body");

    this.el.toggle.addEventListener("click", (event) => {
      const btn = event.target.closest(".analytics-toggle-btn");
      if (!btn) return;
      const period = btn.dataset.period;
      if (period === this.state.period) return;
      this.state.period = period;
      this.state.range = period === "weekly" ? 8 : 7;
      this.el.toggle.querySelectorAll(".analytics-toggle-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      this.load();
    });

    this.load();
    return () => this.destroy();
  },

  destroy() {
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
      this.onResize = null;
    }
    this.state.requestSeq += 1;
  },

  async load() {
    const seq = ++this.state.requestSeq;
    this.renderLoading();

    try {
      const data = await getAnalytics({
        period: this.state.period,
        range: this.state.range,
      });
      if (seq !== this.state.requestSeq) return;
      this.state.data = data;
      this.renderContent(data);
    } catch (err) {
      if (seq !== this.state.requestSeq) return;
      this.state.data = null;
      this.renderError(err.message);
    }
  },

  renderLoading() {
    this.el.body.textContent = "";

    const grid = document.createElement("div");
    grid.className = "analytics-kpi-grid";
    for (let i = 0; i < 4; i++) {
      const sk = document.createElement("div");
      sk.className = "overview-card loading";
      grid.appendChild(sk);
    }
    this.el.body.appendChild(grid);

    const chartSk = document.createElement("div");
    chartSk.className = "overview-card loading";
    chartSk.style.height = "280px";
    this.el.body.appendChild(chartSk);
  },

  renderError(msg) {
    this.el.body.textContent = "";
    const box = document.createElement("div");
    box.className = "overview-error";

    const text = document.createElement("span");
    text.textContent = "تعذّر تحميل التحليلات: " + (msg || "خطأ غير معروف");

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "notes-btn primary";
    retry.textContent = "إعادة المحاولة";
    retry.addEventListener("click", () => this.load());

    box.appendChild(text);
    box.appendChild(retry);
    this.el.body.appendChild(box);
  },

  formatDuration(sec) {
    if (sec === null || sec === undefined) return "—";
    const s = Math.round(sec);
    if (s < 60) return s + " ثانية";
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? m + "د " + r + "ث" : m + " دقيقة";
  },

  buildKpi({ label, value, sub, icon, tone }) {
    const card = document.createElement("div");
    card.className = "overview-card" + (tone ? " tone-" + tone : "");

    const info = document.createElement("div");
    info.className = "overview-card-info";

    const lbl = document.createElement("div");
    lbl.className = "overview-card-label";
    lbl.textContent = label;

    const val = document.createElement("div");
    val.className = "overview-card-value";
    val.textContent = value;

    info.appendChild(lbl);
    info.appendChild(val);

    if (sub) {
      const s = document.createElement("div");
      s.className = "overview-card-sub";
      s.textContent = sub;
      info.appendChild(s);
    }

    card.appendChild(info);

    if (icon) {
      const ic = document.createElement("div");
      ic.className = "overview-card-icon";
      ic.textContent = icon;
      card.appendChild(ic);
    }

    return card;
  },

  renderContent(data) {
    this.el.body.textContent = "";
    const s = data.summary || {};

    const grid = document.createElement("div");
    grid.className = "analytics-kpi-grid";

    grid.appendChild(this.buildKpi({
      label: "معدل التحويل",
      value: (s.conversion_rate || 0) + "٪",
      sub: "طلبات مؤكدة / محادثات",
      icon: "\uD83C\uDFAF",
      tone: "accent",
    }));
    grid.appendChild(this.buildKpi({
      label: "عدد المحادثات",
      value: (s.total_conversations || 0).toLocaleString("en-US"),
      sub: "وارد " + (s.total_messages_inbound || 0) + " \u2022 صادر " + (s.total_messages_outbound || 0),
      icon: "\uD83D\uDDE8\uFE0F",
    }));
    grid.appendChild(this.buildKpi({
      label: "الطلبات المؤكدة",
      value: (s.total_orders_confirmed || 0).toLocaleString("en-US"),
      sub: "أحداث order_confirmed",
      icon: "\uD83D\uDCE6",
      tone: "green",
    }));
    grid.appendChild(this.buildKpi({
      label: "متوسط وقت الرد",
      value: this.formatDuration(s.avg_response_time_seconds),
      sub: "بين أول inbound وأول رد",
      icon: "\u23F1\uFE0F",
    }));

    this.el.body.appendChild(grid);

    // المخطط
    const chartCard = document.createElement("div");
    chartCard.className = "analytics-chart-card";

    const head = document.createElement("div");
    head.className = "analytics-chart-head";

    const title = document.createElement("span");
    title.className = "analytics-chart-title";
    title.textContent = this.state.period === "weekly" ? "النشاط أسبوعيًا" : "النشاط يوميًا";

    const legend = document.createElement("span");
    legend.className = "analytics-chart-legend";
    const mk = (color, label) => {
      const wrap = document.createElement("span");
      const dot = document.createElement("span");
      dot.className = "analytics-legend-dot";
      dot.style.background = color;
      wrap.appendChild(dot);
      wrap.appendChild(document.createTextNode(" " + label));
      return wrap;
    };
    legend.appendChild(mk("#F97316", "محادثات جديدة"));
    legend.appendChild(mk("#22C55E", "طلبات مؤكدة"));

    head.appendChild(title);
    head.appendChild(legend);
    chartCard.appendChild(head);

    const wrap = document.createElement("div");
    wrap.className = "analytics-chart-wrap";
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "مخطط المحادثات الجديدة والطلبات المؤكدة");
    wrap.appendChild(canvas);
    chartCard.appendChild(wrap);

    this.el.body.appendChild(chartCard);

    // حالة البوت
    const bot = data.bot_status || {};
    const botTotal = (bot.bot_enabled_count || 0) + (bot.bot_disabled_count || 0);
    const botPct = botTotal > 0 ? Math.round(((bot.bot_enabled_count || 0) / botTotal) * 100) : 0;

    const botCard = document.createElement("div");
    botCard.className = "analytics-bot-card";

    const botInfo = document.createElement("div");
    botInfo.className = "analytics-bot-info";

    const botLabel = document.createElement("span");
    botLabel.className = "analytics-bot-label";
    botLabel.textContent = "حالة البوت";

    const botCount = document.createElement("span");
    botCount.className = "analytics-bot-count";
    botCount.textContent = botTotal + " محادثة";

    botInfo.appendChild(botLabel);
    botInfo.appendChild(botCount);

    const barWrap = document.createElement("div");
    barWrap.className = "analytics-bot-bar";

    const barOn = document.createElement("div");
    barOn.className = "analytics-bot-bar-on";
    barOn.style.width = botPct + "%";

    const barOff = document.createElement("div");
    barOff.className = "analytics-bot-bar-off";
    barOff.style.width = (100 - botPct) + "%";

    barWrap.appendChild(barOn);
    barWrap.appendChild(barOff);

    const row = document.createElement("div");
    row.className = "analytics-bot-row";
    const on = document.createElement("span");
    on.className = "analytics-bot-chip is-on";
    on.textContent = "مفعّل: " + (bot.bot_enabled_count || 0);
    const off = document.createElement("span");
    off.className = "analytics-bot-chip is-off";
    off.textContent = "موقوف: " + (bot.bot_disabled_count || 0);
    row.appendChild(on);
    row.appendChild(off);

    botCard.appendChild(botInfo);
    botCard.appendChild(barWrap);
    botCard.appendChild(row);

    this.el.body.appendChild(botCard);

    if (this.onResize) window.removeEventListener("resize", this.onResize);
    this.onResize = () => this.drawChart(canvas, data.timeseries || []);
    window.addEventListener("resize", this.onResize);
    this.drawChart(canvas, data.timeseries || []);
  },

  bucketLabel(dateStr) {
    if (!dateStr) return "";
    if (this.state.period === "weekly") {
      const match = String(dateStr).match(/W(\d+)$/);
      return match ? "الأسبوع " + match[1] : dateStr;
    }
    const d = String(dateStr).includes("T")
      ? new Date(dateStr)
      : new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return dateStr;
    return (d.getDate()) + "/" + (d.getMonth() + 1);
  },

  drawChart(canvas, series) {
    const ctx = canvas.getContext("2d");
    const data = (series || []).slice(-8);
    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 260;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!data.length) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("لا توجد بيانات بعد", width / 2, height / 2);
      return;
    }

    const max = Math.max(
      1,
      ...data.map((d) => Math.max(d.new_conversations || 0, d.orders_confirmed || 0))
    );
    const pad = { top: 14, right: 10, bottom: 26, left: 10 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const gap = 3;
    const groupW = Math.min(90, chartW / data.length);
    const barW = Math.max(4, Math.floor((groupW - gap * 2 - 12) / 2));

    const fillBar = (x, y, w, h, fill) => {
      ctx.fillStyle = fill;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 3);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    };

    data.forEach((day, i) => {
      const gx = pad.left + i * groupW + (groupW - (barW * 2 + 6)) / 2;

      const hNew = Math.max(2, Math.round(((day.new_conversations || 0) / max) * chartH));
      const yNew = pad.top + (chartH - hNew);
      fillBar(gx, yNew, barW, hNew, "rgba(249, 115, 22, 0.85)");

      const hOrd = Math.max(2, Math.round(((day.orders_confirmed || 0) / max) * chartH));
      const yOrd = pad.top + (chartH - hOrd);
      fillBar(gx + barW + 6, yOrd, barW, hOrd, "rgba(34, 197, 94, 0.85)");

      if (day.new_conversations > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(day.new_conversations), gx + barW / 2, yNew - 4);
      }
      if (day.orders_confirmed > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(day.orders_confirmed), gx + barW + 6 + barW / 2, yOrd - 4);
      }

      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.bucketLabel(day.date), gx + barW + 3, height - 8);
    });
  },
};

Router.register("analytics", {
  render: (container) => AnalyticsPage.render(container),
  destroy: () => AnalyticsPage.destroy(),
});