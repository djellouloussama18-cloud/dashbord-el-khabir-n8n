const state = {
  search: "",
  filter: "all",
  page: 1,
  limit: 30,
  conversations: [],
  total: 0,
  current: null,
  loading: false,
};

const el = {};

let searchFocused = false;

function cacheElements() {
  el.searchInput = document.getElementById("search-input");
  el.filters = document.getElementById("filters");
  el.convList = document.getElementById("conv-list");
  el.loadMore = document.getElementById("load-more");
  el.listStatus = document.getElementById("list-status");
  el.errorBanner = document.getElementById("error-banner");
  el.chatPlaceholder = document.getElementById("chat-placeholder");
  el.chatView = document.getElementById("chat-view");
  el.chatError = document.getElementById("chat-error");
  el.botToggle = document.getElementById("bot-toggle");
  el.customerName = document.getElementById("customer-name");
  el.customerPhone = document.getElementById("customer-phone");
  el.customerPlatform = document.getElementById("customer-platform");
  el.customerId = document.getElementById("customer-id");
  el.messages = document.getElementById("messages");
  el.notesInput = document.getElementById("notes-input");
  el.saveNotesBtn = document.getElementById("save-notes");
  el.notesStatus = document.getElementById("notes-status");
  el.statActive = document.getElementById("stat-active");
  el.statBotOff = document.getElementById("stat-bot-off");
  el.statOrders = document.getElementById("stat-orders");
}

/* ---- shared helpers ---- */

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (Number.isNaN(diffSec) || diffSec < 0) return "";
  if (diffSec < 60) return "الآن";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "أمس";
  if (day < 30) return `منذ ${day} يوم`;
  return d.toLocaleDateString("ar-DZ");
}

function truncate(text, max = 50) {
  if (!text) return "";
  const s = String(text);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function showBanner(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.classList.remove("hidden");
  setTimeout(() => {
    if (el.errorBanner.textContent === message) {
      el.errorBanner.classList.add("hidden");
    }
  }, 5000);
}

function showChatError(message) {
  el.chatError.textContent = message || "";
}

function clearChatError() {
  el.chatError.textContent = "";
}

/* ---- stats ---- */

async function loadStats(options = {}) {
  const { silent = false } = options;
  try {
    const stats = await getStats();
    el.statActive.textContent = stats.active_today;
    el.statBotOff.textContent = stats.bot_off_count;
    el.statOrders.textContent = stats.orders_today;
  } catch (err) {
    if (silent) {
      console.warn("[poll] stats:", err.message);
    } else {
      showBanner(err.message);
    }
  }
}

/* ---- conversations list ---- */

async function loadConversations(reset) {
  if (state.loading) return;
  state.loading = true;

  if (reset) {
    state.page = 1;
    if (!state.conversations.length) {
      el.listStatus.textContent = "جارٍ التحميل...";
    }
  }

  try {
    const data = await getConversations({
      search: state.search || undefined,
      filter: state.filter === "all" ? undefined : state.filter,
      page: state.page,
      limit: state.limit,
    });

    if (reset) state.conversations = [];
    state.conversations = state.conversations.concat(data.conversations);
    state.total = data.total;

    renderList();
    updatePagination();
  } catch (err) {
    showBanner(err.message);
  } finally {
    state.loading = false;
    el.listStatus.textContent = "";
  }
}

function renderList() {
  el.convList.textContent = "";
  el.convList.classList.add("loading");

  if (!state.conversations.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "لا توجد محادثات";
    el.convList.appendChild(empty);
    el.convList.classList.remove("loading");
    return;
  }

  state.conversations.forEach((conv) => {
    el.convList.appendChild(buildConversationItem(conv));
  });
  el.convList.classList.remove("loading");
}

function buildConversationItem(conv) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "conv-item";
  item._clientId = conv.client_id;
  if (state.current && state.current.client_id === conv.client_id) {
    item.classList.add("active");
  }
  item.addEventListener("click", () => openConversation(conv.client_id));

  const topRow = document.createElement("div");
  topRow.className = "conv-top";

  const name = document.createElement("span");
  name.className = "conv-name";
  name.textContent = conv.customer_name || conv.client_id;

  const badges = document.createElement("span");
  badges.className = "conv-badges";

  if (conv.needs_attention) {
    const dot = document.createElement("span");
    dot.className = "need-dot";
    dot.title = "يحتاج متابعة";
    badges.appendChild(dot);
  }
  if (conv.has_order) {
    const order = document.createElement("span");
    order.className = "order-mark";
    order.textContent = "🛒";
    order.title = "طلب مؤكد";
    badges.appendChild(order);
  }

  topRow.appendChild(name);
  topRow.appendChild(badges);

  const bottomRow = document.createElement("div");
  bottomRow.className = "conv-bottom";

  const preview = document.createElement("span");
  preview.className = "conv-preview";
  preview.textContent = truncate(conv.last_message_preview);

  const meta = document.createElement("span");
  meta.className = "conv-meta";

  const time = document.createElement("span");
  time.className = "conv-time";
  time.textContent = timeAgo(conv.last_message_at);

  const dot = document.createElement("span");
  dot.className = "bot-dot";
  dot.classList.add(conv.bot_enabled ? "on" : "off");
  dot.title = conv.bot_enabled ? "البوت شغال" : "البوت موقوف";

  meta.appendChild(time);
  meta.appendChild(dot);

  bottomRow.appendChild(preview);
  bottomRow.appendChild(meta);

  item.appendChild(topRow);
  item.appendChild(bottomRow);
  return item;
}

