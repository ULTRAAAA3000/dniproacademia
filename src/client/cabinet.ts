import {
  byId, inputValue, setValue, escapeHtml, gradeColor, api, postForm, showAlert, hide, setLoading,
  openModal, closeModal, removeSmoothly, formatDateTime,
} from "./common";
import { startSettings, openSettings, closeSettings } from "./settings";
import { startChat, openChatPage } from "./chat";

const ICON_EDIT =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_TRASH =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
const BUTTON_STYLE = "display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;cursor:pointer;flex-shrink:0;";

const STUDENT_COLORS: Record<number, string> = {
  1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#eab308", 5: "#eab308", 6: "#84cc16",
  7: "#22c55e", 8: "#14b8a6", 9: "#14b8a6", 10: "#0ea5e9", 11: "#6366f1", 12: "#8b5cf6",
};

function skeletonCard(): string {
  return (
    '<div class="da-card-skeleton"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
    '<span class="da-sk" style="width:70px;height:10px"></span><span class="da-sk" style="width:80px;height:22px;border-radius:100px"></span></div>' +
    '<div class="da-sk" style="width:75%;height:15px;margin-bottom:8px"></div><div class="da-sk" style="width:55%;height:13px;margin-bottom:14px"></div>' +
    '<div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid var(--line)">' +
    '<span class="da-sk" style="width:90px;height:11px"></span><span class="da-sk" style="width:60px;height:11px"></span></div></div>'
  );
}

function skeletonGrade(): string {
  return (
    '<div class="da-grade-skeleton"><span class="da-sk" style="width:38px;height:38px;border-radius:8px;flex-shrink:0"></span>' +
    '<div style="flex:1"><div class="da-sk" style="width:60%;height:12px;margin-bottom:6px"></div><div class="da-sk" style="width:40%;height:11px"></div></div>' +
    '<span class="da-sk" style="width:28px;height:28px;border-radius:6px;flex-shrink:0"></span></div>'
  );
}

function skeletonMaterial(): string {
  return (
    '<div class="da-mat-skeleton"><span class="da-sk" style="width:42px;height:42px;border-radius:8px;flex-shrink:0"></span>' +
    '<div style="flex:1"><div class="da-sk" style="width:70%;height:13px;margin-bottom:6px"></div><div class="da-sk" style="width:45%;height:11px"></div></div>' +
    '<span class="da-sk" style="width:80px;height:30px;border-radius:6px"></span></div>'
  );
}

function swapSkeleton(container: HTMLElement | null, makeSkeleton: () => string, count: number, delay: number): void {
  if (!container || !container.children.length) return;
  const real = container.innerHTML;
  let skeletons = "";
  for (let i = 0; i < count; i++) skeletons += makeSkeleton();
  container.innerHTML = skeletons;

  setTimeout(() => {
    container.style.opacity = "0";
    container.innerHTML = real;
    const items = container.querySelectorAll<HTMLElement>(".da-card,.da-material-card,.da-sgrade-block,.da-gc,.da-news-card");
    for (let i = 0; i < items.length; i++) {
      items[i].style.opacity = "0";
      setTimeout(() => {
        items[i].style.transition = "opacity .22s ease";
        items[i].style.opacity = "1";
      }, i * 40);
    }
    container.style.transition = "opacity .15s";
    container.style.opacity = "1";
  }, delay);
}

function recalcAverage(uid: string): void {
  const avgEl = byId("avg-" + uid);
  if (!avgEl) return;
  const chips = document.querySelectorAll("#grades-list-" + uid + " .da-gc");
  if (!chips.length) {
    avgEl.innerHTML = "—";
    avgEl.classList.remove("da-avg-pill");
    return;
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < chips.length; i++) {
    const badge = chips[i].querySelector(".da-gc-badge");
    const value = parseInt(badge ? badge.textContent || "" : "", 10);
    if (!isNaN(value)) {
      sum += value;
      count++;
    }
  }
  let avg = "0";
  if (count > 0) avg = (sum / count).toFixed(1);
  avgEl.innerHTML = avg;
  avgEl.classList.add("da-avg-pill");
}

