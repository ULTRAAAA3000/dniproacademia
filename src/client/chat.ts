import { byId, api, postForm, escapeHtml, getConfig } from "./common";

interface Message {
  id: number;
  sender_id: number;
  sender_name: string;
  body: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: string | null;
  is_image: boolean;
  reply: { id: number; body: string; file_name: string | null } | null;
  is_deleted: boolean;
  is_edited: boolean;
  time: string;
  date: string;
  ts: number;
}

let chatId = 0;
let chatOtherId = 0;
let chatBlocked = false;
let chatMuted = false;
let pollTimer: number | null = null;
let lastMsgId = 0;
let fileObject: File | null = null;
let replyTo: Message | null = null;
let editId = 0;
let searchTimer: number | null = null;
const lastToastCounts: Record<number, number> = {};
const mutedChats: Record<number, boolean> = {};

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];

function initials(name: string): string {
  let safe = name;
  if (!safe) safe = "?";
  const parts = safe.trim().split(/\s+/);
  let first = "";
  if (parts[0]) first = parts[0][0];
  let second = "";
  if (parts[1]) second = parts[1][0];
  return first + second;
}

function timeAgo(seconds: number): string {
  const ms = seconds * 1000;
  let diff = Math.round((Date.now() - ms) / 1000);
  if (diff < 0) diff = 0;
  if (diff < 60) return "щойно";
  if (diff < 3600) return Math.round(diff / 60) + " хв";
  if (diff < 86400) return Math.round(diff / 3600) + " год";
  const d = new Date(ms);
  return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2);
}

function isImageName(name: string): boolean {
  let ext = "";
  if (name) ext = name.split(".").pop()!.toLowerCase();
  return IMAGE_EXTS.indexOf(ext) !== -1;
}

function fixLayout(): void {
  const wrap = byId("da-chat-wrap");
  if (!wrap) return;
  const burger = byId("da-menu-toggle");
  if (burger) burger.style.display = "none";
  const header = document.querySelector<HTMLElement>(".da-header");
  let headerHeight = 56;
  if (header) headerHeight = header.offsetHeight;
  wrap.style.position = "fixed";
  wrap.style.left = "0";
  wrap.style.right = "0";
  wrap.style.top = headerHeight + "px";
  wrap.style.bottom = "0";
  wrap.style.display = "flex";
  wrap.style.overflow = "hidden";
  wrap.style.zIndex = "100";
}

export function openChatPage(): void {
  window.location.href = window.location.pathname + "?da_view=chat";
}

async function loadList(): Promise<void> {
  const list = byId("da-chat-list");
  if (!list) return;

  const r = await api("chat_list");
  if (!r || !r.ok || !r.chats || !r.chats.length) {
    list.innerHTML = '<div class="da-chat-list-empty">Чатів ще немає.<br>Скористайтесь пошуком.</div>';
    return;
  }

  let html = "";
  for (let i = 0; i < r.chats.length; i++) {
    const ch = r.chats[i];
    mutedChats[ch.other_id] = !!ch.is_muted;

    let preview = "";
    if (ch.last_file) {
      preview = "📎 " + ch.last_file;
    } else if (ch.last_msg) {
      preview = ch.last_msg;
    }
    if (preview.length > 45) preview = preview.substr(0, 45) + "…";

    let badge = "";
    if (ch.unread > 0) badge = '<div class="da-chat-item-badge">' + ch.unread + "</div>";

    let time = "";
    if (ch.last_ts) time = timeAgo(ch.last_ts);

    let style = "";
    if (ch.is_muted) style = "opacity:0.5;";
    let active = "";
    if (chatId && ch.other_id === chatOtherId) active = " active";

    html +=
      '<div class="da-chat-item' + active + '" data-id="' + ch.other_id + '" data-name="' + escapeHtml(ch.other_name) + '" style="' + style + '">' +
      '<div class="da-chat-item-avatar">' + escapeHtml(initials(ch.other_name)) + "</div>" +
      '<div class="da-chat-item-info"><div class="da-chat-item-name">' + escapeHtml(ch.other_name) + '</div><div class="da-chat-item-preview">' + escapeHtml(preview) + "</div></div>" +
      '<div class="da-chat-item-meta"><div class="da-chat-item-time">' + time + "</div>" + badge + "</div></div>";
  }
  list.innerHTML = html;
}

