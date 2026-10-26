import type { Ctx, Env, User, MessageRow, AuditActor } from "./types";
import * as db from "./db";
import * as auth from "./auth";
import { sendVerificationEmail } from "./mail";
import { buildXlsx } from "./xlsx";
import { maybeDailyCleanup, runCleanup } from "./cleanup";
import {
  jsonResponse, redirect, esc, cleanText, cleanArea, cleanEmail, toInt, getIp, isValidIp, randomHex,
  nowSql, fmtTime, fmtDate, sqlToSeconds, formatSize, fileExt, safeFileName, todayKyiv,
} from "./utils";

function str(form: FormData, name: string): string {
  const value = form.get(name);
  if (value === null || typeof value !== "string") return "";
  return value;
}

function getFile(form: FormData, name: string): File | null {
  const value = form.get(name);
  if (value === null || typeof value === "string") return null;
  const file = value as File;
  if (!file.name) return null;
  return file;
}

function fail(msg: string): Response {
  return jsonResponse({ ok: false, msg: msg });
}

function denied(): Response {
  return fail("Доступ заборонено.");
}

function actorOf(user: User): AuditActor {
  return { id: user.id, name: (user.last_name + " " + user.first_name).trim(), role: user.role };
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];
const CHAT_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "pdf", "doc", "docx", "ppt", "pptx", "txt", "zip", "rar", "mp4", "mov", "xls", "xlsx"];

async function maxFileBytes(env: Env): Promise<number> {
  let mb = parseInt(await db.getSetting(env.DB, "max_file_size", "15"), 10);
  if (!mb || mb < 1) mb = 15;
  return mb * 1024 * 1024;
}

async function formatMessage(env: Env, m: MessageRow) {
  const deleted = m.is_deleted === 1;

  let reply = null;
  if (m.reply_to) {
    const replyMsg = await db.getMessage(env.DB, m.reply_to);
    if (replyMsg) {
      let replyBody = "";
      if (replyMsg.body) replyBody = replyMsg.body;
      reply = {
        id: replyMsg.id,
        body: Array.from(replyBody).slice(0, 80).join(""),
        file_name: replyMsg.file_name,
      };
    }
  }

  let fileUrl: string | null = null;
  if (m.file_path && !deleted) {
    fileUrl = "/files/chat/" + m.file_path;
  }

  let isImage = false;
  if (m.file_name && !deleted) {
    isImage = IMAGE_EXTS.indexOf(fileExt(m.file_name)) !== -1;
  }

  let sizeText: string | null = null;
  if (m.file_size && !deleted) {
    sizeText = formatSize(m.file_size);
  }

  let body = m.body;
  let fileName = m.file_name;
  if (deleted) {
    body = null;
    fileName = null;
  }

  let senderName = "";
  if (m.sender_name) senderName = m.sender_name;

  return {
    id: m.id,
    sender_id: m.sender_id,
    sender_name: senderName,
    body: body,
    file_name: fileName,
    file_path: fileUrl,
    file_size: sizeText,
    is_image: isImage,
    reply: reply,
    is_deleted: deleted,
    is_edited: !!m.edited_at,
    is_read: m.is_read === 1,
    time: fmtTime(m.created_at),
    date: fmtDate(m.created_at),
    ts: sqlToSeconds(m.created_at),
  };
}

async function handleLogin(ctx: Ctx, form: FormData): Promise<Response> {
  const email = cleanEmail(str(form, "email"));
  const password = str(form, "password");
  const result = await auth.login(ctx.env, ctx.request, email, password);
  return finishLogin(ctx, result);
}

function finishLogin(ctx: Ctx, result: auth.LoginResult): Response {
  const cookie = result.cookie;
  delete result.cookie;
  const response = jsonResponse(result);
  if (cookie) {
    response.headers.append("Set-Cookie", cookie);
    ctx.waitUntil(maybeDailyCleanup(ctx.env));
  }
  return response;
}

async function checkCaptcha(env: Env, token: string, ip: string): Promise<string> {
  const secret = await db.getSetting(env.DB, "turnstile_secret", "");
  if (!secret) return "";
  if (!token) return "Пройдіть перевірку CAPTCHA.";
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: body,
    });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) return "CAPTCHA не пройдена. Спробуйте ще раз.";
  } catch (e) {
    return "Помилка перевірки CAPTCHA. Спробуйте ще раз.";
  }
  return "";
}

