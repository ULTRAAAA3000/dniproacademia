import type { Env } from "./types";
import * as db from "./db";
import { nowSql, nowSeconds, sqlDaysAgo } from "./utils";

export async function runCleanup(env: Env): Promise<number> {
  let filesCount = 0;

  const autoCleanup = await db.getSetting(env.DB, "auto_cleanup", "1");
  if (autoCleanup === "1") {
    let days = parseInt(await db.getSetting(env.DB, "cleanup_days", "30"), 10);
    if (!days || days < 1) days = 1;
    const cutoff = sqlDaysAgo(days);

    const old = await env.DB
      .prepare(
        "SELECT id, filepath FROM submissions WHERE filepath != '' AND filepath != '[видалено автоматично]' AND submitted_at < ?"
      )
      .bind(cutoff)
      .all<{ id: number; filepath: string }>();

    for (let i = 0; i < old.results.length; i++) {
      const row = old.results[i];
      await env.FILES.delete("submissions/" + row.filepath);
      filesCount = filesCount + 1;
      await env.DB
        .prepare("UPDATE submissions SET filepath = '', filename = '[видалено автоматично]' WHERE id = ?")
        .bind(row.id)
        .run();
    }
  }

  const chatDays = parseInt(await db.getSetting(env.DB, "chat_cleanup_days", "60"), 10);
  if (chatDays > 0) {
    const chatCutoff = sqlDaysAgo(chatDays);
    const oldMessages = await env.DB
      .prepare("SELECT id, file_path FROM messages WHERE is_deleted = 0 AND created_at < ?")
      .bind(chatCutoff)
      .all<{ id: number; file_path: string | null }>();

    for (let i = 0; i < oldMessages.results.length; i++) {
      const msg = oldMessages.results[i];
      if (msg.file_path) {
        await env.FILES.delete("chat/" + msg.file_path);
      }
      await env.DB
        .prepare(
          "UPDATE messages SET is_deleted = 1, body = NULL, file_path = NULL, file_name = '[видалено автоматично]' WHERE id = ?"
        )
        .bind(msg.id)
        .run();
    }
  }

  await db.setSetting(env.DB, "last_cleanup", nowSql());
  await db.setSetting(env.DB, "last_cleanup_count", String(filesCount));
  await db.setSetting(env.DB, "last_cleanup_run", String(nowSeconds()));
  await db.deleteExpired(env.DB);
  return filesCount;
}

export async function maybeDailyCleanup(env: Env): Promise<void> {
  const last = parseInt(await db.getSetting(env.DB, "last_cleanup_run", "0"), 10);
  if (nowSeconds() - last < 86400) return;
  await db.setSetting(env.DB, "last_cleanup_run", String(nowSeconds()));
  await runCleanup(env);
}