function startSearch(): void {
  const input = byId("da-chat-search") as HTMLInputElement | null;
  const results = byId("da-chat-search-results");
  if (!input || !results) return;

  input.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.style.display = "none";
      results.innerHTML = "";
      return;
    }
    searchTimer = window.setTimeout(async () => {
      const r = await api("chat_search", { q: q });
      if (!r || !r.ok || !r.users || !r.users.length) {
        results.innerHTML = '<div style="padding:12px 16px;font-size:12px;color:var(--pale);">Нікого не знайдено</div>';
        results.style.display = "block";
        return;
      }
      let html = "";
      for (let i = 0; i < r.users.length; i++) {
        const u = r.users[i];
        html +=
          '<div class="da-chat-search-item" data-id="' + u.id + '" data-name="' + escapeHtml(u.name) + '">' +
          '<div class="da-chat-search-avatar">' + escapeHtml(initials(u.name)) + "</div>" +
          '<div><div class="da-chat-search-name">' + escapeHtml(u.name) + '</div><div class="da-chat-search-email">' + escapeHtml(u.email) + "</div></div></div>";
      }
      results.innerHTML = html;
      results.style.display = "block";
    }, 350);
  });

  document.addEventListener("click", (e) => {
    const target = e.target as Node;
    if (!input.contains(target) && !results.contains(target)) {
      results.style.display = "none";
    }
  });
}

function setMenuLabels(): void {
  const block = byId("da-block-label");
  if (block) block.textContent = chatBlocked ? "Розблокувати" : "Заблокувати";
  const mute = byId("da-mute-label");
  if (mute) mute.textContent = chatMuted ? "Увімкнути" : "Заглушити";
}

async function openChat(otherId: number): Promise<void> {
  const items = document.querySelectorAll(".da-chat-item");
  for (let i = 0; i < items.length; i++) items[i].classList.remove("active");
  const item = document.querySelector('.da-chat-item[data-id="' + otherId + '"]');
  if (item) item.classList.add("active");

  const messages = byId("da-chat-messages");
  if (messages) messages.innerHTML = '<div class="da-chat-msgs-loading"><span></span><span></span><span></span></div>';

  const win = byId("da-chat-window");
  const empty = byId("da-chat-empty-state");
  if (empty) empty.style.display = "none";
  if (win) win.style.display = "flex";
  byId("da-chat-main")?.classList.add("mobile-open");

  const results = byId("da-chat-search-results");
  if (results) results.style.display = "none";
  const search = byId("da-chat-search") as HTMLInputElement | null;
  if (search) search.value = "";

  const r = await api("chat_open", { other_id: otherId });
  if (!r.ok) {
    if (messages) messages.innerHTML = '<div class="da-chat-msgs-error">' + escapeHtml(r.msg || "Помилка") + "</div>";
    return;
  }

  chatId = r.chat_id;
  chatOtherId = otherId;
  chatBlocked = r.is_blocked;
  chatMuted = r.is_muted;
  mutedChats[otherId] = r.is_muted;

  const avatar = byId("da-chat-avatar");
  if (avatar) avatar.textContent = initials(r.other_name);
  const nameEl = byId("da-chat-other-name");
  if (nameEl) nameEl.textContent = r.other_name;
  setMenuLabels();

  let list: Message[] = r.messages;
  if (!list) list = [];
  renderMessages(list, true);

  if (list.length) {
    lastMsgId = list[list.length - 1].id;
  } else {
    lastMsgId = 0;
  }

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = window.setInterval(pollMessages, 4000);
}

function chatBack(): void {
  byId("da-chat-main")?.classList.remove("mobile-open");
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  chatId = 0;
}

function appear(el: HTMLElement, delay: number): void {
  el.style.opacity = "0";
  el.style.transform = "translateY(8px)";
  setTimeout(() => {
    el.style.transition = "opacity .2s ease, transform .2s ease";
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  }, delay);
}

