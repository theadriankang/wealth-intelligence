/**
 * The gate. Anything the model returns passes through here before it can render.
 * A claim whose citations don't resolve to real supplied facts is DROPPED, not shown
 * with a warning — a bank cannot ship "probably sourced".
 */
export function validateBrief(brief, allowedFactIds) {
  const allowed = new Set(allowedFactIds);
  const dropped = [];
  const sections = (brief?.sections || []).map(s => ({
    ...s,
    claims: (s.claims || []).filter(c => {
      const ok = Array.isArray(c.citations) && c.citations.length &&
                 c.citations.every(id => allowed.has(id));
      if (!ok) dropped.push(c.text?.slice(0, 80));
      return ok;
    })
  })).filter(s => s.claims.length);

  return {
    ok: dropped.length === 0,
    brief: { ...brief, sections },
    dropped,
    coverage: countClaims(brief) ? sections.reduce((n, s) => n + s.claims.length, 0) / countClaims(brief) : 1
  };
}

const countClaims = b => (b?.sections || []).reduce((n, s) => n + (s.claims?.length || 0), 0);

/** Turn a validated brief into the footnoted HTML the memo drawer renders. */
export function briefToHtml(brief, factsById) {
  let n = 0; const notes = [];
  const body = brief.sections.map(s => `
    <h4>${escapeHtml(s.title)}</h4>
    ${s.claims.map(c => {
      const sups = c.citations.map(id => {
        const f = factsById[id];
        notes.push([++n, f ? `${f.source} — ${f.text} (${f.value})` : id]);
        return `<sup>[${n}]</sup>`;
      }).join("");
      return `<p>${escapeHtml(c.text)}${sups}</p>`;
    }).join("")}`).join("");
  const fn = `<div class="fn">${notes.map(x =>
    `<div><sup>[${x[0]}]</sup><span>${escapeHtml(x[1])}</span></div>`).join("")}</div>`;
  return body + fn;
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}
