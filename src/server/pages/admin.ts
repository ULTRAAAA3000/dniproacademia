import type { Env } from "../types";
import * as db from "../db";
import { esc, fmtDateTime, fmtDateTimeSec, fmtDate, fmtTime, formatSize, toInt, cleanText } from "../utils";

const TABS: [string, string][] = [
  ["users", "Користувачі"],
  ["classes", "Класи"],
  ["schedule", "Розклад"],
  ["settings", "Налаштування"],
  ["security", "Безпека"],
  ["audit", "Журнал дій"],
];

const ACTION_LABELS: Record<string, [string, string]> = {
  add: ["Додано", "#16a085"],
  edit: ["Змінено", "#d68910"],
  delete: ["Видалено", "#c0392b"],
  approve: ["Підтверджено", "#2980b9"],
  reject: ["Відхилено", "#8e44ad"],
  grade_submission: ["Перевірено", "#1a7a4a"],
};

const ENTITY_LABELS: Record<string, string> = {
  homework: "ДЗ",
  grade: "Оцінка",
  final_grade: "Підсумкова",
  material: "Матеріал",
  news: "Новина",
  user: "Користувач",
  class: "Клас",
  subject: "Предмет",
  schedule: "Розклад",
};

const FAIL_LABELS: Record<string, [string, string]> = {
  bad_password: ["Невірний пароль", "#d68910"],
  bad_otp: ["Невірний код 2FA", "#8e44ad"],
  user_not_found: ["Акаунт не знайдено", "#2980b9"],
  bad_recovery: ["Невірне кодове слово", "#d35400"],
  admin_bad_password: ["Невірний пароль адміна", "#c0392b"],
};

function shell(title: string, body: string, withScript: boolean): string {
  let script = "";
  if (withScript) script = '<script src="/assets/admin.js"></script>';
  return (
    '<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    "<title>" + esc(title) + "</title>" +
    '<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/admin.css"><link rel="stylesheet" href="/css/admin-base.css">' +
    "</head><body>" + body + script + "</body></html>"
  );
}

export function renderAdminLogin(error: string): string {
  let message = "";
  if (error === "1") message = '<div class="da-login-error">Невірний пароль.</div>';
  if (error === "lock") message = '<div class="da-login-error">Забагато спроб. Спробуйте через 15 хвилин.</div>';
  const body =
    '<div class="da-login-box"><h1>Щоденник — Адміністратор</h1>' + message +
    '<form method="post" action="/api/admin/login"><label>Пароль</label><input type="password" name="password" class="da-input" autofocus required>' +
    '<button type="submit" class="da-btn da-btn--teal">Увійти</button></form></div>';
  return shell("Вхід адміністратора", body, false);
}

async function listStats(env: Env, prefix: string): Promise<{ count: number; size: number }> {
  let count = 0;
  let size = 0;
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 50; i++) {
    const page: R2Objects = await env.FILES.list({ prefix: prefix, cursor: cursor });
    for (let j = 0; j < page.objects.length; j++) {
      count++;
      size += page.objects[j].size;
    }
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return { count: count, size: size };
}

function tabLink(tab: string, extra: Record<string, string | number>): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  for (const key in extra) params.set(key, String(extra[key]));
  return "/admin?" + params.toString();
}

