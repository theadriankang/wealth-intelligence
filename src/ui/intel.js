/**
 * The intelligence panel — the retrieval layer made visible.
 *
 * Until now the fingerprint -> retrieval -> agent chain produced JSON that only
 * a terminal ever saw. Three things are worth a judge's attention and none of
 * them survive being described in a slide:
 *
 *   1. Findings derived by a toolbox whose arithmetic REFUSES a bare number or a
 *      live value. The tool-call count is shown because it is the audit trail.
 *   2. Dataset vs live disagreement, stated and never reconciled.
 *   3. The citation gate. On a fresh bundle every retrieved document is a
 *      candidate and nothing is citable — approving one re-runs the whole walk
 *      and the blocked line becomes a citation in front of them.
 *
 * Everything here re-derives from the bundle. Nothing is precomputed.
 */
import { S } from "../store.js";
import { loadBundle, walk, approve, docObservations, bundleIdFor } from "../intel/load.js";

const RM = "RM (demo)";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Re-render only; the caller owns when. */
export function paintIntel() {
  const el = document.getElementById("seg-intel");
  if (!el) return;

  const id = bundleIdFor(S.portfolio?.id);
  const b = S.intel?.[id];

  if (b === undefined) { el.innerHTML = frame(`<p class="muted">loading intelligence…</p>`); return; }
  if (b === null) {
    el.innerHTML = frame(`<p class="muted">No intel bundle for ${esc(id)}. Build one with
      <code>npm run intel -- --client ${esc(id)} --live</code>, then <code>npm run publish-intel</code>.</p>`);
    return;
  }

  const w = walk(b);
  if (!w) { el.innerHTML = frame(`<p class="muted">Bundle present but the walk failed — see console.</p>`); return; }

  const docs = docObservations(b);
  const approved = docs.filter(d => d.status === "approved").length;

  el.innerHTML = frame(`
    <div class="intel-meta">
      <span><b>${w.tool_calls}</b> tool calls</span>
      <span><b>${w.findings.length}</b> findings</span>
      <span><b>${w.citations.length}</b> citable</span>
      <span class="${w.blocked_citations.length ? "warn" : ""}"><b>${w.blocked_citations.length}</b> blocked</span>
    </div>

    ${w.findings.length ? `<ul class="intel-findings">${w.findings.map(f => `
      <li>
        <p class="if-title">${esc(f.title)}</p>
        <p class="if-why">${esc(f.why)}</p>
        <p class="if-ev">${f.evidence.map(e => `<code>${esc(e)}</code>`).join(" ")}</p>
      </li>`).join("")}</ul>` : `<p class="muted">No findings for this client.</p>`}

    ${w.divergences.length ? `
      <h4>Dataset vs live <span class="c">stated, not reconciled</span></h4>
      <table class="intel-div"><tbody>${w.divergences.map(d => `
        <tr><td>${esc(d.key)}</td>
            <td class="num">${d.dataset}</td>
            <td class="num">${d.live}</td>
            <td class="num ${d.gap_pct > 0 ? "up" : "down"}">${d.gap_pct > 0 ? "+" : ""}${d.gap_pct}%</td>
            <td class="c">as of ${esc(d.live_as_of || "—")}</td></tr>`).join("")}</tbody></table>
      <p class="disclaimer-line">The dataset governs every portfolio number. The live reading is context only.</p>` : ""}

    <h4>Retrieved evidence <span class="c">${approved}/${docs.length} approved</span></h4>
    <p class="if-gate">Nothing retrieved is citable to a client until an RM approves it. The pipeline
      cannot approve its own output.</p>
    ${docs.length ? `<ul class="intel-docs">${docs.map(d => `
      <li class="doc-${d.status}">
        <div class="doc-h">
          <a href="${esc(d.doc?.final_url || "#")}" target="_blank" rel="noopener">${esc(d.doc?.title || d.query)}</a>
          <span class="doc-src">${esc(host(d.doc?.final_url))}</span>
        </div>
        <p class="doc-q">asked because of <code>${esc(d.driver?.key || "—")}</code> · ${esc(d.tier)}</p>
        <p class="doc-x">${esc((d.doc?.excerpt || "").slice(0, 240))}${(d.doc?.excerpt || "").length > 240 ? "…" : ""}</p>
        ${d.status === "approved"
          ? `<span class="doc-ok">approved by ${esc(d.approved_by || RM)}</span>`
          : `<button class="ghost sm approve-doc" data-obs="${esc(d.id)}">Approve for citation</button>`}
      </li>`).join("")}</ul>` : `<p class="muted">No documents retrieved for this client.</p>`}

    ${w.unanswered.length ? `
      <h4>Could not answer</h4>
      <ul class="intel-gaps">${w.unanswered.map(u => `<li>${esc(u)}</li>`).join("")}</ul>
      <p class="disclaimer-line">Reported, never filled in.</p>` : ""}
  `);

  el.querySelectorAll(".approve-doc").forEach(btn =>
    btn.addEventListener("click", () => {
      approve(b, btn.dataset.obs, RM);
      paintIntel();                    // re-runs the walk against the mutated bundle
    }));
}

const frame = inner => `
  <div class="seg-h"><span class="seg-n">03b</span><h3>Intelligence</h3>
    <span class="c">retrieved context · agent findings</span></div>
  ${inner}`;

/** Fetch this client's bundle, then paint. Safe to call on every client change. */
export async function ensureIntel(repaint = paintIntel) {
  const id = bundleIdFor(S.portfolio?.id);
  if (!id) return;
  S.intel = S.intel || {};
  if (id in S.intel) { repaint(); return; }
  repaint();                            // shows "loading…"
  S.intel[id] = await loadBundle(id);
  repaint();
}
