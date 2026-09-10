/* =====================================================
   PAGE: Conversations — Three-Column Layout
   Column 1: Conversations List (340px)
   Column 2: Chat View (flex: 1)
   Column 3: Customer Info Panel (320px)
   ===================================================== */

let pendingOpenClientId = null;

function requestOpenConversation(clientId) {
  pendingOpenClientId = clientId;
}

const ConversationsPage = {
  container: null,
  state: {
    search: "",
    filter: "all",
    page: 1,
    limit: 30,
    conversations: [],
    total: 0,
    counts: { all: 0, bot_on: 0, bot_off: 0, needs_attention: 0 },
    current: null,
    currentMessages: [],
    currentOrder: null,
    currentNotes: "",
    loading: false,
    initialLoaded: false,
    sending: false,
    notesEditing: false,
    infoPanelOpen: false,
  },
  el: {},
  searchFocused: false,
  listPollTimer: null,
  chatPollTimer: null,

  /* =====================================================
     RENDER — Entry point
     ===================================================== */

  render(container) {
    this.container = container;
    this.container.innerHTML = `
      <div class="conv-page">
        <!-- Column 1: Conversations List -->
        <div class="conv-col">
          <div class="conv-col-header">
            <h2 class="conv-col-title">Conversations</h2>
            <div class="conv-col-actions">
              <button type="button" class="icon-btn" title="Sort">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                </svg>
              </button>
              <button type="button" class="icon-btn" title="Filter options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="conv-col-search">
            <svg class="conv-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="search" class="conv-search-input" id="conv-search-input" placeholder="Search by name, phone or ID..." autocomplete="off" />
          </div>

          <div class="conv-col-filters" id="conv-filters">
            <button type="button" class="filter-tab active" data-filter="all">
              All <span class="filter-count" id="count-all">0</span>
            </button>
            <button type="button" class="filter-tab" data-filter="bot_on">
              Bot ON <span class="filter-count" id="count-bot-on">0</span>
            </button>
            <button type="button" class="filter-tab" data-filter="bot_off">
              Bot OFF <span class="filter-count" id="count-bot-off">0</span>
            </button>
            <button type="button" class="filter-tab" data-filter="needs_attention">
              Attention <span class="filter-count" id="count-attention">0</span>
            </button>
          </div>

          <div class="conv-col-list" id="conv-list"></div>

          <div class="conv-col-footer">
            <button type="button" id="load-more" class="load-more-btn hidden">Load more conversations</button>
          </div>
        </div>

        <!-- Column 2: Chat View -->
        <div class="chat-col" id="chat-col">
          <div class="chat-empty" id="chat-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p class="chat-empty-text">Select a conversation to start messaging</p>
          </div>

          <div class="chat-view hidden" id="chat-view">
            <div class="chat-header" id="chat-header">
              <button type="button" class="icon-btn chat-back-btn" id="chat-back-btn" title="Back to conversations">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 19 12 12 5"/>
                </svg>
              </button>
              <div class="chat-header-avatar" id="chat-avatar">--</div>
              <div class="chat-header-info">
                <div class="chat-header-name" id="chat-name">--</div>
                <div class="chat-header-meta">
                  <span id="chat-platform-icon"></span>
                  <span id="chat-platform-text">--</span>
                  <span class="meta-sep">&middot;</span>
                  <span id="chat-first-seen">--</span>
                </div>
              </div>
              <div class="chat-header-actions">
                <button type="button" class="icon-btn" title="Tag">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                </button>
                <button type="button" class="icon-btn" id="info-panel-toggle" title="Customer info">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </button>
                <button type="button" class="icon-btn" title="More options">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="bot-banner" id="bot-banner">
              <div class="bot-banner-left">
                <span class="bot-banner-dot" id="bot-banner-dot"></span>
                <span class="bot-banner-text" id="bot-banner-text">Bot is ACTIVE and will respond automatically</span>
              </div>
              <div class="toggle-switch" id="bot-toggle" role="switch" aria-checked="true" tabindex="0"></div>
            </div>

            <div class="chat-messages" id="messages"></div>

            <div class="chat-input-area">
              <div class="chat-input-row">
                <button type="button" class="icon-btn" title="Attach file">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <button type="button" class="icon-btn" title="Emoji">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                </button>
                <input type="text" class="chat-input" id="chat-input" placeholder="Type a message..." autocomplete="off" />
                <button type="button" class="send-btn" id="send-btn" title="Send message">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <div class="chat-input-status" id="chat-input-status">Bot is ON &bull; AI will respond automatically</div>
            </div>
          </div>

          <div class="chat-error hidden" id="chat-error"></div>
        </div>

        <!-- Column 3: Customer Info Panel -->
        <div class="info-col hidden" id="info-col">
          <div class="info-col-header">
            <span class="info-col-title">Customer Info</span>
            <button type="button" class="info-col-close" id="info-col-close" title="Close panel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="info-col-body" id="info-col-body">
            <!-- Customer card -->
            <div class="info-card">
              <div class="info-card-title">Customer</div>
              <div class="info-card-row">
                <span class="info-card-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Name
                </span>
                <span class="info-card-value" id="info-name">--</span>
              </div>
              <div class="info-card-row">
                <span class="info-card-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Phone
                </span>
                <div class="info-card-actions">
                  <span class="info-card-value" id="info-phone">--</span>
                  <button type="button" class="info-card-action-btn" id="info-copy-phone" title="Copy phone">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                  <button type="button" class="info-card-action-btn" id="info-wa-link" title="Open in WhatsApp">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </button>
                </div>
              </div>
              <div class="info-card-row">
                <span class="info-card-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Platform
                </span>
                <span class="info-card-value" id="info-platform">--</span>
              </div>
              <div class="info-card-row">
                <span class="info-card-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  First seen
                </span>
                <span class="info-card-value" id="info-first-seen">--</span>
              </div>
            </div>

            <!-- Bot Control card -->
            <div class="info-card" id="bot-control-card">
              <div class="info-card-title">Bot Control</div>
              <div class="info-card-row">
                <span class="info-card-label">Auto-reply</span>
                <div style="position:relative;display:flex;align-items:center;gap:8px;">
                  <div class="toggle-switch large" id="info-bot-toggle" role="switch" aria-checked="true" tabindex="0"></div>
                  <button type="button" class="info-card-action-btn" id="pause-btn" title="Pause bot">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  </button>
                  <div class="pause-popover" id="pause-popover">
                    <div class="pause-popover-title">Pause for...</div>
                    <button type="button" class="pause-option" data-minutes="30">30 minutes</button>
                    <button type="button" class="pause-option" data-minutes="60">1 hour</button>
                    <button type="button" class="pause-option" data-minutes="240">4 hours</button>
                    <button type="button" class="pause-option" data-minutes="480">8 hours</button>
                  </div>
                </div>
              </div>
              <div class="info-card-row" id="pause-timer-row" style="display:none;">
                <span class="info-card-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Paused until
                </span>
                <span class="info-card-value" id="info-pause-until">--</span>
              </div>
            </div>

            <!-- Latest Order card (conditionally shown) -->
            <div class="info-card order-card hidden" id="order-card">
              <div class="info-card-title">Latest Order</div>
              <div class="info-card-row">
                <span class="info-card-label">Order</span>
                <span class="info-card-value" id="info-order-id">--</span>
              </div>
              <div class="info-card-row">
                <span class="info-card-label">Total</span>
                <span class="order-amount" id="info-order-total">--</span>
              </div>
              <div class="info-card-row">
                <span class="info-card-label">Status</span>
                <span class="order-status" id="info-order-status">--</span>
              </div>
            </div>

            <!-- Internal Notes card -->
            <div class="info-card" id="notes-card">
              <div class="info-card-title">Internal Notes</div>
              <div id="notes-display-area">
                <div class="notes-display empty" id="notes-display">No notes yet</div>
                <div style="text-align:right;margin-top:6px;">
                  <button type="button" class="info-card-action-btn" id="notes-edit-btn" title="Edit notes">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              </div>
              <div id="notes-edit-area" class="hidden">
                <textarea class="notes-textarea" id="notes-textarea" placeholder="Add internal notes about this customer..." maxlength="2000"></textarea>
                <div class="notes-actions">
                  <button type="button" class="notes-btn ghost" id="notes-cancel-btn">Cancel</button>
                  <button type="button" class="notes-btn primary" id="notes-save-btn">Save</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Toast container -->
      <div class="toast-container" id="toast-container"></div>
    `;

    this.cacheElements();
    this.bindEvents();
    this.resetState();
    this.loadCounts();
    this.loadConversations(true);

    if (pendingOpenClientId) {
      const clientId = pendingOpenClientId;
      pendingOpenClientId = null;
      this.openConversation(clientId);
    }

    this.listPollTimer = setInterval(() => this.pollConversations(), 10000);

    return () => this.destroy();
  },

  destroy() {
    if (this.listPollTimer) { clearInterval(this.listPollTimer); this.listPollTimer = null; }
    if (this.chatPollTimer) { clearInterval(this.chatPollTimer); this.chatPollTimer = null; }
  },

  resetState() {
    this.state.search = "";
    this.state.filter = "all";
    this.state.page = 1;
    this.state.conversations = [];
    this.state.total = 0;
    this.state.counts = { all: 0, bot_on: 0, bot_off: 0, needs_attention: 0 };
    this.state.current = null;
    this.state.currentMessages = [];
    this.state.currentOrder = null;
    this.state.currentNotes = "";
    this.state.loading = false;
    this.state.initialLoaded = false;
    this.state.sending = false;
    this.state.notesEditing = false;
    this.state.infoPanelOpen = false;
    this.searchFocused = false;
  },

  cacheElements() {
    const q = (id) => this.container.querySelector("#" + id);
    this.el.convPage = this.container.querySelector(".conv-page");
    this.el.searchInput = q("conv-search-input");
    this.el.filters = q("conv-filters");
    this.el.convList = q("conv-list");
    this.el.loadMore = q("load-more");
    this.el.countAll = q("count-all");
    this.el.countBotOn = q("count-bot-on");
    this.el.countBotOff = q("count-bot-off");
    this.el.countAttention = q("count-attention");
    this.el.chatEmpty = q("chat-empty");
    this.el.chatView = q("chat-view");
    this.el.chatBackBtn = q("chat-back-btn");
    this.el.chatAvatar = q("chat-avatar");
    this.el.chatName = q("chat-name");
    this.el.chatPlatformIcon = q("chat-platform-icon");
    this.el.chatPlatformText = q("chat-platform-text");
    this.el.chatFirstSeen = q("chat-first-seen");
    this.el.botBanner = q("bot-banner");
    this.el.botBannerDot = q("bot-banner-dot");
    this.el.botBannerText = q("bot-banner-text");
    this.el.botToggle = q("bot-toggle");
    this.el.messages = q("messages");
    this.el.chatInput = q("chat-input");
    this.el.sendBtn = q("send-btn");
    this.el.chatInputStatus = q("chat-input-status");
    this.el.chatError = q("chat-error");
    // Info panel
    this.el.infoCol = q("info-col");
    this.el.infoColClose = q("info-col-close");
    this.el.infoPanelToggle = q("info-panel-toggle");
    this.el.infoName = q("info-name");
    this.el.infoPhone = q("info-phone");
    this.el.infoPlatform = q("info-platform");
    this.el.infoFirstSeen = q("info-first-seen");
    this.el.infoBotToggle = q("info-bot-toggle");
    this.el.pauseBtn = q("pause-btn");
    this.el.pausePopover = q("pause-popover");
    this.el.pauseTimerRow = q("pause-timer-row");
    this.el.infoPauseUntil = q("info-pause-until");
    this.el.orderCard = q("order-card");
    this.el.infoOrderId = q("info-order-id");
    this.el.infoOrderTotal = q("info-order-total");
    this.el.infoOrderStatus = q("info-order-status");
    this.el.notesDisplay = q("notes-display");
    this.el.notesEditBtn = q("notes-edit-btn");
    this.el.notesDisplayArea = q("notes-display-area");
    this.el.notesEditArea = q("notes-edit-area");
    this.el.notesTextarea = q("notes-textarea");
    this.el.notesCancelBtn = q("notes-cancel-btn");
    this.el.notesSaveBtn = q("notes-save-btn");
    this.el.toastContainer = q("toast-container");
  },

  /* =====================================================
     TOAST SYSTEM
     ===================================================== */

  showToast(message, type, duration) {
    type = type || "info";
    duration = duration || 3000;
    const toast = document.createElement("div");
    toast.className = "toast " + type;
    const icons = { success: "\u2714", error: "\u2716", info: "\u2139\uFE0F" };
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span>'
      + '<span>' + this.escapeHtml(message) + '</span>'
      + '<button type="button" class="toast-dismiss">\u00D7</button>';
    this.el.toastContainer.appendChild(toast);
    toast.querySelector(".toast-dismiss").addEventListener("click", () => {
      toast.style.animation = "toast-out 200ms ease forwards";
      setTimeout(() => toast.remove(), 200);
    });
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = "toast-out 200ms ease forwards";
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  },

  escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  /* =====================================================
     HELPERS
     ===================================================== */

  timeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (Number.isNaN(diffSec) || diffSec < 0) return "";
    if (diffSec < 60) return "now";
    const min = Math.floor(diffSec / 60);
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    const day = Math.floor(hr / 24);
    if (day === 1) return "yesterday";
    if (day < 30) return day + "d ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  },

  daysAgo(iso) {
    if (!iso) return "Unknown";
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (Number.isNaN(diffSec) || diffSec < 0) return "Unknown";
    const day = Math.floor(diffSec / 86400);
    if (day === 0) return "First seen today";
    if (day === 1) return "First seen yesterday";
    return "First seen " + day + " days ago";
  },

  truncate(text, max) {
    if (!text) return "";
    max = max || 45;
    const s = String(text);
    return s.length > max ? s.slice(0, max) + "\u2026" : s;
  },

  fmtClock(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  },

  fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const diffMs = now - d;
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffDay === 0) return "Today";
    if (diffDay === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  },

  getInitial(name) {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  },

  getPlatformIcon(platform) {
    if (!platform) return "";
    const p = platform.toLowerCase();
    if (p === "instagram") return "\uD83D\uDCF7";
    if (p === "facebook") return "\uD83D\uDCD3";
    if (p === "whatsapp") return "\uD83D\uDCAC";
    if (p === "telegram") return "\u2708\uFE0F";
    return "\uD83D\uDCDD";
  },

  isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  },

  getDateKey(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toDateString();
  },

  formatCurrency(amount) {
    if (amount == null) return "--";
    return Number(amount).toLocaleString("en-US") + " MAD";
  },

  /* =====================================================
     COLUMN 1: COUNTS
     ===================================================== */

  async loadCounts() {
    try {
      const stats = await getStats();
      this.state.counts.all = stats.total_conversations || 0;
      this.state.counts.bot_on = stats.bot_on_count || 0;
      this.state.counts.bot_off = stats.bot_off_count || 0;
      this.state.counts.needs_attention = stats.needs_attention_count || 0;
      this.renderCounts();
      Shell.updateConversationCount(this.state.counts.all);
    } catch (err) {
      console.warn("[counts]", err.message);
    }
  },

  renderCounts() {
    this.el.countAll.textContent = this.state.counts.all;
    this.el.countBotOn.textContent = this.state.counts.bot_on;
    this.el.countBotOff.textContent = this.state.counts.bot_off;
    this.el.countAttention.textContent = this.state.counts.needs_attention;
  },

  /* =====================================================
     COLUMN 1: CONVERSATIONS LIST
     ===================================================== */

  async loadConversations(reset) {
    if (this.state.loading) return;
    this.state.loading = true;

    if (reset) {
      this.state.page = 1;
      if (!this.state.initialLoaded) {
        this.renderSkeletons();
      }
    }

    try {
      const data = await getConversations({
        search: this.state.search || undefined,
        filter: this.state.filter === "all" ? undefined : this.state.filter,
        page: this.state.page,
        limit: this.state.limit,
      });

      if (reset) this.state.conversations = [];
      this.state.conversations = this.state.conversations.concat(data.conversations);
      this.state.total = data.total;
      this.state.initialLoaded = true;

      this.renderList();
      this.updatePagination();
    } catch (err) {
      console.warn("[conv-list]", err.message);
      if (!this.state.initialLoaded) {
        this.renderEmpty();
      }
    } finally {
      this.state.loading = false;
    }
  },

  renderSkeletons() {
    this.el.convList.textContent = "";
    for (let i = 0; i < 5; i++) {
      const skel = document.createElement("div");
      skel.className = "skeleton-item";
      skel.innerHTML = `
        <div class="skeleton-row">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line w60"></div>
            <div class="skeleton-line w90"></div>
            <div class="skeleton-line w40"></div>
          </div>
        </div>
      `;
      this.el.convList.appendChild(skel);
    }
  },

  renderEmpty() {
    this.el.convList.textContent = "";
    const empty = document.createElement("div");
    empty.className = "conv-empty";
    empty.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <p>No conversations found</p>
    `;
    this.el.convList.appendChild(empty);
  },

  renderList() {
    this.el.convList.textContent = "";

    if (!this.state.conversations.length) {
      this.renderEmpty();
      return;
    }

    this.state.conversations.forEach((conv) => {
      this.el.convList.appendChild(this.buildItem(conv));
    });
  },

  buildItem(conv) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "conv-item";
    item._clientId = conv.client_id;
    if (this.state.current && this.state.current.client_id === conv.client_id) {
      item.classList.add("active");
    }
    item.addEventListener("click", () => this.openConversation(conv.client_id));

    const unreadDot = document.createElement("span");
    unreadDot.className = "conv-item-unread";

    const avatar = document.createElement("div");
    avatar.className = "conv-item-avatar";
    avatar.textContent = this.getInitial(conv.customer_name || conv.client_id);

    const content = document.createElement("div");
    content.className = "conv-item-content";

    const topRow = document.createElement("div");
    topRow.className = "conv-item-top";

    const name = document.createElement("span");
    name.className = "conv-item-name";
    name.textContent = conv.customer_name || conv.client_id;

    topRow.appendChild(name);

    if (conv.has_order) {
      const orderIcon = document.createElement("span");
      orderIcon.className = "conv-item-order";
      orderIcon.textContent = "\uD83D\uDED2";
      orderIcon.title = "Order confirmed";
      topRow.appendChild(orderIcon);
    }

    const preview = document.createElement("div");
    preview.className = "conv-item-preview";
    preview.textContent = this.truncate(conv.last_message_preview);

    const meta = document.createElement("div");
    meta.className = "conv-item-meta";

    const platform = document.createElement("span");
    platform.className = "conv-item-platform";
    platform.textContent = (conv.platform || "unknown").charAt(0).toUpperCase() + (conv.platform || "unknown").slice(1);

    const time = document.createElement("span");
    time.className = "conv-item-time";
    time.textContent = this.timeAgo(conv.last_message_at);

    meta.appendChild(platform);
    meta.appendChild(document.createTextNode("\u00B7"));
    meta.appendChild(time);

    content.appendChild(topRow);
    content.appendChild(preview);
    content.appendChild(meta);

    const botBadge = document.createElement("div");
    botBadge.className = "conv-item-bot-badge " + (conv.bot_enabled ? "on" : "off");

    const botDot = document.createElement("span");
    botBadge.appendChild(botDot);

    const botText = document.createElement("span");
    botText.textContent = conv.bot_enabled ? "Bot ON" : "Bot OFF";
    botBadge.appendChild(botText);

    item.appendChild(unreadDot);
    item.appendChild(avatar);
    item.appendChild(content);
    item.appendChild(botBadge);

    return item;
  },

  updatePagination() {
    const hasMore = this.state.conversations.length < this.state.total;
    this.el.loadMore.classList.toggle("hidden", !hasMore);
  },

  /* =====================================================
     COLUMN 1: POLLING (diff-merge)
     ===================================================== */

  conversationChanged(a, b) {
    if (!a) return true;
    return (
      a.customer_name !== b.customer_name ||
      a.phone !== b.phone ||
      a.platform !== b.platform ||
      a.bot_enabled !== b.bot_enabled ||
      a.needs_attention !== b.needs_attention ||
      a.has_order !== b.has_order ||
      a.last_message_at !== b.last_message_at ||
      a.last_message_preview !== b.last_message_preview
    );
  },

  mergeConversations(rows, total) {
    if (!rows.length) {
      if (this.state.conversations.length) {
        this.state.conversations = [];
        this.state.total = 0;
        this.renderList();
        this.updatePagination();
      }
      return;
    }

    if (!this.state.conversations.length) {
      this.state.conversations = rows;
      this.state.total = total;
      this.renderList();
      this.updatePagination();
      return;
    }

    const byId = new Map(rows.map((r) => [r.client_id, r]));
    const oldById = new Map(this.state.conversations.map((c) => [c.client_id, c]));

    this.el.convList.querySelectorAll(".conv-item").forEach((node) => {
      if (!byId.has(node._clientId)) node.remove();
    });

    let prevNode = null;
    rows.forEach((conv) => {
      let node = Array.from(this.el.convList.querySelectorAll(".conv-item")).find(
        (n) => n._clientId === conv.client_id
      );
      if (!node) {
        node = this.buildItem(conv);
      } else if (this.conversationChanged(oldById.get(conv.client_id), conv)) {
        const fresh = this.buildItem(conv);
        node.replaceWith(fresh);
        node = fresh;
      }
      if (prevNode) {
        this.el.convList.insertBefore(node, prevNode.nextSibling);
      } else if (this.el.convList.firstChild !== node) {
        this.el.convList.insertBefore(node, this.el.convList.firstChild);
      }
      prevNode = node;
    });

    while (prevNode && prevNode.nextSibling) {
      const extra = prevNode.nextSibling;
      if (extra.classList && extra.classList.contains("conv-item")) extra.remove();
      else prevNode = extra;
    }

    this.state.conversations = rows;
    this.state.total = total;
    this.updatePagination();
  },

  async pollConversations() {
    if (this.state.loading || this.searchFocused) return;
    try {
      const [data, stats] = await Promise.all([
        getConversations({
          search: this.state.search || undefined,
          filter: this.state.filter === "all" ? undefined : this.state.filter,
          page: 1,
          limit: Math.max(this.state.limit, this.state.conversations.length),
        }),
        getStats(),
      ]);
      this.mergeConversations(data.conversations, data.total);
      this.state.counts.all = stats.total_conversations || 0;
      this.state.counts.bot_on = stats.bot_on_count || 0;
      this.state.counts.bot_off = stats.bot_off_count || 0;
      this.state.counts.needs_attention = stats.needs_attention_count || 0;
      this.renderCounts();
      Shell.updateConversationCount(this.state.counts.all);
    } catch (err) {
      console.warn("[poll]", err.message);
    }
  },

  /* =====================================================
     COLUMN 2: OPEN CONVERSATION
     ===================================================== */

  async openConversation(clientId) {
    this.clearChatPoll();
    this.applyActiveHighlight(clientId);
    this.showChatLoading();
    this.clearChatError();

    try {
      const detail = await getConversation(clientId);
      this.state.current = detail.conversation;
      this.state.currentMessages = detail.messages || [];
      this.state.currentNotes = detail.conversation.notes || "";
      this.state.currentOrder = null;
      this.renderChatHeader();
      this.renderBotBanner();
      this.renderMessages();
      this.startChatPolling();
      this.el.convPage.classList.add("mobile-view-chat");

      // Load info panel data
      this.renderInfoPanel();

      // Fetch order in background
      this.fetchOrder(clientId);
    } catch (err) {
      this.showChatError(err.message);
      this.showChatEmpty("Failed to load conversation");
    }
  },

  startChatPolling() {
    this.clearChatPoll();
    this.chatPollTimer = setInterval(() => this.pollOpenConversation(), 5000);
  },

  clearChatPoll() {
    if (this.chatPollTimer) { clearInterval(this.chatPollTimer); this.chatPollTimer = null; }
  },

  async pollOpenConversation() {
    const conv = this.state.current;
    if (!conv) return;
    try {
      const detail = await getConversation(conv.client_id);
      if (this.state.current !== conv) return;

      if (detail.conversation.bot_enabled !== conv.bot_enabled) {
        conv.bot_enabled = detail.conversation.bot_enabled;
        this.renderBotBanner();
        this.renderInfoPanelBotToggle();
      }

      const nearBottom =
        this.el.messages.scrollHeight - this.el.messages.scrollTop - this.el.messages.clientHeight < 40;
      this.syncMessages(detail.messages, nearBottom);
    } catch (err) {
      console.warn("[poll conv]", err.message);
    }
  },

  showChatLoading() {
    this.el.chatEmpty.classList.add("hidden");
    this.el.chatView.classList.remove("hidden");
    this.el.messages.textContent = "";
    const loader = document.createElement("div");
    loader.className = "chat-loading";
    loader.textContent = "Loading conversation...";
    this.el.messages.appendChild(loader);
  },

  showChatEmpty(msg) {
    this.el.chatView.classList.add("hidden");
    this.el.chatEmpty.classList.remove("hidden");
    this.el.chatEmpty.querySelector(".chat-empty-text").textContent = msg || "Select a conversation to start messaging";
    this.el.infoCol.classList.add("hidden");
    this.state.infoPanelOpen = false;
    this.el.convPage.classList.remove("mobile-view-chat");
  },

  /* =====================================================
     COLUMN 2: CHAT HEADER
     ===================================================== */

  renderChatHeader() {
    const conv = this.state.current;
    if (!conv) return;

    this.el.chatEmpty.classList.add("hidden");
    this.el.chatView.classList.remove("hidden");

    this.el.chatAvatar.textContent = this.getInitial(conv.customer_name || conv.client_id);
    this.el.chatName.textContent = conv.customer_name || conv.client_id;

    const platform = conv.platform || "unknown";
    this.el.chatPlatformIcon.textContent = this.getPlatformIcon(platform);
    this.el.chatPlatformText.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);

    const msgs = this.state.currentMessages;
    if (msgs.length > 0) {
      this.el.chatFirstSeen.textContent = this.daysAgo(msgs[0].created_at);
    } else {
      this.el.chatFirstSeen.textContent = "First seen unknown";
    }
  },

  /* =====================================================
     COLUMN 2: BOT STATUS BANNER + TOGGLE
     ===================================================== */

  renderBotBanner() {
    const conv = this.state.current;
    if (!conv) return;

    const active = !!conv.bot_enabled;
    this.el.botBanner.className = "bot-banner " + (active ? "active" : "paused");
    this.el.botBannerDot.className = "bot-banner-dot " + (active ? "green" : "red");
    this.el.botBannerText.textContent = active
      ? "Bot is ACTIVE and will respond automatically"
      : "Bot is PAUSED \u2014 won\u2019t respond automatically to this customer";
    this.el.botToggle.classList.toggle("active", active);
    this.el.botToggle.setAttribute("aria-checked", String(active));

    this.el.chatInputStatus.innerHTML = active
      ? "Bot is ON &bull; AI will respond automatically"
      : "Bot is OFF &bull; Only team replies will be sent";

    this.renderInfoPanelBotToggle();
  },

  async handleToggle() {
    const conv = this.state.current;
    if (!conv || this.el.botToggle.disabled) return;

    const target = !conv.bot_enabled;
    this.el.botToggle.disabled = true;
    this.el.botToggle.classList.toggle("active", target);

    try {
      const updated = await toggleBot(conv.client_id, target);
      conv.bot_enabled = updated.bot_enabled;
      this.renderBotBanner();
      this.updateItemBotBadge(conv.client_id, conv.bot_enabled);
      this.loadCounts();
      this.showToast(target ? "Bot enabled" : "Bot disabled", "success");
    } catch (err) {
      this.renderBotBanner();
      this.showChatError(err.message || "Failed to update bot status");
    } finally {
      this.el.botToggle.disabled = false;
    }
  },

  updateItemBotBadge(clientId, enabled) {
    this.el.convList.querySelectorAll(".conv-item").forEach((node) => {
      if (node._clientId !== clientId) return;
      const badge = node.querySelector(".conv-item-bot-badge");
      if (badge) {
        badge.className = "conv-item-bot-badge " + (enabled ? "on" : "off");
        badge.querySelector("span:last-child").textContent = enabled ? "Bot ON" : "Bot OFF";
      }
    });
  },

  /* =====================================================
     COLUMN 2: MESSAGES
     ===================================================== */

  renderMessages() {
    this.el.messages.textContent = "";
    const msgs = this.state.currentMessages;

    if (!msgs || !msgs.length) {
      const empty = document.createElement("div");
      empty.className = "msg-empty";
      empty.textContent = "No messages yet";
      this.el.messages.appendChild(empty);
      return;
    }

    let lastDateKey = "";
    msgs.forEach((msg) => {
      const dateKey = this.getDateKey(msg.created_at);
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        this.el.messages.appendChild(this.buildDateSep(msg.created_at));
      }
      this.el.messages.appendChild(this.buildMessage(msg));
    });

    this.el.messages.scrollTop = this.el.messages.scrollHeight;
  },

  buildDateSep(iso) {
    const sep = document.createElement("div");
    sep.className = "msg-date-sep";
    const span = document.createElement("span");
    span.textContent = this.fmtDate(iso);
    sep.appendChild(span);
    return sep;
  },

  buildMessage(msg) {
    const isInbound = msg.direction === "inbound";
    const isHuman = msg.message_type === "human_reply";
    const bubble = document.createElement("div");

    if (isInbound) {
      bubble.className = "msg inbound";
    } else if (isHuman) {
      bubble.className = "msg outbound human";
    } else {
      bubble.className = "msg outbound bot";
    }

    if (isInbound) {
      const sender = document.createElement("div");
      sender.className = "msg-sender";
      const conv = this.state.current;
      sender.textContent = conv ? (conv.customer_name || conv.client_id || "Customer") : "Customer";
      bubble.appendChild(sender);
    }

    if (!isInbound) {
      const icon = document.createElement("span");
      icon.className = "msg-outbound-icon";
      icon.textContent = isHuman ? "\uD83D\uDC64" : "\uD83E\uDD16";
      bubble.appendChild(icon);
    }

    const content = document.createElement("div");
    content.className = "msg-text";

    const type = msg.message_type || "text";
    const url = msg.message_text || "";

    if (type === "image") {
      const img = document.createElement("img");
      img.className = "msg-media";
      img.src = url;
      img.alt = "Image";
      img.loading = "lazy";
      content.appendChild(img);
    } else if (type === "audio") {
      const audio = document.createElement("audio");
      audio.className = "msg-media";
      audio.controls = true;
      audio.src = url;
      content.appendChild(audio);
    } else if (type === "video") {
      const video = document.createElement("video");
      video.className = "msg-media";
      video.controls = true;
      video.src = url;
      video.preload = "metadata";
      content.appendChild(video);
    } else {
      content.textContent = url;
    }

    bubble.appendChild(content);

    const footer = document.createElement("div");
    footer.className = "msg-footer";

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = this.fmtClock(msg.created_at);
    footer.appendChild(time);

    if (!isInbound) {
      const readMark = document.createElement("span");
      readMark.className = "msg-read";
      readMark.textContent = "\u2713\u2713";
      footer.appendChild(readMark);
    }

    bubble.appendChild(footer);
    return bubble;
  },

  syncMessages(messages, nearBottom) {
    const oldCount = this.el.messages.querySelectorAll(".msg").length;
    const newCount = messages ? messages.length : 0;
    if (newCount < oldCount) {
      this.state.currentMessages = messages;
      this.renderMessages();
      return;
    }
    if (newCount === oldCount) return;

    const newMsgs = messages.slice(oldCount);
    let lastDateKey = "";
    const existingDates = this.el.messages.querySelectorAll(".msg-date-sep");

    if (existingDates.length > 0) {
      lastDateKey = this.getDateKey(newMsgs[0] ? newMsgs[0].created_at : null);
    }

    newMsgs.forEach((msg) => {
      const dateKey = this.getDateKey(msg.created_at);
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        this.el.messages.appendChild(this.buildDateSep(msg.created_at));
      }
      this.el.messages.appendChild(this.buildMessage(msg));
    });

    this.state.currentMessages = messages;
    if (nearBottom) {
      this.el.messages.scrollTop = this.el.messages.scrollHeight;
    }
  },

  applyActiveHighlight(clientId) {
    this.el.convList.querySelectorAll(".conv-item").forEach((node) => {
      node.classList.toggle("active", node._clientId === clientId);
    });
  },

  /* =====================================================
     COLUMN 2: SEND MESSAGE
     ===================================================== */

  async handleSend() {
    const text = this.el.chatInput.value.trim();
    const conv = this.state.current;
    if (!text || !conv || this.state.sending) return;

    this.state.sending = true;
    this.el.sendBtn.disabled = true;
    this.el.chatInput.value = "";

    const optimisticMsg = {
      direction: "outbound",
      message_text: text,
      message_type: "human_reply",
      created_at: new Date().toISOString(),
    };
    const bubble = this.buildMessage(optimisticMsg);
    this.el.messages.appendChild(bubble);
    this.el.messages.scrollTop = this.el.messages.scrollHeight;

    try {
      await replyMessage(conv.client_id, text);
      this.updateItemPreview(conv.client_id, text);
    } catch (err) {
      bubble.classList.add("failed");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "msg-retry";
      retry.textContent = "\u21BB Retry";
      retry.title = err.message || "Send failed";
      retry.addEventListener("click", () => {
        bubble.remove();
        this.el.chatInput.value = text;
        this.handleSend();
      });
      bubble.appendChild(retry);
      this.showChatError(err.message || "Failed to send message");
    } finally {
      this.state.sending = false;
      this.el.sendBtn.disabled = false;
      this.el.chatInput.focus();
    }
  },

  updateItemPreview(clientId, text) {
    this.el.convList.querySelectorAll(".conv-item").forEach((node) => {
      if (node._clientId !== clientId) return;
      const preview = node.querySelector(".conv-item-preview");
      if (preview) preview.textContent = this.truncate(text);
    });
  },

  /* =====================================================
     COLUMN 3: INFO PANEL
     ===================================================== */

  toggleInfoPanel() {
    this.state.infoPanelOpen = !this.state.infoPanelOpen;
    this.el.infoCol.classList.toggle("hidden", !this.state.infoPanelOpen);
  },

  closeInfoPanel() {
    this.state.infoPanelOpen = false;
    this.el.infoCol.classList.add("hidden");
  },

  renderInfoPanel() {
    const conv = this.state.current;
    if (!conv) return;

    this.el.infoName.textContent = conv.customer_name || conv.client_id || "--";
    this.el.infoPhone.textContent = conv.phone || "--";

    const platform = conv.platform || "unknown";
    this.el.infoPlatform.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);

    const msgs = this.state.currentMessages;
    this.el.infoFirstSeen.textContent = msgs.length > 0 ? this.daysAgo(msgs[0].created_at) : "--";

    this.renderInfoPanelBotToggle();
    this.renderNotes();

    // Pause timer
    if (conv.bot_paused_until) {
      const until = new Date(conv.bot_paused_until);
      this.el.pauseTimerRow.style.display = "flex";
      this.el.infoPauseUntil.textContent = until.toLocaleString("en-US", {
        hour: "2-digit", minute: "2-digit", month: "short", day: "numeric"
      });
    } else {
      this.el.pauseTimerRow.style.display = "none";
    }
  },

  renderInfoPanelBotToggle() {
    const conv = this.state.current;
    if (!conv) return;
    const active = !!conv.bot_enabled;
    this.el.infoBotToggle.classList.toggle("active", active);
    this.el.infoBotToggle.setAttribute("aria-checked", String(active));
  },

  async fetchOrder(clientId) {
    try {
      const order = await getOrder(clientId);
      this.state.currentOrder = order;
      this.el.orderCard.classList.remove("hidden");
      this.el.infoOrderId.textContent = order.order_id || "--";
      this.el.infoOrderTotal.textContent = this.formatCurrency(order.total);
      const statusEl = this.el.infoOrderStatus;
      statusEl.textContent = (order.status || "unknown").charAt(0).toUpperCase() + (order.status || "unknown").slice(1);
      statusEl.className = "order-status " + (order.status === "confirmed" ? "confirmed" : "pending");
    } catch (err) {
      this.state.currentOrder = null;
      this.el.orderCard.classList.add("hidden");
    }
  },

  /* =====================================================
     COLUMN 3: BOT CONTROL + PAUSE
     ===================================================== */

  async handleInfoToggle() {
    const conv = this.state.current;
    if (!conv || this.el.infoBotToggle.disabled) return;

    const target = !conv.bot_enabled;
    this.el.infoBotToggle.disabled = true;
    this.el.infoBotToggle.classList.toggle("active", target);

    try {
      const updated = await toggleBot(conv.client_id, target);
      conv.bot_enabled = updated.bot_enabled;
      this.renderBotBanner();
      this.updateItemBotBadge(conv.client_id, conv.bot_enabled);
      this.loadCounts();
      this.showToast(target ? "Bot enabled" : "Bot disabled", "success");
    } catch (err) {
      this.renderInfoPanelBotToggle();
      this.renderBotBanner();
      this.showToast(err.message || "Failed to update bot", "error");
    } finally {
      this.el.infoBotToggle.disabled = false;
    }
  },

  togglePausePopover() {
    this.el.pausePopover.classList.toggle("open");
  },

  closePausePopover() {
    this.el.pausePopover.classList.remove("open");
  },

  async handlePause(durationMinutes) {
    const conv = this.state.current;
    if (!conv) return;
    this.closePausePopover();

    try {
      const result = await pauseBot(conv.client_id, durationMinutes);
      conv.bot_paused_until = result.bot_paused_until;
      this.renderBotBanner();
      this.renderInfoPanel();
      this.showToast("Bot paused for " + durationMinutes + " minutes", "info");
    } catch (err) {
      this.showToast(err.message || "Failed to pause bot", "error");
    }
  },

  /* =====================================================
     COLUMN 3: NOTES
     ===================================================== */

  renderNotes() {
    const notes = this.state.currentNotes || "";
    this.el.notesDisplay.textContent = notes || "No notes yet";
    this.el.notesDisplay.classList.toggle("empty", !notes);
    this.el.notesTextarea.value = notes;
  },

  startEditNotes() {
    this.state.notesEditing = true;
    this.el.notesDisplayArea.classList.add("hidden");
    this.el.notesEditArea.classList.remove("hidden");
    this.el.notesTextarea.focus();
    this.el.notesTextarea.selectionStart = this.el.notesTextarea.value.length;
  },

  cancelEditNotes() {
    this.state.notesEditing = false;
    this.el.notesEditArea.classList.add("hidden");
    this.el.notesDisplayArea.classList.remove("hidden");
    this.el.notesTextarea.value = this.state.currentNotes || "";
  },

  async saveNotes() {
    const conv = this.state.current;
    if (!conv) return;
    const text = this.el.notesTextarea.value.trim();

    try {
      await saveNotes(conv.client_id, text);
      this.state.currentNotes = text;
      this.renderNotes();
      this.cancelEditNotes();
      this.showToast("Notes saved", "success");
    } catch (err) {
      this.showToast(err.message || "Failed to save notes", "error");
    }
  },

  async copyPhone() {
    const conv = this.state.current;
    if (!conv || !conv.phone) return;
    try {
      await navigator.clipboard.writeText(conv.phone);
      this.showToast("Phone copied", "success");
    } catch (err) {
      this.showToast("Failed to copy", "error");
    }
  },

  openWhatsAppLink() {
    const conv = this.state.current;
    if (!conv || !conv.phone) return;
    const phone = conv.phone.replace(/[^0-9]/g, "");
    window.open("https://wa.me/" + phone, "_blank");
  },

  /* =====================================================
     COLUMN 2: ERROR
     ===================================================== */

  showChatError(msg) {
    this.el.chatError.textContent = msg || "";
    this.el.chatError.classList.remove("hidden");
    setTimeout(() => {
      if (this.el.chatError.textContent === msg) {
        this.el.chatError.classList.add("hidden");
      }
    }, 5000);
  },

  clearChatError() {
    this.el.chatError.textContent = "";
    this.el.chatError.classList.add("hidden");
  },

  /* =====================================================
     EVENTS
     ===================================================== */

  bindEvents() {
    let debounceTimer;
    this.el.searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.state.search = this.el.searchInput.value.trim();
        this.loadConversations(true);
      }, 300);
    });

    this.el.searchInput.addEventListener("focus", () => { this.searchFocused = true; });
    this.el.searchInput.addEventListener("focusout", () => { this.searchFocused = false; });

    this.el.filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-tab");
      if (!btn) return;
      this.state.filter = btn.dataset.filter;
      this.el.filters.querySelectorAll(".filter-tab").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      this.loadConversations(true);
    });

    this.el.loadMore.addEventListener("click", () => {
      this.state.page += 1;
      this.loadConversations(false);
    });

    // Mobile: back to conversations list
    this.el.chatBackBtn.addEventListener("click", () => {
      this.el.convPage.classList.remove("mobile-view-chat");
    });

    // Bot toggle (chat header)
    this.el.botToggle.addEventListener("click", () => this.handleToggle());
    this.el.botToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.handleToggle(); }
    });

    // Bot toggle (info panel)
    this.el.infoBotToggle.addEventListener("click", () => this.handleInfoToggle());
    this.el.infoBotToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.handleInfoToggle(); }
    });

    // Info panel toggle
    this.el.infoPanelToggle.addEventListener("click", () => this.toggleInfoPanel());
    this.el.infoColClose.addEventListener("click", () => this.closeInfoPanel());

    // Pause popover
    this.el.pauseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePausePopover();
    });

    this.el.pausePopover.querySelectorAll(".pause-option").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handlePause(Number(btn.dataset.minutes));
      });
    });

    document.addEventListener("click", (e) => {
      if (!this.el.pausePopover.contains(e.target) && e.target !== this.el.pauseBtn) {
        this.closePausePopover();
      }
    });

    // Phone actions
    this.el.infoCopyPhone.addEventListener("click", () => this.copyPhone());
    this.el.infoWaLink.addEventListener("click", () => this.openWhatsAppLink());

    // Notes
    this.el.notesEditBtn.addEventListener("click", () => this.startEditNotes());
    this.el.notesCancelBtn.addEventListener("click", () => this.cancelEditNotes());
    this.el.notesSaveBtn.addEventListener("click", () => this.saveNotes());

    // Send message
    this.el.sendBtn.addEventListener("click", () => this.handleSend());
    this.el.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
  },
};

Router.register("conversations", {
  render: (container) => ConversationsPage.render(container),
  destroy: () => ConversationsPage.destroy(),
});

window.requestOpenConversation = requestOpenConversation;