async function tabUsers(env: Env): Promise<string> {
  const pending = await db.getPendingUsers(env.DB);
  const students = await db.getStudents(env.DB);
  const teachers = await db.getTeachers(env.DB);
  const classes = await db.getClasses(env.DB);

  const classNames: Record<number, string> = {};
  for (let i = 0; i < classes.length; i++) classNames[classes[i].id] = classes[i].name;

  let html = '<div class="da-section"><h2 class="da-section-title">Очікують підтвердження (' + pending.length + ")</h2>";
  if (pending.length === 0) {
    html += '<p class="da-empty">Нових реєстрацій немає.</p>';
  } else {
    html += '<div class="da-table-wrap"><table class="da-table"><thead><tr><th>Ім\'я</th><th>Прізвище</th><th>Email</th><th>Дата</th><th>Дія</th></tr></thead><tbody>';
    for (let i = 0; i < pending.length; i++) {
      const u = pending[i];
      let options = "";
      for (let j = 0; j < classes.length; j++) {
        options += '<option value="' + classes[j].id + '">' + esc(classes[j].name) + "</option>";
      }
      html +=
        "<tr><td>" + esc(u.first_name) + "</td><td>" + esc(u.last_name) + "</td><td>" + esc(u.email) + "</td><td>" + fmtDateTime(u.created_at) + "</td><td>" +
        '<div class="da-assign-form"><select class="da-select" name="role_' + u.id + '"><option value="student">Учень</option><option value="teacher">Вчитель</option></select>' +
        '<select class="da-select" name="class_' + u.id + '">' + options + "</select>" +
        '<input type="text" class="da-input" placeholder="Предмет (для вчителя)" id="subj_' + u.id + '">' +
        '<button class="da-btn da-btn--teal" data-action="assign_user" data-uid="' + u.id + '">Підтвердити</button></div></td></tr>';
    }
    html += "</tbody></table></div>";
  }
  html += "</div>";

  html += '<div class="da-section"><h2 class="da-section-title">Учні (' + students.length + ')</h2><div class="da-table-wrap"><table class="da-table"><thead><tr><th>Прізвище</th><th>Ім\'я</th><th>Email</th><th>Клас</th><th>Дія</th></tr></thead><tbody>';
  for (let i = 0; i < students.length; i++) {
    const u = students[i];
    let className = "—";
    if (u.class_id && classNames[u.class_id]) className = classNames[u.class_id];
    html +=
      "<tr><td>" + esc(u.last_name) + "</td><td>" + esc(u.first_name) + "</td><td>" + esc(u.email) + "</td><td>" + esc(className) + "</td>" +
      '<td><button class="da-btn da-btn--red" data-action="delete_user" data-uid="' + u.id + '">Видалити</button></td></tr>';
  }
  if (students.length === 0) html += '<tr><td colspan="5" class="da-empty">Учнів немає</td></tr>';
  html += "</tbody></table></div></div>";

  html += '<div class="da-section"><h2 class="da-section-title">Вчителі (' + teachers.length + ')</h2><div class="da-table-wrap"><table class="da-table"><thead><tr><th>Прізвище</th><th>Ім\'я</th><th>Email</th><th>Предмет</th><th>Дія</th></tr></thead><tbody>';
  for (let i = 0; i < teachers.length; i++) {
    const u = teachers[i];
    let subject = "—";
    if (u.subject) subject = u.subject;
    html +=
      "<tr><td>" + esc(u.last_name) + "</td><td>" + esc(u.first_name) + "</td><td>" + esc(u.email) + "</td><td>" + esc(subject) + "</td>" +
      '<td><button class="da-btn da-btn--red" data-action="delete_user" data-uid="' + u.id + '">Видалити</button></td></tr>';
  }
  if (teachers.length === 0) html += '<tr><td colspan="5" class="da-empty">Вчителів немає</td></tr>';
  return html + "</tbody></table></div></div>";
}

async function classDetail(env: Env, classId: number): Promise<string> {
  const students = await db.getClassMembers(env.DB, classId, "student");
  const teachers = await db.getClassMembers(env.DB, classId, "teacher");
  const subjects = await db.getClassSubjects(env.DB, classId);
  const news = await db.getNews(env.DB, classId);

  let html = '<div class="da-class-detail"><div class="da-detail-section"><h3>Предмети</h3><div class="da-chip-list">';
  for (let i = 0; i < subjects.length; i++) {
    html += '<span class="da-chip">' + esc(subjects[i].name) + '<button class="da-chip-del" data-action="del_subject" data-sid="' + subjects[i].id + '">×</button></span>';
  }
  html +=
    '</div><div class="da-inline-form"><input type="text" class="da-input" id="subj-input-' + classId + '" placeholder="Назва предмету">' +
    '<button class="da-btn da-btn--teal" data-action="add_subject" data-cid="' + classId + '">Додати</button></div></div>';

  html += '<div class="da-detail-section"><h3>Вчителі</h3><ul class="da-member-list">';
  for (let i = 0; i < teachers.length; i++) {
    const t = teachers[i];
    let subj = "";
    if (t.subject) subj = "<em>(" + esc(t.subject) + ")</em>";
    html +=
      "<li>" + esc(t.last_name + " " + t.first_name) + " " + subj +
      '<button class="da-btn da-btn--xs da-btn--red" data-action="remove_member" data-cid="' + classId + '" data-uid="' + t.id + '">&times;</button></li>';
  }
  html +=
    '</ul><div class="da-inline-form"><input type="email" class="da-input" id="add-teacher-' + classId + '" placeholder="Email вчителя">' +
    '<button class="da-btn da-btn--teal" data-action="add_member" data-cid="' + classId + '" data-role="teacher">Додати</button></div></div>';

  html += '<div class="da-detail-section"><h3>Новини класу</h3><div class="da-news-admin-list" id="news-list-' + classId + '">';
  for (let i = 0; i < news.length; i++) {
    const n = news[i];
    html +=
      '<div class="da-news-admin-item" id="anews-' + n.id + '"><div class="da-news-admin-title">' + esc(n.title) + "</div>" +
      '<div class="da-news-admin-meta">' + esc(n.author_name) + " · " + fmtDateTime(n.created_at) + "</div>" +
      '<button class="da-btn da-btn--xs da-btn--red da-admin-del-news" data-id="' + n.id + '" data-cid="' + classId + '">Видалити</button></div>';
  }
  if (news.length === 0) html += '<div class="da-empty">Новин ще немає.</div>';
  html +=
    '</div><div class="da-news-admin-form" style="margin-top:10px;"><input type="text" class="da-input da-news-title-inp" placeholder="Тема" id="news-title-' + classId + '" style="margin-bottom:6px;">' +
    '<textarea class="da-input" rows="2" placeholder="Текст новини..." id="news-body-' + classId + '" style="margin-bottom:6px;resize:vertical;"></textarea>' +
    '<button class="da-btn da-btn--teal da-admin-add-news" data-cid="' + classId + '">Опублікувати</button></div></div>';

  html += '<div class="da-detail-section"><h3>Учні</h3><ul class="da-member-list">';
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    html +=
      "<li>" + esc(s.last_name + " " + s.first_name) +
      '<button class="da-btn da-btn--xs da-btn--red" data-action="remove_member" data-cid="' + classId + '" data-uid="' + s.id + '">&times;</button></li>';
  }
  html +=
    '</ul><div class="da-inline-form"><input type="email" class="da-input" id="add-student-' + classId + '" placeholder="Email учня">' +
    '<button class="da-btn da-btn--teal" data-action="add_member" data-cid="' + classId + '" data-role="student">Додати</button></div></div></div>';
  return html;
}