function gradeChipHtml(id: number, grade: number, description: string, uid: string): string {
  const color = gradeColor(grade);
  const now = new Date();
  const dateText = ("0" + now.getDate()).slice(-2) + "." + ("0" + (now.getMonth() + 1)).slice(-2) + "." + now.getFullYear();
  let descBlock = "";
  if (description) {
    descBlock = '<div class="da-gc-desc" style="font-size:12px;color:#6b8f89;flex:1;">' + escapeHtml(description) + "</div>";
  }
  return (
    '<div class="da-gc" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #deecea;border-radius:8px;background:#fff;margin-bottom:4px;" id="gchip-' + id + '">' +
    '<div class="da-gc-left" style="display:flex;align-items:center;gap:10px;flex:1;"><div class="da-gc-badge" style="min-width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0;background:' +
    color + '">' + grade + "</div>" + descBlock + '<div style="font-size:11px;color:#a3bfbb;white-space:nowrap;">' + dateText + "</div></div>" +
    '<div class="da-gc-btns" style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
    '<div class="da-gc-btn da-gc-btn-edit" style="' + BUTTON_STYLE + 'background-color:#f2faf9;border:1.5px solid #deecea;color:#1a6b5e;" data-act="edit-grade" data-id="' + id + '" data-grade="' + grade + '" data-desc="' + escapeHtml(description) + '">' + ICON_EDIT + "</div>" +
    '<div class="da-gc-btn da-gc-btn-del" style="' + BUTTON_STYLE + 'background-color:#fff7f7;border:1.5px solid #fecaca;color:#c0392b;" data-act="delete-grade" data-id="' + id + '" data-uid="' + uid + '">' + ICON_TRASH + "</div></div></div>"
  );
}

async function addNews(button: HTMLElement): Promise<void> {
  const titleEl = byId("news-title-inp") as HTMLInputElement | null;
  const bodyEl = byId("news-body-inp") as HTMLTextAreaElement | null;
  const alertBox = byId("news-alert");
  if (!titleEl || !bodyEl) return;

  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  if (!title || !body) {
    showAlert(alertBox, "Заповніть тему та текст");
    return;
  }
  hide(alertBox);

  setLoading(button, true);
  const r = await api("add_news", { class_id: button.dataset.cid || "0", title: title, body: body });
  setLoading(button, false);

  if (!r.ok) {
    showAlert(alertBox, r.msg || "Помилка");
    return;
  }

  const authorEl = document.querySelector(".da-user-name");
  let author = "";
  if (authorEl) author = authorEl.textContent || "";

  const html =
    '<div class="da-news-card" id="news-' + r.id + '"><div class="da-news-card-header"><div class="da-news-card-title">' + escapeHtml(title) +
    '</div><div class="da-news-card-meta"><span class="da-news-author">' + escapeHtml(author) + '</span><span class="da-news-date">' + formatDateTime(new Date()) + "</span>" +
    '<div class="da-gc-btn da-gc-btn-del" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;cursor:pointer;background-color:#fff7f7;border:1.5px solid #fecaca;color:#c0392b;" data-act="delete-news" data-id="' +
    r.id + '" title="Видалити">' + ICON_TRASH.replace(/15/g, "13") + "</div></div></div>" +
    '<div class="da-news-card-body">' + escapeHtml(body).replace(/\n/g, "<br>") + "</div></div>";

  const list = byId("da-news-list");
  if (list) {
    const empty = list.querySelector(".da-empty");
    if (empty) empty.remove();
    list.insertAdjacentHTML("afterbegin", html);
  }
  titleEl.value = "";
  bodyEl.value = "";
}

async function refreshGrades(button: HTMLElement): Promise<void> {
  if (button.classList.contains("loading")) return;
  button.classList.add("loading");
  const r = await api("get_grades", { class_id: button.dataset.cid || "0" });
  button.classList.remove("loading");
  if (!r.ok) return;

  let html = "";
  if (!r.data || !r.data.length) {
    html = '<div class="da-empty">Оцінок ще немає.</div>';
  } else {
    for (let i = 0; i < r.data.length; i++) {
      const g = r.data[i];
      const number = parseInt(g.grade, 10);
      let color = STUDENT_COLORS[number];
      if (!color) color = "#14b8a6";
      let desc = "";
      if (g.description) desc = '<div class="da-card-desc">' + escapeHtml(g.description) + "</div>";
      html +=
        '<div class="da-card da-card--grade"><div class="da-grade-badge" style="background:' + color + '">' + number + '</div><div class="da-grade-info"><div class="da-card-subject">' +
        escapeHtml(g.subject) + "</div>" + desc + '<div class="da-card-footer"><span>' + escapeHtml(g.teacher_name) + '</span><span class="da-card-pub">' + escapeHtml(g.created_at) + "</span></div></div></div>";
    }
  }
  const list = byId("da-grades-list");
  if (list) list.innerHTML = html;
}