function renderMessages(list: Message[], scroll: boolean): void {
  const container = byId("da-chat-messages");
  if (!container) return;
  container.innerHTML = "";

  let lastDate = "";
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.date !== lastDate) {
      const sep = document.createElement("div");
      sep.className = "da-msg-date-sep";
      sep.textContent = m.date;
      container.appendChild(sep);
      lastDate = m.date;
    }
    const el = buildMessage(m);
    container.appendChild(el);
    appear(el, i * 20);
  }

  if (scroll) {
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, list.length * 20 + 50);
  }
}

function iconSvg(paths: string, size: number): string {
  return (
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>"
  );
}

const ICON_REPLY = '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>';
const ICON_EDIT = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>';
const ICON_TRASH = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>';

function buildMessage(m: Message): HTMLElement {
  const myId = getConfig().user_id;
  const isMe = myId > 0 && m.sender_id === myId;

  const wrap = document.createElement("div");
  wrap.className = isMe ? "da-msg da-msg--me" : "da-msg da-msg--other";
  wrap.id = "msg-" + m.id;
  wrap.setAttribute("data-id", String(m.id));

  if (m.is_deleted) {
    const deleted = document.createElement("div");
    deleted.className = "da-msg-bubble da-msg-deleted";
    deleted.textContent = "Повідомлення видалено";
    wrap.appendChild(deleted);
    const t = document.createElement("div");
    t.className = "da-msg-time";
    t.textContent = m.time;
    wrap.appendChild(t);
    return wrap;
  }

  if (m.reply) {
    const reply = m.reply;
    const preview = document.createElement("div");
    preview.className = "da-msg-reply-preview";
    let replyText = reply.body;
    if (!replyText) {
      if (reply.file_name) {
        replyText = "📎 " + reply.file_name;
      } else {
        replyText = "Повідомлення";
      }
    }
    preview.textContent = replyText;
    preview.addEventListener("click", () => {
      const original = byId("msg-" + reply.id);
      if (original) {
        original.scrollIntoView({ behavior: "smooth", block: "center" });
        original.classList.add("da-msg-highlight");
        setTimeout(() => original.classList.remove("da-msg-highlight"), 1500);
      }
    });
    wrap.appendChild(preview);
  }

  if (m.file_path) {
    const filePath = m.file_path;
    const fileName = m.file_name;
    if (m.is_image) {
      const imgWrap = document.createElement("div");
      imgWrap.style.cssText = "max-width:260px;border-radius:12px;overflow:hidden;cursor:pointer;line-height:0;";
      const img = document.createElement("img");
      img.src = filePath;
      img.alt = fileName || "";
      img.style.cssText = "width:100%;max-width:260px;display:block;border-radius:12px;";
      img.loading = "lazy";
      img.addEventListener("click", () => openLightbox(filePath, fileName));
      imgWrap.appendChild(img);
      wrap.appendChild(imgWrap);
    } else {
      const a = document.createElement("a");
      a.href = filePath;
      a.target = "_blank";
      a.setAttribute(
        "style",
        "display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;text-decoration:none;background:#1a5c52;border:2px solid #0d3d35;min-width:160px;max-width:280px;"
      );
      let sizeLine = "";
      if (m.file_size) {
        sizeLine = '<div style="font-size:10px;color:#7ecfc4;margin-top:2px;">' + escapeHtml(m.file_size) + "</div>";
      }
      a.innerHTML =
        '<div style="width:36px;height:36px;border-radius:8px;background:#0d3d35;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7ecfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
        '<div style="min-width:0;flex:1;"><div style="font-size:12px;font-weight:700;color:#e8f5f3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        escapeHtml(fileName || "Файл") + "</div>" + sizeLine + "</div>" +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7ecfc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      wrap.appendChild(a);
    }
  }

  if (m.body) {
    const bubble = document.createElement("div");
    bubble.className = "da-msg-bubble";
    bubble.textContent = m.body;
    wrap.appendChild(bubble);
  }

  const timeLine = document.createElement("div");
  timeLine.className = "da-msg-time";
  let timeText = m.time;
  if (m.is_edited) timeText += " · змінено";
  timeLine.textContent = timeText;
  wrap.appendChild(timeLine);

  const actions = document.createElement("div");
  actions.className = "da-msg-actions";
  let side = "left:0;";
  if (isMe) side = "right:0;";
  actions.style.cssText = "display:none;position:absolute;top:-28px;" + side + "gap:3px;align-items:center;z-index:20;";

  const buttons: { icon: string; title: string; del: boolean; run: () => void }[] = [];
  buttons.push({ icon: ICON_REPLY, title: "Відповісти", del: false, run: () => setReply(m) });
  if (isMe && m.body && !m.file_path) {
    buttons.push({ icon: ICON_EDIT, title: "Редагувати", del: false, run: () => startEdit(m) });
  }
  if (isMe) {
    buttons.push({ icon: ICON_TRASH, title: "Видалити", del: true, run: () => deleteMessage(m.id) });
  }

  for (let i = 0; i < buttons.length; i++) {
    const item = buttons[i];
    const btn = document.createElement("div");
    btn.title = item.title;
    let color = "#6b8f89";
    if (item.del) color = "#c0392b";
    btn.style.cssText =
      "width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;background:#fff;border:1px solid #deecea;color:" +
      color + ";box-shadow:0 1px 4px rgba(0,0,0,.1);transition:background .15s,color .15s;flex-shrink:0;";
    btn.innerHTML = iconSvg(item.icon, 12);
    btn.addEventListener("mouseenter", () => {
      btn.style.background = item.del ? "#fdf3f2" : "#f2faf9";
      btn.style.color = item.del ? "#c0392b" : "#1a6b5e";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#fff";
      btn.style.color = item.del ? "#c0392b" : "#6b8f89";
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      item.run();
    });
    actions.appendChild(btn);
  }

  wrap.style.position = "relative";
  wrap.appendChild(actions);
  wrap.addEventListener("mouseenter", () => (actions.style.display = "flex"));
  wrap.addEventListener("mouseleave", () => (actions.style.display = "none"));

  let holdTimer: number | null = null;
  wrap.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMessageMenu(m, isMe, wrap);
  });
  wrap.addEventListener(
    "touchstart",
    () => {
      holdTimer = window.setTimeout(() => showMessageMenu(m, isMe, wrap), 500);
    },
    { passive: true }
  );
  wrap.addEventListener("touchend", () => {
    if (holdTimer) clearTimeout(holdTimer);
  });
  wrap.addEventListener("touchmove", () => {
    if (holdTimer) clearTimeout(holdTimer);
  });

  return wrap;
}

