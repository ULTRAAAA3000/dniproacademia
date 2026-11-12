import { byId, loadSetting, saveSetting, deleteSetting } from "./common";

interface Scheme {
  brand: string;
  mid: string;
  deep: string;
  light: string;
  tint: string;
  glow: string;
  shadow: string;
}

const SCHEMES: Record<string, Scheme> = {
  green: { brand: "#1a6b5e", mid: "#15574c", deep: "#0e3d35", light: "#e8f5f3", tint: "#f2faf9", glow: "rgba(26,107,94,.18)", shadow: "rgba(26,107,94,.28)" },
  blue: { brand: "#1d4ed8", mid: "#1e40af", deep: "#1e3a8a", light: "#dbeafe", tint: "#eff6ff", glow: "rgba(29,78,216,.18)", shadow: "rgba(29,78,216,.28)" },
  violet: { brand: "#7c3aed", mid: "#6d28d9", deep: "#4c1d95", light: "#ede9fe", tint: "#f5f3ff", glow: "rgba(124,58,237,.18)", shadow: "rgba(124,58,237,.28)" },
  orange: { brand: "#c2410c", mid: "#9a3412", deep: "#7c2d12", light: "#ffedd5", tint: "#fff7ed", glow: "rgba(194,65,12,.18)", shadow: "rgba(194,65,12,.28)" },
  rose: { brand: "#be185d", mid: "#9d174d", deep: "#831843", light: "#fce7f3", tint: "#fdf2f8", glow: "rgba(190,24,93,.18)", shadow: "rgba(190,24,93,.28)" },
};

interface Words {
  hw: string; grades: string; schedule: string; summary: string; materials: string; logout: string;
  settings: string; appearance: string; darkTheme: string; darkThemeSub: string; colorScheme: string; fontSize: string;
  interface: string; compact: string; compactSub: string; animations: string; animSub: string; hwView: string; hwViewSub: string;
  deadlinesLabel: string; deadlines: string; deadlinesSub: string; deadlineOff: string; deadline1: string; deadline3: string; deadline7: string;
  formatLang: string; timeFmt: string; langLabel: string; resetBtn: string; resetConfirm: string;
  panelSchedule: string; panelHomework: string; panelGrades: string; panelSummary: string; panelMaterials: string;
  avgTitle: string; avgSub: string; thSubject: string; thAvg: string; thFinal: string; thStudent: string; thActions: string;
  scheduleEmpty: string; materialsEmpty: string; hwEmpty: string; gradesEmpty: string; chatTitle: string;
}

