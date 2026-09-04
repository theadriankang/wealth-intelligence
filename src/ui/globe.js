import Globe from "globe.gl";
import COUNTRIES from "../data/countries.geo.json";
import { CHOKEPOINTS, LANES } from "../signals/fixtures/signals.js";
import { S, exposure, clientsExposedIn } from "../store.js";
import { P, LENSES, css } from "./palette.js";

/* Natural Earth ids are numeric ISO-3166; the model speaks alpha-3. */
const N2A3 = { "158":"TWN","682":"SAU","410":"KOR","528":"NLD","156":"CHN","076":"BRA",
  "392":"JPN","840":"USA","356":"IND","756":"CHE","276":"DEU","826":"GBR","702":"SGP" };
const a3 = f => N2A3[f.properties.id] || null;

/* alpha-3 -> alpha-2, for /flags/<cc>.svg. Falls back to a code chip if absent. */
const A2 = { TWN:"tw", SAU:"sa", KOR:"kr", NLD:"nl", CHN:"cn", BRA:"br", JPN:"jp",
  USA:"us", IND:"in", CHE:"ch", DEU:"de", GBR:"gb", SGP:"sg" };

const esc = v => String(v).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

const flagMark = (iso3, name) => {
  const cc = A2[iso3];
  const chip = `<span class="gt-cc">${esc((iso3 || "??").slice(0, 2))}</span>`;
  if (!cc) return chip;
  return `<span class="gt-flag">${chip}<img src="/flags/${cc}.svg" alt="${esc(name)}"
    onload="this.previousElementSibling.remove()" onerror="this.remove()"></span>`;
};


/* Countries too small to appear in the 110m polygon set render as points. */
const POINT_STATES = { SGP:{ name:"Singapore", lat:1.29, lng:103.85 } };
const COUNTRY_VIEW = {
  BRA:{ lat:-14.2, lng:-51.9 }, CHE:{ lat:46.8, lng:8.2 }, CHN:{ lat:35.9, lng:104.2 },
  DEU:{ lat:51.2, lng:10.4 }, GBR:{ lat:55.4, lng:-3.4 }, IND:{ lat:20.6, lng:78.9 },
  JPN:{ lat:36.2, lng:138.2 }, KOR:{ lat:36.5, lng:127.8 }, NLD:{ lat:52.1, lng:5.3 },
  SAU:{ lat:23.9, lng:45.1 }, SGP:{ lat:1.29, lng:103.85 }, TWN:{ lat:23.7, lng:121 },
  USA:{ lat:39.8, lng:-98.6 }
};

let globe = null;
let idleTimer = null;
const DEFAULT_VIEW = { lat:14, lng:104, altitude:2.15 };
const FOCUS_IDLE_MS = 25000;

function scheduleIdleReset() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => resetGlobeView(), FOCUS_IDLE_MS);
}

function pauseForFocus() {
  if (!globe) return;
  globe.controls().autoRotate = false;
  scheduleIdleReset();
}

export function mountGlobe(el, { onSelect, onOpenClient }) {
  globe = Globe({ animateIn:false })(el)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true).atmosphereColor("#9ec5ff").atmosphereAltitude(0.18)
    .polygonsData(COUNTRIES.features)
    .polygonSideColor(() => "rgba(63,84,62,0.18)")
    .onPolygonClick(f => onSelect(exposure()[a3(f)] ? a3(f) : null))
    .pointLat("lat").pointLng("lng").pointAltitude(0.012).pointRadius(0.27)
    .pointLabel(p => `<div class="gt"><div class="n">${p.name}</div>
      <div class="r"><span>${p.kind}</span><span>${p.detail}</span></div></div>`)
    .ringsData(CHOKEPOINTS.filter(c => c.status === "strained"))
    .ringLat("lat").ringLng("lng").ringColor(() => (t => `rgba(250,178,25,${1 - t})`))
    .ringMaxRadius(4.5).ringPropagationSpeed(1.6).ringRepeatPeriod(1500)
    .arcsData(LANES)
    .arcStartLat("sLat").arcStartLng("sLng").arcEndLat("eLat").arcEndLng("eLng")
    .arcColor(a => a.hot ? ["rgba(250,178,25,0.08)","rgba(230,137,38,0.72)"]
                         : ["rgba(80,139,201,0.05)","rgba(80,139,201,0.28)"])
    .arcStroke(a => a.hot ? 0.4 : 0.22).arcAltitudeAutoScale(0.42)
    .arcDashLength(0.4).arcDashGap(0.9).arcDashAnimateTime(a => a.hot ? 3200 : 6000)
    .onGlobeClick(() => onSelect(null));

  globe.globeMaterial().color.set("#7db7d8");
  globe.globeMaterial().emissive.set("#dbeafe");
  globe.globeMaterial().emissiveIntensity = 0.06;
  globe.globeMaterial().shininess = 9;
  globe.pointOfView(DEFAULT_VIEW, 0);

  openClient = onOpenClient || null;
  mountPanel(el);
  globe.onPolygonHover(f => {
    const iso = f ? a3(f) : null;
    if (iso && exposure()[iso] && S.signals[iso]) showPanel(iso, f);
    else scheduleHide();
  });

  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  globe.controls().autoRotate = !reduced;
  globe.controls().autoRotateSpeed = 0.228;
  globe.controls().enableDamping = true;
  ["pointerdown", "wheel", "touchstart"].forEach(type =>
    el.addEventListener(type, pauseForFocus, { passive:true }));
  sizeGlobe();
  addEventListener("resize", sizeGlobe);
  return globe;
}

