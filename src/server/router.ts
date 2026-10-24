import type { Ctx } from "./types";
import * as auth from "./auth";
import * as db from "./db";
import { handleApi, handleAdminApi, handleExport } from "./api";
import { handleFile } from "./files";
import { renderLogin } from "./pages/login";
import { renderCabinetPage } from "./pages/cabinet";
import { renderAdminLogin, renderAdminPage } from "./pages/admin";
import { maybeDailyCleanup } from "./cleanup";
import { htmlResponse, jsonResponse, redirect, getIp, cleanText } from "./utils";

function sameOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export async function route(ctx: Ctx): Promise<Response> {
  const url = new URL(ctx.request.url);
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  if (!sameOrigin(ctx.request)) {
    return jsonResponse({ ok: false, msg: "Заборонено." }, 403);
  }

  if (path === "/api/export_grades") return await handleExport(ctx);

  if (path.startsWith("/api/admin/")) {
    return await handleAdminApi(ctx, path.slice("/api/admin/".length));
  }

  if (path.startsWith("/api/")) {
    return await handleApi(ctx, path.slice("/api/".length));
  }

  if (path.startsWith("/files/")) {
    const parts = path.split("/");
    if (parts.length === 4) return await handleFile(ctx, parts[2], decodeURIComponent(parts[3]));
    return new Response("Not found", { status: 404 });
  }

  if (path === "/da-login") {
    const token = cleanText(url.searchParams.get("da_verify_email"));
    if (token) {
      const found = await db.findUserByVerifyToken(ctx.env.DB, token);
      if (found) {
        await db.markEmailVerified(ctx.env.DB, found.id);
        return redirect("/da-login?da_ev=1");
      }
      return redirect("/da-login?da_ev=fail");
    }

    const user = await auth.currentUser(ctx.env, ctx.request);
    if (user) return redirect("/da-cabinet");

    const ip = getIp(ctx.request);
    if (await db.isIpBlacklisted(ctx.env.DB, ip)) {
      return new Response("Доступ заборонено.", { status: 403 });
    }
    const ev = cleanText(url.searchParams.get("da_ev"));
    return htmlResponse(await renderLogin(ctx.env, ev));
  }

  if (path === "/da-cabinet") {
    const user = await auth.currentUser(ctx.env, ctx.request);
    if (!user) return redirect("/da-login");
    ctx.waitUntil(maybeDailyCleanup(ctx.env));
    return htmlResponse(await renderCabinetPage(ctx.env, url, user));
  }

  if (path === "/admin/login") {
    if (await auth.isAdmin(ctx.env, ctx.request)) return redirect("/admin");
    return htmlResponse(renderAdminLogin(cleanText(url.searchParams.get("error"))));
  }

  if (path === "/admin") {
    if (!(await auth.isAdmin(ctx.env, ctx.request))) return redirect("/admin/login");
    ctx.waitUntil(maybeDailyCleanup(ctx.env));
    return htmlResponse(await renderAdminPage(ctx.env, url));
  }

  return new Response("Not found", { status: 404 });
}