async function addHomework(button: HTMLElement): Promise<void> {
  const subject = inputValue("hw-subject");
  const topic = inputValue("hw-topic").trim();
  const description = inputValue("hw-desc");
  const deadline = inputValue("hw-deadline");
  const alertBox = byId("hw-alert");

  if (!topic || !deadline) {
    showAlert(alertBox, "Заповніть тему та дату");
    return;
  }
  setLoading(button, true);
  const r = await api("add_homework", {
    class_id: button.dataset.cid || "0", subject: subject, topic: topic, description: description, deadline: deadline,
  });
  setLoading(button, false);
  if (r.ok) {
    showAlert(alertBox, "Опубліковано!", true);
    setValue("hw-topic", "");
    setValue("hw-desc", "");
    setValue("hw-deadline", "");
    setTimeout(() => location.reload(), 900);
  } else {
    showAlert(alertBox, r.msg || "Помилка");
  }
}

async function saveEditedHomework(button: HTMLElement): Promise<void> {
  const id = inputValue("ehw-id");
  const topic = inputValue("ehw-topic").trim();
  const deadline = inputValue("ehw-deadline");
  const alertBox = byId("ehw-alert");

  if (!topic || !deadline) {
    showAlert(alertBox, "Заповніть тему та дату");
    return;
  }
  setLoading(button, true);
  const r = await api("edit_homework", { hw_id: id, topic: topic, description: inputValue("ehw-desc"), deadline: deadline });
  setLoading(button, false);
  if (r.ok) {
    closeModal("#da-edit-hw-modal");
    setTimeout(() => location.reload(), 300);
  } else {
    showAlert(alertBox, r.msg || "Помилка");
  }
}

async function saveNewGrade(): Promise<void> {
  const grade = parseInt(inputValue("gm-grade"), 10);
  const alertBox = byId("gm-alert");
  if (!grade || grade < 1 || grade > 12) {
    showAlert(alertBox, "Оцінка від 1 до 12");
    return;
  }
  const uid = inputValue("gm-uid");
  const description = inputValue("gm-desc");
  const r = await api("add_grade", {
    student_id: uid, class_id: inputValue("gm-cid"), subject: inputValue("gm-subject"), grade: grade, description: description,
  });
  if (!r.ok) {
    showAlert(alertBox, r.msg || "Помилка");
    return;
  }
  const list = byId("grades-list-" + uid);
  if (list) {
    const empty = list.querySelector(".da-gc-empty");
    if (empty) empty.remove();
    list.insertAdjacentHTML("beforeend", gradeChipHtml(r.grade_id, grade, description, uid));
  }
  closeModal("#da-grade-modal");
  recalcAverage(uid);
}

async function saveEditedGrade(button: HTMLElement): Promise<void> {
  const id = inputValue("egm-id");
  const grade = parseInt(inputValue("egm-grade"), 10);
  const description = inputValue("egm-desc").trim();
  const alertBox = byId("egm-alert");

  if (!grade || grade < 1 || grade > 12) {
    showAlert(alertBox, "Оцінка від 1 до 12");
    return;
  }
  setLoading(button, true);
  const r = await api("edit_grade", { grade_id: id, grade: grade, description: description });
  setLoading(button, false);
  if (!r.ok) {
    showAlert(alertBox, r.msg || "Помилка");
    return;
  }

  const chip = byId("gchip-" + id);
  if (chip) {
    const badge = chip.querySelector<HTMLElement>(".da-gc-badge");
    if (badge) {
      badge.style.background = gradeColor(grade);
      badge.textContent = String(grade);
    }
    const editBtn = chip.querySelector<HTMLElement>(".da-gc-btn-edit");
    if (editBtn) {
      editBtn.dataset.grade = String(grade);
      editBtn.dataset.desc = description;
    }
    const descEl = chip.querySelector(".da-gc-desc");
    if (description) {
      if (descEl) {
        descEl.textContent = description;
      } else if (badge) {
        badge.insertAdjacentHTML("afterend", '<div class="da-gc-desc" style="font-size:12px;color:#6b8f89;flex:1;">' + escapeHtml(description) + "</div>");
      }
    } else if (descEl) {
      descEl.remove();
    }
    const row = chip.closest(".da-sgrade-block");
    if (row) recalcAverage(row.id.replace("row-", ""));
  }
  closeModal("#da-edit-grade-modal");
}

