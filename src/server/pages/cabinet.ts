import type { Env, User, ClassRow, HomeworkRow, GradeRow, ScheduleRow } from "../types";
import * as db from "../db";
import { esc, nl2br, fmtDate, fmtDateTime, todayKyiv, fileExt, uniqueSorted } from "../utils";

function icon(paths: string, size = 16): string {
  return (
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    paths + "</svg>"
  );
}

const NAV_ICONS: Record<string, string> = {
  schedule: icon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  homework: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'),
  grades: icon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  summary: icon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
  materials: icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
};

const ICON_EDIT =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_TRASH =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
const ICON_REFRESH =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

const BTN_EDIT_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;cursor:pointer;background-color:#f2faf9;border:1.5px solid #deecea;color:#1a6b5e;flex-shrink:0;";
const BTN_DEL_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;cursor:pointer;background-color:#fff7f7;border:1.5px solid #fecaca;color:#c0392b;flex-shrink:0;";

const TEACHER_GRADE_COLORS: Record<number, string> = {
  1: "#c0392b", 2: "#e67e22", 3: "#f39c12", 4: "#f39c12", 5: "#f39c12", 6: "#27ae60",
  7: "#27ae60", 8: "#16a085", 9: "#16a085", 10: "#2980b9", 11: "#8e44ad", 12: "#6c3483",
};
const STUDENT_GRADE_COLORS: Record<number, string> = {
  1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#eab308", 5: "#eab308", 6: "#84cc16",
  7: "#22c55e", 8: "#14b8a6", 9: "#14b8a6", 10: "#0ea5e9", 11: "#6366f1", 12: "#8b5cf6",
};