async function tabClasses(env: Env, url: URL): Promise<string> {
  const classes = await db.getClasses(env.DB);
  const open = toInt(url.searchParams.get("class"));

  let html =
    '<div class="da-section"><h2 class="da-section-title">Класи</h2><div class="da-add-class-form">' +
    '<input type="text" id="new-class-name" class="da-input" placeholder="Назва класу (напр. 9-А)">' +
    '<button class="da-btn da-btn--teal" data-action="add_class">Додати клас</button></div><div class="da-classes-grid">';

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    let openClass = "";
    if (open === cls.id) openClass = "da-class-card--open";
    html +=
      '<div class="da-class-card ' + openClass + '"><div class="da-class-card-head"><span class="da-class-name">' + esc(cls.name) + '</span><div class="da-class-actions">' +
      '<a href="' + esc(tabLink("classes", { class: cls.id })) + '" class="da-btn da-btn--sm da-btn--teal">Відкрити</a>' +
      '<button class="da-btn da-btn--sm da-btn--red" data-action="delete_class" data-cid="' + cls.id + '">&times;</button></div></div>';
    if (open === cls.id) html += await classDetail(env, cls.id);
    html += "</div>";
  }
  if (classes.length === 0) html += '<p class="da-empty">Класів ще немає.</p>';
  return html + "</div></div>";
}