async function saveFinalGrade(): Promise<void> {
  const grade = parseInt(inputValue("fm-grade"), 10);
  const alertBox = byId("fm-alert");
  if (!grade || grade < 1 || grade > 12) {
    showAlert(alertBox, "Оцінка від 1 до 12");
    return;
  }
  let semester = parseInt(inputValue("fm-semester"), 10);
  if (!semester) semester = 1;
  const uid = inputValue("fm-uid");

  const r = await api("set_final_grade", {
    student_id: uid, class_id: inputValue("fm-cid"), subject: inputValue("fm-subject"), grade: grade, semester: semester,
  });
  if (r.ok) {
    const cell = byId("fg-" + uid);
    if (cell) cell.innerHTML = '<span class="da-final-badge">' + grade + "</span>";
    closeModal("#da-final-modal");
  } else {
    showAlert(alertBox, r.msg || "Помилка");
  }
}

async function uploadMaterial(button: HTMLElement): Promise<void> {
  const fileInput = byId("mat-file") as HTMLInputElement;
  const file = fileInput.files ? fileInput.files[0] : null;
  const title = inputValue("mat-title").trim();
  const alertBox = byId("mat-alert");

  if (!file) {
    showAlert(alertBox, "Виберіть файл");
    return;
  }
  if (!title) {
    showAlert(alertBox, "Вкажіть назву");
    return;
  }
  const ext = file.name.split(".").pop()!.toLowerCase();
  if (ext !== "docx" && ext !== "pptx") {
    showAlert(alertBox, "Лише .docx або .pptx");
    return;
  }

  setLoading(button, true);
  const form = new FormData();
  form.append("class_id", button.dataset.cid || "0");
  form.append("subject", inputValue("mat-subject"));
  form.append("title", title);
  form.append("file", file);
  const r = await postForm("/api/upload_material", form);
  setLoading(button, false);

  if (r.ok) {
    showAlert(alertBox, "Завантажено!", true);
    setTimeout(() => location.reload(), 900);
  } else {
    showAlert(alertBox, r.msg || "Помилка");
  }
}

function handleActions(target: HTMLElement): boolean {
  const actionEl = target.closest<HTMLElement>("[data-act]");
  if (!actionEl) return false;
  const act = actionEl.dataset.act;
  const id = actionEl.dataset.id || "";

  if (act === "open-chat") {
    openChatPage();
  } else if (act === "open-settings") {
    openSettings();
  } else if (act === "close-settings") {
    closeSettings();
  } else if (act === "add-news") {
    addNews(actionEl);
  } else if (act === "delete-news") {
    if (!confirm("Видалити новину?")) return true;
    api("delete_news", { news_id: id }).then((r) => {
      if (r.ok) removeSmoothly(byId("news-" + id));
    });
  } else if (act === "edit-hw") {
    setValue("ehw-id", id);
    setValue("ehw-topic", actionEl.dataset.topic || "");
    setValue("ehw-desc", actionEl.dataset.desc || "");
    setValue("ehw-deadline", actionEl.dataset.deadline || "");
    hide(byId("ehw-alert"));
    openModal("#da-edit-hw-modal");
  } else if (act === "delete-hw") {
    if (!confirm("Видалити завдання?")) return true;
    api("delete_homework", { hw_id: id }).then((r) => {
      if (r.ok) removeSmoothly(byId("hw-" + id));
    });
  } else if (act === "edit-grade") {
    setValue("egm-id", id);
    setValue("egm-grade", actionEl.dataset.grade || "");
    setValue("egm-desc", actionEl.dataset.desc || "");
    hide(byId("egm-alert"));
    openModal("#da-edit-grade-modal");
  } else if (act === "delete-grade") {
    if (!confirm("Видалити оцінку?")) return true;
    const uid = actionEl.dataset.uid || "";
    api("delete_grade", { grade_id: id }).then((r) => {
      if (r.ok) {
        removeSmoothly(byId("gchip-" + id));
        setTimeout(() => recalcAverage(uid), 300);
      }
    });
  } else {
    return false;
  }
  return true;
}