function link(url: URL, changes: Record<string, string | number>): string {
  const params = new URLSearchParams(url.searchParams);
  for (const key in changes) {
    const value = changes[key];
    if (value === "" || value === 0) {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  if (text) return url.pathname + "?" + text;
  return url.pathname;
}

function param(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) return "";
  return value;
}

function cleanParam(url: URL, name: string): string {
  return param(url, name).replace(/<[^>]*>/g, "").trim();
}

function emptyState(iconSvg: string, text: string): string {
  return (
    '<div class="da-empty-state"><div class="da-empty-state-icon">' + iconSvg + "</div><p>" + text + "</p></div>"
  );
}

function filterChips(url: URL, subjects: string[], current: string, withAll: boolean): string {
  let html = '<div class="da-filter-bar">';
  if (withAll) {
    let active = "";
    if (!current) active = "active";
    html += '<a href="' + esc(link(url, { da_subj: "" })) + '" class="da-filter-chip ' + active + '">Всі</a>';
  }
  for (let i = 0; i < subjects.length; i++) {
    let active = "";
    if (current === subjects[i]) active = "active";
    html += '<a href="' + esc(link(url, { da_subj: subjects[i] })) + '" class="da-filter-chip ' + active + '">' + esc(subjects[i]) + "</a>";
  }
  return html + "</div>";
}

export async function renderHeader(env: Env, user: User, teacher: boolean): Promise<string> {
  const initials = (user.first_name.slice(0, 1) + user.last_name.slice(0, 1)).toUpperCase();
  let roleName = "Учень";
  if (teacher) roleName = "Вчитель";
  const fullName = esc(user.last_name + " " + user.first_name);

  const unread = await db.countUnreadMessages(env.DB, user.id);
  let badge = "";
  if (unread > 0) badge = '<span class="da-notif-badge">' + unread + "</span>";

  const dark =
    '<div class="da-settings-row"><div><div class="da-settings-row-text">Темна тема</div><div class="da-settings-row-sub">Зменшує навантаження на очі</div></div>' +
    '<label class="da-toggle"><input type="checkbox" id="da-toggle-dark"><span class="da-toggle-track"></span></label></div>';

  const swatches =
    '<div class="da-color-swatch active" data-scheme="green" style="background:#1a6b5e" title="Зелений (стандарт)"></div>' +
    '<div class="da-color-swatch" data-scheme="blue" style="background:#1d4ed8" title="Синій"></div>' +
    '<div class="da-color-swatch" data-scheme="violet" style="background:#7c3aed" title="Фіолетовий"></div>' +
    '<div class="da-color-swatch" data-scheme="orange" style="background:#c2410c" title="Помаранчевий"></div>' +
    '<div class="da-color-swatch" data-scheme="rose" style="background:#be185d" title="Рожевий"></div>';

  return (
    '<header class="da-header"><div class="da-header-left">' +
    '<button class="da-menu-toggle" id="da-menu-toggle" aria-label="Меню"><span></span><span></span><span></span></button>' +
    '<span class="da-header-logo">Дніпро Академія</span></div><div class="da-header-right">' +
    '<div id="da-chat-btn" data-act="open-chat" role="button" tabindex="0" style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:#fff;border:1.5px solid #deecea;border-radius:8px;cursor:pointer;color:#6b8f89;flex-shrink:0;user-select:none;">' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    badge + "</div>" +
    '<div id="da-settings-btn" data-act="open-settings" role="button" tabindex="0" title="Налаштування">' +
    '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div>' +
    '<div class="da-user-badge"><div class="da-user-avatar">' + esc(initials) + '</div><div class="da-user-info"><span class="da-user-name">' + fullName +
    '</span><span class="da-user-role">' + roleName + "</span></div></div>" +
    '<button class="da-logout-btn" id="da-logout"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span class="da-logout-label">Вийти</span></button>' +
    "</div></header>" +
    '<div id="da-settings-overlay" data-act="close-settings"></div>' +
    '<div id="da-settings-drawer"><div class="da-settings-head"><h3>Налаштування</h3>' +
    '<button class="da-settings-close" data-act="close-settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>' +
    '<div class="da-settings-body">' +
    '<div class="da-settings-section"><div class="da-settings-label">Оформлення</div>' + dark + "</div>" +
    '<div class="da-settings-section"><div class="da-settings-label">Колірна схема</div><div class="da-color-grid">' + swatches + "</div></div>" +
    '<div class="da-settings-section"><div class="da-settings-label">Розмір шрифту</div><div class="da-font-btns">' +
    '<button class="da-font-btn" data-size="sm" style="font-size:11px">A</button>' +
    '<button class="da-font-btn active" data-size="md" style="font-size:14px">A</button>' +
    '<button class="da-font-btn" data-size="lg" style="font-size:17px">A</button></div></div>' +
    '<div class="da-settings-section"><div class="da-settings-label">Інтерфейс</div>' +
    '<div class="da-settings-row"><div><div class="da-settings-row-text">Компактний режим</div><div class="da-settings-row-sub">Менші відступи в картках</div></div><label class="da-toggle"><input type="checkbox" id="da-toggle-compact"><span class="da-toggle-track"></span></label></div>' +
    '<div class="da-settings-row" style="margin-top:12px"><div><div class="da-settings-row-text">Анімації карток</div><div class="da-settings-row-sub">Плавна поява елементів</div></div><label class="da-toggle"><input type="checkbox" id="da-toggle-anim" checked><span class="da-toggle-track"></span></label></div>' +
    '<div class="da-settings-row" style="margin-top:12px"><div><div class="da-settings-row-text">Вигляд завдань</div><div class="da-settings-row-sub">Список або сітка карток</div></div><div class="da-view-btns">' +
    '<button class="da-view-btn active" id="da-view-list" data-view="list" title="Список"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></button>' +
    '<button class="da-view-btn" id="da-view-grid" data-view="grid" title="Сітка"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>' +
    "</div></div></div>" +
    '<div class="da-settings-section"><div class="da-settings-label">Дедлайни</div>' +
    '<div class="da-settings-row"><div style="flex:1"><div class="da-settings-row-text">⏰ Нагадування про дедлайни</div><div class="da-settings-row-sub">Сповіщення у браузері</div></div></div>' +
    '<div class="da-seg" id="da-deadline-seg" style="margin-top:8px">' +
    '<button class="da-seg-btn" data-val="off">Вимк</button><button class="da-seg-btn active" data-val="1">1 день</button><button class="da-seg-btn" data-val="3">3 дні</button><button class="da-seg-btn" data-val="7">7 днів</button></div></div>' +
    '<div class="da-settings-section"><div class="da-settings-label">Формат та мова</div>' +
    '<div class="da-settings-row"><div><div class="da-settings-row-text">Формат часу</div></div><div class="da-seg" id="da-time-seg"><button class="da-seg-btn active" data-val="24">24г</button><button class="da-seg-btn" data-val="12">12г</button></div></div>' +
    '<div class="da-settings-row" style="margin-top:14px"><div><div class="da-settings-row-text">Мова інтерфейсу</div></div><div class="da-seg" id="da-lang-seg"><button class="da-seg-btn active" data-val="uk">UA</button><button class="da-seg-btn" data-val="ru">RU</button><button class="da-seg-btn" data-val="en">EN</button></div></div></div>' +
    '<div class="da-settings-section"><button class="da-settings-reset" data-act="settings-reset">↺ Скинути всі налаштування</button></div>' +
    "</div></div>"
  );
}

function scheduleView(schedule: ScheduleRow[], overall: number): string {
  const dayNames = ["", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця"];
  const grid: Record<string, ScheduleRow[]> = {};
  for (let i = 0; i < schedule.length; i++) {
    const key = schedule[i].day + "-" + schedule[i].period;
    if (!grid[key]) grid[key] = [];
    grid[key].push(schedule[i]);
  }

  let html = '<div class="da-panel">';
  if (overall > 0) {
    html +=
      '<div class="da-avg-hero"><div class="da-avg-ring" style="--pct:' + Math.round((overall / 12) * 100) + '%"><span class="da-avg-num">' +
      overall.toFixed(1) + '</span></div><div class="da-avg-meta"><div class="da-avg-title">Середній бал</div><div class="da-avg-sub">за поточний семестр</div></div></div>';
  }
  html += '<h2 class="da-panel-title">Розклад</h2>';

  if (schedule.length === 0) {
    return html + '<p class="da-empty">Розклад ще не заповнено.</p></div>';
  }

  html += '<div class="da-schedule-wrap"><table class="da-schedule-view"><thead><tr><th>#</th>';
  for (let d = 1; d <= 5; d++) html += "<th>" + dayNames[d] + "</th>";
  html += "</tr></thead><tbody>";

  for (let p = 1; p <= 8; p++) {
    let hasAnything = false;
    for (let d = 1; d <= 5; d++) {
      if (grid[d + "-" + p]) hasAnything = true;
    }
    if (!hasAnything) continue;

    html += '<tr><td class="da-period-cell">' + p + "</td>";
    for (let d = 1; d <= 5; d++) {
      html += "<td>";
      const cell = grid[d + "-" + p] || [];
      for (let i = 0; i < cell.length; i++) {
        const entry = cell[i];
        const meta: string[] = [];
        if (entry.group_name === "group1") meta.push("Гр.1");
        if (entry.group_name === "group2") meta.push("Гр.2");
        if (entry.week_type === "numerator") meta.push("Чис.");
        if (entry.week_type === "denominator") meta.push("Зн.");
        html += '<div class="da-sch-entry"><span class="da-sch-subj">' + esc(entry.subject) + "</span>";
        if (meta.length > 0) html += "<span class='da-sch-meta'>" + meta.join("|") + "</span>";
        html += "</div>";
      }
      html += "</td>";
    }
    html += "</tr>";
  }
  return html + "</tbody></table></div></div>";
}

function homeworkCard(h: HomeworkRow, today: string, showTeacher: boolean, actions: string): string {
  let overdue = "";
  if (h.deadline < today) overdue = "da-card--overdue";
  let desc = "";
  if (h.description) desc = '<div class="da-card-desc">' + nl2br(h.description) + "</div>";
  let footer = "";
  if (showTeacher) {
    footer = "<span>" + esc(h.teacher_name) + '</span><span class="da-card-pub">' + fmtDateTime(h.created_at) + "</span>";
  } else {
    footer = '<span class="da-card-pub">' + fmtDateTime(h.created_at) + "</span>";
  }
  return (
    '<div class="da-card da-card--hw ' + overdue + '" id="hw-' + h.id + '"><div class="da-card-head"><span class="da-card-subject">' + esc(h.subject) +
    '</span><div class="da-hw-actions" style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><span class="da-card-date">До: ' + fmtDate(h.deadline) +
    "</span>" + actions + '</div></div><div class="da-card-topic">' + esc(h.topic) + "</div>" + desc +
    '<div class="da-card-footer">' + footer + "</div></div>"
  );
}

async function studentHomework(env: Env, url: URL, classId: number): Promise<string> {
  const all = await db.getHomework(env.DB, classId);
  const subjects = uniqueSorted(all.map((h) => h.subject));
  const filter = cleanParam(url, "da_subj");

  let html =
    '<div class="da-panel"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;"><h2 class="da-panel-title" style="margin-bottom:0">Завдання</h2>' +
    '<button class="da-refresh-btn" data-action="da_get_homework_refresh" data-cid="' + classId + '" title="Оновити"><span class="da-refresh-icon">' + ICON_REFRESH + "</span></button></div>";

  if (subjects.length > 0) html += filterChips(url, subjects, filter, true);
  if (all.length === 0) {
    return html + '<div class="da-empty">Завдань ще немає.</div></div>';
  }

  const today = todayKyiv();
  html += '<div class="da-hw-list">';
  for (let i = 0; i < all.length; i++) {
    if (filter && all[i].subject !== filter) continue;
    html += homeworkCard(all[i], today, true, "");
  }
  return html + "</div></div>";
}

function gradeCards(grades: GradeRow[]): string {
  if (grades.length === 0) return '<div class="da-empty">Оцінок ще немає.</div>';
  let html = "";
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    let color = STUDENT_GRADE_COLORS[g.grade];
    if (!color) color = "#14b8a6";
    let desc = "";
    if (g.description) desc = '<div class="da-card-desc">' + esc(g.description) + "</div>";
    html +=
      '<div class="da-card da-card--grade"><div class="da-grade-badge" style="background:' + color + '">' + g.grade + '</div><div class="da-grade-info"><div class="da-card-subject">' +
      esc(g.subject) + "</div>" + desc + '<div class="da-card-footer"><span>' + esc(g.teacher_name) + '</span><span class="da-card-pub">' + fmtDateTime(g.created_at) + "</span></div></div></div>";
  }
  return html;
}

async function studentGrades(env: Env, url: URL, user: User, classId: number): Promise<string> {
  const all = await db.getStudentGrades(env.DB, user.id, classId);
  const current = cleanParam(url, "da_subj");
  const subjects = uniqueSorted(all.map((g) => g.subject));
  let shown = all;
  if (current) shown = all.filter((g) => g.subject === current);

  let html =
    '<div class="da-panel"><div class="da-panel-header"><h2 class="da-panel-title">Оцінки</h2><button class="da-refresh-btn" data-action="da_get_grades" data-cid="' +
    classId + '" title="Оновити"><span class="da-refresh-icon">' + ICON_REFRESH + "</span></button></div>";
  if (subjects.length > 0) html += filterChips(url, subjects, current, true);
  return html + '<div class="da-grades-list" id="da-grades-list">' + gradeCards(shown) + "</div></div>";
}

async function studentSummary(env: Env, user: User, classId: number): Promise<string> {
  const subjects = await db.getClassSubjects(env.DB, classId);
  const avgs = await db.getAvgBySubject(env.DB, user.id, classId);
  const finals = await db.getFinalGrades(env.DB, user.id, classId);

  const avgMap: Record<string, number> = {};
  for (let i = 0; i < avgs.length; i++) avgMap[avgs[i].subject] = avgs[i].avg_grade;
  const finalMap: Record<string, number> = {};
  for (let i = 0; i < finals.length; i++) finalMap[finals[i].subject] = finals[i].grade;

  let html = '<div class="da-panel"><h2 class="da-panel-title">Середній бал і підсумкові оцінки</h2>';
  if (subjects.length === 0) return html + '<p class="da-empty">Предмети ще не додані.</p></div>';

  html += '<div class="da-summary-table-wrap"><table class="da-summary-table"><thead><tr><th>Предмет</th><th>Середній бал</th><th>Виведена оцінка</th></tr></thead><tbody>';
  for (let i = 0; i < subjects.length; i++) {
    const name = subjects[i].name;
    let avgCell = "—";
    if (avgMap[name] !== undefined) avgCell = "<span class='da-avg-pill'>" + avgMap[name].toFixed(1) + "</span>";
    let finalCell = "—";
    if (finalMap[name] !== undefined) finalCell = "<span class='da-final-badge'>" + finalMap[name] + "</span>";
    html += "<tr><td>" + esc(name) + "</td><td>" + avgCell + "</td><td>" + finalCell + "</td></tr>";
  }
  return html + "</tbody></table></div></div>";
}

function materialCard(m: { id: number; title: string; subject: string; filename: string; filepath: string; created_at: string; teacher_name?: string }, mine: boolean): string {
  let kind = "docx";
  if (fileExt(m.filename) === "pptx") kind = "pptx";
  let teacherPart = "";
  if (!mine) teacherPart = "<span>" + esc(m.teacher_name) + "</span>";
  let actions =
    '<a href="/files/materials/' + esc(m.filepath) + '" class="da-download-btn" download>Завантажити</a>';
  if (mine) {
    actions =
      '<a href="/files/materials/' + esc(m.filepath) + '" class="da-download-btn" download>↓</a>' +
      '<button class="da-delete-mat da-btn da-btn--xs da-btn--red" data-mid="' + m.id + '">&times;</button>';
  }
  return (
    '<div class="da-material-card" id="mat-' + m.id + '"><div class="da-material-icon">' + kind + '</div><div class="da-material-info"><div class="da-material-title">' + esc(m.title) +
    '</div><div class="da-material-meta"><span class="da-material-subject">' + esc(m.subject) + "</span>" + teacherPart + "<span>" + fmtDate(m.created_at) + "</span></div></div>" + actions + "</div>"
  );
}

async function studentMaterials(env: Env, url: URL, classId: number): Promise<string> {
  const all = await db.getMaterials(env.DB, classId);
  const subjects = uniqueSorted(all.map((m) => m.subject));
  const filter = cleanParam(url, "da_subj");

  let html = '<div class="da-panel"><h2 class="da-panel-title">Матеріали</h2>';
  if (subjects.length > 0) html += filterChips(url, subjects, filter, true);
  html += '<div class="da-materials-list">';

  let count = 0;
  for (let i = 0; i < all.length; i++) {
    if (filter && all[i].subject !== filter) continue;
    html += materialCard(all[i], false);
    count++;
  }
  if (count === 0) html += '<div class="da-empty">Матеріали відсутні.</div>';
  return html + "</div></div>";
}

function studentNav(url: URL, current: string, classId: number): string {
  const items: [string, string][] = [
    ["schedule", "Розклад"], ["homework", "Завдання"],
    ["grades", "Оцінки"], ["summary", "Середній бал"], ["materials", "Матеріали"],
  ];
  return navLinks(url, current, classId, items);
}

function teacherNav(url: URL, current: string, classId: number): string {
  const items: [string, string][] = [
    ["schedule", "Розклад"], ["homework", "Завдання"],
    ["grades", "Оцінки"], ["summary", "Підсумкові"], ["materials", "Матеріали"],
  ];
  return navLinks(url, current, classId, items);
}

function navLinks(url: URL, current: string, classId: number, items: [string, string][]): string {
  let html = "";
  for (let i = 0; i < items.length; i++) {
    const key = items[i][0];
    let active = "";
    if (current === key) active = "active";
    html +=
      "<a href='" + esc(link(url, { da_class: classId, da_tab: key, da_subj: "" })) + "' class='da-nav-item " + active + "' data-tab='" + key + "'><span class='da-nav-icon'>" +
      NAV_ICONS[key] + "</span>" + items[i][1] + "</a>";
  }
  return html;
}

function pickClass(url: URL, classes: ClassRow[]): number {
  const wanted = parseInt(param(url, "da_class"), 10);
  if (wanted) return wanted;
  if (classes.length > 0) return classes[0].id;
  return 0;
}

export async function renderStudent(env: Env, url: URL, user: User): Promise<string> {
  const classes = await db.getUserClasses(env.DB, user.id);
  let classId = pickClass(url, classes);
  let found = false;
  for (let i = 0; i < classes.length; i++) {
    if (classes[i].id === classId) found = true;
  }
  if (!found) classId = 0;

  let tab = param(url, "da_tab");
  if (!tab) tab = "schedule";

  let overall = 0;
  if (classId) {
    overall = await db.getOverallAvg(env.DB, user.id, classId);
  }

  let classLinks = "";
  if (classes.length > 1) {
    classLinks = '<div class="da-sb-section"><div class="da-sb-label">Клас</div>';
    for (let i = 0; i < classes.length; i++) {
      let active = "";
      if (classId === classes[i].id) active = "active";
      classLinks += '<a href="' + esc(link(url, { da_class: classes[i].id, da_tab: tab })) + '" class="da-sb-class-link ' + active + '">' + esc(classes[i].name) + "</a>";
    }
    classLinks += "</div>";
  }

  let main = "";
  if (!classId) {
    main = emptyState(icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', 26), "Вас ще не додано до класу. Зверніться до адміністратора.");
  } else if (tab === "homework") {
    main = await studentHomework(env, url, classId);
  } else if (tab === "grades") {
    main = await studentGrades(env, url, user, classId);
  } else if (tab === "summary") {
    main = await studentSummary(env, user, classId);
  } else if (tab === "materials") {
    main = await studentMaterials(env, url, classId);
  } else {
    main = scheduleView(await db.getSchedule(env.DB, classId), overall);
  }

  return (
    '<div class="da-cabinet">' + (await renderHeader(env, user, false)) +
    '<div class="da-body"><aside class="da-sidebar" id="da-sidebar">' + classLinks +
    '<div class="da-sb-section"><div class="da-sb-label">Меню</div>' + studentNav(url, tab, classId) + "</div></aside>" +
    '<main class="da-main">' + main + "</main></div></div>"
  );
}

async function teacherHomework(env: Env, user: User, classId: number, cls: ClassRow): Promise<string> {
  const hw = await db.getTeacherHomework(env.DB, classId, user.id);
  const subjects = await db.getClassSubjects(env.DB, classId);

  let subjectField = "";
  if (user.subject) {
    subjectField =
      '<input type="text" class="da-input" id="hw-subject" value="' + esc(user.subject) + '" readonly style="background:#f2faf9;cursor:default;font-weight:700;color:var(--brand)">';
  } else {
    subjectField = '<select class="da-input" id="hw-subject">';
    for (let i = 0; i < subjects.length; i++) {
      subjectField += '<option value="' + esc(subjects[i].name) + '">' + esc(subjects[i].name) + "</option>";
    }
    subjectField += "</select>";
  }

  let html =
    '<div class="da-panel"><div class="da-panel-header"><h2 class="da-panel-title">Завдання — ' + esc(cls.name) + "</h2></div>" +
    '<div class="da-add-form"><h3 class="da-form-title">Додати завдання</h3><div class="da-form-row2">' +
    '<div class="da-form-group"><label class="da-label">Предмет</label>' + subjectField + "</div>" +
    '<div class="da-form-group"><label class="da-label">Термін виконання</label><input type="date" class="da-input" id="hw-deadline" min="' + todayKyiv() + '"></div></div>' +
    '<div class="da-form-group"><label class="da-label">Тема</label><input type="text" class="da-input" id="hw-topic" placeholder="Тема завдання"></div>' +
    '<div class="da-form-group"><label class="da-label">Опис</label><textarea class="da-input da-textarea" id="hw-desc" rows="3"></textarea></div>' +
    '<div class="da-alert" id="hw-alert" style="display:none"></div>' +
    '<button class="da-btn-primary" id="btn-add-hw" data-cid="' + classId + '"><span class="da-btn-text">Опублікувати</span><span class="da-spinner" style="display:none"></span></button></div>' +
    '<h3 class="da-section-sub">Мої завдання</h3><div class="da-hw-list" id="da-hw-teacher-list">';

  if (hw.length === 0) html += '<div class="da-empty">Завдань ще немає.</div>';
  const today = todayKyiv();
  for (let i = 0; i < hw.length; i++) {
    const h = hw[i];
    const actions =
      '<div class="da-gc-btn da-gc-btn-edit" style="' + BTN_EDIT_STYLE + '" data-act="edit-hw" data-id="' + h.id + '" data-topic="' + esc(h.topic) +
      '" data-desc="' + esc(h.description) + '" data-deadline="' + esc(h.deadline) + '" title="Редагувати">' + ICON_EDIT + "</div>" +
      '<div class="da-gc-btn da-gc-btn-del" style="' + BTN_DEL_STYLE + '" data-act="delete-hw" data-id="' + h.id + '" title="Видалити">' + ICON_TRASH + "</div>";
    html += homeworkCard(h, today, false, actions);
  }
  html += "</div>";

  html +=
    '<div class="da-modal" id="da-edit-hw-modal" style="display:none"><div class="da-modal-overlay"></div><div class="da-modal-inner"><h3>Редагувати завдання</h3>' +
    '<input type="hidden" id="ehw-id">' +
    '<div class="da-form-group"><label class="da-label">Тема</label><input type="text" class="da-input" id="ehw-topic"></div>' +
    '<div class="da-form-group"><label class="da-label">Опис</label><textarea class="da-input da-textarea" id="ehw-desc" rows="3"></textarea></div>' +
    '<div class="da-form-group"><label class="da-label">Дедлайн</label><input type="date" class="da-input" id="ehw-deadline"></div>' +
    '<div class="da-alert" id="ehw-alert" style="display:none"></div>' +
    '<div class="da-modal-actions"><button class="da-btn-primary" id="btn-save-edit-hw">Зберегти</button><button class="da-btn" id="btn-cancel-edit-hw">Скасувати</button></div></div></div>';
  return html + "</div>";
}

function subjectPicker(url: URL, subjects: { name: string }[], teacherSubject: string, current: string): string {
  if (teacherSubject) return '<div class="da-subject-badge">' + esc(teacherSubject) + "</div>";
  if (subjects.length === 0) return "";
  return filterChips(url, subjects.map((s) => s.name), current, false);
}

async function currentSubject(env: Env, url: URL, user: User, classId: number) {
  const subjects = await db.getClassSubjects(env.DB, classId);
  let current = user.subject || "";
  if (!current) {
    current = cleanParam(url, "da_subj");
    if (!current && subjects.length > 0) current = subjects[0].name;
  }
  return { subjects: subjects, current: current };
}

async function teacherGrades(env: Env, url: URL, user: User, classId: number, cls: ClassRow): Promise<string> {
  const info = await currentSubject(env, url, user, classId);
  const students = await db.getClassStudentsGrades(env.DB, classId, info.current);
  const allGrades = await db.getClassSubjectGrades(env.DB, classId, info.current);

  let html = '<div class="da-panel"><h2 class="da-panel-title">Оцінки — ' + esc(cls.name) + "</h2>" + subjectPicker(url, info.subjects, user.subject || "", info.current) + '<div class="da-students-grades">';

  for (let i = 0; i < students.length; i++) {
    const st = students[i];
    const name = st.last_name + " " + st.first_name;
    let avg = '<span id="avg-' + st.id + '">—</span>';
    if (st.avg_grade) avg = '<span class="da-avg-pill" id="avg-' + st.id + '">' + st.avg_grade.toFixed(1) + "</span>";

    html +=
      '<div class="da-sgrade-block" style="background:#fff;border:1px solid #deecea;border-radius:10px;overflow:hidden;margin-bottom:10px;" id="row-' + st.id + '">' +
      '<div class="da-sgrade-header" style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;background:#f2faf9;border-bottom:1px solid #deecea;flex-wrap:wrap;gap:8px;">' +
      '<div class="da-sgrade-name" style="font-size:14px;font-weight:700;color:#0d1f1c;">' + esc(name) + "</div>" +
      '<div class="da-sgrade-meta" style="display:flex;align-items:center;gap:10px;">' + avg +
      '<button class="da-btn da-btn--sm da-btn--teal add-grade-btn" data-uid="' + st.id + '" data-name="' + esc(name) + '" data-subject="' + esc(info.current) + '" data-cid="' + classId + '">+ Оцінка</button></div></div>' +
      '<div class="da-sgrade-list" style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;" id="grades-list-' + st.id + '">';

    let count = 0;
    for (let j = 0; j < allGrades.length; j++) {
      const gr = allGrades[j];
      if (gr.student_id !== st.id) continue;
      count++;
      let color = TEACHER_GRADE_COLORS[gr.grade];
      if (!color) color = "#16a085";
      let desc = "";
      if (gr.description) desc = '<div class="da-gc-desc" style="font-size:12px;color:#6b8f89;flex:1;">' + esc(gr.description) + "</div>";
      html +=
        '<div class="da-gc" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #deecea;border-radius:8px;background:#fff;" id="gchip-' + gr.id + '">' +
        '<div class="da-gc-left" style="display:flex;align-items:center;gap:10px;flex:1;"><div class="da-gc-badge" style="min-width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0;background:' +
        color + '">' + gr.grade + "</div>" + desc + '<div class="da-gc-date" style="font-size:11px;color:#a3bfbb;white-space:nowrap;">' + fmtDate(gr.created_at) + "</div></div>" +
        '<div class="da-gc-btns" style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
        '<div class="da-gc-btn da-gc-btn-edit" style="' + BTN_EDIT_STYLE + '" data-act="edit-grade" data-id="' + gr.id + '" data-grade="' + gr.grade + '" data-desc="' + esc(gr.description) + '" title="Редагувати">' + ICON_EDIT + "</div>" +
        '<div class="da-gc-btn da-gc-btn-del" style="' + BTN_DEL_STYLE + '" data-act="delete-grade" data-id="' + gr.id + '" data-uid="' + st.id + '" title="Видалити">' + ICON_TRASH + "</div></div></div>";
    }
    if (count === 0) html += '<div class="da-gc-empty" style="font-size:12px;color:#a3bfbb;font-style:italic;padding:4px 0;">Оцінок ще немає</div>';
    html += "</div></div>";
  }
  if (students.length === 0) html += '<div class="da-empty">У класі немає учнів.</div>';
  html += "</div>";

  html +=
    '<div class="da-modal" id="da-grade-modal" style="display:none"><div class="da-modal-overlay"></div><div class="da-modal-inner"><h3>Оцінка — <span id="gm-name"></span></h3>' +
    '<input type="hidden" id="gm-uid"><input type="hidden" id="gm-cid"><input type="hidden" id="gm-subject">' +
    '<div class="da-form-group"><label class="da-label">Оцінка (1–12)</label><input type="number" class="da-input" id="gm-grade" min="1" max="12"></div>' +
    '<div class="da-form-group"><label class="da-label">Опис</label><input type="text" class="da-input" id="gm-desc"></div>' +
    '<div class="da-alert" id="gm-alert" style="display:none"></div>' +
    '<div class="da-modal-actions"><button class="da-btn-primary" id="btn-save-grade">Зберегти</button><button class="da-btn" id="btn-grade-cancel">Скасувати</button></div></div></div>' +
    '<div class="da-modal" id="da-edit-grade-modal" style="display:none"><div class="da-modal-overlay"></div><div class="da-modal-inner"><h3>Редагувати оцінку</h3><input type="hidden" id="egm-id">' +
    '<div class="da-form-group"><label class="da-label">Оцінка (1–12)</label><input type="number" class="da-input" id="egm-grade" min="1" max="12"></div>' +
    '<div class="da-form-group"><label class="da-label">Опис</label><input type="text" class="da-input" id="egm-desc"></div>' +
    '<div class="da-alert" id="egm-alert" style="display:none"></div>' +
    '<div class="da-modal-actions"><button class="da-btn-primary" id="btn-save-edit-grade">Зберегти</button><button class="da-btn" id="btn-cancel-edit-grade">Скасувати</button></div></div></div>';
  return html + "</div>";
}

const EXPORT_ICON =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7h-2v3H9l3 3 3-3h-2zm1-6.5L18.5 8H14z"/></svg>';

async function teacherSummary(env: Env, url: URL, user: User, classId: number, cls: ClassRow): Promise<string> {
  const info = await currentSubject(env, url, user, classId);
  let students: Awaited<ReturnType<typeof db.getClassStudentsGrades>> = [];
  const finals: Record<number, number> = {};
  if (info.current) {
    students = await db.getClassStudentsGrades(env.DB, classId, info.current);
    const rows = await db.getClassFinalGrades(env.DB, classId, info.current);
    for (let i = 0; i < rows.length; i++) finals[rows[i].student_id] = rows[i].grade;
  }

  let exportSubject = "";
  if (info.current) {
    exportSubject =
      '<a href="/api/export_grades?cid=' + classId + "&subject=" + encodeURIComponent(info.current) + '" class="da-btn--export" title="Завантажити оцінки з предмету ' + esc(info.current) + '">' +
      EXPORT_ICON + esc(info.current) + " .xlsx</a>";
  }

  let html =
    '<style>.da-export-bar{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}.da-export-bar .da-panel-title{margin-bottom:0;flex:1}' +
    ".da-btn--export{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;background:#1a7a4a;color:#fff!important;text-decoration:none!important;border:none;cursor:pointer;transition:background .15s}" +
    ".da-btn--export:hover{background:#155e38}.da-btn--export svg{width:15px;height:15px;fill:#fff;flex-shrink:0}</style>" +
    '<div class="da-panel"><div class="da-export-bar"><h2 class="da-panel-title">Підсумкові оцінки — ' + esc(cls.name) + "</h2>" + exportSubject +
    '<a href="/api/export_grades?cid=' + classId + '" class="da-btn--export" title="Завантажити всі оцінки класу">' + EXPORT_ICON + "Весь клас .xlsx</a></div>" +
    subjectPicker(url, info.subjects, user.subject || "", info.current) +
    '<div class="da-summary-table-wrap"><table class="da-summary-table"><thead><tr><th>Учень</th><th>Середній бал</th><th>Виведена оцінка</th><th></th></tr></thead><tbody>';

  for (let i = 0; i < students.length; i++) {
    const st = students[i];
    const name = st.last_name + " " + st.first_name;
    let avg = "—";
    if (st.avg_grade) avg = "<span class='da-avg-pill'>" + st.avg_grade.toFixed(1) + "</span>";
    let fin = "—";
    if (finals[st.id]) fin = "<span class='da-final-badge'>" + finals[st.id] + "</span>";
    html +=
      '<tr id="fgrow-' + st.id + '"><td>' + esc(name) + "</td><td>" + avg + '</td><td><span id="fg-' + st.id + '">' + fin + "</span></td>" +
      '<td><button class="da-btn da-btn--sm da-btn--teal set-final-btn" data-uid="' + st.id + '" data-name="' + esc(name) + '" data-subject="' + esc(info.current) + '" data-cid="' + classId + '">Виставити</button></td></tr>';
  }
  if (students.length === 0) html += '<tr><td colspan="4" class="da-empty">Виберіть предмет.</td></tr>';

  html +=
    '</tbody></table></div><div class="da-modal" id="da-final-modal" style="display:none"><div class="da-modal-overlay"></div><div class="da-modal-inner"><h3>Виведена оцінка — <span id="fm-name"></span></h3>' +
    '<input type="hidden" id="fm-uid"><input type="hidden" id="fm-cid"><input type="hidden" id="fm-subject">' +
    '<div class="da-form-group"><label class="da-label">Семестр</label><select class="da-input" id="fm-semester"><option value="1">I семестр</option><option value="2">II семестр</option><option value="3">Річний</option></select></div>' +
    '<div class="da-form-group"><label class="da-label">Оцінка (1–12)</label><input type="number" class="da-input" id="fm-grade" min="1" max="12"></div>' +
    '<div class="da-alert" id="fm-alert" style="display:none"></div>' +
    '<div class="da-modal-actions"><button class="da-btn-primary" id="btn-save-final">Зберегти</button><button class="da-btn" id="btn-final-cancel">Скасувати</button></div></div></div></div>';
  return html;
}

async function teacherMaterials(env: Env, user: User, classId: number, cls: ClassRow): Promise<string> {
  const materials = await db.getTeacherMaterials(env.DB, classId, user.id);
  const subjects = await db.getClassSubjects(env.DB, classId);

  let subjectField = "";
  if (user.subject) {
    subjectField = '<input type="text" class="da-input" id="mat-subject" value="' + esc(user.subject) + '" readonly style="background:#f2faf9;cursor:default;font-weight:700;color:var(--brand)">';
  } else {
    subjectField = '<select class="da-input" id="mat-subject">';
    for (let i = 0; i < subjects.length; i++) {
      subjectField += '<option value="' + esc(subjects[i].name) + '">' + esc(subjects[i].name) + "</option>";
    }
    subjectField += "</select>";
  }

  let html =
    '<div class="da-panel"><h2 class="da-panel-title">Матеріали — ' + esc(cls.name) + "</h2>" +
    '<div class="da-add-form"><h3 class="da-form-title">Завантажити матеріал</h3><div class="da-form-row2">' +
    '<div class="da-form-group"><label class="da-label">Предмет</label>' + subjectField + "</div>" +
    '<div class="da-form-group"><label class="da-label">Назва</label><input type="text" class="da-input" id="mat-title" placeholder="Назва матеріалу"></div></div>' +
    '<div class="da-form-group"><label class="da-label">Файл (.docx або .pptx)</label><label class="da-file-label"><span id="mat-file-name">Виберіть файл...</span><input type="file" id="mat-file" accept=".docx,.pptx" style="display:none"></label></div>' +
    '<div class="da-alert" id="mat-alert" style="display:none"></div>' +
    '<button class="da-btn-primary" id="btn-upload-mat" data-cid="' + classId + '"><span class="da-btn-text">Завантажити</span><span class="da-spinner" style="display:none"></span></button></div>' +
    '<h3 class="da-section-sub">Мої матеріали</h3><div class="da-materials-list" id="da-mat-list">';
  if (materials.length === 0) html += '<div class="da-empty">Матеріалів ще немає.</div>';
  for (let i = 0; i < materials.length; i++) html += materialCard(materials[i], true);
  return html + "</div></div>";
}

export async function renderTeacher(env: Env, url: URL, user: User): Promise<string> {
  const classes = await db.getUserClasses(env.DB, user.id);
  let classId = pickClass(url, classes);
  let cls: ClassRow | null = null;
  for (let i = 0; i < classes.length; i++) {
    if (classes[i].id === classId) cls = classes[i];
  }
  if (!cls) classId = 0;

  let tab = param(url, "da_tab");
  if (!tab) tab = "schedule";

  let classLinks = '<div class="da-sb-section"><div class="da-sb-label">Мої класи</div>';
  for (let i = 0; i < classes.length; i++) {
    let active = "";
    if (classId === classes[i].id) active = "active";
    classLinks += '<a href="' + esc(link(url, { da_class: classes[i].id, da_tab: "schedule", da_subj: "" })) + '" class="da-sb-class-link ' + active + '">' + esc(classes[i].name) + "</a>";
  }
  classLinks += "</div>";

  let menu = "";
  if (cls) {
    menu = '<div class="da-sb-section"><div class="da-sb-label">' + esc(cls.name) + "</div>" + teacherNav(url, tab, classId) + "</div>";
  }

  let main = "";
  if (!cls) {
    main = emptyState(icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 26), "Виберіть клас у меню зліва.");
  } else if (tab === "homework") {
    main = await teacherHomework(env, user, classId, cls);
  } else if (tab === "grades") {
    main = await teacherGrades(env, url, user, classId, cls);
  } else if (tab === "summary") {
    main = await teacherSummary(env, url, user, classId, cls);
  } else if (tab === "materials") {
    main = await teacherMaterials(env, user, classId, cls);
  } else {
    main = scheduleView(await db.getSchedule(env.DB, classId), 0);
  }

  return (
    '<div class="da-cabinet da-cabinet--teacher">' + (await renderHeader(env, user, true)) +
    '<div class="da-body"><aside class="da-sidebar" id="da-sidebar">' + classLinks + menu + "</aside>" +
    '<main class="da-main">' + main + "</main></div></div>"
  );
}

const EMOJIS = ["😀", "😂", "😍", "😎", "🤔", "😢", "😡", "👍", "👎", "❤️", "🎉", "🔥", "✅", "❌", "📚", "✏️", "📝", "🏆", "💡", "⚡", "🎯", "💪", "🙏", "👏", "🤝"];

export async function renderChat(env: Env, url: URL, user: User): Promise<string> {
  const params = new URLSearchParams(url.searchParams);
  params.delete("da_view");
  params.delete("da_chat");
  const backText = params.toString();
  let backUrl = url.pathname;
  if (backText) backUrl += "?" + backText;

  const svg = (paths: string, size: number, extra: string) =>
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + (extra || "currentColor") + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";

  let emojiHtml = "";
  for (let i = 0; i < EMOJIS.length; i++) {
    emojiHtml += '<span data-emoji="' + EMOJIS[i] + '">' + EMOJIS[i] + "</span>";
  }

  const chat =
    '<div class="da-chat-wrap" id="da-chat-wrap"><div class="da-chat-sidebar" id="da-chat-sidebar"><div class="da-chat-sidebar-head"><span class="da-chat-sidebar-title">Повідомлення</span>' +
    '<a href="' + esc(backUrl) + '" class="da-chat-back-btn" title="Назад">' + svg('<polyline points="15 18 9 12 15 6"/>', 18, "") + "</a></div>" +
    '<div class="da-chat-search-wrap">' + svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 15, "") +
    '<input type="text" id="da-chat-search" class="da-chat-search-input" placeholder="Пошук за email або ім\'ям..."></div>' +
    '<div id="da-chat-search-results" class="da-chat-search-results" style="display:none"></div>' +
    '<div class="da-chat-list" id="da-chat-list"><div class="da-chat-list-loading">Завантаження...</div></div></div>' +
    '<div class="da-chat-main" id="da-chat-main"><div class="da-chat-empty-state" id="da-chat-empty-state">' +
    svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 48, "#deecea").replace('stroke-width="2"', 'stroke-width="1.5"') +
    "<p>Виберіть чат або знайдіть користувача</p></div>" +
    '<div class="da-chat-window" id="da-chat-window" style="display:none;flex-direction:column;height:100%;">' +
    '<div class="da-chat-topbar"><div class="da-chat-topbar-left"><div class="da-chat-back-mobile" data-act="chat-back">' + svg('<polyline points="15 18 9 12 15 6"/>', 20, "") + "</div>" +
    '<div class="da-chat-avatar" id="da-chat-avatar">?</div><div><div class="da-chat-other-name" id="da-chat-other-name">—</div></div></div>' +
    '<div class="da-chat-topbar-right"><div class="da-chat-menu-btn" data-act="chat-menu">' + svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>', 18, "") + "</div>" +
    '<div class="da-chat-menu-dropdown" id="da-chat-menu-dropdown" style="display:none;">' +
    '<div data-act="chat-block">' + svg('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>', 13, "") + '<span id="da-block-label">Заблокувати</span></div>' +
    '<div data-act="chat-mute">' + svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>', 13, "") + '<span id="da-mute-label">Заглушити</span></div>' +
    '<div data-act="chat-clear" style="color:#c0392b;">' + svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>', 13, "") + "Очистити чат</div></div></div></div>" +
    '<div class="da-chat-messages" id="da-chat-messages"></div>' +
    '<div class="da-emoji-picker" id="da-emoji-picker" style="display:none;">' + emojiHtml + "</div>" +
    '<div class="da-chat-input-bar"><div class="da-chat-input-btn" data-act="chat-emoji" title="Емодзі">' +
    svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>', 20, "") + "</div>" +
    '<label class="da-chat-input-btn" title="Файл">' + svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>', 20, "") +
    '<input type="file" id="da-chat-file" style="display:none"></label>' +
    '<label class="da-chat-input-btn" title="Фото / камера">' + svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>', 20, "") +
    '<input type="file" id="da-chat-photo" accept="image/*" capture="environment" style="display:none"></label>' +
    '<div class="da-chat-input-wrap"><div id="da-chat-file-preview" style="display:none;"></div><textarea id="da-chat-textarea" class="da-chat-textarea" placeholder="Написати повідомлення..." rows="1"></textarea></div>' +
    '<div class="da-chat-send-btn" data-act="chat-send">' + svg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', 18, "") + "</div></div></div></div></div>";

  const isTeacher = user.role === "teacher";
  return (await renderHeader(env, user, isTeacher)) + chat;
}

export async function renderCabinetPage(env: Env, url: URL, user: User): Promise<string> {
  let body = "";
  if (param(url, "da_view") === "chat") {
    body = await renderChat(env, url, user);
  } else if (user.role === "teacher") {
    body = await renderTeacher(env, url, user);
  } else {
    body = await renderStudent(env, url, user);
  }

  const maxMb = parseInt(await db.getSetting(env.DB, "max_file_size", "15"), 10) || 15;
  const config = JSON.stringify({ user_id: user.id, max_file_mb: maxMb });

  return (
    '<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    "<title>Кабінет — Дніпро Академія</title>" +
    '<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/client.css"><link rel="stylesheet" href="/css/extra.css">' +
    '</head><body><div id="da-config" data-config="' + esc(config) + '"></div>' + body + '<script src="/assets/cabinet.js"></script></body></html>'
  );
}
