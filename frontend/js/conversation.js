/* ---- shared helpers (chat) ---- */

function fmtClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" });
}

/* ---- open conversation ---- */

let chatPollTimer = null;

async function openConversation(clientId) {
  clearChatPollTimer();
  applyActiveHighlight(clientId);
  showChatLoading();
  clearChatError();

  try {
    const detail = await getConversation(clientId);
    state.current = detail.conversation;
    renderChat();
    renderMessages(detail.messages);
    startChatPolling();
  } catch (err) {
    showChatError(err.message);
    if (!state.current) {
      showChatPlaceholder("تعذر تحميل المحادثة");
    }
  }
}

function startChatPolling() {
  clearChatPollTimer();
  chatPollTimer = setInterval(pollOpenConversation, 5000);
}

function clearChatPollTimer() {
  if (chatPollTimer !== null) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

async function pollOpenConversation() {
  const conv = state.current;
  if (!conv) return;
  try {
    const detail = await getConversation(conv.client_id);
    if (state.current !== conv) return;

    if (detail.conversation.bot_enabled !== conv.bot_enabled) {
      conv.bot_enabled = detail.conversation.bot_enabled;
      applyToggleUI(conv.bot_enabled);
      refreshItemStatusInList(conv.client_id, conv);
    }

    const nearBottom =
      el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight < 40;
    syncMessages(detail.messages, nearBottom);
  } catch (err) {
    console.warn("[poll] conversation:", err.message);
  }
}

function showChatLoading() {
  el.chatView.classList.add("hidden");
  el.chatPlaceholder.textContent = "جارٍ تحميل المحادثة...";
  el.chatPlaceholder.classList.remove("hidden");
}

function showChatPlaceholder(message) {
  el.chatPlaceholder.textContent = message || "اختر محادثة من القائمة";
  el.chatPlaceholder.classList.remove("hidden");
  el.chatView.classList.add("hidden");
}

function renderChat() {
  const conv = state.current;

  el.chatPlaceholder.classList.add("hidden");
  el.chatView.classList.remove("hidden");

  el.customerName.textContent = conv.customer_name || conv.client_id;
  el.customerPhone.textContent = conv.phone || "بلا هاتف";
  el.customerPlatform.textContent = conv.platform || "غير معروف";
  el.customerId.textContent = conv.client_id;

  el.notesInput.value = conv.notes || "";
  clearNotesStatus();

  applyToggleUI(conv.bot_enabled);
}

function applyToggleUI(enabled) {
  el.botToggle.classList.toggle("on", !!enabled);
  el.botToggle.classList.toggle("off", !enabled);
  el.botToggle.textContent = enabled ? "البوت شغال" : "البوت موقوف";
}

function renderMessages(messages) {
  el.messages.textContent = "";
  if (!messages || !messages.length) {
    const empty = document.createElement("div");
    empty.className = "msg-empty";
    empty.textContent = "لا توجد رسائل بعد";
    el.messages.appendChild(empty);
    return;
  }

  appendMessageBubbles(messages);
  el.messages.scrollTop = el.messages.scrollHeight;
}

function appendMessageBubbles(messages) {
  messages.forEach((msg) => {
    const rawUrl = (msg.message_text || "").trim();
    let type = (msg.message_type || "text").toLowerCase();

    // Auto-detect media type if marked as text but text is a media URL
    if (type === "text" && rawUrl.startsWith("http")) {
      const cleanUrl = rawUrl.split("?")[0].toLowerCase();
      if (cleanUrl.endsWith(".mp3") || cleanUrl.endsWith(".ogg") || cleanUrl.endsWith(".wav") || cleanUrl.endsWith(".m4a")) {
        type = "audio";
      } else if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg") || cleanUrl.endsWith(".png") || cleanUrl.endsWith(".webp") || cleanUrl.endsWith(".gif")) {
        type = "image";
      } else if (cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".webm") || cleanUrl.endsWith(".mov")) {
        type = "video";
      }
    }

    // Skip empty text or null bubbles completely
    if (!rawUrl) {
      return;
    }

    const isMedia = (type === "image" || type === "audio" || type === "voice" || type === "video");
    const bubble = document.createElement("div");
    let bubbleClass = "msg " + (msg.direction === "inbound" ? "inbound" : "outbound");
    if (isMedia) bubbleClass += " msg-media-bubble";
    bubble.className = bubbleClass;

    const content = document.createElement("div");
    content.className = "msg-text";

    if (type === "image") {
      const link = document.createElement("a");
      link.href = rawUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.display = "block";

      const img = document.createElement("img");
      img.className = "msg-media msg-img";
      img.src = rawUrl;
      img.alt = "معاينة الصورة";
      img.loading = "eager";
      img.referrerPolicy = "no-referrer";

      img.onerror = () => {
        img.style.display = "none";
        const fallbackText = document.createElement("span");
        fallbackText.className = "msg-media-link";
        fallbackText.textContent = "🖼️ فتح الصورة في تبويب جديد";
        link.appendChild(fallbackText);
      };

      link.appendChild(img);
      content.appendChild(link);
    } else if (type === "audio" || type === "voice") {
      const audio = document.createElement("audio");
      audio.className = "msg-media msg-audio";
      audio.controls = true;
      audio.preload = "metadata";
      audio.src = rawUrl;
      content.appendChild(audio);
    } else if (type === "video") {
      const video = document.createElement("video");
      video.className = "msg-media msg-video";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = rawUrl;

      const vLink = document.createElement("a");
      vLink.href = rawUrl;
      vLink.target = "_blank";
      vLink.rel = "noopener noreferrer";
      vLink.className = "msg-media-link";
      vLink.textContent = "🎬 مشاهدة الفيديو في تبويب جديد";

      video.onerror = () => {
        video.style.display = "none";
      };

      content.appendChild(video);
      content.appendChild(vLink);
    } else {
      content.textContent = rawUrl;
    }

    bubble.appendChild(content);
    const time = document.createElement("div");
    time.className = "msg-time";
    time.textContent = fmtClock(msg.created_at);

    bubble.appendChild(time);
    el.messages.appendChild(bubble);
  });
}