function updatePagination() {
  const hasMore = state.conversations.length < state.total;
  el.loadMore.classList.toggle("hidden", !hasMore);
}

function applyActiveHighlight(clientId) {
  el.convList.querySelectorAll(".conv-item").forEach((node) => {
    node.classList.toggle("active", node._clientId === clientId);
  });
}

/* ---- polling: diff-merge list ---- */

function conversationChanged(a, b) {
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
}

function mergeConversations(rows, total) {
  if (!rows.length) {
    if (state.conversations.length) {
      state.conversations = [];
      state.total = 0;
      renderList();
      updatePagination();
    }
    return;
  }

  if (!state.conversations.length) {
    state.conversations = rows;
    state.total = total;
    renderList();
    updatePagination();
    return;
  }

  const byId = new Map(rows.map((r) => [r.client_id, r]));
  const oldById = new Map(state.conversations.map((c) => [c.client_id, c]));

  el.convList.querySelectorAll(".conv-item").forEach((node) => {
    if (!byId.has(node._clientId)) node.remove();
  });

  let prevNode = null;
  rows.forEach((conv) => {
    let node = Array.from(el.convList.querySelectorAll(".conv-item")).find(
      (n) => n._clientId === conv.client_id
    );
    if (!node) {
      node = buildConversationItem(conv);
    } else if (conversationChanged(oldById.get(conv.client_id), conv)) {
      const fresh = buildConversationItem(conv);
      node.replaceWith(fresh);
      node = fresh;
    }
    if (prevNode) {
      el.convList.insertBefore(node, prevNode.nextSibling);
    } else if (el.convList.firstChild !== node) {
      el.convList.insertBefore(node, el.convList.firstChild);
    }
    prevNode = node;
  });

  while (prevNode && prevNode.nextSibling) {
    const extra = prevNode.nextSibling;
    if (extra.classList && extra.classList.contains("conv-item")) extra.remove();
    else prevNode = extra;
  }

  state.conversations = rows;
  state.total = total;
  updatePagination();
}

async function pollConversations() {
  if (state.loading || searchFocused) return;
  if (!el.searchInput) return;
  try {
    const data = await getConversations({
      search: state.search || undefined,
      filter: state.filter === "all" ? undefined : state.filter,
      page: 1,
      limit: Math.max(state.limit, state.conversations.length),
    });
    mergeConversations(data.conversations, data.total);
  } catch (err) {
    console.warn("[poll] conversations:", err.message);
  }
}

/* ---- events (list) ---- */

function bindListEvents() {
  let debounceTimer;
  el.searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = el.searchInput.value.trim();
      loadConversations(true);
    }, 300);
  });

  el.searchInput.addEventListener("focus", () => {
    searchFocused = true;
  });

  el.searchInput.addEventListener("focusout", () => {
    searchFocused = false;
  });

  el.filters.addEventListener("click", (event) => {
    const btn = event.target.closest(".filter-btn");
    if (!btn) return;
    state.filter = btn.dataset.filter;
    el.filters.querySelectorAll(".filter-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    loadConversations(true);
  });

  el.loadMore.addEventListener("click", () => {
    state.page += 1;
    loadConversations(false);
  });
}

/* ---- init ---- */

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindListEvents();
  loadStats();
  loadConversations(true);

  setInterval(pollConversations, 8000);
  setInterval(() => loadStats({ silent: true }), 15000);
});