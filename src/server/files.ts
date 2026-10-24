import type { Ctx } from "./types";
import * as db from "./db";
import * as auth from "./auth";
import { fileExt } from "./utils";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function handleFile(ctx: Ctx, kind: string, name: string): Promise<Response> {
  if (kind !== "chat" && kind !== "materials") return notFound();
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return notFound();

  const session = await auth.currentSession(ctx.env, ctx.request);
  if (session.kind === "none") return new Response("Unauthorized", { status: 401 });

  let downloadName = name;

  if (kind === "materials") {
    const material = await ctx.env.DB
      .prepare("SELECT class_id, filename FROM materials WHERE filepath = ?")
      .bind(name)
      .first<{ class_id: number; filename: string }>();
    if (!material) return notFound();
    if (session.user) {
      const allowed = await db.isClassMember(ctx.env.DB, session.user.id, material.class_id);
      if (!allowed) return new Response("Forbidden", { status: 403 });
    }
    downloadName = material.filename;
  }

  if (kind === "chat") {
    if (!session.user) return new Response("Forbidden", { status: 403 });
    const message = await ctx.env.DB
      .prepare("SELECT chat_id, file_name FROM messages WHERE file_path = ? AND is_deleted = 0")
      .bind(name)
      .first<{ chat_id: number; file_name: string | null }>();
    if (!message) return notFound();
    const chat = await db.getChat(ctx.env.DB, message.chat_id, session.user.id);
    if (!chat) return new Response("Forbidden", { status: 403 });
    if (message.file_name) downloadName = message.file_name;
  }

  const object = await ctx.env.FILES.get(kind + "/" + name);
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "private, max-age=3600");

  let disposition = "attachment";
  if (kind === "chat" && IMAGE_EXTS.indexOf(fileExt(name)) !== -1) disposition = "inline";
  headers.set("Content-Disposition", disposition + "; filename*=UTF-8''" + encodeURIComponent(downloadName));

  return new Response(object.body, { headers: headers });
}
