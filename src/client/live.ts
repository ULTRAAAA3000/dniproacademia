import { api, getConfig } from "./common";
import { runCalc } from "./calc";

const CHECK_MS = 15000;
let lastSig = "";

function classIdFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("da_class") || "";
}

async function loadSignature(): Promise<string> {
  const r = await api("live_check", { class_id: classIdFromUrl() });
  if (!r || !r.ok) return "";
  return r.sig;
}

async function reloadContent(): Promise<void> {
  try {
    const res = await fetch(window.location.href, { credentials: "same-origin" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fresh = doc.querySelector(".da-main");
    const current = document.querySelector(".da-main");
    if (!fresh || !current) return;
    current.innerHTML = fresh.innerHTML;
    keepHomeworkView();
    runCalc();
  } catch (e) {
    return;
  }
}

function keepHomeworkView(): void {
  const active = document.querySelector<HTMLElement>(".da-view-btn.active");
  const list = document.querySelector(".da-hw-list");
  if (active && list && active.dataset.view === "grid") list.classList.add("da-hw-grid");
}

async function check(): Promise<void> {
  if (document.hidden) return;
  const sig = await loadSignature();
  if (!sig) return;
  if (lastSig && sig !== lastSig) await reloadContent();
  lastSig = sig;
}

export function startLive(): void {
  if (getConfig().role !== "student") return;
  if (!document.querySelector(".da-main")) return;

  check();
  setInterval(check, CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
}