function showMessageMenu(m: Message, isMe: boolean, wrap: HTMLElement): void {
  const old = document.querySelectorAll(".da-msg-ctx-menu");
  for (let i = 0; i < old.length; i++) old[i].remove();

  const menu = document.createElement("div");
  menu.className = "da-msg-ctx-menu";

  const items: { icon: string; label: string; del: boolean; run: () => void }[] = [];
  items.push({ icon: ICON_REPLY, label: "Відповісти", del: false, run: () => setReply(m) });
  if (isMe && m.body && !m.file_path) {
    items.push({ icon: ICON_EDIT, label: "Редагувати", del: false, run: () => startEdit(m) });
  }
  if (isMe) {
    items.push({ icon: ICON_TRASH, label: "Видалити", del: true, run: () => deleteMessage(m.id) });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = document.createElement("div");
    if (item.del) row.className = "da-msg-ctx-del";
    row.innerHTML = iconSvg(item.icon, 13) + " " + item.label;
    row.addEventListener("click", () => {
      menu.remove();
      item.run();
    });
    menu.appendChild(row);
  }

  const rect = wrap.getBoundingClientRect();
  let left = rect.left;
  if (isMe) left = Math.max(8, rect.right - 168);
  left = Math.min(left, window.innerWidth - 175);
  menu.style.cssText = "position:fixed;top:" + (rect.bottom + 4) + "px;left:" + left + "px;z-index:9999;";
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 50);
}