export function focusGlobeOnCountries(isos = []) {
  if (!globe) return;
  const iso = isos.find(x => COUNTRY_VIEW[x]);
  if (!iso) return;
  S.selIso = iso;
  pauseForFocus();
  globe.pointOfView({ ...COUNTRY_VIEW[iso], altitude:1.35 }, 850);
}

export function resetGlobeView() {
  if (!globe) return;
  S.selIso = null;
  globe.pointOfView(DEFAULT_VIEW, 900);
  globe.controls().autoRotate = !matchMedia("(prefers-reduced-motion:reduce)").matches;
  paintGlobe();
}

export function sizeGlobe() {
  const el = document.querySelector(".globe-wrap");
  if (globe && el?.clientWidth) globe.width(el.clientWidth).height(el.clientHeight);
}

export function paintGlobe() {
  if (!globe) return;
  const ex = exposure(), L = LENSES()[S.lens];
  const ws = Object.values(ex).map(e => e.weightPct);
  const maxw = ws.length ? Math.max(...ws) : 1;
  const sig = iso => S.signals[iso];

  globe.polygonAltitude(f => {
    const e = ex[a3(f)];
    return e ? 0.02 + (e.weightPct / maxw) * 0.22 : 0.006;
  });
  globe.polygonCapColor(f => {
    const iso = a3(f), e = ex[iso];
    if (!e || !sig(iso)) return P.DIM;
    if (S.selIso && iso !== S.selIso) return P.MUTE;
    return L.col(L.val(sig(iso)));
  });
  globe.polygonStrokeColor(f => ex[a3(f)] ? "rgba(74,92,118,0.42)" : "rgba(74,92,118,0.10)");
  globe.polygonLabel(() => "");   /* replaced by the interactive panel below */

  /* points: chokepoints + any exposed micro-state */
  const pts = CHOKEPOINTS.map(c => ({ ...c, kind:"Chokepoint", detail:c.detail }));
  for (const [iso, meta] of Object.entries(POINT_STATES)) {
    const e = ex[iso];
    if (e) pts.push({ ...meta, iso3:iso, status:"holding", kind:"Mandate exposure",
                      detail:`${e.weightPct.toFixed(1)}% via ${e.instrumentIds.join(" ")}` });
  }
  globe.pointsData(pts).pointColor(p =>
    p.status === "strained" ? css("--warn")
    : p.status === "holding" && sig(p.iso3) ? L.col(L.val(sig(p.iso3)))
    : P.INK4);
}

export const isoFromFeature = a3;


/* ============================================================================
 * Interactive country panel
 * globe.gl's own polygonLabel is a cursor-following div with pointer-events:none,
 * so it can never host a clickable control. This is a real anchored panel: it
 * stays put, survives the cursor travelling into it, and its client bubbles
 * route straight to that client's portfolio.
 * ========================================================================== */

let panel = null, hideTimer = null, openIso = null, rafId = 0, wasRotating = false;
let openClient = null;

function mountPanel(el) {
  if (panel) return;
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  panel = document.createElement("div");
  panel.className = "gt gt-panel";
  panel.hidden = true;
  el.appendChild(panel);

  panel.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  panel.addEventListener("pointerleave", scheduleHide);
  panel.addEventListener("click", ev => {
    const b = ev.target.closest("[data-open-client]");
    if (!b) return;
    ev.stopPropagation();
    hidePanel();
    openClient?.(b.dataset.openClient);
  });
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hidePanel, 260);
}

function hidePanel() {
  clearTimeout(hideTimer);
  cancelAnimationFrame(rafId);
  openIso = null;
  if (panel) panel.hidden = true;
  if (globe && wasRotating) { globe.controls().autoRotate = true; wasRotating = false; }
}