async function tabSchedule(env: Env, url: URL): Promise<string> {
  const classes = await db.getClasses(env.DB);
  const open = toInt(url.searchParams.get("class"));
  const dayNames = ["Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця"];

  let html = '<div class="da-section"><h2 class="da-section-title">Розклад</h2><div class="da-schedule-class-select">';
  for (let i = 0; i < classes.length; i++) {
    let active = "";
    if (open === classes[i].id) active = "da-btn--teal";
    html += '<a href="' + esc(tabLink("schedule", { class: classes[i].id })) + '" class="da-btn da-btn--sm ' + active + '">' + esc(classes[i].name) + "</a>";
  }
  html += "</div>";

  const cls = await db.getClass(env.DB, open);
  if (open && cls) {
    const schedule = await db.getSchedule(env.DB, open);
    const subjects = await db.getClassSubjects(env.DB, open);

    html +=
      '<div class="da-schedule-editor"><h3 class="da-class-name">Клас: ' + esc(cls.name) + '</h3><div class="da-schedule-table-wrap"><table class="da-schedule-table"><thead><tr><th>#</th>';
    for (let d = 0; d < dayNames.length; d++) html += "<th>" + dayNames[d] + "</th>";
    html += "</tr></thead><tbody>";

    for (let p = 1; p <= 8; p++) {
      html += '<tr><td class="da-period-num">' + p + "</td>";
      for (let d = 1; d <= 5; d++) {
        html += '<td class="da-schedule-cell">';
        for (let i = 0; i < schedule.length; i++) {
          const entry = schedule[i];
          if (entry.day !== d || entry.period !== p) continue;
          html += '<div class="da-schedule-entry"><span class="da-entry-subj">' + esc(entry.subject) + "</span>";
          if (entry.group_name !== "all") html += '<span class="da-entry-meta">' + esc(entry.group_name) + "</span>";
          if (entry.week_type !== "all") {
            let label = "З";
            if (entry.week_type === "numerator") label = "Ч";
            html += '<span class="da-entry-meta">' + label + "</span>";
          }
          html += '<button class="da-del-entry" data-action="del_schedule" data-id="' + entry.id + '">&times;</button></div>';
        }
        html += '<button class="da-add-slot" data-cid="' + open + '" data-day="' + d + '" data-period="' + p + '">+</button></td>';
      }
      html += "</tr>";
    }
    html += "</tbody></table></div></div>";

    let options = "";
    for (let i = 0; i < subjects.length; i++) {
      options += '<option value="' + esc(subjects[i].name) + '">' + esc(subjects[i].name) + "</option>";
    }
    html +=
      '<div class="da-modal" id="da-schedule-modal" style="display:none"><div class="da-modal-inner"><h3>Додати урок</h3>' +
      '<input type="hidden" id="sch-cid"><input type="hidden" id="sch-day"><input type="hidden" id="sch-period">' +
      '<div class="da-form-row"><label>Предмет</label><select id="sch-subject" class="da-select">' + options + "</select></div>" +
      '<div class="da-form-row"><label>Група</label><select id="sch-group" class="da-select"><option value="all">Всі</option><option value="group1">Група 1</option><option value="group2">Група 2</option></select></div>' +
      '<div class="da-form-row"><label>Тиждень</label><select id="sch-week" class="da-select"><option value="all">Щотижня</option><option value="numerator">Чисельник</option><option value="denominator">Знаменник</option></select></div>' +
      '<div class="da-modal-actions"><button class="da-btn da-btn--teal" id="sch-save">Зберегти</button><button class="da-btn" id="sch-cancel">Скасувати</button></div></div></div>';
  }
  return html + "</div>";
}

function checked(value: string): string {
  if (value === "1") return "checked";
  return "";
}

