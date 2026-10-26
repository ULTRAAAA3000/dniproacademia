import { byId, inputValue, setValue, api, showAlert, hide, setLoading } from "./common";

const FORMS = ["da-login-form", "da-register-form", "da-forgot-form"];
let forgotEmail = "";

function showPanel(id: string): void {
  for (let i = 0; i < FORMS.length; i++) {
    const form = byId(FORMS[i]);
    if (form) form.style.display = "none";
  }
  const target = byId(id);
  if (target) {
    target.style.opacity = "0";
    target.style.display = "block";
    setTimeout(() => {
      target.style.transition = "opacity .2s";
      target.style.opacity = "1";
    }, 20);
  }
  const alerts = document.querySelectorAll<HTMLElement>(".da-alert");
  for (let i = 0; i < alerts.length; i++) alerts[i].style.display = "none";
}

function click(id: string, handler: () => void): void {
  const el = byId(id);
  if (el) el.addEventListener("click", handler);
}

click("go-register", () => showPanel("da-register-form"));
click("go-login-from-reg", () => showPanel("da-login-form"));
click("go-forgot", () => showPanel("da-forgot-form"));
click("go-login-from-forgot", () => showPanel("da-login-form"));

const eyes = document.querySelectorAll<HTMLElement>(".da-field-eye");
for (let i = 0; i < eyes.length; i++) {
  eyes[i].addEventListener("click", () => {
    const input = byId(eyes[i].getAttribute("data-target") || "") as HTMLInputElement | null;
    if (!input) return;
    const svg = eyes[i].querySelector("svg");
    if (input.type === "password") {
      input.type = "text";
      if (svg) {
        svg.innerHTML =
          '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
      }
    } else {
      input.type = "password";
      if (svg) {
        svg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
      }
    }
  });
}

async function doLogin(): Promise<void> {
  const email = inputValue("login-email").trim();
  const password = inputValue("login-password");
  const alertBox = byId("login-alert");
  const button = byId("btn-login");

  if (!email || !password) {
    showAlert(alertBox, "Заповніть всі поля");
    return;
  }

  setLoading(button, true);
  const r = await api("login", { email: email, password: password });
  setLoading(button, false);

  if (r.ok) {
    window.location.href = "/da-cabinet";
  } else {
    showAlert(alertBox, r.msg || "Помилка входу");
    if (r.locked && button) (button as HTMLButtonElement).disabled = true;
  }
}

click("btn-login", doLogin);

const loginInputs = ["login-email", "login-password"];
for (let i = 0; i < loginInputs.length; i++) {
  const el = byId(loginInputs[i]);
  if (el) {
    el.addEventListener("keypress", (e) => {
      if ((e as KeyboardEvent).key === "Enter") doLogin();
    });
  }
}

click("btn-register", async () => {
  const first = inputValue("reg-first").trim();
  const last = inputValue("reg-last").trim();
  const email = inputValue("reg-email").trim();
  const password = inputValue("reg-password");
  const recovery = inputValue("reg-recovery").trim();
  const alertBox = byId("reg-alert");
  const button = byId("btn-register");

  if (!first || !last || !email || !password || !recovery) {
    showAlert(alertBox, "Заповніть всі поля");
    return;
  }

  const tokenEl = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
  let token = "";
  if (tokenEl) token = tokenEl.value;
  if (document.querySelector(".cf-turnstile") && !token) {
    showAlert(alertBox, "Пройдіть перевірку CAPTCHA");
    return;
  }

  setLoading(button, true);
  const r = await api("register", {
    first_name: first,
    last_name: last,
    email: email,
    password: password,
    recovery: recovery,
    cf_turnstile_response: token,
  });
  setLoading(button, false);

  if (r.ok) {
    showAlert(alertBox, r.msg || "Реєстрація успішна! Перевірте пошту.", true);
    setTimeout(() => showPanel("da-login-form"), 4000);
  } else {
    showAlert(alertBox, r.msg || "Помилка");
    const w = window as any;
    if (w.turnstile) w.turnstile.reset();
  }
});

click("btn-check-email", async () => {
  forgotEmail = inputValue("forgot-email").trim();
  const alertBox = byId("forgot-alert");
  const button = byId("btn-check-email");
  if (!forgotEmail) {
    showAlert(alertBox, "Введіть email");
    return;
  }
  setLoading(button, true);
  const r = await api("check_email", { email: forgotEmail });
  setLoading(button, false);
  if (r.ok) {
    (byId("forgot-step1") as HTMLElement).style.display = "none";
    (byId("forgot-step2") as HTMLElement).style.display = "block";
    byId("dot-1")?.classList.remove("active");
    byId("dot-2")?.classList.add("active");
    hide(alertBox);
  } else {
    showAlert(alertBox, "Email не знайдено");
  }
});

click("btn-check-recovery", async () => {
  const recovery = inputValue("forgot-recovery").trim();
  const alertBox = byId("forgot-alert");
  const button = byId("btn-check-recovery");
  if (!recovery) {
    showAlert(alertBox, "Введіть кодове слово");
    return;
  }
  setLoading(button, true);
  const r = await api("check_recovery", { email: forgotEmail, recovery: recovery });
  setLoading(button, false);
  if (r.ok) {
    setValue("forgot-token", r.reset_token);
    (byId("forgot-step2") as HTMLElement).style.display = "none";
    (byId("forgot-step3") as HTMLElement).style.display = "block";
    byId("dot-2")?.classList.remove("active");
    byId("dot-3")?.classList.add("active");
    hide(alertBox);
  } else {
    showAlert(alertBox, r.msg || "Невірне слово");
  }
});

click("btn-reset-pass", async () => {
  const password = inputValue("forgot-newpass");
  const token = inputValue("forgot-token");
  const alertBox = byId("forgot-alert");
  const button = byId("btn-reset-pass");
  if (!password) {
    showAlert(alertBox, "Введіть пароль");
    return;
  }
  setLoading(button, true);
  const r = await api("reset_password", { reset_token: token, password: password });
  setLoading(button, false);
  if (r.ok) {
    showAlert(alertBox, "Пароль змінено!", true);
    setTimeout(() => showPanel("da-login-form"), 2000);
  } else {
    showAlert(alertBox, r.msg || "Помилка");
  }
});

const bubbles = [
  { w: 55, l: 6, dur: 12, del: 0, bg: "" },
  { w: 28, l: 20, dur: 9, del: 3, bg: "" },
  { w: 72, l: 76, dur: 15, del: 1, bg: "" },
  { w: 18, l: 90, dur: 8, del: 4.5, bg: "" },
  { w: 42, l: 62, dur: 11, del: 0.5, bg: "rgba(78,205,196,.14)" },
  { w: 30, l: 38, dur: 10, del: 6, bg: "" },
  { w: 22, l: 52, dur: 13, del: 2, bg: "" },
  { w: 48, l: 12, dur: 16, del: 7, bg: "rgba(26,107,94,.13)" },
  { w: 35, l: 82, dur: 11, del: 9, bg: "" },
  { w: 60, l: 45, dur: 14, del: 5, bg: "rgba(78,205,196,.1)" },
];

const particles = byId("da-particles");
if (particles) {
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const dot = document.createElement("div");
    dot.className = "da-p";
    let style =
      "width:" + b.w + "px;height:" + b.w + "px;left:" + b.l + "%;animation-duration:" + b.dur + "s;animation-delay:" + b.del + "s;";
    if (b.bg) style += "background:" + b.bg + ";";
    dot.setAttribute("style", style);
    particles.appendChild(dot);
  }
}