function makeBar(id: string): HTMLElement {
  let bar = byId(id);
  if (!bar) {
    bar = document.createElement("div");
    bar.id = id;
    bar.className = "da-chat-reply-bar";
    const inputBar = document.querySelector(".da-chat-input-bar") as HTMLElement;
    inputBar.parentNode!.insertBefore(bar, inputBar);
  }
  return bar;
}

function setReply(m: Message): void {
  replyTo = m;
  const bar = makeBar("da-chat-reply-bar");
  let text = m.body;
  if (!text) text = "📎 " + (m.file_name || "");
  text = text.substr(0, 60);
  bar.innerHTML =
    '<div class="da-reply-preview">' + iconSvg(ICON_REPLY, 12) + " " + escapeHtml(text) + '</div><div class="da-reply-close" id="da-reply-close">×</div>';
  bar.style.display = "flex";
  const close = byId("da-reply-close");
  if (close) close.addEventListener("click", cancelReply);
  const ta = byId("da-chat-textarea");
  if (ta) ta.focus();
}

function cancelReply(): void {
  replyTo = null;
  const bar = byId("da-chat-reply-bar");
  if (bar) {
    bar.style.display = "none";
    bar.innerHTML = "";
  }
}

function startEdit(m: Message): void {
  editId = m.id;
  const ta = byId("da-chat-textarea") as HTMLTextAreaElement;
  ta.value = m.body || "";
  ta.focus();
  const bar = makeBar("da-chat-edit-bar");
  bar.innerHTML = '<div class="da-reply-preview">✏️ Редагування повідомлення</div><div class="da-reply-close" id="da-edit-close">×</div>';
  bar.style.display = "flex";
  const close = byId("da-edit-close");
  if (close) close.addEventListener("click", cancelEdit);
}

function cancelEdit(): void {
  editId = 0;
  const bar = byId("da-chat-edit-bar");
  if (bar) bar.style.display = "none";
  const ta = byId("da-chat-textarea") as HTMLTextAreaElement;
  ta.value = "";
}