function syncMessages(messages, nearBottom) {
  const oldCount = el.messages.querySelectorAll(".msg").length;
  const newCount = messages ? messages.length : 0;

  if (newCount < oldCount) {
    renderMessages(messages);
    return;
  }
  if (newCount === oldCount) return;

  appendMessageBubbles(messages.slice(oldCount));
  if (nearBottom) {
    el.messages.scrollTop = el.messages.scrollHeight;
  }
}

/* ---- toggle (optimistic) ---- */

async function handleToggle() {
  const conv = state.current;
  if (!conv || el.botToggle.disabled) return;

  const target = !conv.bot_enabled;
  el.botToggle.disabled = true;
  applyToggleUI(target);

  try {
    const updated = await toggleBot(conv.client_id, target);
    conv.bot_enabled = updated.bot_enabled;
    applyToggleUI(conv.bot_enabled);
    refreshItemStatusInList(conv.client_id, conv);
  } catch (err) {
    applyToggleUI(!target);
    showChatError(err.message || "فشل تحديث حالة البوت");
  } finally {
    el.botToggle.disabled = false;
  }
}

function refreshItemStatusInList(clientId, conv) {
  el.convList.querySelectorAll(".conv-item").forEach((node) => {
    if (node._clientId !== clientId) return;
    const dot = node.querySelector(".bot-dot");
    if (dot) {
      dot.classList.toggle("on", !!conv.bot_enabled);
      dot.classList.toggle("off", !conv.bot_enabled);
      dot.title = conv.bot_enabled ? "البوت شغال" : "البوت موقوف";
    }
  });
}

/* ---- notes ---- */

function clearNotesStatus() {
  el.notesStatus.textContent = "";
}

async function handleSaveNotes() {
  const conv = state.current;
  if (!conv) return;

  const notes = el.notesInput.value;
  if (notes.length > 2000) {
    el.notesStatus.textContent = "الملاحظة أطول من 2000 حرف";
    return;
  }

  el.saveNotesBtn.disabled = true;
  try {
    const updated = await saveNotes(conv.client_id, notes);
    conv.notes = updated.notes;
    el.notesStatus.textContent = "تم الحفظ ✓";
    setTimeout(() => {
      clearNotesStatus();
    }, 2000);
  } catch (err) {
    el.notesStatus.textContent = err.message || "فشل حفظ الملاحظة";
  } finally {
    el.saveNotesBtn.disabled = false;
  }
}

/* ---- events (chat) ---- */

function bindChatEvents() {
  el.botToggle.addEventListener("click", handleToggle);
  el.saveNotesBtn.addEventListener("click", handleSaveNotes);
  el.notesInput.addEventListener("input", clearNotesStatus);
}

document.addEventListener("DOMContentLoaded", bindChatEvents);