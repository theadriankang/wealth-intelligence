/** The book-wide urgent strip: every client's above-cutoff action, one click from its card. */
import { urgentTasks } from "../store.js";

export function paintUrgent(onPick) {
  const el = document.getElementById("urgent");
  if (!el) return;
  const tasks = urgentTasks();
  if (!tasks.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `<span class="urgent-lab">Urgent</span>` + tasks.map(t =>
    `<button class="urgent-task urg-${t.kind}" data-uid="${t.portfolioId}|${t.actionId}">
      <b>${t.clientName}</b> ${t.text}<span class="upip">${Math.round(t.urgency)}</span></button>`).join("");
  el.querySelectorAll("[data-uid]").forEach(b => b.addEventListener("click", () => {
    const [portfolioId, actionId] = b.dataset.uid.split("|");
    onPick({ portfolioId, actionId });
  }));
}
