import { byId } from "./common";

function toast(message: string, ok = true): void {
  const el = document.createElement("div");
  el.textContent = message;
  el.className = "da-toast";
  el.style.background = ok ? "#0d9488" : "#ef4444";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

async function request(action: string, data: Record<string, string>): Promise<any> {
  const form = new FormData();
  for (const key in data) form.append(key, data[key]);
  try {
    const res = await fetch("/api/admin/" + action, { method: "POST", body: form, credentials: "same-origin" });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return { ok: false };
    }
    return await res.json();
  } catch (e) {
    return { ok: false, msg: "Помилка з'єднання" };
  }
}

function value(id: string): string {
  const el = byId(id) as HTMLInputElement | null;
  if (!el) return "";
  return el.value;
}

function selectValue(name: string): string {
  const el = document.querySelector<HTMLSelectElement>('select[name="' + name + '"]');
  if (!el) return "";
  return el.value;
}

function reloadSoon(delay: number): void {
  setTimeout(() => location.reload(), delay);
}

async function handleAction(button: HTMLElement): Promise<void> {
  const action = button.dataset.action || "";
  const uid = button.dataset.uid || "";
  const cid = button.dataset.cid || "";

  if (action === "assign_user") {
    const r = await request("assign_user", {
      uid: uid,
      role: selectValue("role_" + uid),
      class_id: selectValue("class_" + uid),
      subject: value("subj_" + uid),
    });
    if (r.ok) {
      toast("Підтверджено");
      button.closest("tr")?.remove();
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "delete_user") {
    if (!confirm("Видалити користувача?")) return;
    const r = await request("delete_user", { uid: uid });
    if (r.ok) {
      toast("Видалено");
      button.closest("tr")?.remove();
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "add_class") {
    const name = value("new-class-name").trim();
    if (!name) {
      toast("Введіть назву", false);
      return;
    }
    const r = await request("add_class", { name: name });
    if (r.ok) {
      toast("Клас додано");
      reloadSoon(800);
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "delete_class") {
    if (!confirm("Видалити клас?")) return;
    const r = await request("delete_class", { cid: cid });
    if (r.ok) {
      toast("Видалено");
      button.closest(".da-class-card")?.remove();
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "add_member") {
    const role = button.dataset.role || "student";
    let email = "";
    if (role === "teacher") {
      email = value("add-teacher-" + cid);
    } else {
      email = value("add-student-" + cid);
    }
    if (!email) {
      toast("Введіть email", false);
      return;
    }
    const r = await request("add_member", { cid: cid, email: email, role: role });
    if (r.ok) {
      toast("Додано");
      reloadSoon(800);
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "remove_member") {
    if (!confirm("Видалити з класу?")) return;
    const r = await request("remove_member", { cid: cid, uid: uid });
    if (r.ok) {
      toast("Видалено");
      button.closest("li")?.remove();
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "add_subject") {
    const name = value("subj-input-" + cid).trim();
    if (!name) {
      toast("Введіть назву", false);
      return;
    }
    const r = await request("add_subject", { cid: cid, name: name });
    if (r.ok) {
      toast("Предмет додано");
      reloadSoon(800);
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "del_subject") {
    const r = await request("del_subject", { sid: button.dataset.sid || "" });
    if (r.ok) {
      toast("Видалено");
      button.closest(".da-chip")?.remove();
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "del_schedule") {
    const r = await request("del_schedule", { id: button.dataset.id || "" });
    if (r.ok) {
      toast("Видалено");
      button.closest(".da-schedule-entry")?.remove();
    } else {
      toast(r.msg || "Помилка", false);
    }
  } else if (action === "bl_add" || action === "bl_add_form") {
    let ip = button.dataset.ip || "";
    if (!ip) ip = value("bl-ip").trim();
    if (!ip) {
      alert("Введіть IP");
      return;
    }
    const r = await request("ip_blacklist_add", { ip: ip, reason: value("bl-reason").trim() });
    if (r.ok) {
      location.reload();
    } else {
      alert(r.msg || "Помилка");
    }
  } else if (action === "bl_remove") {
    const ip = button.dataset.ip || "";
    if (!confirm("Видалити " + ip + " з чорного списку?")) return;
    const r = await request("ip_blacklist_remove", { ip: ip });
    if (r.ok) {
      button.closest("tr")?.remove();
    } else {
      alert(r.msg || "Помилка");
    }
  }
}

const modal = byId("da-schedule-modal");

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target || !target.closest) return;

  const actionButton = target.closest<HTMLElement>("[data-action]");
  if (actionButton) {
    handleAction(actionButton);
    return;
  }

  const slot = target.closest<HTMLElement>(".da-add-slot");
  if (slot && modal) {
    (byId("sch-cid") as HTMLInputElement).value = slot.dataset.cid || "";
    (byId("sch-day") as HTMLInputElement).value = slot.dataset.day || "";
    (byId("sch-period") as HTMLInputElement).value = slot.dataset.period || "";
    modal.style.display = "flex";
    return;
  }

  if (target.closest("#sch-cancel") && modal) {
    modal.style.display = "none";
    return;
  }

  if (target.closest("#sch-save")) {
    request("add_schedule", {
      cid: value("sch-cid"),
      day: value("sch-day"),
      period: value("sch-period"),
      subject: value("sch-subject"),
      group: value("sch-group"),
      week_type: value("sch-week"),
    }).then((r) => {
      if (r.ok) {
        toast("Збережено");
        if (modal) modal.style.display = "none";
        reloadSoon(600);
      } else {
        toast(r.msg || "Помилка", false);
      }
    });
    return;
  }
});

document.addEventListener("submit", (e) => {
  const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
  if (submitter && submitter.dataset.confirm) {
    if (!confirm(submitter.dataset.confirm)) e.preventDefault();
  }
});

