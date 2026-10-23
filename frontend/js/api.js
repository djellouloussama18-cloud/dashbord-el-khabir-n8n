function getToken() {
  return typeof Auth !== "undefined" ? Auth.getToken() : null;
}

async function apiFetch(path, options = {}) {
  const { headers, body, ...rest } = options;
  const finalHeaders = { ...(headers || {}) };

  // المصادقة عبر JWT Bearer token (من localStorage بعد تسجيل الدخول)
  const token = getToken();
  if (token) {
    finalHeaders["Authorization"] = "Bearer " + token;
  }
  if (body) {
    finalHeaders["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(BACKEND_URL + path, {
      ...rest,
      headers: finalHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error("تعذر الاتصال بالخادم. تحقق من تشغيل الـ backend.");
  }

  if (res.status === 401) {
    // الجلسة انتهت أو التوكن تلاعب فيه → نمسحه ونرجع لشاشة الدخول فورًا
    if (typeof Auth !== "undefined") {
      Auth.handleUnauthorized();
    }
    throw new Error("انتهت الجلسة. أعد تسجيل الدخول.");
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }

  if (!res.ok) {
    const error = new Error((data && data.error) || `خطأ غير متوقع (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

function buildQueryString(params = {}) {
  const sp = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const getConversations = (params = {}) =>
  apiFetch("/api/conversations" + buildQueryString(params));

const getConversation = (id) =>
  apiFetch("/api/conversations/" + encodeURIComponent(id));

const getStats = () => apiFetch("/api/stats");

const getOverviewActivity = () => apiFetch("/api/stats");

const getAnalytics = (params = {}) =>
  apiFetch("/api/analytics" + buildQueryString(params));

const getContacts = (params = {}) =>
  apiFetch("/api/contacts" + buildQueryString(params));

const getContactStates = () => apiFetch("/api/contacts/states");

const getOrders = (params = {}) =>
  apiFetch("/api/orders" + buildQueryString(params));

const getOrderStatuses = () => apiFetch("/api/orders/statuses");

const getOrderStats = () => apiFetch("/api/orders/stats");

const updateOrderStatus = (orderNumber, status) =>
  apiFetch(`/api/orders/${encodeURIComponent(orderNumber)}/status`, {
    method: "PATCH",
    body: { status },
  });

const toggleBot = (id, enabled, changedBy = "admin") =>
  apiFetch(`/api/conversations/${encodeURIComponent(id)}/toggle`, {
    method: "POST",
    body: { enabled, changed_by: changedBy || "admin" },
  });

const saveNotes = (id, notes) =>
  apiFetch(`/api/conversations/${encodeURIComponent(id)}/notes`, {
    method: "POST",
    body: { notes },
  });

const replyMessage = (id, text) =>
  apiFetch(`/api/conversations/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    body: { text },
  });

const pauseBot = (id, durationMinutes) =>
  apiFetch(`/api/conversations/${encodeURIComponent(id)}/pause`, {
    method: "POST",
    body: { duration_minutes: durationMinutes },
  });

const getOrder = (id) =>
  apiFetch(`/api/conversations/${encodeURIComponent(id)}/order`);

/* =====================================================
   POSTS — المنشورات (bot_posts + keywords + comments + hits)
   ===================================================== */

const getPostsSummary = (platform = "facebook") =>
  apiFetch("/api/posts/summary" + buildQueryString({ platform }));

const listPosts = (params = {}) =>
  apiFetch("/api/posts" + buildQueryString(params));

/** رسالة الخاص اختيارية: الفارغ يُرسل null بدل سلسلة فارغة/مسافات. */
function withOptionalDmMessage(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  if (Object.prototype.hasOwnProperty.call(next, "dm_message")) {
    const value = typeof next.dm_message === "string" ? next.dm_message.trim() : "";
    next.dm_message = value || null;
  }
  if (next.first_keyword && typeof next.first_keyword === "object") {
    const firstKeyword = { ...next.first_keyword };
    if (Object.prototype.hasOwnProperty.call(firstKeyword, "dm_message")) {
      const value =
        typeof firstKeyword.dm_message === "string" ? firstKeyword.dm_message.trim() : "";
      firstKeyword.dm_message = value || null;
    }
    next.first_keyword = firstKeyword;
  }
  return next;
}

const createPost = (body) =>
  apiFetch("/api/posts", { method: "POST", body: withOptionalDmMessage(body) });

const getPost = (id) => apiFetch("/api/posts/" + encodeURIComponent(id));

const updatePost = (id, body) =>
  apiFetch("/api/posts/" + encodeURIComponent(id), { method: "PATCH", body });

const deletePost = (id) =>
  apiFetch("/api/posts/" + encodeURIComponent(id), { method: "DELETE" });

const createKeyword = (postId, body) =>
  apiFetch(`/api/posts/${encodeURIComponent(postId)}/keywords`, {
    method: "POST",
    body: withOptionalDmMessage(body),
  });

const updateKeyword = (keywordId, body) =>
  apiFetch(`/api/posts/keywords/${encodeURIComponent(keywordId)}`, {
    method: "PATCH",
    body: withOptionalDmMessage(body),
  });

const deleteKeyword = (keywordId) =>
  apiFetch(`/api/posts/keywords/${encodeURIComponent(keywordId)}`, {
    method: "DELETE",
  });

const listPostComments = (postId, params = {}) =>
  apiFetch(
    `/api/posts/${encodeURIComponent(postId)}/comments` + buildQueryString(params)
  );

const listPostHits = (postId, params = {}) =>
  apiFetch(
    `/api/posts/${encodeURIComponent(postId)}/hits` + buildQueryString(params)
  );

const getNextPostVariant = (postId) =>
  apiFetch(`/api/posts/${encodeURIComponent(postId)}/next-variant`, {
    method: 'POST',
  });

const checkMediaLink = (url, type) =>
  apiFetch("/api/media/check", {
    method: "POST",
    body: { url, type },
  });

const getMediaUploadAvailability = () => apiFetch("/api/media/upload-availability");

/* رفع ملف وسائط: multipart/form-data — لا نرسل Content-Type يدويًا (الحدود يحدّدها المتصفح). */
const uploadMedia = async (file) => {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(BACKEND_URL + "/api/media/upload", {
    method: "POST",
    headers,
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "تعذّر رفع الملف");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

