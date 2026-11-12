import type { Env, User, Session } from "./types";
import * as db from "./db";
import { sendAdminAlert } from "./mail";
import { getIp, randomHex, sha256, sameText, nowSql, fmtDateTimeSec } from "./utils";

const USER_COOKIE = "da_session";
const ADMIN_COOKIE = "da_admin";
const USER_SESSION_SECONDS = 1209600;
const ADMIN_SESSION_SECONDS = 43200;
const MAX_FAILS = 5;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt);
  return "pbkdf2$100000$" + salt + "$" + hash;
}

async function pbkdf2(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256
  );
  const bytes = new Uint8Array(bits);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const hash = await pbkdf2(password, parts[2]);
  return sameText(hash, parts[3]);
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("Cookie");
  if (!header) return "";
  const pairs = header.split(";");
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim();
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index) === name) {
      return pair.slice(index + 1);
    }
  }
  return "";
}

function makeCookie(request: Request, name: string, value: string, seconds: number): string {
  let cookie = name + "=" + value + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + seconds;
  if (new URL(request.url).protocol === "https:") {
    cookie += "; Secure";
  }
  return cookie;
}

export async function startUserSession(env: Env, request: Request, userId: number): Promise<string> {
  const token = randomHex(32);
  await db.createSession(env.DB, await sha256(token), userId, "user", USER_SESSION_SECONDS);
  return makeCookie(request, USER_COOKIE, token, USER_SESSION_SECONDS);
}

export async function startAdminSession(env: Env, request: Request): Promise<string> {
  const token = randomHex(32);
  await db.createSession(env.DB, await sha256(token), 0, "admin", ADMIN_SESSION_SECONDS);
  return makeCookie(request, ADMIN_COOKIE, token, ADMIN_SESSION_SECONDS);
}

export async function currentUser(env: Env, request: Request): Promise<User | null> {
  const token = readCookie(request, USER_COOKIE);
  if (!token) return null;
  const session = await db.findSession(env.DB, await sha256(token));
  if (!session || session.kind !== "user") return null;
  return await db.getUser(env.DB, session.user_id);
}

export async function isAdmin(env: Env, request: Request): Promise<boolean> {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return false;
  const session = await db.findSession(env.DB, await sha256(token));
  if (!session) return false;
  return session.kind === "admin";
}

export async function currentSession(env: Env, request: Request): Promise<Session> {
  const user = await currentUser(env, request);
  if (user) return { kind: "user", user: user };
  if (await isAdmin(env, request)) return { kind: "admin", user: null };
  return { kind: "none", user: null };
}

export async function logoutUser(env: Env, request: Request): Promise<string> {
  const token = readCookie(request, USER_COOKIE);
  if (token) {
    await db.deleteSession(env.DB, await sha256(token));
  }
  return makeCookie(request, USER_COOKIE, "", 0);
}

export async function logoutAdmin(env: Env, request: Request): Promise<string> {
  const token = readCookie(request, ADMIN_COOKIE);
  if (token) {
    await db.deleteSession(env.DB, await sha256(token));
  }
  return makeCookie(request, ADMIN_COOKIE, "", 0);
}

async function maybeAlertAdmin(env: Env, request: Request, email: string, ip: string): Promise<void> {
  const threshold = parseInt(await db.getSetting(env.DB, "fail_alert_threshold", "10"), 10);
  if (!threshold || threshold <= 0) return;
  const count = await db.countLoginFailsByIp(env.DB, ip, 60);
  if (count !== threshold) return;
  const key = "alert_" + (await sha256(ip));
  if (await db.getTransient(env.DB, key)) return;
  await db.setTransient(env.DB, key, "1", 1800);
  const link = new URL(request.url).origin + "/admin?tab=security";
  await sendAdminAlert(env, ip, email, count, link, fmtDateTimeSec(nowSql()));
}

export interface LoginResult {
  ok: boolean;
  msg?: string;
  locked?: boolean;
  role?: string;
  cookie?: string;
}

