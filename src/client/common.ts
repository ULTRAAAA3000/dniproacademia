export function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function inputValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!el) return "";
  return el.value;
}

export function setValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (el) el.value = value;
}

export function escapeHtml(text: unknown): string {
  let s = "";
  if (text !== null && text !== undefined) s = String(text);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function gradeColor(grade: number): string {
  const colors: Record<number, string> = {
    1: "#c0392b", 2: "#e67e22", 3: "#f39c12", 4: "#f39c12", 5: "#f39c12", 6: "#27ae60",
    7: "#27ae60", 8: "#16a085", 9: "#16a085", 10: "#2980b9", 11: "#8e44ad", 12: "#6c3483",
  };
  const color = colors[grade];
  if (!color) return "#16a085";
  return color;
}

export async function post(url: string, data: Record<string, string | number>): Promise<any> {
  const form = new FormData();
  for (const key in data) {
    form.append(key, String(data[key]));
  }
  return await postForm(url, form);
}

export async function postForm(url: string, form: FormData): Promise<any> {
  try {
    const res = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
    return await res.json();
  } catch (e) {
    return { ok: false, msg: "Помилка з'єднання. Спробуйте ще раз." };
  }
}

export function api(action: string, data: Record<string, string | number> = {}): Promise<any> {
  return post("/api/" + action, data);
}

export function showAlert(el: HTMLElement | null, msg: string, ok = false): void {
  if (!el) return;
  el.classList.remove("da-alert--success", "da-alert--error");
  if (ok) {
    el.classList.add("da-alert--success");
  } else {
    el.classList.add("da-alert--error");
  }
  el.textContent = msg;
  el.style.display = "block";
}

export function hide(el: HTMLElement | null): void {
  if (el) el.style.display = "none";
}

export function setLoading(btn: HTMLElement | null, on: boolean): void {
  if (!btn) return;
  const text = btn.querySelector<HTMLElement>(".da-btn-text");
  const spinner = btn.querySelector<HTMLElement>(".da-spinner");
  if (text) text.style.display = on ? "none" : "";
  if (spinner) spinner.style.display = on ? "inline-block" : "none";
  (btn as HTMLButtonElement).disabled = on;
}

export function openModal(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.style.opacity = "0";
  el.style.display = "flex";
  setTimeout(() => {
    el.style.transition = "opacity .18s";
    el.style.opacity = "1";
  }, 10);
}

export function closeModal(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.style.transition = "opacity .18s";
  el.style.opacity = "0";
  setTimeout(() => {
    el.style.display = "none";
  }, 180);
}

export function removeSmoothly(el: HTMLElement | null): void {
  if (!el) return;
  el.style.transition = "opacity .25s";
  el.style.opacity = "0";
  setTimeout(() => {
    el.remove();
  }, 260);
}

export function getConfig(): { user_id: number; max_file_mb: number } {
  const el = document.getElementById("da-config");
  if (!el) return { user_id: 0, max_file_mb: 15 };
  try {
    return JSON.parse(el.getAttribute("data-config") || "{}");
  } catch (e) {
    return { user_id: 0, max_file_mb: 15 };
  }
}

export function storageKey(name: string): string {
  return "da_u" + getConfig().user_id + "_" + name;
}

export function saveSetting(name: string, value: string): void {
  localStorage.setItem(storageKey(name), value);
}

export function loadSetting(name: string, fallback: string): string {
  const value = localStorage.getItem(storageKey(name));
  if (value === null) return fallback;
  return value;
}

export function deleteSetting(name: string): void {
  localStorage.removeItem(storageKey(name));
}

export function formatDateTime(date: Date): string {
  const is12 = loadSetting("timefmt", "24") === "12";
  const hours = date.getHours();
  const minutes = ("0" + date.getMinutes()).slice(-2);
  const day = ("0" + date.getDate()).slice(-2);
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();

  if (is12) {
    let ampm = "AM";
    if (hours >= 12) ampm = "PM";
    let h12 = hours % 12;
    if (h12 === 0) h12 = 12;
    return day + "." + month + "." + year + " " + h12 + ":" + minutes + " " + ampm;
  }
  return day + "." + month + "." + year + " " + ("0" + hours).slice(-2) + ":" + minutes;
}

export function formatClock(date: Date): string {
  const is12 = loadSetting("timefmt", "24") === "12";
  const hours = date.getHours();
  const minutes = ("0" + date.getMinutes()).slice(-2);
  if (is12) {
    let ampm = "AM";
    if (hours >= 12) ampm = "PM";
    let h12 = hours % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + minutes + " " + ampm;
  }
  return ("0" + hours).slice(-2) + ":" + minutes;
}
