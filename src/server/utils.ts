export function esc(value: unknown): string {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function nl2br(value: string): string {
  return esc(value).replace(/\n/g, "<br>");
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status: status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function redirect(url: string, cookies: string[] = []): Response {
  const headers = new Headers();
  headers.set("Location", url);
  for (let i = 0; i < cookies.length; i++) {
    headers.append("Set-Cookie", cookies[i]);
  }
  return new Response(null, { status: 302, headers: headers });
}

export function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function sqlMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString().slice(0, 19).replace("T", " ");
}

export function sqlDaysAgo(days: number): string {
  return sqlMinutesAgo(days * 1440);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function sqlToDate(sql: string): Date {
  if (sql.length === 10) {
    return new Date(sql + "T12:00:00Z");
  }
  return new Date(sql.replace(" ", "T") + "Z");
}

export function sqlToSeconds(sql: string): number {
  return Math.floor(sqlToDate(sql).getTime() / 1000);
}

function kyivParts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const result: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    result[parts[i].type] = parts[i].value;
  }
  return result;
}

export function fmtDate(sql: string): string {
  const p = kyivParts(sqlToDate(sql));
  return p.day + "." + p.month + "." + p.year;
}

export function fmtDateTime(sql: string): string {
  const p = kyivParts(sqlToDate(sql));
  return p.day + "." + p.month + "." + p.year + " " + p.hour + ":" + p.minute;
}

export function fmtDateTimeSec(sql: string): string {
  const p = kyivParts(sqlToDate(sql));
  return p.day + "." + p.month + "." + p.year + " " + p.hour + ":" + p.minute + ":" + p.second;
}

export function fmtTime(sql: string): string {
  const p = kyivParts(sqlToDate(sql));
  return p.hour + ":" + p.minute;
}

export function todayKyiv(): string {
  const p = kyivParts(new Date());
  return p.year + "-" + p.month + "-" + p.day;
}

export function getIp(request: Request): string {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "0.0.0.0";
}

export function isValidIp(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = ip.match(v4);
  if (m) {
    for (let i = 1; i <= 4; i++) {
      if (Number(m[i]) > 255) return false;
    }
    return true;
  }
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.indexOf(":") !== -1;
}

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function randomInt(min: number, max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return min + (arr[0] % (max - min + 1));
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff = diff | (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return diff === 0;
}

export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function cleanArea(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n").trim();
}

export function cleanEmail(value: unknown): string {
  const text = cleanText(value).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return text;
  return "";
}

export function toInt(value: unknown): number {
  const n = parseInt(String(value === null || value === undefined ? "" : value), 10);
  if (isNaN(n)) return 0;
  return n;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1048576) return Math.round((bytes / 1048576) * 10) / 10 + " МБ";
  if (bytes >= 1024) return Math.round(bytes / 1024) + " КБ";
  return bytes + " Б";
}

export function fileExt(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

export function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "").trim() || "file";
}

export function uniqueSorted(subjects: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < subjects.length; i++) {
    if (result.indexOf(subjects[i]) === -1) {
      result.push(subjects[i]);
    }
  }
  result.sort();
  return result;
}