async function tabSettings(env: Env, url: URL): Promise<string> {
  const maxSize = parseInt(await db.getSetting(env.DB, "max_file_size", "15"), 10) || 15;
  const autoCleanup = await db.getSetting(env.DB, "auto_cleanup", "1");
  const cleanupDays = parseInt(await db.getSetting(env.DB, "cleanup_days", "30"), 10) || 30;
  const chatDays = parseInt(await db.getSetting(env.DB, "chat_cleanup_days", "60"), 10);
  const lastCleanup = await db.getSetting(env.DB, "last_cleanup", "—");
  const lastCount = parseInt(await db.getSetting(env.DB, "last_cleanup_count", "0"), 10);
  const twofa = await db.getSetting(env.DB, "2fa_enabled", "1");
  const otpMax = parseInt(await db.getSetting(env.DB, "otp_max_attempts", "3"), 10) || 3;
  const otpLock = parseInt(await db.getSetting(env.DB, "otp_lockout_mins", "5"), 10) || 5;

  let notice = "";
  if (url.searchParams.get("saved")) notice = '<div class="notice notice-success"><p>Налаштування збережено.</p></div>';
  if (url.searchParams.get("cleaned") !== null) {
    notice = '<div class="notice notice-success"><p>Очищення виконано. Видалено файлів: ' + toInt(url.searchParams.get("cleaned")) + "</p></div>";
  }

  const submissions = await listStats(env, "submissions/");
  const materials = await listStats(env, "materials/");
  const chat = await listStats(env, "chat/");

  let lastText = lastCleanup;
  if (lastCleanup !== "—") lastText = fmtDateTime(lastCleanup);

  const statCard = (label: string, value: string, sub: string) =>
    '<div class="da-stat-card"><div class="da-stat-label">' + label + '</div><div class="da-stat-value">' + value + '</div><div class="da-stat-sub">' + sub + "</div></div>";

  return (
    notice +
    '<form method="post" action="/api/admin/save_settings">' +
    '<div class="da-section"><h2 class="da-section-title">Статистика сховища</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:16px;">' +
    statCard("Здачі ДЗ учнів", submissions.count + " файлів", formatSize(submissions.size)) +
    statCard("Матеріали вчителів", materials.count + " файлів", formatSize(materials.size)) +
    statCard("Файли чату", chat.count + " файлів", formatSize(chat.size)) +
    statCard("Разом", formatSize(submissions.size + materials.size + chat.size), "Останнє очищення: " + esc(lastText)) +
    '</div><div style="background:#f2faf9;border:1px solid #deecea;border-radius:8px;padding:12px 16px;font-size:13px;color:#2d4742;line-height:1.7;">' +
    "<strong>Як це працює:</strong><br><strong>Здачі ДЗ</strong> — старі файли видаляються через N днів. Запис про здачу та оцінку <em>зберігається</em> назавжди.<br>" +
    "<strong>Матеріали вчителів</strong> — docx/pptx вже є стиснутими форматами. Ці файли <em>не видаляються автоматично</em>.</div></div>" +

    '<div class="da-section"><h2 class="da-section-title">Двофакторна аутентифікація (2FA)</h2><table class="da-settings-table">' +
    '<tr><td class="da-settings-label">Увімкнути 2FA при вході</td><td><label class="da-toggle"><input type="checkbox" name="2fa_enabled" ' + checked(twofa) + '><span class="da-toggle-slider"></span></label>' +
    '<span class="da-settings-hint">Якщо вимкнено — код на пошту не відправляється, вхід одразу після пароля.</span></td></tr>' +
    '<tr><td class="da-settings-label">Максимальна кількість спроб введення коду</td><td><input type="number" name="otp_max_attempts" value="' + otpMax + '" min="1" max="10" class="da-input" style="width:80px"><span class="da-settings-hint">Після цього входи блокуються. Рекомендовано: 3.</span></td></tr>' +
    '<tr><td class="da-settings-label">Час блокування після вичерпання спроб (хвилин)</td><td><input type="number" name="otp_lockout_mins" value="' + otpLock + '" min="1" max="60" class="da-input" style="width:80px"><span class="da-settings-hint">Рекомендовано: 5.</span></td></tr></table>' +
    '<div style="background:#f0faf7;border:1px solid #c8e8e0;border-radius:8px;padding:12px 16px;font-size:13px;color:#2d4742;line-height:1.7;margin-top:12px;">Код складається з <strong>3 цифр</strong>, дійсний <strong>10 хвилин</strong>.<br>Після ' +
    otpMax + " невдалих спроб — блокування на " + otpLock + " хв.</div></div>" +

    '<div class="da-section"><h2 class="da-section-title">Завантаження файлів</h2><table class="da-settings-table"><tr><td class="da-settings-label">Максимальний розмір файлу (МБ)</td><td>' +
    '<input type="number" name="max_file_size" value="' + maxSize + '" min="1" max="100" class="da-input" style="width:100px"><span class="da-settings-hint">Рекомендовано: 15 МБ.</span></td></tr></table></div>' +

    '<div class="da-section"><h2 class="da-section-title">Автовидалення повідомлень чату</h2><table class="da-settings-table"><tr><td class="da-settings-label">Видаляти повідомлення старіші за (днів)</td><td>' +
    '<input type="number" name="chat_cleanup_days" value="' + chatDays + '" min="0" max="365" class="da-input" style="width:100px"><span class="da-settings-hint">Встановіть 0 — вимкнути.</span></td></tr></table></div>' +

    '<div class="da-section"><h2 class="da-section-title">Автоматичне очищення файлів завдань</h2><table class="da-settings-table">' +
    '<tr><td class="da-settings-label">Увімкнути автоочищення</td><td><label class="da-toggle"><input type="checkbox" name="auto_cleanup" ' + checked(autoCleanup) + '><span class="da-toggle-slider"></span></label>' +
    '<span class="da-settings-hint">Тільки файли здач ДЗ. Матеріали вчителів не зачіпаються.</span></td></tr>' +
    '<tr><td class="da-settings-label">Видаляти файли старіші за (днів)</td><td><input type="number" name="cleanup_days" value="' + cleanupDays + '" min="1" max="365" class="da-input" style="width:100px"><span class="da-settings-hint">Запис про здачу та оцінку зберігається.</span></td></tr>' +
    '<tr><td class="da-settings-label">Статус останнього очищення</td><td><span style="font-size:13px;color:#6b8f89;">' + esc(lastText) + (lastCount ? " · Видалено файлів: " + lastCount : "") + "</span></td></tr></table>" +
    '<div style="margin-top:16px;display:flex;gap:10px;align-items:center;"><button type="submit" name="save" value="1" class="da-btn da-btn--teal">Зберегти налаштування</button>' +
    '<button type="submit" name="manual_cleanup" value="1" class="da-btn" data-confirm="Запустити очищення зараз? Старі файли буде видалено.">Запустити очищення зараз</button></div></div></form>'
  );
}