async function deleteMessage(id: number): Promise<void> {
  if (!confirm("Видалити повідомлення?")) return;
  const r = await api("chat_delete_msg", { msg_id: id });
  if (r.ok) {
    const el = byId("msg-" + id);
    if (el) el.innerHTML = '<div class="da-msg-bubble da-msg-deleted">Повідомлення видалено</div>';
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

async function shrinkImage(file: File): Promise<File> {
  const ext = file.name.split(".").pop()!.toLowerCase();
  if (ext !== "jpg" && ext !== "jpeg" && ext !== "png" && ext !== "webp") return file;
  try {
    const img = await loadImage(file);
    const maxSide = 1920;
    let width = img.width;
    let height = img.height;
    if (width <= maxSide && height <= maxSide && file.size < 1048576) return file;
    if (width > maxSide || height > maxSide) {
      const scale = maxSide / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (e) {
    return file;
  }
}

async function sendMessage(): Promise<void> {
  if (!chatId) return;
  const ta = byId("da-chat-textarea") as HTMLTextAreaElement;
  const body = ta.value.trim();

  if (editId) {
    if (!body) return;
    const editing = editId;
    const r = await api("chat_edit_msg", { msg_id: editing, body: body });
    if (r.ok) {
      const el = byId("msg-" + editing);
      if (el) {
        const bubble = el.querySelector(".da-msg-bubble");
        if (bubble) bubble.textContent = body;
        const timeLine = el.querySelector(".da-msg-time");
        if (timeLine && (timeLine.textContent || "").indexOf("змінено") === -1) {
          timeLine.textContent = timeLine.textContent + " · змінено";
        }
      }
      cancelEdit();
    }
    return;
  }

  if (!body && !fileObject) return;

  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (body) form.append("body", body);
  if (fileObject) form.append("file", fileObject);
  if (replyTo) form.append("reply_to", String(replyTo.id));

  ta.value = "";
  ta.style.height = "auto";
  clearFile();
  cancelReply();
  const picker = byId("da-emoji-picker");
  if (picker) picker.style.display = "none";

  const r = await postForm("/api/chat_send", form);
  if (r.ok) {
    const container = byId("da-chat-messages") as HTMLElement;
    const el = buildMessage(r.msg);
    container.appendChild(el);
    appear(el, 10);
    container.scrollTop = container.scrollHeight;
    if (r.msg.id > lastMsgId) lastMsgId = r.msg.id;
    loadList();
  } else {
    alert(r.msg || "Помилка");
  }
}

async function pollMessages(): Promise<void> {
  if (!chatId) return;
  if (document.hidden) return;

  const r = await api("chat_messages", { chat_id: chatId, before_id: 0 });
  if (!r.ok || !r.messages) return;

  const container = byId("da-chat-messages");
  if (!container) return;

  const fresh: Message[] = [];
  for (let i = 0; i < r.messages.length; i++) {
    if (r.messages[i].id > lastMsgId) fresh.push(r.messages[i]);
  }
  if (!fresh.length) return;

  const wasBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 30;
  for (let i = 0; i < fresh.length; i++) {
    const el = buildMessage(fresh[i]);
    container.appendChild(el);
    appear(el, 10);
    if (fresh[i].id > lastMsgId) lastMsgId = fresh[i].id;
  }
  if (wasBottom) container.scrollTop = container.scrollHeight;

  api("chat_read", { chat_id: chatId });
  loadList();
}

async function fileSelected(input: HTMLInputElement): Promise<void> {
  let file = input.files ? input.files[0] : null;
  if (!file) return;

  const maxMb = getConfig().max_file_mb;
  if (isImageName(file.name)) file = await shrinkImage(file);

  if (file.size > maxMb * 1024 * 1024) {
    alert("Файл більше " + maxMb + " МБ");
    input.value = "";
    return;
  }

  fileObject = file;
  const preview = byId("da-chat-file-preview") as HTMLElement;
  preview.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f2faf9;border-radius:8px;border:1px solid #deecea;margin-bottom:6px;";

  const nameSpan =
    '<span style="font-size:12px;color:#555;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(file.name) + "</span>";
  const closeSpan = '<span id="da-file-clear" style="cursor:pointer;color:#c0392b;font-size:18px;line-height:1;flex-shrink:0;">×</span>';

  if (isImageName(file.name)) {
    const reader = new FileReader();
    reader.onload = () => {
      preview.innerHTML =
        '<img src="' + reader.result + '" style="width:56px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0;">' + nameSpan + closeSpan;
      byId("da-file-clear")?.addEventListener("click", clearFile);
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a7a4a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      nameSpan + closeSpan;
    byId("da-file-clear")?.addEventListener("click", clearFile);
  }
}

function clearFile(): void {
  fileObject = null;
  const preview = byId("da-chat-file-preview");
  if (preview) {
    preview.style.display = "none";
    preview.innerHTML = "";
  }
  const a = byId("da-chat-file") as HTMLInputElement | null;
  if (a) a.value = "";
  const b = byId("da-chat-photo") as HTMLInputElement | null;
  if (b) b.value = "";
}

function toggleEmoji(): void {
  const picker = byId("da-emoji-picker");
  if (!picker) return;
  if (picker.style.display === "none" || !picker.style.display) {
    picker.style.display = "flex";
  } else {
    picker.style.display = "none";
  }
}

function insertEmoji(emoji: string): void {
  const ta = byId("da-chat-textarea") as HTMLTextAreaElement;
  let pos = ta.selectionStart;
  if (!pos) pos = ta.value.length;
  ta.value = ta.value.slice(0, pos) + emoji + ta.value.slice(pos);
  ta.focus();
}

function toggleMenu(): void {
  const dropdown = byId("da-chat-menu-dropdown");
  if (!dropdown) return;
  if (dropdown.style.display === "none" || !dropdown.style.display) {
    dropdown.style.display = "block";
  } else {
    dropdown.style.display = "none";
  }
}

function closeMenu(): void {
  const dropdown = byId("da-chat-menu-dropdown");
  if (dropdown) dropdown.style.display = "none";
}

function blockChat(): void {
  closeMenu();
  chatBlocked = !chatBlocked;
  api("chat_setting", { other_id: chatOtherId, field: "is_blocked", value: chatBlocked ? 1 : 0 });
  setMenuLabels();
}

function muteChat(): void {
  closeMenu();
  chatMuted = !chatMuted;
  mutedChats[chatOtherId] = chatMuted;
  api("chat_setting", { other_id: chatOtherId, field: "is_muted", value: chatMuted ? 1 : 0 });
  setMenuLabels();
  const item = document.querySelector<HTMLElement>('.da-chat-item[data-id="' + chatOtherId + '"]');
  if (item) item.style.opacity = chatMuted ? "0.5" : "1";
}

async function clearChat(): Promise<void> {
  closeMenu();
  if (!confirm("Очистити всі повідомлення?")) return;
  const r = await api("chat_clear", { chat_id: chatId });
  if (r.ok) {
    const container = byId("da-chat-messages");
    if (container) container.innerHTML = "";
    loadList();
  }
}

function updateHeaderBadge(count: number): void {
  const btn = byId("da-chat-btn");
  if (!btn) return;
  const existing = btn.querySelector(".da-notif-badge");
  if (count > 0) {
    if (existing) {
      existing.textContent = String(count);
    } else {
      const badge = document.createElement("span");
      badge.className = "da-notif-badge";
      badge.textContent = String(count);
      badge.style.cssText =
        "position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;background:#c0392b;color:#fff;border-radius:100px;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;pointer-events:none;";
      btn.appendChild(badge);
    }
  } else if (existing) {
    existing.remove();
  }
}

function showToast(name: string, text: string, otherId: number): void {
  if (chatId && chatOtherId === otherId) return;

  const old = byId("da-chat-toast-" + otherId);
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.id = "da-chat-toast-" + otherId;
  toast.setAttribute(
    "style",
    "position:fixed;bottom:24px;right:24px;z-index:99999;background:#1a6b5e;color:#fff;border-radius:14px;padding:12px 16px;max-width:300px;min-width:220px;box-shadow:0 4px 24px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;cursor:pointer;transform:translateY(100px);opacity:0;transition:transform .32s cubic-bezier(.16,1,.3,1),opacity .32s ease;"
  );
  toast.innerHTML =
    '<div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">' +
    escapeHtml(initials(name)) + "</div>" +
    '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;margin-bottom:2px;">' + escapeHtml(name) +
    '</div><div style="font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(text) + "</div></div>" +
    '<div class="da-toast-x" style="font-size:20px;line-height:1;opacity:.6;flex-shrink:0;padding:0 4px;">×</div>';

  const closeBtn = toast.querySelector(".da-toast-x") as HTMLElement;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toast.remove();
  });
  toast.addEventListener("click", () => {
    toast.remove();
    if (byId("da-chat-wrap")) {
      openChat(otherId);
    } else {
      window.location.href = "/da-cabinet?da_view=chat";
    }
  });

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  }, 30);
  setTimeout(() => {
    if (!toast.parentNode) return;
    toast.style.transform = "translateY(100px)";
    toast.style.opacity = "0";
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 400);
  }, 5000);
}

