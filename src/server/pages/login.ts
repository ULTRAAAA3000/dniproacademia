import type { Env } from "../types";
import { getSetting } from "../db";
import { esc } from "../utils";

const EYE =
  '<svg width="17" height="17" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

const LOGO =
  '<div class="da-auth-logo"><span class="da-auth-logo-icon">ДА</span><span class="da-auth-logo-text">Дніпро Академія</span></div>';

function field(id: string, type: string, label: string, autocomplete: string): string {
  let auto = "";
  if (autocomplete) auto = ' autocomplete="' + autocomplete + '"';
  return (
    '<div class="da-field"><input class="da-field-input" type="' + type + '" id="' + id + '" placeholder=" "' + auto + ">" +
    '<label class="da-field-label" for="' + id + '">' + label + "</label></div>"
  );
}

function passwordField(id: string, label: string, autocomplete: string): string {
  let auto = "";
  if (autocomplete) auto = ' autocomplete="' + autocomplete + '"';
  return (
    '<div class="da-field"><div class="da-fey-wrap"><input class="da-field-input" type="password" id="' + id + '" placeholder=" "' + auto + ">" +
    '<label class="da-field-label" for="' + id + '">' + label + "</label>" +
    '<button type="button" class="da-field-eye" data-target="' + id + '">' + EYE + "</button></div></div>"
  );
}

function button(id: string, text: string): string {
  return (
    '<button class="da-btn-primary" id="' + id + '"><span class="da-btn-text">' + text +
    '</span><span class="da-spinner" style="display:none"></span></button>'
  );
}

export async function renderLogin(env: Env, ev: string): Promise<string> {
  const siteKey = await getSetting(env.DB, "turnstile_site_key", "");

  let notice = "";
  if (ev === "1") {
    notice =
      '<div class="da-notice da-notice--ok"><strong>Email підтверджено!</strong> Чекайте підтвердження від адміністратора.</div>';
  } else if (ev === "fail") {
    notice = '<div class="da-notice da-notice--bad">Посилання для підтвердження недійсне або вже використане.</div>';
  }

  let captcha = "";
  let captchaScript = "";
  if (siteKey) {
    captcha = '<div class="da-captcha-wrap"><div class="cf-turnstile" data-sitekey="' + esc(siteKey) + '" data-theme="light"></div></div>';
    captchaScript = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';
  }

  const loginForm =
    '<div class="da-auth-card" id="da-login-form">' + LOGO +
    '<h2 class="da-auth-title">Вхід до кабінету</h2>' +
    '<div class="da-alert" id="login-alert" style="display:none"></div>' +
    field("login-email", "email", "Електронна пошта", "email") +
    passwordField("login-password", "Пароль", "current-password") +
    button("btn-login", "Увійти") +
    '<div class="da-auth-divider">або</div>' +
    '<div class="da-auth-links"><button class="da-link" id="go-register">Немає акаунту? Реєстрація</button><button class="da-link" id="go-forgot">Забули пароль?</button></div></div>';

  const otpForm =
    '<div class="da-auth-card" id="da-otp-form" style="display:none">' + LOGO +
    '<h2 class="da-auth-title">Підтвердження входу</h2>' +
    '<p class="da-auth-subtitle" id="otp-hint">Введіть 3-значний код, надісланий на вашу пошту</p>' +
    '<div class="da-alert" id="otp-alert" style="display:none"></div>' +
    '<div class="da-otp-inputs">' +
    '<input class="da-otp-digit" type="text" inputmode="numeric" maxlength="1" id="otp-d1" autocomplete="off">' +
    '<input class="da-otp-digit" type="text" inputmode="numeric" maxlength="1" id="otp-d2" autocomplete="off">' +
    '<input class="da-otp-digit" type="text" inputmode="numeric" maxlength="1" id="otp-d3" autocomplete="off">' +
    "</div>" +
    button("btn-verify-otp", "Підтвердити") +
    '<div class="da-auth-links" style="margin-top:12px"><button class="da-link" id="go-back-from-otp">← Повернутися до входу</button></div></div>';

  const registerForm =
    '<div class="da-auth-card" id="da-register-form" style="display:none">' + LOGO +
    '<h2 class="da-auth-title">Реєстрація</h2>' +
    '<div class="da-alert" id="reg-alert" style="display:none"></div>' +
    '<div class="da-form-row2">' +
    field("reg-first", "text", "Ім'я", "given-name") +
    field("reg-last", "text", "Прізвище", "family-name") +
    "</div>" +
    field("reg-email", "email", "Електронна пошта", "email") +
    passwordField("reg-password", "Пароль (мін. 6 символів)", "new-password") +
    field("reg-recovery", "text", "Кодове слово для відновлення", "") +
    captcha +
    button("btn-register", "Зареєструватись") +
    '<div class="da-auth-links" style="margin-top:16px;justify-content:center"><button class="da-link" id="go-login-from-reg">← Назад до входу</button></div></div>';

  const forgotForm =
    '<div class="da-auth-card" id="da-forgot-form" style="display:none">' + LOGO +
    '<h2 class="da-auth-title">Відновлення пароля</h2>' +
    '<div class="da-step-dots"><div class="da-step-dot active" id="dot-1"></div><div class="da-step-dot" id="dot-2"></div><div class="da-step-dot" id="dot-3"></div></div>' +
    '<div class="da-alert" id="forgot-alert" style="display:none"></div>' +
    '<div id="forgot-step1">' + field("forgot-email", "email", "Електронна пошта", "") + button("btn-check-email", "Далі →") + "</div>" +
    '<div id="forgot-step2" style="display:none">' + field("forgot-recovery", "text", "Кодове слово (з великої літери)", "") + button("btn-check-recovery", "Перевірити →") + "</div>" +
    '<div id="forgot-step3" style="display:none"><input type="hidden" id="forgot-token">' + passwordField("forgot-newpass", "Новий пароль", "") + button("btn-reset-pass", "Зберегти пароль") + "</div>" +
    '<div class="da-auth-links" style="margin-top:16px;justify-content:center"><button class="da-link" id="go-login-from-forgot">← Назад до входу</button></div></div>';

  return (
    '<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    "<title>Вхід до кабінету — Дніпро Академія</title>" +
    '<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/client.css"><link rel="stylesheet" href="/css/login.css"><link rel="stylesheet" href="/css/extra.css">' +
    "</head><body>" +
    '<div class="da-auth-page"></div><div class="da-particles" id="da-particles"></div>' +
    notice +
    '<div class="da-auth-wrap" id="da-auth">' + loginForm + otpForm + registerForm + forgotForm + "</div>" +
    '<a href="/" class="da-back-btn"><svg width="13" height="13" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>На головну</a>' +
    captchaScript +
    '<script src="/assets/login.js"></script></body></html>'
  );
}