async function handleRegister(ctx: Ctx, form: FormData): Promise<Response> {
  const env = ctx.env;
  const ip = getIp(ctx.request);

  if (await db.isIpBlacklisted(env.DB, ip)) {
    return fail("Реєстрацію з вашої IP-адреси заблоковано.");
  }

  const limitOn = await db.getSetting(env.DB, "reg_limit_enabled", "1");
  if (limitOn === "1") {
    let days = parseInt(await db.getSetting(env.DB, "reg_limit_days", "7"), 10);
    if (!days || days < 1) days = 1;
    const count = await db.countRegistrationsFromIp(env.DB, ip, days);
    if (count > 0) {
      return fail("З цієї IP-адреси вже реєстрували акаунт. Спробуйте через " + days + " дн.");
    }
  }

  const captchaError = await checkCaptcha(env, str(form, "cf_turnstile_response"), ip);
  if (captchaError) return fail(captchaError);

  const email = cleanEmail(str(form, "email"));
  const first = cleanText(str(form, "first_name"));
  const last = cleanText(str(form, "last_name"));
  const password = str(form, "password");
  const recovery = cleanText(str(form, "recovery"));

  if (!email || !first || !last || !password || !recovery) {
    return fail("Заповніть всі поля.");
  }

  const result = await auth.registerUser(env, first, last, email, password, recovery, ip);
  if (!result.ok) return jsonResponse(result);

  await db.logRegistration(env.DB, ip, result.userId as number);
  const token = randomHex(24);
  await db.setEmailVerifyToken(env.DB, result.userId as number, token);
  const url = new URL(ctx.request.url).origin + "/da-login?da_verify_email=" + token;
  await sendVerificationEmail(env, email, first, url);

  return jsonResponse({
    ok: true,
    msg: "Реєстрація успішна! Перевірте пошту — надіслали лист для підтвердження email.",
  });
}

async function handleVerifyEmail(ctx: Ctx, form: FormData): Promise<Response> {
  const token = cleanText(str(form, "token"));
  const found = await db.findUserByVerifyToken(ctx.env.DB, token);
  if (!found) return fail("Посилання недійсне або вже використане.");
  await db.markEmailVerified(ctx.env.DB, found.id);
  return jsonResponse({ ok: true, msg: "Email підтверджено! Очікуйте підтвердження від адміністратора." });
}

async function handleCheckEmail(ctx: Ctx, form: FormData): Promise<Response> {
  const email = cleanEmail(str(form, "email"));
  const found = await db.getUserByEmail(ctx.env.DB, email);
  return jsonResponse({ ok: found !== null });
}

async function handleCheckRecovery(ctx: Ctx, form: FormData): Promise<Response> {
  const email = cleanEmail(str(form, "email"));
  const recovery = cleanText(str(form, "recovery"));
  return jsonResponse(await auth.checkRecovery(ctx.env, ctx.request, email, recovery));
}

async function handleResetPassword(ctx: Ctx, form: FormData): Promise<Response> {
  const token = cleanText(str(form, "reset_token"));
  const password = str(form, "password");
  return jsonResponse(await auth.resetPassword(ctx.env, token, password));
}

async function handleLogout(ctx: Ctx): Promise<Response> {
  const cookie = await auth.logoutUser(ctx.env, ctx.request);
  const response = jsonResponse({ ok: true });
  response.headers.append("Set-Cookie", cookie);
  return response;
}

async function canUseClass(env: Env, user: User, classId: number): Promise<boolean> {
  if (!classId) return false;
  return await db.isClassMember(env.DB, user.id, classId);
}

async function pickClassId(form: FormData, user: User): Promise<number> {
  let classId = 0;
  if (user.class_id) classId = user.class_id;
  const posted = toInt(str(form, "class_id"));
  if (posted) classId = posted;
  return classId;
}

async function handleGetHomework(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const classId = await pickClassId(form, user);
  if (!(await canUseClass(ctx.env, user, classId))) return denied();
  if (user.role === "teacher" && user.subject) {
    return jsonResponse({ ok: true, data: await db.getHomeworkBySubject(ctx.env.DB, classId, user.subject) });
  }
  return jsonResponse({ ok: true, data: await db.getHomework(ctx.env.DB, classId) });
}