const WORDS: Record<string, Words> = {
  uk: {
    hw: "Завдання", grades: "Оцінки", schedule: "Розклад", summary: "Середній бал", materials: "Матеріали", logout: "Вийти",
    settings: "Налаштування", appearance: "Оформлення", darkTheme: "Темна тема", darkThemeSub: "Зменшує навантаження на очі",
    colorScheme: "Колірна схема", fontSize: "Розмір шрифту", interface: "Інтерфейс", compact: "Компактний режим", compactSub: "Менші відступи в картках",
    animations: "Анімації карток", animSub: "Плавна поява елементів", hwView: "Вигляд завдань", hwViewSub: "Список або сітка карток",
    deadlinesLabel: "Дедлайни", deadlines: "⏰ Нагадування про дедлайни", deadlinesSub: "Сповіщення у браузері",
    deadlineOff: "Вимк", deadline1: "1 день", deadline3: "3 дні", deadline7: "7 днів",
    formatLang: "Формат та мова", timeFmt: "Формат часу", langLabel: "Мова інтерфейсу",
    resetBtn: "↺ Скинути всі налаштування", resetConfirm: "Скинути всі налаштування до стандартних?",
    panelSchedule: "Розклад", panelHomework: "Завдання", panelGrades: "Оцінки",
    panelSummary: "Середній бал і підсумкові оцінки", panelMaterials: "Матеріали",
    avgTitle: "Середній бал", avgSub: "за поточний семестр",
    thSubject: "Предмет", thAvg: "Середній бал", thFinal: "Виведена оцінка", thStudent: "Учень", thActions: "",
    scheduleEmpty: "Розклад ще не заповнено.", materialsEmpty: "Матеріали відсутні.", hwEmpty: "Завдань поки немає.", gradesEmpty: "Оцінок ще немає.",
    chatTitle: "Повідомлення",
  },
  ru: {
    hw: "Задания", grades: "Оценки", schedule: "Расписание", summary: "Средний балл", materials: "Материалы", logout: "Выйти",
    settings: "Настройки", appearance: "Оформление", darkTheme: "Тёмная тема", darkThemeSub: "Снижает нагрузку на глаза",
    colorScheme: "Цветовая схема", fontSize: "Размер шрифта", interface: "Интерфейс", compact: "Компактный режим", compactSub: "Меньшие отступы в карточках",
    animations: "Анимации карточек", animSub: "Плавное появление элементов", hwView: "Вид заданий", hwViewSub: "Список или сетка карточек",
    deadlinesLabel: "Дедлайны", deadlines: "⏰ Напоминания о дедлайнах", deadlinesSub: "Уведомления в браузере",
    deadlineOff: "Выкл", deadline1: "1 день", deadline3: "3 дня", deadline7: "7 дней",
    formatLang: "Формат и язык", timeFmt: "Формат времени", langLabel: "Язык интерфейса",
    resetBtn: "↺ Сбросить все настройки", resetConfirm: "Сбросить все настройки до стандартных?",
    panelSchedule: "Расписание", panelHomework: "Задания", panelGrades: "Оценки",
    panelSummary: "Средний балл и итоговые оценки", panelMaterials: "Материалы",
    avgTitle: "Средний балл", avgSub: "за текущий семестр",
    thSubject: "Предмет", thAvg: "Средний балл", thFinal: "Итоговая оценка", thStudent: "Ученик", thActions: "",
    scheduleEmpty: "Расписание ещё не заполнено.", materialsEmpty: "Материалы отсутствуют.", hwEmpty: "Заданий пока нет.", gradesEmpty: "Оценок ещё нет.",
    chatTitle: "Сообщения",
  },
  en: {
    hw: "Homework", grades: "Grades", schedule: "Schedule", summary: "GPA", materials: "Materials", logout: "Logout",
    settings: "Settings", appearance: "Appearance", darkTheme: "Dark Mode", darkThemeSub: "Easier on the eyes",
    colorScheme: "Color Scheme", fontSize: "Font Size", interface: "Interface", compact: "Compact Mode", compactSub: "Smaller card padding",
    animations: "Card Animations", animSub: "Smooth element transitions", hwView: "Homework View", hwViewSub: "List or card grid",
    deadlinesLabel: "Deadlines", deadlines: "⏰ Deadline Reminders", deadlinesSub: "Browser notifications",
    deadlineOff: "Off", deadline1: "1 day", deadline3: "3 days", deadline7: "7 days",
    formatLang: "Format & Language", timeFmt: "Time Format", langLabel: "Interface Language",
    resetBtn: "↺ Reset All Settings", resetConfirm: "Reset all settings to default?",
    panelSchedule: "Schedule", panelHomework: "Homework", panelGrades: "Grades",
    panelSummary: "GPA & Final Grades", panelMaterials: "Materials",
    avgTitle: "GPA", avgSub: "current semester",
    thSubject: "Subject", thAvg: "GPA", thFinal: "Final Grade", thStudent: "Student", thActions: "",
    scheduleEmpty: "Schedule not filled yet.", materialsEmpty: "No materials available.", hwEmpty: "No homework yet.", gradesEmpty: "No grades yet.",
    chatTitle: "Messages",
  },
};

