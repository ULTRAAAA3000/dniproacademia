import { byId } from "./common";

const WORDS = ["оцінка", "оцінки", "оцінки", "оцінки", "оцінок"];

function line(text: string, kind: string): string {
  return '<div class="da-calc-line da-calc-line--' + kind + '">' + text + "</div>";
}

export function runCalc(): void {
  const select = byId("da-calc-subject") as HTMLSelectElement | null;
  const goalInput = byId("da-calc-goal") as HTMLInputElement | null;
  const whatInput = byId("da-calc-what") as HTMLInputElement | null;
  const result = byId("da-calc-result");
  if (!select || !goalInput || !whatInput || !result) return;

  const option = select.options[select.selectedIndex];
  const sum = Number(option.dataset.sum);
  const count = Number(option.dataset.count);
  const avg = sum / count;

  if (goalInput.dataset.subject !== select.value) {
    let goal = Math.floor(avg) + 1;
    if (goal > 12) goal = 12;
    goalInput.value = String(goal);
    goalInput.dataset.subject = select.value;
  }

  let html = line("Зараз: " + avg.toFixed(1) + " (оцінок: " + count + ")", "info");

  const goal = Number(goalInput.value);
  if (goal >= 1 && goal <= 12) {
    if (avg >= goal) {
      html += line("Ціль уже досягнута", "ok");
    } else {
      for (let k = 1; k <= 5; k++) {
        const need = Math.ceil(((goal * (count + k) - sum) / k) * 10) / 10;
        const text = "Ще " + k + " " + WORDS[k - 1] + ": ";
        if (need > 12) html += line(text + "недосяжно (треба " + need.toFixed(1) + ")", "no");
        else html += line(text + "у середньому " + need.toFixed(1), "ok");
      }
    }
  }

  const what = Number(whatInput.value);
  if (whatInput.value !== "" && what >= 1 && what <= 12) {
    const next = (sum + what) / (count + 1);
    const diff = next - avg;
    let sign = "";
    if (diff >= 0) sign = "+";
    html += line("З оцінкою " + what + " середній стане " + next.toFixed(1) + " (" + sign + diff.toFixed(1) + ")", "info");
  }

  result.innerHTML = html;
}

export function startCalc(): void {
  document.addEventListener("input", runCalc);
  document.addEventListener("change", runCalc);
  runCalc();
}