async function pollGlobal(): Promise<void> {
  if (document.hidden) return;
  const r = await api("chat_list");
  if (!r || !r.ok || !r.chats) return;

  let total = 0;
  for (let i = 0; i < r.chats.length; i++) {
    const ch = r.chats[i];
    let unread = parseInt(ch.unread, 10);
    if (isNaN(unread)) unread = 0;
    total += unread;

    let previous = lastToastCounts[ch.other_id];
    if (previous === undefined) previous = 0;

    if (unread > previous && !mutedChats[ch.other_id]) {
      let preview = "Нове повідомлення";
      if (ch.last_msg) {
        preview = ch.last_msg.substr(0, 60);
      } else if (ch.last_file) {
        preview = ch.last_file;
      }
      showToast(ch.other_name, preview, ch.other_id);
    }
    lastToastCounts[ch.other_id] = unread;
  }
  updateHeaderBadge(total);
}

function openLightbox(src: string, name: string | null): void {
  let box = byId("da-chat-lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "da-chat-lightbox";
    box.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;";
    box.innerHTML =
      '<div style="position:absolute;top:16px;right:20px;display:flex;gap:12px;align-items:center;">' +
      '<a id="da-lb-download" download style="color:#fff;font-size:12px;text-decoration:none;padding:5px 12px;background:rgba(255,255,255,.15);border-radius:6px;">Завантажити</a>' +
      '<span id="da-lb-close" style="color:#fff;font-size:28px;line-height:1;cursor:pointer;">×</span></div>' +
      '<img id="da-lb-img" style="max-width:92vw;max-height:88vh;border-radius:8px;object-fit:contain;cursor:default;">';
    document.body.appendChild(box);
    const lightbox = box;
    lightbox.addEventListener("click", () => (lightbox.style.display = "none"));
    (byId("da-lb-img") as HTMLElement).addEventListener("click", (e) => e.stopPropagation());
    (byId("da-lb-close") as HTMLElement).addEventListener("click", (e) => {
      e.stopPropagation();
      lightbox.style.display = "none";
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") lightbox.style.display = "none";
    });
  }
  (byId("da-lb-img") as HTMLImageElement).src = src;
  const download = byId("da-lb-download") as HTMLAnchorElement;
  download.href = src;
  download.download = name || "image";
  box.style.display = "flex";
}

