/**
 * Composition view — the second lens on the same portfolio the map shows.
 *
 * A donut alone is a bad instrument: past three or four slices people cannot rank
 * them by eye, and they certainly cannot read a value off one. So the donut carries
 * the gestalt (how concentrated is this book?) and a ranked bar list beside it
 * carries the precision (which line, exactly how much). Every slice is direct-
 * labelled in that list, which is also what discharges the palette's contrast
 * relief rule — three of the eight categorical hues sit under 3:1 on this surface
 * and are legal only alongside visible labels.
 */
import { S, positions, goal } from "../store.js";
import { composition, concentrationOf, DIMENSIONS } from "../model/composition.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => (
  { "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]
));

/* Eight categorical hues, fixed order, never cycled — a ninth category folds into
 * Other upstream in composition(). Colour follows the entity's rank in THIS
 * breakdown, which is stable for as long as the breakdown is. */
const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COL = "#98a4bb";

const R_OUT = 84, R_IN = 54, CX = 96, CY = 96;
/* Radians of surface showing between slices — the 2px spacer, expressed as an angle
 * at this radius. Skipped when a slice is too thin to survive losing it. */
const GAP = 0.026;

const colourFor = (slice, i) => slice.isOther ? OTHER_COL : CAT[i % CAT.length];