function clearActive(selector: string): void {
  const items = document.querySelectorAll(selector);
  for (let i = 0; i < items.length; i++) {
    items[i].classList.remove("active");
  }
}

function setText(selector: string, text: string): void {
  const el = document.querySelector(selector);
  if (el && text) el.textContent = text;
}

export function openSettings(): void {
  const drawer = byId("da-settings-drawer");
  const overlay = byId("da-settings-overlay");
  if (!drawer) return;
  drawer.style.top = "0px";
  drawer.style.bottom = "0px";
  if (overlay) overlay.style.top = "0px";
  drawer.classList.add("open");
  if (overlay) overlay.classList.add("open");
}

export function closeSettings(): void {
  const drawer = byId("da-settings-drawer");
  const overlay = byId("da-settings-overlay");
  if (drawer) drawer.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
}

function setScheme(name: string, el: HTMLElement): void {
  clearActive(".da-color-swatch");
  el.classList.add("active");
  let scheme = SCHEMES[name];
  if (!scheme) scheme = SCHEMES.green;

  const root = document.documentElement.style;
  root.setProperty("--brand", scheme.brand);
  root.setProperty("--brand-mid", scheme.mid);
  root.setProperty("--brand-deep", scheme.deep);
  root.setProperty("--brand-light", scheme.light);
  root.setProperty("--brand-tint", scheme.tint);
  root.setProperty("--brand-glow", scheme.glow);
  root.setProperty("--shadow-brand", "0 4px 16px " + scheme.shadow);
  saveSetting("scheme", name);
}

function setFont(size: string, el: HTMLElement): void {
  clearActive(".da-font-btn");
  el.classList.add("active");
  document.body.classList.remove("da-font-sm", "da-font-md", "da-font-lg");
  if (size !== "md") document.body.classList.add("da-font-" + size);
  saveSetting("font", size);
}

function setView(mode: string, el: HTMLElement): void {
  clearActive(".da-view-btn");
  el.classList.add("active");
  const list = document.querySelector(".da-hw-list");
  if (list) {
    if (mode === "grid") {
      list.classList.add("da-hw-grid");
    } else {
      list.classList.remove("da-hw-grid");
    }
  }
  saveSetting("view", mode);
}