export function startChat(): void {
  setTimeout(async () => {
    const r = await api("chat_list");
    if (r && r.ok && r.chats) {
      let total = 0;
      for (let i = 0; i < r.chats.length; i++) {
        const ch = r.chats[i];
        let unread = parseInt(ch.unread, 10);
        if (isNaN(unread)) unread = 0;
        total += unread;
        lastToastCounts[ch.other_id] = unread;
        mutedChats[ch.other_id] = !!ch.is_muted;
      }
      updateHeaderBadge(total);
    }
    setInterval(pollGlobal, 15000);
  }, 2000);

  if (!byId("da-chat-wrap")) return;

  startSearch();

  const ta = byId("da-chat-textarea") as HTMLTextAreaElement | null;
  if (ta) {
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  loadList();
  fixLayout();
  window.addEventListener("resize", fixLayout);

  const fileInput = byId("da-chat-file") as HTMLInputElement | null;
  if (fileInput) fileInput.addEventListener("change", () => fileSelected(fileInput));
  const photoInput = byId("da-chat-photo") as HTMLInputElement | null;
  if (photoInput) photoInput.addEventListener("change", () => fileSelected(photoInput));

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (!target.closest(".da-chat-topbar-right")) closeMenu();
    if (!target.closest(".da-emoji-picker") && !target.closest(".da-chat-input-btn")) {
      const picker = byId("da-emoji-picker");
      if (picker) picker.style.display = "none";
    }

    const chatItem = target.closest<HTMLElement>(".da-chat-item");
    if (chatItem) {
      openChat(parseInt(chatItem.dataset.id || "0", 10));
      return;
    }
    const searchItem = target.closest<HTMLElement>(".da-chat-search-item");
    if (searchItem) {
      openChat(parseInt(searchItem.dataset.id || "0", 10));
      return;
    }
    const emoji = target.closest<HTMLElement>("[data-emoji]");
    if (emoji) {
      insertEmoji(emoji.dataset.emoji || "");
      return;
    }

    const actionEl = target.closest<HTMLElement>("[data-act]");
    if (!actionEl) return;
    const act = actionEl.dataset.act;
    if (act === "chat-back") chatBack();
    if (act === "chat-menu") toggleMenu();
    if (act === "chat-block") blockChat();
    if (act === "chat-mute") muteChat();
    if (act === "chat-clear") clearChat();
    if (act === "chat-emoji") toggleEmoji();
    if (act === "chat-send") sendMessage();
  });
}