async function tabSecurity(env: Env, url: URL): Promise<string> {
  const limitEnabled = await db.getSetting(env.DB, "reg_limit_enabled", "1");
  const limitDays = parseInt(await db.getSetting(env.DB, "reg_limit_days", "7"), 10) || 7;
  const siteKey = await db.getSetting(env.DB, "turnstile_site_key", "");
  const secret = await db.getSetting(env.DB, "turnstile_secret", "");
  const threshold = parseInt(await db.getSetting(env.DB, "fail_alert_threshold", "10"), 10) || 0;

  const blacklist = await db.getBlacklist(env.DB);
  const regLog = await db.getRegLog(env.DB, 100);
  let suspiciousLimit = 5;
  if (threshold > 0) suspiciousLimit = threshold;
  const suspicious = await db.getSuspiciousIps(env.DB, suspiciousLimit, 60);
  const fails = await db.getLoginFails(env.DB, 100);

  const blocked: Record<string, boolean> = {};
  for (let i = 0; i < blacklist.length; i++) blocked[blacklist[i].ip] = true;

  let notice = "";
  if (url.searchParams.get("saved")) notice = '<div class="notice notice-success is-dismissible"><p>Налаштування збережено.</p></div>';

  let html =
    notice +
    '<div class="da-section"><h2 class="da-section-title">Захист від спаму при реєстрації</h2><form method="post" action="/api/admin/save_security"><table class="da-settings-table">' +
    '<tr><td class="da-settings-label">Обмеження реєстрації по IP</td><td><label class="da-toggle"><input type="checkbox" name="reg_limit_enabled" ' + checked(limitEnabled) +
    '><span class="da-toggle-slider"></span></label><span class="da-settings-hint">Одна реєстрація з однієї IP за вказаний період</span></td></tr>' +
    '<tr><td class="da-settings-label">Інтервал блокування (днів)</td><td><input type="number" name="reg_limit_days" value="' + limitDays + '" min="1" max="365" class="da-input" style="width:100px"></td></tr>' +
    '<tr><td class="da-settings-label" style="padding-top:16px;border-top:1px solid #eee;">Cloudflare Turnstile — Site Key</td><td style="padding-top:16px;border-top:1px solid #eee;">' +
    '<input type="text" name="turnstile_site_key" value="' + esc(siteKey) + '" class="da-input" style="width:340px" placeholder="0x4AAAA..."><span class="da-settings-hint">Залиште порожнім — CAPTCHA вимкнена.</span></td></tr>' +
    '<tr><td class="da-settings-label">Cloudflare Turnstile — Secret Key</td><td><input type="text" name="turnstile_secret" value="' + esc(secret) + '" class="da-input" style="width:340px" placeholder="0x4AAAA..."></td></tr>' +
    '<tr><td class="da-settings-label" style="padding-top:16px;border-top:1px solid #eee;">Алерт адміну при N невдалих входах/год</td><td style="padding-top:16px;border-top:1px solid #eee;">' +
    '<input type="number" name="fail_alert_threshold" value="' + threshold + '" min="0" max="100" class="da-input" style="width:80px"><span class="da-settings-hint">0 — вимкнути.</span></td></tr></table>' +
    '<button type="submit" class="da-btn da-btn--teal" style="margin-top:12px">Зберегти</button></form></div>';

  html += '<div class="da-section" style="margin-top:24px"><h2 class="da-section-title">Підозріла активність (остання година)</h2>';
  if (suspicious.length === 0) {
    html += '<div class="da-empty" style="padding:12px 0;">Підозрілої активності не виявлено.</div>';
  } else {
    html += '<table class="da-table" style="width:100%"><thead><tr><th>IP</th><th>Невдалих спроб</th><th>Остання спроба</th><th></th></tr></thead><tbody>';
    for (let i = 0; i < suspicious.length; i++) {
      const s = suspicious[i];
      let action = '<button class="da-btn da-btn--xs da-btn--red" data-action="bl_add" data-ip="' + esc(s.ip) + '">Заблокувати IP</button>';
      if (blocked[s.ip]) action = '<span style="font-size:12px;color:#888">Вже заблоковано</span>';
      html +=
        '<tr style="background:#fff8f8"><td><code style="color:#c0392b">' + esc(s.ip) + '</code></td><td><span style="font-weight:700;color:#c0392b">' + s.fails + "</span></td><td>" +
        fmtDateTime(s.last_fail) + "</td><td>" + action + "</td></tr>";
    }
    html += "</tbody></table>";
  }
  html += "</div>";

  html += '<div class="da-section" style="margin-top:24px"><h2 class="da-section-title">Останні невдалі спроби входу</h2>';
  if (fails.length === 0) {
    html += '<div class="da-empty" style="padding:12px 0;">Невдалих спроб не зафіксовано.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table class="da-table" style="width:100%;font-size:12px"><thead><tr><th>IP</th><th>Email</th><th>Причина</th><th>Час</th></tr></thead><tbody>';
    for (let i = 0; i < fails.length; i++) {
      const f = fails[i];
      let label = f.reason;
      let color = "#888";
      if (FAIL_LABELS[f.reason]) {
        label = FAIL_LABELS[f.reason][0];
        color = FAIL_LABELS[f.reason][1];
      }
      let email = "—";
      if (f.email) email = f.email;
      html +=
        "<tr><td><code>" + esc(f.ip) + "</code></td><td>" + esc(email) + '</td><td><span style="color:' + color + ';font-weight:600">' + esc(label) + "</span></td><td>" + fmtDateTimeSec(f.created_at) + "</td></tr>";
    }
    html += "</tbody></table></div>";
  }
  html += "</div>";

  html +=
    '<div class="da-section" style="margin-top:24px"><h2 class="da-section-title">Чорний список IP</h2><div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">' +
    '<input type="text" id="bl-ip" placeholder="IP адреса" class="da-input" style="width:180px"><input type="text" id="bl-reason" placeholder="Причина (необов\'язково)" class="da-input" style="width:220px">' +
    '<button class="da-btn da-btn--red" data-action="bl_add_form">Додати в чорний список</button></div><div id="da-blacklist-table">';
  if (blacklist.length === 0) {
    html += '<div class="da-empty">Чорний список порожній</div>';
  } else {
    html += '<table class="da-table" style="width:100%"><thead><tr><th>IP</th><th>Причина</th><th>Ким заблоковано</th><th>Дата</th><th></th></tr></thead><tbody>';
    for (let i = 0; i < blacklist.length; i++) {
      const b = blacklist[i];
      let reason = "—";
      if (b.reason) reason = b.reason;
      html +=
        '<tr data-ip="' + esc(b.ip) + '"><td><code>' + esc(b.ip) + "</code></td><td>" + esc(reason) + "</td><td>Адмін</td><td>" + fmtDateTime(b.blocked_at) +
        '</td><td><button class="da-btn da-btn--xs da-btn--red" data-action="bl_remove" data-ip="' + esc(b.ip) + '">Видалити</button></td></tr>';
    }
    html += "</tbody></table>";
  }
  html += "</div></div>";

  html += '<div class="da-section" style="margin-top:24px"><h2 class="da-section-title">Журнал реєстрацій</h2>';
  if (regLog.length === 0) {
    html += '<div class="da-empty">Реєстрацій ще не було</div>';
  } else {
    html += '<table class="da-table" style="width:100%"><thead><tr><th>IP</th><th>Користувач</th><th>Email</th><th>Дата</th><th></th></tr></thead><tbody>';
    for (let i = 0; i < regLog.length; i++) {
      const r = regLog[i];
      let userName = "—";
      if (r.user_name) userName = r.user_name;
      let email = "—";
      if (r.email) email = r.email;
      let action = '<button class="da-btn da-btn--xs da-btn--red" data-action="bl_add" data-ip="' + esc(r.ip) + '">Заблокувати IP</button>';
      if (blocked[r.ip]) action = '<span style="font-size:11px;color:#c0392b;font-weight:700;">В ЧС</span>';
      html += "<tr><td><code>" + esc(r.ip) + "</code></td><td>" + esc(userName) + "</td><td>" + esc(email) + "</td><td>" + fmtDateTime(r.registered_at) + "</td><td>" + action + "</td></tr>";
    }
    html += "</tbody></table>";
  }
  return html + "</div>";
}

