import type { Env } from "./types";
import { esc } from "./utils";

const SITE_NAME = "Dnipro Academia";

export async function sendMail(env: Env, to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (env.MAIL_DEBUG === "1") {
    console.log("MAIL TO " + to + " | " + subject + " | " + text);
    return true;
  }
  if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_TOKEN || !env.MAIL_FROM) {
    console.log("Пошта не налаштована");
    return false;
  }
  try {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/email/sending/send";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.CF_EMAIL_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: to,
        from: { address: env.MAIL_FROM, name: SITE_NAME },
        subject: subject,
        html: html,
        text: text,
      }),
    });
    if (!res.ok) {
      console.log("Помилка пошти: " + res.status + " " + (await res.text()));
      return false;
    }
    return true;
  } catch (e) {
    console.log("Помилка пошти: " + String(e));
    return false;
  }
}

function wrapLetter(content: string): string {
  return (
    '<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;"><tr><td align="center">' +
    '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">' +
    '<tr><td style="background:#1a6b5a;padding:28px 36px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#ffffff;">Dnipro Academia</div></td></tr>' +
    '<tr><td style="padding:36px;">' +
    content +
    "</td></tr>" +
    '<tr><td style="background:#f9fbfa;border-top:1px solid #e8f0ee;padding:16px 36px;text-align:center;"><p style="margin:0;font-size:12px;color:#a0b4b0;">' +
    SITE_NAME +
    " · автоматичне повідомлення, не відповідайте на нього</p></td></tr>" +
    "</table></td></tr></table></body></html>"
  );
}

export async function sendVerificationEmail(env: Env, to: string, name: string, verifyUrl: string): Promise<boolean> {
  const subject = SITE_NAME + " — підтвердьте вашу електронну пошту";
  const content =
    '<p style="margin:0 0 12px;font-size:16px;color:#1a2e2a;">Вітаємо, <strong>' + esc(name) + "</strong>!</p>" +
    '<p style="margin:0 0 24px;font-size:14px;color:#4a6b65;line-height:1.6;">Для завершення реєстрації підтвердіть вашу електронну пошту, натиснувши кнопку нижче:</p>' +
    '<div style="text-align:center;margin:0 0 28px;"><a href="' + esc(verifyUrl) +
    '" style="display:inline-block;background:#1a6b5a;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">Підтвердити пошту</a></div>' +
    '<p style="margin:0;font-size:12px;color:#aaaaaa;text-align:center;">Або скопіюйте посилання:<br><span style="font-size:11px;color:#888888;word-break:break-all;">' +
    esc(verifyUrl) + "</span></p>";
  return await sendMail(env, to, subject, wrapLetter(content), "Підтвердіть пошту: " + verifyUrl);
}

export async function sendAdminAlert(env: Env, ip: string, email: string, count: number, link: string, time: string): Promise<void> {
  if (!env.ADMIN_EMAIL) return;
  const subject = "[" + SITE_NAME + "] Підозріла активність входу";
  const text =
    "Виявлено " + count + " невдалих спроб входу за останню годину.\n\n" +
    "IP: " + ip + "\n" +
    "Останній email: " + email + "\n" +
    "Час: " + time + "\n\n" +
    "Перевірте журнал безпеки в адміністративній панелі.\n" + link;
  const html = "<pre style=\"font-family:Arial,sans-serif;font-size:14px\">" + esc(text) + "</pre>";
  await sendMail(env, env.ADMIN_EMAIL, subject, html, text);
}