/** Centroid of the feature's largest ring — good enough to anchor a card. */
const centroids = new WeakMap();
function centroid(f) {
  if (centroids.has(f)) return centroids.get(f);
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = null;
  for (const poly of polys) {
    const ring = poly[0] || [];
    if (!best || ring.length > best.length) best = ring;
  }
  let lat = 0, lng = 0;
  for (const [x, y] of best) { lng += x; lat += y; }
  const c = { lat: lat / best.length, lng: lng / best.length };
  centroids.set(f, c);
  return c;
}

function position(f) {
  const { lat, lng } = centroid(f);
  const pt = globe.getScreenCoords(lat, lng, 0.06);
  if (!pt || !isFinite(pt.x)) return;
  const host = panel.parentElement.getBoundingClientRect();
  const w = panel.offsetWidth || 268, h = panel.offsetHeight || 220;
  /* sit beside the country, never on top of it; flip near the edges */
  let x = pt.x + 26, y = pt.y - h / 2;
  if (x + w > host.width - 8) x = pt.x - w - 26;
  panel.style.left = Math.max(8, Math.min(host.width - w - 8, x)) + "px";
  panel.style.top = Math.max(8, Math.min(host.height - h - 8, y)) + "px";
}

function showPanel(iso, f) {
  clearTimeout(hideTimer);
  if (iso !== openIso) {
    panel.innerHTML = panelHtml(iso);
    openIso = iso;
  }
  panel.hidden = false;
  if (globe.controls().autoRotate) { wasRotating = true; globe.controls().autoRotate = false; }
  cancelAnimationFrame(rafId);
  const track = () => { if (openIso) { position(f); rafId = requestAnimationFrame(track); } };
  track();
}

function panelHtml(iso) {
  const ex = exposure(), L = LENSES()[S.lens];
  const e = ex[iso], s = S.signals[iso];
  if (!e || !s) return "";

  const ws = Object.values(ex).map(x => x.weightPct);
  const maxw = ws.length ? Math.max(...ws) : 1;
  const d = s.riskDelta;
  const tag = d > 0 ? ["worsening", "up"] : d < 0 ? ["improving", "dn"] : ["flat", "fl"];
  const share = Math.max(4, Math.min(100, (e.weightPct / maxw) * 100));
  const clients = clientsExposedIn(iso);

  const bubbles = clients.slice(0, 6).map((c, i) => `
    <button class="gt-bub" data-open-client="${esc(c.id)}" style="--i:${i}"
      title="Open ${esc(c.name)}">
      <span class="gt-av">${esc(c.initials)}</span>
      <span class="gt-bname">${esc(c.name)}<i>${c.weightPct.toFixed(1)}%</i></span>
    </button>`).join("");

  /* heaviest first, capped — a 27-row list is a wall, not an answer */
  const ranked = e.instrumentIds
    .map(id => ({ id, w: e.byInstrument?.[id] || 0 }))
    .sort((a, b) => b.w - a.w);
  const shown = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  const restW = rest.reduce((t, r) => t + r.w, 0);

  const via = shown.map(({ id, w }) =>
    `<div class="gt-ln"><span class="gt-id">${esc(S.instruments[id]?.name || id)}</span>
      <span class="gt-w">${w.toFixed(1)}%</span></div>`).join("")
    + (rest.length ? `<div class="gt-ln gt-rest"><span class="gt-id">+${rest.length} smaller holdings</span>
      <span class="gt-w">${restW.toFixed(1)}%</span></div>` : "");

  return `
    <div class="gt-hd">${flagMark(iso, s.name)}<span class="gt-n">${esc(s.name)}</span>
      <span class="gt-tag gt-${tag[1]}">${tag[0]}</span></div>

    <div class="gt-hero">
      <span class="gt-big">${e.weightPct.toFixed(1)}<i>%</i></span>
      <span class="gt-cap">capital at risk</span>
    </div>
    <div class="gt-bar"><i style="width:${share.toFixed(0)}%; background:${L.col(L.val(s))}"></i></div>

    <div class="gt-rows">
      <div class="gt-r"><span>${esc(L.label.split(",")[0])}</span>
        <b style="color:${L.col(L.val(s))}">${L.fmt(L.val(s))}</b></div>
      <div class="gt-r"><span>Holdings exposed</span><b>${e.instrumentIds.length}</b></div>
    </div>

    ${clients.length ? `<div class="gt-clients">
      <div class="gt-lb">${clients.length} client${clients.length > 1 ? "s" : ""} exposed
        <em>hover to open</em></div>
      <div class="gt-bubs">${bubbles}${clients.length > 6
        ? `<span class="gt-more">+${clients.length - 6}</span>` : ""}</div>
    </div>` : ""}

    <div class="gt-ft"><div class="gt-lb">Exposure via</div>${via}</div>`;
}