async function tabAudit(env: Env, url: URL): Promise<string> {
  const perPage = 50;
  let page = toInt(url.searchParams.get("al_page"));
  if (page < 1) page = 1;
  const actionFilter = cleanText(url.searchParams.get("al_action"));
  const entityFilter = cleanText(url.searchParams.get("al_entity"));

  const result = await db.getAuditLog(env.DB, perPage, (page - 1) * perPage, actionFilter, entityFilter);
  const pages = Math.ceil(result.total / perPage);

  let actionOptions = '<option value="">Всі дії</option>';
  for (const key in ACTION_LABELS) {
    let sel = "";
    if (actionFilter === key) sel = "selected";
    actionOptions += '<option value="' + key + '" ' + sel + ">" + ACTION_LABELS[key][0] + "</option>";
  }
  let entityOptions = '<option value="">Всі об\'єкти</option>';
  for (const key in ENTITY_LABELS) {
    let sel = "";
    if (entityFilter === key) sel = "selected";
    entityOptions += '<option value="' + key + '" ' + sel + ">" + ENTITY_LABELS[key] + "</option>";
  }

  let reset = "";
  if (actionFilter || entityFilter) reset = '<a href="/admin?tab=audit" class="button">Скинути</a>';

  let html =
    '<div class="da-section"><h2 class="da-section-title">Журнал дій <span style="font-size:13px;font-weight:400;color:#888;margin-left:8px">Всього: ' + result.total + " записів</span></h2>" +
    '<form method="get" action="/admin" class="da-audit-filters"><input type="hidden" name="tab" value="audit">' +
    '<select name="al_action">' + actionOptions + '</select><select name="al_entity">' + entityOptions + "</select>" +
    '<button type="submit" class="button">Фільтр</button>' + reset + "</form>";

  if (result.rows.length === 0) {
    return html + '<div class="da-audit-empty">Записів не знайдено.</div></div>';
  }

  html +=
    '<div style="overflow-x:auto"><table class="da-audit-table"><thead><tr><th>Час</th><th>Користувач</th><th>Дія</th><th>Об\'єкт</th><th>Деталі</th><th>IP</th></tr></thead><tbody>';
  for (let i = 0; i < result.rows.length; i++) {
    const log = result.rows[i];
    let label = log.action;
    let color = "#888";
    if (ACTION_LABELS[log.action]) {
      label = ACTION_LABELS[log.action][0];
      color = ACTION_LABELS[log.action][1];
    }
    let entity = log.entity;
    if (ENTITY_LABELS[log.entity]) entity = ENTITY_LABELS[log.entity];
    let details = "—";
    if (log.details) details = log.details;
    let entityId = "";
    if (log.entity_id) entityId = '<span style="font-size:10px;color:#bbb">&nbsp;#' + log.entity_id + "</span>";

    html +=
      '<tr><td style="white-space:nowrap;font-size:12px;color:#555">' + fmtDate(log.created_at) + '<br><span style="color:#aaa">' + fmtTime(log.created_at) + ":" + fmtDateTimeSec(log.created_at).slice(-2) + "</span></td>" +
      '<td><span style="font-weight:600">' + esc(log.user_name) + '</span><br><span style="font-size:11px;color:#888">' + esc(log.role) + "</span></td>" +
      '<td><span class="da-audit-badge" style="background:' + color + '">' + esc(label) + "</span></td>" +
      '<td><span class="da-audit-entity">' + esc(entity) + "</span>" + entityId + "</td>" +
      '<td><span class="da-audit-details" title="' + esc(details) + '">' + esc(details) + "</span></td>" +
      '<td><span class="da-audit-ip">' + esc(log.ip) + "</span></td></tr>";
  }
  html += "</tbody></table></div>";

  if (pages > 1) {
    html += '<div class="da-audit-pagination">';
    for (let p = 1; p <= pages; p++) {
      if (p === page) {
        html += '<span class="current">' + p + "</span>";
      } else {
        const params = new URLSearchParams();
        params.set("tab", "audit");
        if (actionFilter) params.set("al_action", actionFilter);
        if (entityFilter) params.set("al_entity", entityFilter);
        params.set("al_page", String(p));
        html += '<a href="/admin?' + esc(params.toString()) + '">' + p + "</a>";
      }
    }
    html += "</div>";
  }
  return html + "</div>";
}