function arc(startAng, endAng) {
  const sweep = endAng - startAng;
  const gap = sweep > GAP * 2.5 ? GAP / 2 : 0;
  const a0 = startAng + gap, a1 = endAng - gap;
  const pt = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const [x0, y0] = pt(R_OUT, a0), [x1, y1] = pt(R_OUT, a1);
  const [x2, y2] = pt(R_IN, a1), [x3, y3] = pt(R_IN, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  // A single slice at 100% would degenerate: start and end land on the same point and
  // the path collapses to nothing. Split it into two half-rings instead.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    return `M${CX - R_OUT} ${CY}A${R_OUT} ${R_OUT} 0 1 1 ${CX + R_OUT} ${CY}A${R_OUT} ${R_OUT} 0 1 1 ${CX - R_OUT} ${CY}
            M${CX - R_IN} ${CY}A${R_IN} ${R_IN} 0 1 0 ${CX + R_IN} ${CY}A${R_IN} ${R_IN} 0 1 0 ${CX - R_IN} ${CY}Z`;
  }
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R_OUT} ${R_OUT} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}
          L${x2.toFixed(2)} ${y2.toFixed(2)}A${R_IN} ${R_IN} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}

/** Positions feeding the view — the goal filter applies here exactly as it does to
 * the map's exposure(), so selecting a goal narrows both views the same way. */
function scopedPositions() {
  const g = S.route === "client" ? goal() : null;
  const list = positions();
  return g ? list.filter(p => g.driverIds.includes(p.instrumentId)) : list;
}

const countryNames = () => Object.fromEntries(
  Object.entries(S.signals || {}).map(([iso, s]) => [iso, s?.name || iso]));

export function ensureCompositionHost() {
  const el = document.getElementById("globe");
  if (!el) return null;
  let host = el.querySelector(".composition-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "composition-host";
    el.appendChild(host);
  }
  return host;
}

export function renderComposition(dimension = "country") {
  const host = ensureCompositionHost();
  if (!host) return;
  document.querySelector(".globe-3d-host")?.setAttribute("hidden", "");
  document.querySelector(".client-map-host")?.setAttribute("hidden", "");
  host.hidden = false;

  const dim = DIMENSIONS[dimension] || DIMENSIONS.country;
  const pos = scopedPositions();
  const { slices, hidden } = composition(dim.key, pos, S.instruments, countryNames());
  const conc = concentrationOf(dim.key, pos, S.instruments);

  if (!slices.length) {
    host.innerHTML = `<div class="composition-empty">No ${esc(dim.label.toLowerCase())} breakdown for the current selection.</div>`;
    return;
  }

  let ang = -Math.PI / 2;
  const arcs = slices.map((sl, i) => {
    const start = ang;
    ang += (sl.pct / 100) * Math.PI * 2;
    return `<path class="comp-arc" data-slice="${esc(sl.key)}" d="${arc(start, ang)}"
      fill="${colourFor(sl, i)}"><title>${esc(sl.label)} — ${sl.pct.toFixed(1)}%</title></path>`;
  }).join("");

  const bars = slices.map((sl, i) => `
    <button class="comp-row" data-slice="${esc(sl.key)}" type="button" style="--c:${colourFor(sl, i)}">
      <span class="comp-sw"></span>
      <span class="comp-name">${esc(sl.label)}</span>
      <span class="comp-track"><i style="width:${Math.max(1.5, sl.pct).toFixed(1)}%"></i></span>
      <b class="comp-pct">${sl.pct.toFixed(1)}%</b>
    </button>`).join("");

  // HHI is the honest read on concentration and it is computed on the full list, so
  // the Other bucket cannot flatter it. Banded rather than shown raw: "1,840" means
  // nothing at a booth, "concentrated" does.
  const band = conc.hhi >= 2500 ? ["concentrated", "hot"] : conc.hhi >= 1500 ? ["moderately concentrated", "warm"] : ["diversified", "calm"];

  host.innerHTML = `
    <div class="composition-head">
      <div>
        <h2>Portfolio Composition</h2>
        <p>${esc(dim.caption)}</p>
      </div>
      <dl class="composition-stats">
        <div><dt>Largest ${esc(dim.label.toLowerCase())}</dt><dd>${conc.top.toFixed(1)}%</dd></div>
        <div><dt>${esc(dim.label)}s held</dt><dd>${conc.n}</dd></div>
        <div class="band ${band[1]}"><dt>Spread</dt><dd>${band[0]}</dd></div>
      </dl>
    </div>
    <div class="composition-body">
      <figure class="comp-donut">
        <svg viewBox="0 0 192 192" role="img" aria-label="${esc(dim.label)} composition donut">
          <g class="comp-arcs">${arcs}</g>
        </svg>
        <figcaption class="comp-centre">
          <b id="comp-focus-v">${slices[0].pct.toFixed(1)}%</b>
          <span id="comp-focus-k">${esc(slices[0].label)}</span>
        </figcaption>
      </figure>
      <div class="comp-list" role="list">${bars}</div>
    </div>
    <div class="composition-foot">
      ${dim.key === "country" || dim.key === "sector"
        ? "Look-through: fund holdings are decomposed into their underlying exposures, so a global fund is counted in every country it holds rather than in its domicile."
        : "Direct position weights, as booked."}
      ${hidden ? ` ${hidden} smaller ${hidden === 1 ? "line is" : "lines are"} grouped as Other.` : ""}
    </div>`;

  wireComposition(host, slices);
}

/** Hover on either side lights the other and writes the donut's centre. One entity,
 * two marks — the whole point of pairing a donut with a list is that they are the
 * same object seen twice, so they have to react as one. */
function wireComposition(host, slices) {
  const vEl = host.querySelector("#comp-focus-v");
  const kEl = host.querySelector("#comp-focus-k");
  const top = slices[0];

  const focus = key => {
    const sl = slices.find(s => s.key === key) || top;
    vEl.textContent = `${sl.pct.toFixed(1)}%`;
    kEl.textContent = sl.label;
    host.querySelectorAll("[data-slice]").forEach(n =>
      n.classList.toggle("is-lit", n.dataset.slice === sl.key));
    host.classList.toggle("has-focus", Boolean(key));
  };

  host.querySelectorAll("[data-slice]").forEach(n => {
    n.addEventListener("mouseenter", () => focus(n.dataset.slice));
    n.addEventListener("focus", () => focus(n.dataset.slice));
  });
  host.querySelector(".composition-body")?.addEventListener("mouseleave", () => focus(null));
  focus(null);
}
