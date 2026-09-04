/**
 * THE SCREEN YOU CAN TURN AROUND.
 *
 * Same data, different reader. No instability indices, no amber alerts, no jargon —
 * goals, plainly, and what the adviser wants to talk about. Light, calm, printable.
 */
import { S, goals, flagged } from "../store.js";

export function renderClientView(root) {
  const p = S.portfolio, gs = goals();
  const worst = [...gs].sort((a, b) => a.change - b.change)[0];
  const fl = flagged();

  root.innerHTML = `
  <div class="cv"><div class="cv-inner">
    <a class="back" href="?">← Adviser view</a>
    <h1>Your plan, this month</h1>
    <p class="sub">${p.name} · prepared by ${p.rm} · 4 September 2026</p>

    <p class="lead">${worst && worst.change < 0
      ? `Most of your plan is on track. One goal — <strong>${worst.name}</strong> — moved further
         away this month, and that is what we should spend our time on when we speak.`
      : `Your plan is on track across every goal we plan against. Nothing needs a decision
         from you before your next review.`}</p>

    ${gs.map(g => {
      const col = g.funded >= 95 ? "#1f6f5c" : g.funded >= 80 ? "#b8862b" : "#8a3324";
      return `<div class="cv-goal">
        <span class="n">${g.name}</span>
        <span class="p" style="color:${col}">${g.funded}%</span>
        <span class="h">${g.horizon} · ${g.targetLabel}${g.change !== 0
          ? ` · ${g.change > 0 ? "up" : "down"} ${Math.abs(g.change)} points this month` : ""}</span>
        <span class="tr"><i style="width:${Math.min(100, g.funded)}%; background:${col}"></i></span>
      </div>`;
    }).join("")}

    <div class="talk">
      <h2>What we would like to discuss</h2>
      ${(p.relationship?.points || []).slice(0, 3).map(t =>
        `<p>${stripAdviserVoice(t)}</p>`).join("")}
      ${fl.length ? `<p>In short: ${fl.length} of your holdings are exposed to the same part of the
        world at the same time. That is a concentration worth understanding, and there are options
        that do not involve selling anything you would rather keep.</p>` : ""}
    </div>

    <p class="foot">Prepared for discussion with your adviser. This is not investment advice and
    nothing has been actioned on your account. Figures are indicative and, in this prototype,
    fabricated for demonstration.</p>
  </div></div>`;
}

/** The adviser's notes are written to the adviser. Soften the register for the client. */
function stripAdviserVoice(t) {
  return t
    .replace(/^Lead with the goal[^:]*:\s*/i, "")
    .replace(/^Open with /i, "We should start with ")
    .replace(/^Name the concentration honestly — /i, "There is a concentration worth naming: ")
    .replace(/^Raise the /i, "We should cover the ")
    .replace(/^Bring the /i, "We will bring the ")
    .replace(/^Have the /i, "We will have the ")
    .replace(/this week\./i, "this month.")
    .replace(/he will not have worked out himself|she measures everything against/i,
             "worth going through together");
}