export async function renderAdminPage(env: Env, url: URL): Promise<string> {
  let tab = url.searchParams.get("tab") || "users";

  let content = "";
  if (tab === "classes") {
    content = await tabClasses(env, url);
  } else if (tab === "schedule") {
    content = await tabSchedule(env, url);
  } else if (tab === "settings") {
    content = await tabSettings(env, url);
  } else if (tab === "security") {
    content = await tabSecurity(env, url);
  } else if (tab === "audit") {
    content = await tabAudit(env, url);
  } else {
    tab = "users";
    content = await tabUsers(env);
  }

  let nav = "";
  for (let i = 0; i < TABS.length; i++) {
    let active = "";
    if (tab === TABS[i][0]) active = "da-tab--active";
    nav += '<a href="' + esc(tabLink(TABS[i][0], {})) + '" class="da-tab ' + active + '">' + TABS[i][1] + "</a>";
  }

  const body =
    '<div class="wrap da-admin-wrap"><div class="da-admin-top"><h1 class="da-admin-title">Щоденник — Панель управління</h1>' +
    '<form method="post" action="/api/admin/logout"><button type="submit" class="da-btn">Вийти</button></form></div>' +
    '<nav class="da-tabs">' + nav + '</nav><div class="da-tab-content">' + content + "</div></div>";
  return shell("Щоденник — Адміністратор", body, true);
}