function startClicks(): void {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target || !target.closest) return;

    if (handleActions(target)) return;

    const logout = target.closest<HTMLElement>("#da-logout");
    if (logout) {
      (logout as HTMLButtonElement).disabled = true;
      api("logout").then(() => {
        window.location.href = "/da-login";
      });
      return;
    }

    const refresh = target.closest<HTMLElement>(".da-refresh-btn");
    if (refresh) {
      const action = refresh.dataset.action;
      if (action === "da_get_homework_refresh") {
        location.reload();
      } else if (action === "da_get_grades") {
        refreshGrades(refresh);
      }
      return;
    }

    if (target.closest("#da-menu-toggle")) {
      byId("da-sidebar")?.classList.toggle("da-sidebar--open");
      byId("da-menu-toggle")?.classList.toggle("active");
      return;
    }

    if (target.closest(".da-nav-item,.da-sb-class-link")) {
      if (window.innerWidth <= 768) {
        byId("da-sidebar")?.classList.remove("da-sidebar--open");
        byId("da-menu-toggle")?.classList.remove("active");
      }
    }

    if (target.classList.contains("da-modal-overlay")) {
      const modal = target.closest<HTMLElement>(".da-modal");
      if (modal) closeModal("#" + modal.id);
      return;
    }

    const addGrade = target.closest<HTMLElement>(".add-grade-btn");
    if (addGrade) {
      setValue("gm-uid", addGrade.dataset.uid || "");
      setValue("gm-cid", addGrade.dataset.cid || "");
      setValue("gm-subject", addGrade.dataset.subject || "");
      const nameEl = byId("gm-name");
      if (nameEl) nameEl.textContent = addGrade.dataset.name || "";
      setValue("gm-grade", "");
      setValue("gm-desc", "");
      hide(byId("gm-alert"));
      openModal("#da-grade-modal");
      return;
    }

    const setFinal = target.closest<HTMLElement>(".set-final-btn");
    if (setFinal) {
      setValue("fm-uid", setFinal.dataset.uid || "");
      setValue("fm-cid", setFinal.dataset.cid || "");
      setValue("fm-subject", setFinal.dataset.subject || "");
      const nameEl = byId("fm-name");
      if (nameEl) nameEl.textContent = setFinal.dataset.name || "";
      setValue("fm-grade", "");
      hide(byId("fm-alert"));
      openModal("#da-final-modal");
      return;
    }

    const deleteMaterial = target.closest<HTMLElement>(".da-delete-mat");
    if (deleteMaterial) {
      if (!confirm("Видалити матеріал?")) return;
      const mid = deleteMaterial.dataset.mid || "";
      api("delete_material", { material_id: mid }).then((r) => {
        if (r.ok) removeSmoothly(byId("mat-" + mid));
      });
      return;
    }

    const buttonId = target.closest("button") ? (target.closest("button") as HTMLElement).id : "";
    const button = target.closest("button") as HTMLElement | null;
    if (buttonId === "btn-add-hw" && button) addHomework(button);
    if (buttonId === "btn-save-edit-hw" && button) saveEditedHomework(button);
    if (buttonId === "btn-cancel-edit-hw") closeModal("#da-edit-hw-modal");
    if (buttonId === "btn-grade-cancel") closeModal("#da-grade-modal");
    if (buttonId === "btn-save-grade") saveNewGrade();
    if (buttonId === "btn-save-edit-grade" && button) saveEditedGrade(button);
    if (buttonId === "btn-cancel-edit-grade") closeModal("#da-edit-grade-modal");
    if (buttonId === "btn-final-cancel") closeModal("#da-final-modal");
    if (buttonId === "btn-save-final") saveFinalGrade();
    if (buttonId === "btn-upload-mat" && button) uploadMaterial(button);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modals = document.querySelectorAll(".da-modal");
      for (let i = 0; i < modals.length; i++) {
        if ((modals[i] as HTMLElement).style.display !== "none") closeModal("#" + modals[i].id);
      }
    }
  });

  document.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === "mat-file") {
      let name = "Виберіть файл...";
      if (target.files && target.files[0]) name = target.files[0].name;
      const label = byId("mat-file-name");
      if (label) label.textContent = name;
    }
  });

  document.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === "gm-grade" || target.id === "egm-grade" || target.id === "fm-grade") {
      const value = parseInt(target.value, 10);
      if (value >= 1 && value <= 12) {
        const color = gradeColor(value);
        target.style.borderColor = color;
        target.style.boxShadow = "0 0 0 3px " + color + "30";
      } else {
        target.style.borderColor = "";
        target.style.boxShadow = "";
      }
    }
  });
}

startSettings();
startClicks();
startChat();

swapSkeleton(document.querySelector<HTMLElement>(".da-hw-list"), skeletonCard, 3, 400);
swapSkeleton(document.querySelector<HTMLElement>(".da-news-list"), skeletonCard, 3, 450);
swapSkeleton(document.querySelector<HTMLElement>(".da-materials-list"), skeletonMaterial, 3, 480);
swapSkeleton(document.querySelector<HTMLElement>(".da-grades-list"), skeletonGrade, 4, 420);