function askNotificationPermission(): void {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function setDeadline(value: string, el: HTMLElement): void {
  clearActive("#da-deadline-seg .da-seg-btn");
  el.classList.add("active");
  saveSetting("deadline", value);
  if (value !== "off") askNotificationPermission();
}

function setTimeFormat(value: string, el: HTMLElement): void {
  clearActive("#da-time-seg .da-seg-btn");
  el.classList.add("active");
  saveSetting("timefmt", value);
}

function setTextList(selector: string, texts: string[]): void {
  const items = document.querySelectorAll(selector);
  for (let i = 0; i < items.length; i++) {
    if (texts[i]) items[i].textContent = texts[i];
  }
}

function setLanguage(value: string, el: HTMLElement): void {
  clearActive("#da-lang-seg .da-seg-btn");
  el.classList.add("active");
  saveSetting("lang", value);

  let t = WORDS[value];
  if (!t) t = WORDS.uk;

  const tabNames: Record<string, string> = {
    homework: t.hw, grades: t.grades, schedule: t.schedule, summary: t.summary, materials: t.materials,
  };
  const navItems = document.querySelectorAll(".da-nav-item");
  for (let i = 0; i < navItems.length; i++) {
    const href = navItems[i].getAttribute("href") || "";
    for (const tab in tabNames) {
      if (href.indexOf("da_tab=" + tab) !== -1) {
        const nodes = navItems[i].childNodes;
        for (let n = 0; n < nodes.length; n++) {
          if (nodes[n].nodeType === 3) nodes[n].textContent = tabNames[tab];
        }
      }
    }
  }

  setText(".da-logout-label", t.logout);
  setText("#da-settings-drawer .da-settings-head h3", t.settings);
  setTextList("#da-settings-drawer .da-settings-label", [t.appearance, t.colorScheme, t.fontSize, t.interface, t.deadlinesLabel, t.formatLang]);
  setTextList("#da-settings-drawer .da-settings-row-text", [t.darkTheme, t.compact, t.animations, t.hwView, t.deadlines, t.timeFmt, t.langLabel]);
  setTextList("#da-settings-drawer .da-settings-row-sub", [t.darkThemeSub, t.compactSub, t.animSub, t.hwViewSub, t.deadlinesSub]);
  setTextList("#da-deadline-seg .da-seg-btn", [t.deadlineOff, t.deadline1, t.deadline3, t.deadline7]);
  setText(".da-settings-reset", t.resetBtn);

  const titles = document.querySelectorAll(".da-panel-title");
  for (let i = 0; i < titles.length; i++) {
    const text = (titles[i].textContent || "").trim();
    if (text === "Розклад" || text === "Schedule" || text === "Расписание") titles[i].textContent = t.panelSchedule;
    else if (text === "Завдання" || text === "Homework" || text === "Задания") titles[i].textContent = t.panelHomework;
    else if (text === "Оцінки" || text === "Grades" || text === "Оценки") titles[i].textContent = t.panelGrades;
    else if (text === "Середній бал і підсумкові оцінки" || text === "GPA & Final Grades" || text === "Средний балл и итоговые оценки") titles[i].textContent = t.panelSummary;
    else if (text === "Матеріали" || text === "Materials" || text === "Материалы") titles[i].textContent = t.panelMaterials;
  }

  setText(".da-avg-title", t.avgTitle);
  setText(".da-avg-sub", t.avgSub);
  setTextList(".da-summary-table thead th", [t.thSubject, t.thAvg, t.thFinal, t.thStudent, t.thActions]);
  setText(".da-chat-sidebar-title", t.chatTitle);

  const empties = document.querySelectorAll(".da-empty");
  for (let i = 0; i < empties.length; i++) {
    const text = (empties[i].textContent || "").trim();
    if (/Розклад|Schedule|Расписание/.test(text) && /не заповнено|not filled|не заполнено/.test(text)) {
      empties[i].textContent = t.scheduleEmpty;
    } else if (/Матеріали|Materials|Материалы/.test(text) && /відсутні|available|отсутствуют/.test(text)) {
      empties[i].textContent = t.materialsEmpty;
    }
  }
}

function applyToggles(): void {
  const dark = (byId("da-toggle-dark") as HTMLInputElement).checked;
  const compact = (byId("da-toggle-compact") as HTMLInputElement).checked;
  const anim = (byId("da-toggle-anim") as HTMLInputElement).checked;
  document.body.classList.toggle("da-dark", dark);
  document.body.classList.toggle("da-compact", compact);
  document.body.classList.toggle("da-no-anim", !anim);
  saveSetting("dark", dark ? "1" : "0");
  saveSetting("compact", compact ? "1" : "0");
  saveSetting("anim", anim ? "1" : "0");
}

function resetSettings(): void {
  let t = WORDS[loadSetting("lang", "uk")];
  if (!t) t = WORDS.uk;
  if (!confirm(t.resetConfirm)) return;
  const keys = ["scheme", "font", "dark", "compact", "anim", "deadline", "timefmt", "lang", "view"];
  for (let i = 0; i < keys.length; i++) deleteSetting(keys[i]);
  location.reload();
}

function activateSegment(segId: string, value: string): void {
  const seg = byId(segId);
  if (!seg) return;
  const buttons = seg.querySelectorAll(".da-seg-btn");
  for (let i = 0; i < buttons.length; i++) buttons[i].classList.remove("active");
  const target = seg.querySelector('[data-val="' + value + '"]');
  if (target) target.classList.add("active");
}

export function startSettings(): void {
  const scheme = loadSetting("scheme", "green");
  const font = loadSetting("font", "md");
  const dark = loadSetting("dark", "0") === "1";
  const compact = loadSetting("compact", "0") === "1";
  const anim = loadSetting("anim", "1") === "1";
  const deadline = loadSetting("deadline", "1");
  const timefmt = loadSetting("timefmt", "24");
  const lang = loadSetting("lang", "uk");
  const view = loadSetting("view", "list");

  const swatch = document.querySelector<HTMLElement>('.da-color-swatch[data-scheme="' + scheme + '"]');
  if (swatch) setScheme(scheme, swatch);
  const fontBtn = document.querySelector<HTMLElement>('.da-font-btn[data-size="' + font + '"]');
  if (fontBtn) setFont(font, fontBtn);
  const viewBtn = byId("da-view-" + view);
  if (viewBtn) setView(view, viewBtn);

  activateSegment("da-deadline-seg", deadline);
  activateSegment("da-time-seg", timefmt);
  activateSegment("da-lang-seg", lang);

  const darkToggle = byId("da-toggle-dark") as HTMLInputElement | null;
  const compactToggle = byId("da-toggle-compact") as HTMLInputElement | null;
  const animToggle = byId("da-toggle-anim") as HTMLInputElement | null;
  if (darkToggle) darkToggle.checked = dark;
  if (compactToggle) compactToggle.checked = compact;
  if (animToggle) animToggle.checked = anim;

  document.body.classList.toggle("da-dark", dark);
  document.body.classList.toggle("da-compact", compact);
  document.body.classList.toggle("da-no-anim", !anim);

  if (deadline !== "off") askNotificationPermission();

  if (lang !== "uk") {
    const langBtn = document.querySelector<HTMLElement>('#da-lang-seg [data-val="' + lang + '"]');
    if (langBtn) setLanguage(lang, langBtn);
  }

  const swatches = document.querySelectorAll<HTMLElement>(".da-color-swatch");
  for (let i = 0; i < swatches.length; i++) {
    swatches[i].addEventListener("click", () => setScheme(swatches[i].dataset.scheme || "green", swatches[i]));
  }
  const fontButtons = document.querySelectorAll<HTMLElement>(".da-font-btn");
  for (let i = 0; i < fontButtons.length; i++) {
    fontButtons[i].addEventListener("click", () => setFont(fontButtons[i].dataset.size || "md", fontButtons[i]));
  }
  const viewButtons = document.querySelectorAll<HTMLElement>(".da-view-btn");
  for (let i = 0; i < viewButtons.length; i++) {
    viewButtons[i].addEventListener("click", () => setView(viewButtons[i].dataset.view || "list", viewButtons[i]));
  }
  const deadlineButtons = document.querySelectorAll<HTMLElement>("#da-deadline-seg .da-seg-btn");
  for (let i = 0; i < deadlineButtons.length; i++) {
    deadlineButtons[i].addEventListener("click", () => setDeadline(deadlineButtons[i].dataset.val || "1", deadlineButtons[i]));
  }
  const timeButtons = document.querySelectorAll<HTMLElement>("#da-time-seg .da-seg-btn");
  for (let i = 0; i < timeButtons.length; i++) {
    timeButtons[i].addEventListener("click", () => setTimeFormat(timeButtons[i].dataset.val || "24", timeButtons[i]));
  }
  const langButtons = document.querySelectorAll<HTMLElement>("#da-lang-seg .da-seg-btn");
  for (let i = 0; i < langButtons.length; i++) {
    langButtons[i].addEventListener("click", () => setLanguage(langButtons[i].dataset.val || "uk", langButtons[i]));
  }

  const toggles = ["da-toggle-dark", "da-toggle-compact", "da-toggle-anim"];
  for (let i = 0; i < toggles.length; i++) {
    const el = byId(toggles[i]);
    if (el) el.addEventListener("change", applyToggles);
  }

  const resetButton = document.querySelector(".da-settings-reset");
  if (resetButton) resetButton.addEventListener("click", resetSettings);
}