export async function login(env: Env, request: Request, emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.toLowerCase().trim();
  const ip = getIp(request);
  const id = await sha256(email + ip);
  const failKey = "fails_" + id;

  const tries = parseInt((await db.getTransient(env.DB, failKey)) || "0", 10);
  if (tries >= MAX_FAILS) {
    return { ok: false, msg: "Забагато невдалих спроб. Спробуйте через 15 хв.", locked: true };
  }

  const user = await db.getUserByEmail(env.DB, email);
  if (!user) {
    await db.setTransient(env.DB, failKey, String(tries + 1), 900);
    await db.logLoginFail(env.DB, email, ip, "user_not_found");
    return { ok: false, msg: "Акаунт не знайдено." };
  }

  const passwordOk = await checkPassword(password, user.password);
  if (!passwordOk) {
    await db.setTransient(env.DB, failKey, String(tries + 1), 900);
    await db.logLoginFail(env.DB, email, ip, "bad_password");
    await maybeAlertAdmin(env, request, email, ip);
    return { ok: false, msg: "Невірний пароль." };
  }

  if (user.role === "pending") {
    return { ok: false, msg: "Ваш акаунт ще не підтверджений адміністратором." };
  }

  await db.deleteTransient(env.DB, failKey);
  const cookie = await startUserSession(env, request, user.id);
  return { ok: true, role: user.role, cookie: cookie };
}

export async function registerUser(
  env: Env,
  first: string,
  last: string,
  emailRaw: string,
  password: string,
  recovery: string,
  ip: string
): Promise<{ ok: boolean; msg?: string; userId?: number }> {
  const email = emailRaw.toLowerCase().trim();
  const existing = await db.getUserByEmail(env.DB, email);
  if (existing) {
    return { ok: false, msg: "Ця електронна адреса вже зареєстрована." };
  }
  if (password.length < 6) {
    return { ok: false, msg: "Пароль повинен містити не менше 6 символів." };
  }
  const passwordHash = await hashPassword(password);
  const recoveryHash = await hashPassword(recovery);
  const res = await env.DB
    .prepare(
      "INSERT INTO users (first_name, last_name, email, password, recovery, role, reg_ip, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)"
    )
    .bind(first, last, email, passwordHash, recoveryHash, ip, nowSql())
    .run();
  if (!res.success) {
    return { ok: false, msg: "Помилка реєстрації. Спробуйте ще раз." };
  }
  return { ok: true, userId: res.meta.last_row_id };
}

export async function checkRecovery(
  env: Env,
  request: Request,
  emailRaw: string,
  recovery: string
): Promise<{ ok: boolean; msg?: string; reset_token?: string }> {
  const email = emailRaw.toLowerCase().trim();
  const ip = getIp(request);
  const id = await sha256("rec" + email + ip);
  const tries = parseInt((await db.getTransient(env.DB, "rec_" + id)) || "0", 10);
  if (tries >= 5) {
    return { ok: false, msg: "Забагато невдалих спроб. Спробуйте пізніше." };
  }
  const user = await db.getUserByEmail(env.DB, email);
  if (!user) {
    return { ok: false, msg: "Акаунт не знайдено." };
  }
  const good = await checkPassword(recovery, user.recovery);
  if (!good) {
    await db.setTransient(env.DB, "rec_" + id, String(tries + 1), 900);
    await db.logLoginFail(env.DB, email, ip, "bad_recovery");
    return { ok: false, msg: "Кодове слово не збігається." };
  }
  const token = randomHex(24);
  await db.setTransient(env.DB, "reset_" + token, String(user.id), 600);
  return { ok: true, reset_token: token };
}

export async function resetPassword(
  env: Env,
  token: string,
  newPassword: string
): Promise<{ ok: boolean; msg?: string }> {
  if (newPassword.length < 6) {
    return { ok: false, msg: "Пароль повинен містити не менше 6 символів." };
  }
  const userId = await db.getTransient(env.DB, "reset_" + token);
  if (!userId) {
    return { ok: false, msg: "Час для зміни пароля вийшов. Почніть спочатку." };
  }
  const hash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(hash, parseInt(userId, 10)).run();
  await db.deleteTransient(env.DB, "reset_" + token);
  return { ok: true };
}