async function handleAddHomework(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const classId = toInt(str(form, "class_id"));
  let subject = user.subject || "";
  if (!subject) subject = cleanText(str(form, "subject"));
  const topic = cleanText(str(form, "topic"));
  const description = cleanArea(str(form, "description"));
  const deadline = cleanText(str(form, "deadline"));

  if (!topic || !deadline || !classId) return fail("Заповніть всі поля.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return fail("Невірна дата.");
  if (!(await canUseClass(ctx.env, user, classId))) return denied();

  const res = await ctx.env.DB
    .prepare("INSERT INTO homework (class_id, teacher_id, subject, topic, description, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(classId, user.id, subject, topic, description, deadline, nowSql())
    .run();
  const id = res.meta.last_row_id;
  await db.auditLog(ctx.env.DB, actorOf(user), "add", "homework", id, subject + ": «" + topic + "»", getIp(ctx.request));
  return jsonResponse({ ok: true, id: id });
}

async function handleEditHomework(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const id = toInt(str(form, "hw_id"));
  const row = await ctx.env.DB.prepare("SELECT * FROM homework WHERE id = ?").bind(id).first<{ teacher_id: number; subject: string }>();
  if (!row || row.teacher_id !== user.id) return denied();

  const topic = cleanText(str(form, "topic"));
  const description = cleanArea(str(form, "description"));
  const deadline = cleanText(str(form, "deadline"));
  if (!topic || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return fail("Заповніть всі поля.");

  await ctx.env.DB
    .prepare("UPDATE homework SET topic = ?, description = ?, deadline = ? WHERE id = ?")
    .bind(topic, description, deadline, id)
    .run();
  await db.auditLog(ctx.env.DB, actorOf(user), "edit", "homework", id, row.subject + ": «" + topic + "»", getIp(ctx.request));
  return jsonResponse({ ok: true });
}

async function handleDeleteHomework(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const id = toInt(str(form, "hw_id"));
  const row = await ctx.env.DB.prepare("SELECT * FROM homework WHERE id = ?").bind(id).first<{ teacher_id: number; subject: string; topic: string }>();
  if (!row || row.teacher_id !== user.id) return denied();

  await ctx.env.DB.prepare("DELETE FROM homework WHERE id = ?").bind(id).run();
  await db.auditLog(ctx.env.DB, actorOf(user), "delete", "homework", id, row.subject + ": «" + row.topic + "»", getIp(ctx.request));
  return jsonResponse({ ok: true });
}

async function handleGetGrades(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const classId = await pickClassId(form, user);
  if (!(await canUseClass(ctx.env, user, classId))) return denied();
  const rows = await db.getStudentGrades(ctx.env.DB, user.id, classId);
  const data = [];
  for (let i = 0; i < rows.length; i++) {
    data.push({
      grade: rows[i].grade,
      subject: rows[i].subject,
      description: rows[i].description,
      teacher_name: rows[i].teacher_name,
      created_at: fmtDateTimeText(rows[i].created_at),
    });
  }
  return jsonResponse({ ok: true, data: data });
}

function fmtDateTimeText(sql: string): string {
  return fmtDate(sql) + " " + fmtTime(sql);
}

async function studentName(env: Env, id: number): Promise<string> {
  const student = await db.getUser(env.DB, id);
  if (!student) return "#" + id;
  return (student.last_name + " " + student.first_name).trim();
}

async function handleAddGrade(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const grade = toInt(str(form, "grade"));
  if (grade < 1 || grade > 12) return fail("Оцінка від 1 до 12.");

  const studentId = toInt(str(form, "student_id"));
  const classId = toInt(str(form, "class_id"));
  const subject = cleanText(str(form, "subject"));
  const description = cleanText(str(form, "description"));

  if (!(await canUseClass(ctx.env, user, classId))) return denied();
  if (!(await db.isClassMember(ctx.env.DB, studentId, classId))) return fail("Учня не знайдено в класі.");
  if (!subject) return fail("Вкажіть предмет.");

  const res = await ctx.env.DB
    .prepare("INSERT INTO grades (student_id, teacher_id, class_id, subject, grade, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(studentId, user.id, classId, subject, grade, description, nowSql())
    .run();
  const id = res.meta.last_row_id;

  const avgRow = await ctx.env.DB
    .prepare("SELECT ROUND(AVG(grade), 2) AS avg FROM grades WHERE student_id = ? AND class_id = ? AND subject = ?")
    .bind(studentId, classId, subject)
    .first<{ avg: number }>();

  const name = await studentName(ctx.env, studentId);
  await db.auditLog(ctx.env.DB, actorOf(user), "add", "grade", id, subject + " · " + grade + " → " + name, getIp(ctx.request));
  return jsonResponse({ ok: true, id: id, grade_id: id, avg: avgRow ? avgRow.avg : null });
}

async function handleEditGrade(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const id = toInt(str(form, "grade_id"));
  const row = await ctx.env.DB.prepare("SELECT * FROM grades WHERE id = ?").bind(id).first<{ teacher_id: number; subject: string; grade: number }>();
  if (!row || row.teacher_id !== user.id) return denied();

  const grade = toInt(str(form, "grade"));
  if (grade < 1 || grade > 12) return fail("Оцінка від 1 до 12.");
  const description = cleanText(str(form, "description"));

  await ctx.env.DB.prepare("UPDATE grades SET grade = ?, description = ? WHERE id = ?").bind(grade, description, id).run();
  await db.auditLog(ctx.env.DB, actorOf(user), "edit", "grade", id, row.subject + " · " + row.grade + " → " + grade, getIp(ctx.request));
  return jsonResponse({ ok: true });
}

async function handleDeleteGrade(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const id = toInt(str(form, "grade_id"));
  const row = await ctx.env.DB.prepare("SELECT * FROM grades WHERE id = ?").bind(id).first<{ teacher_id: number; subject: string; grade: number }>();
  if (!row || row.teacher_id !== user.id) return denied();

  await ctx.env.DB.prepare("DELETE FROM grades WHERE id = ?").bind(id).run();
  await db.auditLog(ctx.env.DB, actorOf(user), "delete", "grade", id, row.subject + " · оцінка " + row.grade, getIp(ctx.request));
  return jsonResponse({ ok: true });
}

async function handleSetFinalGrade(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const grade = toInt(str(form, "grade"));
  if (grade < 1 || grade > 12) return fail("Оцінка від 1 до 12.");

  const subject = cleanText(str(form, "subject"));
  const studentId = toInt(str(form, "student_id"));
  const classId = toInt(str(form, "class_id"));
  let semester = toInt(str(form, "semester"));
  if (semester < 1 || semester > 3) semester = 1;

  if (!(await canUseClass(ctx.env, user, classId))) return denied();
  if (!(await db.isClassMember(ctx.env.DB, studentId, classId))) return fail("Учня не знайдено в класі.");

  await ctx.env.DB
    .prepare(
      "INSERT INTO final_grades (student_id, class_id, subject, grade, semester) VALUES (?, ?, ?, ?, ?) ON CONFLICT (student_id, subject, semester) DO UPDATE SET grade = ?, class_id = ?"
    )
    .bind(studentId, classId, subject, grade, semester, grade, classId)
    .run();

  const name = await studentName(ctx.env, studentId);
  await db.auditLog(ctx.env.DB, actorOf(user), "add", "final_grade", studentId, subject + " · підсумкова " + grade + " → " + name, getIp(ctx.request));
  return jsonResponse({ ok: true });
}

async function handleGetMaterials(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const classId = await pickClassId(form, user);
  if (!(await canUseClass(ctx.env, user, classId))) return denied();
  return jsonResponse({ ok: true, data: await db.getMaterials(ctx.env.DB, classId) });
}

async function handleUploadMaterial(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  if (user.role !== "teacher") return denied();
  const file = getFile(form, "file");
  if (!file) return fail("Файл не вибрано.");

  const ext = fileExt(file.name);
  if (ext !== "docx" && ext !== "pptx") return fail("Дозволені лише .docx та .pptx.");
  if (file.size > (await maxFileBytes(ctx.env))) return fail("Файл завеликий.");

  const classId = toInt(str(form, "class_id"));
  if (!(await canUseClass(ctx.env, user, classId))) return denied();

  let subject = user.subject || "";
  if (!subject) subject = cleanText(str(form, "subject"));
  const title = cleanText(str(form, "title"));
  if (!title) return fail("Вкажіть назву.");

  const safeName = "mat_" + randomHex(12) + "." + ext;
  await ctx.env.FILES.put("materials/" + safeName, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  await ctx.env.DB
    .prepare("INSERT INTO materials (teacher_id, class_id, subject, title, filename, filepath, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(user.id, classId, subject, title, safeFileName(file.name), safeName, nowSql())
    .run();
  return jsonResponse({ ok: true });
}

async function handleDeleteMaterial(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const id = toInt(str(form, "material_id"));
  const mat = await ctx.env.DB
    .prepare("SELECT * FROM materials WHERE id = ?")
    .bind(id)
    .first<{ teacher_id: number; filepath: string; subject: string; title: string }>();
  if (!mat || mat.teacher_id !== user.id) return denied();

  await ctx.env.FILES.delete("materials/" + mat.filepath);
  await ctx.env.DB.prepare("DELETE FROM materials WHERE id = ?").bind(id).run();
  await db.auditLog(ctx.env.DB, actorOf(user), "delete", "material", id, mat.subject + ": «" + mat.title + "»", getIp(ctx.request));
  return jsonResponse({ ok: true });
}

async function handleChatList(ctx: Ctx, user: User): Promise<Response> {
  const chats = await db.getUserChats(ctx.env.DB, user.id);
  const result = [];
  for (let i = 0; i < chats.length; i++) {
    const ch = chats[i];
    let lastTs = 0;
    if (ch.last_at) lastTs = sqlToSeconds(ch.last_at);
    result.push({
      other_id: ch.other_id,
      other_name: ch.other_name,
      last_msg: ch.last_msg,
      last_file: ch.last_file,
      last_ts: lastTs,
      unread: ch.unread,
      is_muted: ch.is_muted === 1,
    });
  }
  return jsonResponse({ ok: true, chats: result });
}

async function handleChatSearch(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const q = cleanText(str(form, "q"));
  if (q.length < 2) return jsonResponse({ ok: true, users: [] });
  const found = await db.searchUsers(ctx.env.DB, q, user.id);
  const users = [];
  for (let i = 0; i < found.length; i++) {
    users.push({
      id: found[i].id,
      name: found[i].last_name + " " + found[i].first_name,
      email: found[i].email,
      role: found[i].role,
    });
  }
  return jsonResponse({ ok: true, users: users });
}

async function handleChatOpen(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const otherId = toInt(str(form, "other_id"));
  if (!otherId) return fail("other_id required");
  if (await db.getChatSetting(ctx.env.DB, otherId, user.id, "is_blocked")) {
    return fail("Цей користувач вас заблокував.");
  }
  const other = await db.getUser(ctx.env.DB, otherId);
  if (!other || other.role === "pending") return fail("Користувача не знайдено");

  const chatId = await db.getOrCreateChat(ctx.env.DB, user.id, otherId);
  const rows = await db.getMessages(ctx.env.DB, chatId, 30, 0);
  rows.reverse();
  await db.markChatRead(ctx.env.DB, chatId, user.id);

  const messages = [];
  for (let i = 0; i < rows.length; i++) {
    messages.push(await formatMessage(ctx.env, rows[i]));
  }
  return jsonResponse({
    ok: true,
    chat_id: chatId,
    other_name: other.last_name + " " + other.first_name,
    other_id: otherId,
    is_blocked: await db.getChatSetting(ctx.env.DB, user.id, otherId, "is_blocked"),
    is_muted: await db.getChatSetting(ctx.env.DB, user.id, otherId, "is_muted"),
    messages: messages,
  });
}

async function handleChatSend(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const chatId = toInt(str(form, "chat_id"));
  const body = cleanArea(str(form, "body"));

  const chat = await db.getChat(ctx.env.DB, chatId, user.id);
  if (!chat) return fail("Чат не знайдено");

  let otherId = chat.user_b;
  if (chat.user_a !== user.id) otherId = chat.user_a;
  if (await db.getChatSetting(ctx.env.DB, otherId, user.id, "is_blocked")) {
    return fail("Ви заблоковані цим користувачем.");
  }

  let fileName: string | null = null;
  let filePath: string | null = null;
  let fileSize: number | null = null;

  const file = getFile(form, "file");
  if (file) {
    if (file.size > (await maxFileBytes(ctx.env))) return fail("Файл завеликий");
    const ext = fileExt(file.name);
    if (CHAT_EXTS.indexOf(ext) === -1) return fail("Цей тип файлу не дозволений: " + ext);

    const storedName = "f_" + Date.now() + "_" + randomHex(3) + "." + ext;
    await ctx.env.FILES.put("chat/" + storedName, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    fileName = safeFileName(file.name);
    filePath = storedName;
    fileSize = file.size;
  }

  if (!body && !filePath) return fail("Порожнє повідомлення");

  let replyTo: number | null = null;
  const replyValue = toInt(str(form, "reply_to"));
  if (replyValue > 0) replyTo = replyValue;

  let bodyToSave: string | null = body;
  if (!bodyToSave) bodyToSave = null;

  const created = nowSql();
  const res = await ctx.env.DB
    .prepare("INSERT INTO messages (chat_id, sender_id, body, file_name, file_path, file_size, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(chatId, user.id, bodyToSave, fileName, filePath, fileSize, replyTo, created)
    .run();

  const saved = await db.getMessage(ctx.env.DB, res.meta.last_row_id);
  const message = await formatMessage(ctx.env, saved as MessageRow);
  message.sender_name = user.last_name + " " + user.first_name;
  return jsonResponse({ ok: true, msg: message });
}

async function handleChatMessages(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const chatId = toInt(str(form, "chat_id"));
  const beforeId = toInt(str(form, "before_id"));
  const chat = await db.getChat(ctx.env.DB, chatId, user.id);
  if (!chat) return jsonResponse({ ok: false });

  const rows = await db.getMessages(ctx.env.DB, chatId, 20, beforeId);
  rows.reverse();
  const messages = [];
  for (let i = 0; i < rows.length; i++) {
    messages.push(await formatMessage(ctx.env, rows[i]));
  }
  return jsonResponse({ ok: true, messages: messages });
}

async function handleChatRead(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const chatId = toInt(str(form, "chat_id"));
  const chat = await db.getChat(ctx.env.DB, chatId, user.id);
  if (!chat) return jsonResponse({ ok: false });
  await db.markChatRead(ctx.env.DB, chatId, user.id);
  return jsonResponse({ ok: true });
}

async function handleChatSetting(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const otherId = toInt(str(form, "other_id"));
  const field = str(form, "field");
  const value = toInt(str(form, "value")) ? 1 : 0;
  if (field !== "is_blocked" && field !== "is_muted") return fail("Invalid field");
  if (!otherId) return fail("other_id required");
  await db.setChatSetting(ctx.env.DB, user.id, otherId, field, value);
  return jsonResponse({ ok: true });
}

async function handleChatClear(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const chatId = toInt(str(form, "chat_id"));
  const chat = await db.getChat(ctx.env.DB, chatId, user.id);
  if (!chat) return jsonResponse({ ok: false });

  const paths = await db.getChatFilePaths(ctx.env.DB, chatId);
  for (let i = 0; i < paths.length; i++) {
    await ctx.env.FILES.delete("chat/" + paths[i]);
  }
  await db.deleteChatMessages(ctx.env.DB, chatId);
  return jsonResponse({ ok: true });
}

async function handleChatEdit(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const id = toInt(str(form, "msg_id"));
  const body = cleanArea(str(form, "body"));
  if (!body) return fail("Порожній текст");
  const ok = await db.editMessage(ctx.env.DB, id, user.id, body);
  return jsonResponse({ ok: ok });
}

async function handleChatDelete(ctx: Ctx, form: FormData, user: User): Promise<Response> {
  const id = toInt(str(form, "msg_id"));
  const msg = await db.getMessage(ctx.env.DB, id);
  if (!msg || msg.sender_id !== user.id) return jsonResponse({ ok: false });
  if (msg.file_path) {
    await ctx.env.FILES.delete("chat/" + msg.file_path);
  }
  const ok = await db.deleteMessage(ctx.env.DB, id, user.id);
  return jsonResponse({ ok: ok });
}

export async function handleExport(ctx: Ctx): Promise<Response> {
  const user = await auth.currentUser(ctx.env, ctx.request);
  if (!user) return jsonResponse({ ok: false, msg: "Не авторизовано." }, 401);
  if (user.role !== "teacher") return jsonResponse({ ok: false, msg: "Доступ заборонено." }, 403);

  const url = new URL(ctx.request.url);
  const classId = toInt(url.searchParams.get("cid"));
  const subject = cleanText(url.searchParams.get("subject"));
  if (!classId) return jsonResponse({ ok: false, msg: "Невірний клас." }, 400);
  if (!(await canUseClass(ctx.env, user, classId))) return jsonResponse({ ok: false, msg: "Доступ заборонено." }, 403);

  const cls = await db.getClass(ctx.env.DB, classId);
  if (!cls) return jsonResponse({ ok: false, msg: "Клас не знайдено." }, 404);

  const data = await db.getExportData(ctx.env.DB, classId, subject);
  const xlsx = buildXlsx(cls.name, data);

  let niceName = "ocenky-" + cls.name;
  if (subject) niceName += "-" + subject;
  niceName += "-" + todayKyiv() + ".xlsx";
  const plainName = "grades-" + cls.id + "-" + todayKyiv() + ".xlsx";

  return new Response(xlsx, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="' + plainName + "\"; filename*=UTF-8''" + encodeURIComponent(niceName),
      "Cache-Control": "no-store",
    },
  });
}

type UserHandler = (ctx: Ctx, form: FormData, user: User) => Promise<Response>;

const userHandlers: Record<string, UserHandler> = {
  get_homework: handleGetHomework,
  add_homework: handleAddHomework,
  edit_homework: handleEditHomework,
  delete_homework: handleDeleteHomework,
  get_grades: handleGetGrades,
  add_grade: handleAddGrade,
  edit_grade: handleEditGrade,
  delete_grade: handleDeleteGrade,
  set_final_grade: handleSetFinalGrade,
  get_materials: handleGetMaterials,
  upload_material: handleUploadMaterial,
  delete_material: handleDeleteMaterial,
  chat_list: (ctx, form, user) => handleChatList(ctx, user),
  chat_search: handleChatSearch,
  chat_open: handleChatOpen,
  chat_send: handleChatSend,
  chat_messages: handleChatMessages,
  chat_read: handleChatRead,
  chat_setting: handleChatSetting,
  chat_clear: handleChatClear,
  chat_edit_msg: handleChatEdit,
  chat_delete_msg: handleChatDelete,
  chat_unread_count: async (ctx, form, user) =>
    jsonResponse({ ok: true, unread: await db.countUnreadMessages(ctx.env.DB, user.id) }),
};

type PublicHandler = (ctx: Ctx, form: FormData) => Promise<Response>;

const publicHandlers: Record<string, PublicHandler> = {
  login: handleLogin,
  register: handleRegister,
  verify_email: handleVerifyEmail,
  check_email: handleCheckEmail,
  check_recovery: handleCheckRecovery,
  reset_password: handleResetPassword,
  logout: (ctx) => handleLogout(ctx),
};

export async function handleApi(ctx: Ctx, name: string): Promise<Response> {
  if (ctx.request.method !== "POST") return jsonResponse({ ok: false, msg: "Method not allowed" }, 405);

  let form = new FormData();
  try {
    form = await ctx.request.formData();
  } catch (e) {
    form = new FormData();
  }

  const publicHandler = publicHandlers[name];
  if (publicHandler) return await publicHandler(ctx, form);

  const userHandler = userHandlers[name];
  if (!userHandler) return jsonResponse({ ok: false, msg: "Невідома дія" }, 404);

  const user = await auth.currentUser(ctx.env, ctx.request);
  if (!user) return jsonResponse({ ok: false, msg: "Не авторизовано." }, 401);
  return await userHandler(ctx, form, user);
}

const ADMIN_ACTOR: AuditActor = { id: 0, name: "Адміністратор", role: "admin" };

export async function handleAdminApi(ctx: Ctx, name: string): Promise<Response> {
  if (ctx.request.method !== "POST") return jsonResponse({ ok: false, msg: "Method not allowed" }, 405);

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch (e) {
    return fail("Невірний запит.");
  }

  const origin = new URL(ctx.request.url).origin;

  if (name === "login") {
    const ip = getIp(ctx.request);
    const lockKey = "adminlock_" + ip;
    const tries = parseInt((await db.getTransient(ctx.env.DB, lockKey)) || "0", 10);
    if (tries >= 5) {
      return redirect(origin + "/admin/login?error=lock");
    }
    const password = str(form, "password");
    const real = ctx.env.ADMIN_PASSWORD || "";
    let good = false;
    if (real && password.length === real.length) {
      let diff = 0;
      for (let i = 0; i < real.length; i++) diff = diff | (real.charCodeAt(i) ^ password.charCodeAt(i));
      good = diff === 0;
    }
    if (!good) {
      await db.setTransient(ctx.env.DB, lockKey, String(tries + 1), 900);
      await db.logLoginFail(ctx.env.DB, "admin", ip, "admin_bad_password");
      return redirect(origin + "/admin/login?error=1");
    }
    await db.deleteTransient(ctx.env.DB, lockKey);
    const cookie = await auth.startAdminSession(ctx.env, ctx.request);
    return redirect(origin + "/admin", [cookie]);
  }

  if (!(await auth.isAdmin(ctx.env, ctx.request))) {
    return jsonResponse({ ok: false, msg: "Доступ заборонено" }, 401);
  }

  const ip = getIp(ctx.request);
  const env = ctx.env;

  if (name === "logout") {
    const cookie = await auth.logoutAdmin(env, ctx.request);
    return redirect(origin + "/admin/login", [cookie]);
  }

  if (name === "assign_user") {
    const uid = toInt(str(form, "uid"));
    let role = "student";
    if (str(form, "role") === "teacher") role = "teacher";
    const classId = toInt(str(form, "class_id"));
    let subject: string | null = cleanText(str(form, "subject"));
    if (!subject) subject = null;

    let classValue: number | null = null;
    if (classId) classValue = classId;
    await env.DB.prepare("UPDATE users SET role = ?, class_id = ?, subject = ? WHERE id = ?").bind(role, classValue, subject, uid).run();
    if (classId) {
      await env.DB.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)").bind(classId, uid).run();
    }
    await db.auditLog(env.DB, ADMIN_ACTOR, "approve", "user", uid, role + " → клас #" + classId, ip);
    return jsonResponse({ ok: true });
  }

  if (name === "delete_user") {
    const uid = toInt(str(form, "uid"));
    const target = await db.getUser(env.DB, uid);
    let targetName = "#" + uid;
    if (target) targetName = (target.last_name + " " + target.first_name).trim();
    await env.DB.prepare("DELETE FROM class_members WHERE user_id = ?").bind(uid).run();
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid).run();
    await db.auditLog(env.DB, ADMIN_ACTOR, "delete", "user", uid, targetName, ip);
    return jsonResponse({ ok: true });
  }

  if (name === "add_class") {
    const className = cleanText(str(form, "name"));
    if (!className) return fail("Вкажіть назву");
    const exists = await env.DB.prepare("SELECT id FROM classes WHERE name = ?").bind(className).first();
    if (exists) return fail("Такий клас вже є");
    const res = await env.DB.prepare("INSERT INTO classes (name) VALUES (?)").bind(className).run();
    return jsonResponse({ ok: true, id: res.meta.last_row_id });
  }

  if (name === "delete_class") {
    const cid = toInt(str(form, "cid"));
    const cls = await db.getClass(env.DB, cid);
    let className = "#" + cid;
    if (cls) className = cls.name;
    await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(cid).run();
    await env.DB.prepare("DELETE FROM class_members WHERE class_id = ?").bind(cid).run();
    await env.DB.prepare("DELETE FROM subjects WHERE class_id = ?").bind(cid).run();
    await env.DB.prepare("DELETE FROM schedule WHERE class_id = ?").bind(cid).run();
    await db.auditLog(env.DB, ADMIN_ACTOR, "delete", "class", cid, className, ip);
    return jsonResponse({ ok: true });
  }

  if (name === "add_member") {
    const cid = toInt(str(form, "cid"));
    const email = cleanEmail(str(form, "email"));
    const member = await db.getUserByEmail(env.DB, email);
    if (!member) return fail("Користувача не знайдено");
    if (member.role === "pending") return fail("Спочатку підтвердіть користувача");
    await env.DB.prepare("INSERT OR IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)").bind(cid, member.id).run();
    await env.DB.prepare("UPDATE users SET class_id = ? WHERE id = ?").bind(cid, member.id).run();
    return jsonResponse({ ok: true, name: member.last_name + " " + member.first_name });
  }

  if (name === "remove_member") {
    const cid = toInt(str(form, "cid"));
    const uid = toInt(str(form, "uid"));
    await env.DB.prepare("DELETE FROM class_members WHERE class_id = ? AND user_id = ?").bind(cid, uid).run();
    return jsonResponse({ ok: true });
  }

  if (name === "add_subject") {
    const cid = toInt(str(form, "cid"));
    const subjectName = cleanText(str(form, "name"));
    if (!subjectName) return fail("Вкажіть назву");
    await env.DB.prepare("INSERT OR IGNORE INTO subjects (class_id, name) VALUES (?, ?)").bind(cid, subjectName).run();
    return jsonResponse({ ok: true });
  }

  if (name === "del_subject") {
    const sid = toInt(str(form, "sid"));
    await env.DB.prepare("DELETE FROM subjects WHERE id = ?").bind(sid).run();
    await db.auditLog(env.DB, ADMIN_ACTOR, "delete", "subject", sid, "Предмет #" + sid, ip);
    return jsonResponse({ ok: true });
  }

  if (name === "add_schedule") {
    const cid = toInt(str(form, "cid"));
    const day = toInt(str(form, "day"));
    const period = toInt(str(form, "period"));
    const subject = cleanText(str(form, "subject"));
    let group = str(form, "group");
    if (group !== "group1" && group !== "group2") group = "all";
    let week = str(form, "week_type");
    if (week !== "numerator" && week !== "denominator") week = "all";
    if (!cid || day < 1 || day > 5 || period < 1 || !subject) return fail("Заповніть всі поля");

    const res = await env.DB
      .prepare("INSERT INTO schedule (class_id, day, period, subject, group_name, week_type) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(cid, day, period, subject, group, week)
      .run();
    return jsonResponse({ ok: true, id: res.meta.last_row_id });
  }

  if (name === "del_schedule") {
    const id = toInt(str(form, "id"));
    await env.DB.prepare("DELETE FROM schedule WHERE id = ?").bind(id).run();
    return jsonResponse({ ok: true });
  }

  if (name === "ip_blacklist_add") {
    const target = cleanText(str(form, "ip"));
    const reason = cleanText(str(form, "reason"));
    if (!isValidIp(target)) return fail("Невірний формат IP");
    await env.DB
      .prepare("INSERT INTO ip_blacklist (ip, reason, blocked_at, blocked_by) VALUES (?, ?, ?, 0) ON CONFLICT (ip) DO UPDATE SET reason = ?, blocked_at = ?")
      .bind(target, reason, nowSql(), reason, nowSql())
      .run();
    return jsonResponse({ ok: true });
  }

  if (name === "ip_blacklist_remove") {
    const target = cleanText(str(form, "ip"));
    await env.DB.prepare("DELETE FROM ip_blacklist WHERE ip = ?").bind(target).run();
    return jsonResponse({ ok: true });
  }

  if (name === "save_settings") {
    let maxFile = toInt(str(form, "max_file_size")) || 15;
    if (maxFile < 1) maxFile = 1;
    if (maxFile > 100) maxFile = 100;
    let cleanupDays = toInt(str(form, "cleanup_days")) || 30;
    if (cleanupDays < 1) cleanupDays = 1;
    let chatDays = toInt(str(form, "chat_cleanup_days"));
    if (chatDays < 0) chatDays = 0;

    await db.setSetting(env.DB, "max_file_size", String(maxFile));
    await db.setSetting(env.DB, "auto_cleanup", str(form, "auto_cleanup") ? "1" : "0");
    await db.setSetting(env.DB, "cleanup_days", String(cleanupDays));
    await db.setSetting(env.DB, "chat_cleanup_days", String(chatDays));

    if (str(form, "manual_cleanup")) {
      const count = await runCleanup(env);
      return redirect(origin + "/admin?tab=settings&cleaned=" + count);
    }
    return redirect(origin + "/admin?tab=settings&saved=1");
  }

  if (name === "save_security") {
    let days = toInt(str(form, "reg_limit_days")) || 7;
    if (days < 1) days = 1;
    let threshold = toInt(str(form, "fail_alert_threshold"));
    if (threshold < 0) threshold = 0;

    await db.setSetting(env.DB, "reg_limit_enabled", str(form, "reg_limit_enabled") ? "1" : "0");
    await db.setSetting(env.DB, "reg_limit_days", String(days));
    await db.setSetting(env.DB, "turnstile_site_key", cleanText(str(form, "turnstile_site_key")));
    await db.setSetting(env.DB, "turnstile_secret", cleanText(str(form, "turnstile_secret")));
    await db.setSetting(env.DB, "fail_alert_threshold", String(threshold));
    return redirect(origin + "/admin?tab=security&saved=1");
  }

  return jsonResponse({ ok: false, msg: "Невідома дія" }, 404);
}
