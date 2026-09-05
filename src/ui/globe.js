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
const FLAGS = {
  BRA:"🇧🇷", CHE:"🇨🇭", CHN:"🇨🇳", DEU:"🇩🇪", GBR:"🇬🇧", IND:"🇮🇳",
  JPN:"🇯🇵", KOR:"🇰🇷", NLD:"🇳🇱", SAU:"🇸🇦", SGP:"🇸🇬", TWN:"🇹🇼", USA:"🇺🇸"
};

let globe = null;
let idleTimer = null;
const DEFAULT_VIEW = { lat:14, lng:104, altitude:2.15 };
const FOCUS_IDLE_MS = 25000;
/* Equirectangular window. The poles are dropped so the drawn world fills a wide
 * panel instead of floating in two bands of empty ocean; h is derived from the
 * window so the projection stays undistorted. */
const MAP_LAT_TOP = 84, MAP_LAT_BOT = -58;
const MAP = { w:1000, h:Math.round(1000 * (MAP_LAT_TOP - MAP_LAT_BOT) / 360) };
/* Polar features have no exposure and only survive the crop as smeared bands. */
const MAP_SKIP = new Set(["Antarctica", "Fr. S. Antarctic Lands"]);
let selectCountry = null;
let mapViewBox = { x:0, y:0, w:MAP.w, h:MAP.h };
let mapDrag = null;

function scheduleIdleReset() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => resetGlobeView(), FOCUS_IDLE_MS);
}

function pauseForFocus() {
  if (!globe) return;
  globe.controls().autoRotate = false;
  scheduleIdleReset();
}

function exposedClients(iso) {
  return (S.portfolios || []).filter(p =>
    (p.positions || []).some(pos => S.instruments[pos.instrumentId]?.exposures?.some(x => x.iso3 === iso))
  );
}

/** Compact by design: one headline number (capital at risk), one line of secondary metrics
 * (7-day change + holdings/clients counts), no itemised position-by-position breakdown — that
 * detail already lives in the "Positions by pressure" rail and Compliance's look-through panel,
 * so a hover tooltip doesn't need to repeat it. */
function countryTooltip({ countryName, iso, exposureMeta, signal, lens }) {
  if (!exposureMeta || !signal) {
    return `<div class="gt wi-country-tip">
      <div class="gt-head"><b><span class="gt-flag">${FLAGS[iso] || ""}</span>${countryName}</b><span>${iso || ""}</span></div>
      <div class="gt-empty">No mandate exposure</div>
    </div>`;
  }
  const clientCount = exposedClients(iso).length;
  const delta = lens.val(signal);
  const improving = delta < 0;
  const status = improving ? "Improving" : delta > 0 ? "Worsening" : "Stable";
  return `<div class="gt wi-country-tip">
    <div class="gt-head"><b><span class="gt-flag">${FLAGS[iso] || ""}</span>${signal.name || countryName}</b><span class="gt-status ${improving ? "improving" : delta > 0 ? "worsening" : "stable"}">${status}</span></div>
    <div class="gt-risk"><strong>${exposureMeta.weightPct.toFixed(1)}<small>%</small></strong><span>capital at risk</span></div>
    <div class="gt-rule"><i style="width:${Math.min(100, Math.max(4, exposureMeta.weightPct))}%;background:${lens.col(delta)}"></i></div>
    <div class="gt-metrics"><span>7d Δ <strong style="color:${lens.col(delta)}">${lens.fmt(delta)}</strong></span><span>${exposureMeta.instrumentIds.length} holding${exposureMeta.instrumentIds.length === 1 ? "" : "s"}</span><span>${clientCount} client${clientCount === 1 ? "" : "s"}</span></div>
  </div>`;
}

export function mountGlobe(el, { onSelect, onOpenClient }) {
  el.innerHTML = `<div class="globe-3d-host"></div>`;
  const globeHost = el.querySelector(".globe-3d-host");
  selectCountry = onSelect || null;

  globe = Globe({ animateIn:false })(globeHost)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true).atmosphereColor("#9ec5ff").atmosphereAltitude(0.18)
    .polygonsData(COUNTRIES.features)
    .polygonSideColor(() => "rgba(63,84,62,0.18)")
    .polygonLabel(() => "")
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
  if (S.route === "client") {
    const iso = isos.find(x => COUNTRY_VIEW[x]);
    if (iso) S.selIso = iso;
    renderClientMap();
    return;
  }
  if (!globe) return;
  const iso = isos.find(x => COUNTRY_VIEW[x]);
  if (!iso) return;
  S.selIso = iso;
  pauseForFocus();
  globe.pointOfView({ ...COUNTRY_VIEW[iso], altitude:1.35 }, 850);
}

export function resetGlobeView() {
  if (S.route === "client") {
    S.selIso = null;
    renderClientMap();
    return;
  }
  if (!globe) return;
  S.selIso = null;
  globe.pointOfView(DEFAULT_VIEW, 900);
  globe.controls().autoRotate = !matchMedia("(prefers-reduced-motion:reduce)").matches;
  paintGlobe();
}

export function sizeGlobe() {
  const el = document.querySelector(".globe-3d-host") || document.getElementById("globe");
  if (globe && el?.clientWidth) globe.width(el.clientWidth).height(el.clientHeight);
}

export function paintGlobe() {
  const clientMap = S.route === "client";
  setGeoMode(clientMap);
  if (clientMap) {
    renderClientMap();
    return;
  }
  if (!globe) return;
  document.querySelector(".client-map-host")?.setAttribute("hidden", "");
  document.querySelector(".globe-3d-host")?.removeAttribute("hidden");
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
  globe.polygonLabel(() => "");

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

function setGeoMode(clientMap) {
  const wrap = document.querySelector(".globe-wrap");
  wrap?.classList.toggle("client-map-mode", clientMap);
  const hint = wrap?.querySelector(".hint");
  if (hint) hint.textContent = clientMap ? "Drag to pan · click a country" : "Drag to rotate · click a country";
  const riskButton = wrap?.querySelector('[data-lens="d"]');
  if (riskButton) riskButton.textContent = clientMap ? "Risk" : "Risk Δ";
}

function ensureMapHost() {
  const el = document.getElementById("globe");
  if (!el) return null;
  if (!panel) mountPanel(el);
  let host = el.querySelector(".client-map-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "client-map-host";
    el.appendChild(host);
  }
  return host;
}

function project(lng, lat) {
  const span = MAP_LAT_TOP - MAP_LAT_BOT;
  const clamped = Math.max(MAP_LAT_BOT, Math.min(MAP_LAT_TOP, lat));
  return [((lng + 180) / 360) * MAP.w, ((MAP_LAT_TOP - clamped) / span) * MAP.h];
}

/* Rings that straddle the antimeridian (Russia, Fiji) would otherwise be drawn
 * as a band sweeping the full width of the map. Unwrap them into one continuous
 * ring, then draw a second copy shifted a full turn west so the wrapped tail
 * still appears on the other edge. */
function ringPath(ring) {
  const wraps = ring.some(([lng]) => lng > 100) && ring.some(([lng]) => lng < -100);
  const draw = shift => ring.map(([lng, lat], i) => {
    const unwrapped = wraps && lng < 0 ? lng + 360 : lng;
    const [x, y] = project(unwrapped + shift, lat);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + "Z";
  return wraps ? `${draw(0)} ${draw(-360)}` : draw(0);
}

function featurePath(f) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polys.flatMap(poly => poly.map(ringPath)).join(" ");
}

/* The base map has to stay legible against a near-white panel without competing
 * with the portfolio countries, so it is a desaturated slate rather than a tint
 * of the background. */
const MAP_BASE_FILL = "#93a9c4";

function mapFill(lens, signal, meta) {
  if (!signal || !meta) return MAP_BASE_FILL;
  const value = lens.val(signal);
  if (value > 0) return "rgba(239,112,118,.58)";
  if (value < 0) return "rgba(56,138,221,.54)";
  return "rgba(99,190,165,.46)";
}

function markerTone(lens, signal, meta) {
  if (!signal || !meta) return "#8fb4dc";
  const value = lens.val(signal);
  if (meta.weightPct >= 20) return "#f09835";
  if (value > 0) return "#ef7076";
  if (value < 0) return "#2e83ff";
  return "#43b98f";
}

function regionFor(iso) {
  if (["CHN","IND","JPN","KOR","SGP","TWN"].includes(iso)) return "Asia";
  if (["GBR","DEU","CHE","NLD"].includes(iso)) return "Europe";
  if (iso === "USA") return "North America";
  if (iso === "BRA") return "Latin America";
  if (iso === "SAU") return "Middle East";
  return "Other";
}

function mapSummary(ex) {
  const exposed = Object.entries(ex).filter(([, e]) => e?.weightPct > 0);
  const regions = exposed.reduce((acc, [iso, e]) => {
    const r = regionFor(iso);
    acc[r] = (acc[r] || 0) + e.weightPct;
    return acc;
  }, {});
  const topRegion = Object.entries(regions).sort((a, b) => b[1] - a[1])[0]?.[0];
  const max = exposed.reduce((m, [, e]) => Math.max(m, e.weightPct || 0), 0);
  const concentration = max >= 20 ? "Elevated" : max >= 10 ? "Watch" : "Moderate";
  return `<div class="client-map-summary">
    <span><b>${exposed.length}</b> countries exposed</span>
    ${topRegion ? `<span>Top region: <b>${esc(topRegion)}</b></span>` : ""}
    ${exposed.length ? `<span>Concentration: <b>${concentration}</b></span>` : ""}
  </div>`;
}

function labelFor(iso, p) {
  const [x, y] = project(p.lng, p.lat);
  const dx = iso === "USA" ? -96 : iso === "CHN" ? 58 : iso === "IND" ? 48 : iso === "SGP" ? 50 : iso === "GBR" ? -64 : 36;
  const dy = iso === "USA" ? 38 : iso === "CHN" ? -4 : iso === "IND" ? 26 : iso === "SGP" ? 4 : iso === "GBR" ? 28 : 18;
  const name = S.signals[iso]?.name || POINT_STATES[iso]?.name || iso;
  return `<g class="map-label">
    <path d="M${x.toFixed(1)} ${y.toFixed(1)} L${(x + dx - 10).toFixed(1)} ${(y + dy).toFixed(1)}"></path>
    <circle cx="${(x + dx - 14).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="2.3"></circle>
    <text x="${(x + dx).toFixed(1)}" y="${(y + dy + 4).toFixed(1)}">${esc(name)}</text>
  </g>`;
}

function renderClientMap() {
  const host = ensureMapHost();
  if (!host) return;
  document.querySelector(".globe-3d-host")?.setAttribute("hidden", "");
  host.hidden = false;
  if (globe) globe.controls().autoRotate = false;

  const ex = exposure(), L = LENSES()[S.lens];
  const sig = iso => S.signals[iso];
  const paths = COUNTRIES.features.filter(f => !MAP_SKIP.has(f.properties?.name)).map(f => {
    const iso = a3(f), e = ex[iso], s = sig(iso);
    const selected = iso && S.selIso === iso;
    const held = Boolean(e && s);
    const fill = mapFill(L, s, e);
    const opacity = held ? Math.min(.84, .5 + ((e.weightPct || 0) / 70)) : .58;
    return `<path class="map-country${held ? "" : " is-base"}${selected ? " is-selected" : ""}" data-iso="${iso || ""}"
      d="${featurePath(f)}" fill="${fill}" opacity="${opacity.toFixed(2)}"></path>`;
  }).join("");

  const lanes = LANES.slice(0, 7).map(a => {
    const [sx, sy] = project(a.sLng, a.sLat);
    const [exx, ey] = project(a.eLng, a.eLat);
    const mx = (sx + exx) / 2, my = Math.min(sy, ey) - Math.abs(exx - sx) * 0.12;
    return `<path class="map-arc ${a.hot ? "is-hot" : ""}" d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${exx.toFixed(1)} ${ey.toFixed(1)}"></path>`;
  }).join("");

  // Each marker carries an invisible hit circle the size of its own ripple. Singapore, Hong Kong
  // and Switzerland are a few pixels of coastline at this projection — asking an RM to land the
  // cursor on the polygon itself made the smallest, often heaviest-weighted positions the hardest
  // ones to inspect. The ripple is already the thing the eye treats as the target, so it is the
  // thing the pointer targets too.
  //
  // The ripple is a live sonar ping, not decoration: its cadence carries weight. A country
  // holding more of the book pings faster (2.6s down to 1.5s), so the eye is pulled to the
  // concentrated exposures before it reads a single number — and the whole map is desynchronised
  // by a per-marker delay, because markers pulsing in lockstep read as a loading state rather
  // than as twenty independent positions. Purely CSS/SMIL-free (see .marker-ripple in
  // styles.css), so it costs nothing per frame and stops dead under prefers-reduced-motion.
  // Heaviest first so the lightest markers paint last and sit on top. In the European cluster the
  // hit circles overlap, and SVG hit-testing gives the win to whatever is later in the document —
  // without this ordering a large neighbour would swallow the hover for Switzerland or the
  // Netherlands, which are exactly the ones too small to hover on the polygon.
  const markerOrder = Object.entries(COUNTRY_VIEW)
    .filter(([iso]) => ex[iso] && sig(iso))
    .sort((a, b) => (ex[b[0]].weightPct || 0) - (ex[a[0]].weightPct || 0));
  const markers = markerOrder.map(([iso, p], i) => {
    const e = ex[iso], s = sig(iso);
    if (!e || !s) return "";
    const [x, y] = project(p.lng, p.lat);
    const col = markerTone(L, s, e);
    const weight = e.weightPct || 0;
    const height = Math.max(18, Math.min(54, 16 + weight * 1.2));
    const hot = weight >= 20 || S.selIso === iso;
    const period = Math.max(1.5, 2.6 - Math.min(weight, 25) * 0.044);
    // Anchored to wall-clock, not to this render. renderClientMap() re-runs on every renderAll()
    // (narration landing, a lens switch, a signal poll), and a plain per-index offset would
    // restart all twenty animations from zero each time — a visible book-wide flicker. Phasing
    // off performance.now() means a re-render resumes each ripple exactly where it was.
    const delay = (((performance.now() / 1000) + i * 0.37) % period).toFixed(2);
    const spread = (2.4 + Math.min(weight, 30) / 22).toFixed(2);
    return `<g class="map-marker${hot ? " is-hot" : ""}" data-iso="${iso}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"
      style="--marker:${col};--ripple-period:${period.toFixed(2)}s;--ripple-delay:-${delay}s;--ripple-spread:${spread}">
      <circle class="marker-hit" r="20"></circle>
      <circle class="marker-ripple" r="11"></circle>
      <circle class="marker-ripple lag" r="11"></circle>
      ${hot ? `<circle class="marker-glow" r="24"></circle><circle class="marker-glow wide" r="34"></circle>` : ""}
      <line y1="-${height.toFixed(0)}" y2="-10"></line><circle class="marker-disc" r="11"></circle><circle class="marker-dot" r="4.5"></circle>
    </g>`;
  }).join("");
  const labels = Object.entries(ex).sort((a, b) => (b[1].weightPct || 0) - (a[1].weightPct || 0))
    .slice(0, 5)
    .map(([iso]) => COUNTRY_VIEW[iso] ? labelFor(iso, COUNTRY_VIEW[iso]) : "")
    .join("");

  host.innerHTML = `<div class="client-map-head"><span>◎</span><div><h2>Geographic Exposure</h2><p>Where your portfolio is exposed to geopolitical, policy and reputational risk.</p></div></div>
  ${mapSummary(ex)}
  <svg class="client-map-svg" viewBox="${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Client exposure map">
    <defs>
      <radialGradient id="mapGlow" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#fafdff"/><stop offset="68%" stop-color="#eaf5ff"/><stop offset="100%" stop-color="#dceaff"/></radialGradient>
    </defs>
    <rect width="${MAP.w}" height="${MAP.h}" fill="url(#mapGlow)"></rect>
    <g class="map-arcs">${lanes}</g>
    <g class="map-countries">${paths}</g>
    <g class="map-labels">${labels}</g>
    <g class="map-markers">${markers}</g>
  </svg>
  <div class="client-map-legend"><span><i class="risk"></i>Capital at risk</span><span><i class="good"></i>Improving</span><span><i class="bad"></i>Deteriorating</span><span><i class="hot"></i>Concentration hotspot</span></div>
  <div class="client-map-foot">Global view. Real-time intelligence.</div>`;
  wireClientMap(host);
  // The card now outlives the hover that opened it, which means it also has to outlive the
  // re-render that a lens switch, a signal poll or a narration landing triggers — otherwise a
  // sticky card would quietly go stale, showing last minute's numbers under this minute's lens.
  // Re-paint it in place, re-anchor it, and drop it only if the exposure itself is gone.
  if (openIso && panel && !panel.hidden) {
    if (ex[openIso] && sig(openIso)) {
      panel.innerHTML = mapPanelHtml(openIso);
      markMapActive(host, openIso);
      positionMapPanel(mapAnchor(host, openIso, null));
    } else hidePanel();
  }
}

function wireClientMap(host) {
  const svg = host.querySelector("svg");
  if (!svg) return;
  svg.addEventListener("pointerdown", ev => {
    mapDrag = { x:ev.clientX, y:ev.clientY, box:{ ...mapViewBox }, moved:false };
    svg.setPointerCapture?.(ev.pointerId);
  });
  svg.addEventListener("pointermove", ev => {
    if (!mapDrag) return;
    const scaleX = mapViewBox.w / Math.max(1, svg.clientWidth);
    const scaleY = mapViewBox.h / Math.max(1, svg.clientHeight);
    const dx = (ev.clientX - mapDrag.x) * scaleX;
    const dy = (ev.clientY - mapDrag.y) * scaleY;
    if (Math.abs(dx) + Math.abs(dy) > 4) mapDrag.moved = true;
    mapViewBox.x = Math.max(0, Math.min(MAP.w - mapViewBox.w, mapDrag.box.x - dx));
    mapViewBox.y = Math.max(0, Math.min(MAP.h - mapViewBox.h, mapDrag.box.y - dy));
    svg.setAttribute("viewBox", `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}`);
  });
  svg.addEventListener("pointerup", () => { setTimeout(() => { mapDrag = null; }, 0); });
  // Deliberately NO pointerleave -> scheduleHide here, unlike the 3D globe. On a flat map the
  // card is the thing you read, and reading it means moving the cursor off the country that
  // opened it. Auto-hiding on exit made the RM re-hover a 12px marker every time they glanced
  // away. It stays until it is replaced by another country, dismissed, or the exposure it
  // describes stops existing — see hoverMapCountry / the Escape and ocean-click handlers below.
  svg.addEventListener("mouseover", ev => {
    const node = ev.target.closest("[data-iso]");
    const iso = node?.dataset.iso;
    if (iso && exposure()[iso] && S.signals[iso]) showMapPanel(iso, node);
  });
  svg.addEventListener("click", ev => {
    const node = ev.target.closest("[data-iso]");
    const iso = node?.dataset.iso;
    // Clicking open water or an unexposed country is the "I'm done with this card" gesture —
    // the same click that already clears the country selection.
    if (!iso || !exposure()[iso]) { if (!mapDrag?.moved) { selectCountry?.(null); hidePanel(); } return; }
    if (mapDrag?.moved) return;
    selectCountry?.(iso);
  });
}

/** Marks the country path and its marker as the one the open card is describing, so the card and
 * the map stay visually tied together once the cursor has moved away from either. */
function markMapActive(host, iso) {
  if (!host) return;
  host.querySelectorAll(".is-active").forEach(n => n.classList.remove("is-active"));
  if (!iso) return;
  host.querySelectorAll(`[data-iso="${CSS.escape(iso)}"]`).forEach(n => n.classList.add("is-active"));
}

/** The marker is what the eye reads as "the pin", so anchor the card beside it rather than beside
 * the country polygon's bounding box — which for a country like the US or Russia puts the card
 * a continent away from the thing it describes. */
function mapAnchor(host, iso, fallback) {
  return host?.querySelector(`.map-marker[data-iso="${CSS.escape(iso)}"]`) || fallback;
}


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
    if (ev.target.closest("[data-close-panel]")) { ev.stopPropagation(); hidePanel(); return; }
    const b = ev.target.closest("[data-open-client]");
    if (!b) return;
    ev.stopPropagation();
    hidePanel();
    openClient?.(b.dataset.openClient);
  });
  addEventListener("keydown", ev => { if (ev.key === "Escape" && !panel.hidden) hidePanel(); });
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hidePanel, 260);
}

function hidePanel() {
  clearTimeout(hideTimer);
  cancelAnimationFrame(rafId);
  openIso = null;
  markMapActive(document.querySelector(".client-map-host"), null);
  if (panel) { panel.hidden = true; panel.classList.remove("is-gliding", "is-swapping"); }
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
  const reservedTop = parseFloat(getComputedStyle(panel.parentElement).getPropertyValue("--globe-panel-top")) || 76;
  /* Keep detail cards in the right-side reading lane so they do not cover the legend. */
  let x = host.width - w - 20, y = pt.y - h / 2;
  if (pt.x > host.width - w - 56) x = pt.x - w - 26;
  panel.style.left = Math.max(8, Math.min(host.width - w - 8, x)) + "px";
  panel.style.top = Math.max(reservedTop, Math.min(host.height - h - 8, y)) + "px";
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

function showMapPanel(iso, node) {
  clearTimeout(hideTimer);
  cancelAnimationFrame(rafId);
  const host = node?.closest(".client-map-host") || document.querySelector(".client-map-host");
  const wasOpen = !panel.hidden;
  if (iso !== openIso) {
    panel.innerHTML = mapPanelHtml(iso);
    openIso = iso;
    // Restart the content-swap keyframe. Without the reflow the class is added and removed inside
    // one frame and the browser never plays it, so moving between two countries would snap.
    panel.classList.remove("is-swapping");
    void panel.offsetWidth;
    panel.classList.add("is-swapping");
  }
  // Only glide between positions once it is already on screen — the first appearance should fade
  // in where it belongs, not slide in from wherever the previous card happened to sit.
  panel.classList.toggle("is-gliding", wasOpen);
  panel.hidden = false;
  markMapActive(host, iso);
  positionMapPanel(mapAnchor(host, iso, node));
}

function mapPanelHtml(iso) {
  const ex = exposure(), L = LENSES()[S.lens];
  const e = ex[iso], s = S.signals[iso];
  if (!e || !s) return "";
  const v = L.val(s);
  const label = v > 0 ? "Elevated" : v < 0 ? "Improving" : "Stable";
  return `<div class="gt-map-tip">
    <div class="gt-map-title">${flagMark(iso, s.name)}<b>${esc(s.name)}</b><em>${label}</em>
      <button class="gt-map-close" data-close-panel type="button" aria-label="Dismiss ${esc(s.name)} card">×</button></div>
    <div class="gt-map-row"><span>Exposure</span><b>${e.weightPct.toFixed(1)}%</b></div>
    <div class="gt-map-row"><span>${esc(L.label.split(",")[0])}</span><b style="color:${L.col(v)}">${L.fmt(v)}</b></div>
    <div class="gt-map-row"><span>Holdings</span><b>${e.instrumentIds.length}</b></div>
  </div>`;
}

function positionMapPanel(node) {
  if (!panel || !node) return;
  const host = panel.parentElement.getBoundingClientRect();
  const target = node.getBoundingClientRect();
  const w = panel.offsetWidth || 268, h = panel.offsetHeight || 220;
  const reservedTop = parseFloat(getComputedStyle(panel.parentElement).getPropertyValue("--globe-panel-top")) || 76;
  const targetX = target.left - host.left + target.width / 2;
  const targetY = target.top - host.top + target.height / 2;
  let x = targetX + 18;
  if (x + w > host.width - 12) x = targetX - w - 18;
  let y = targetY - h / 2;
  panel.style.left = Math.max(8, Math.min(host.width - w - 8, x)) + "px";
  panel.style.top = Math.max(reservedTop, Math.min(host.height - h - 8, y)) + "px";
}

function panelHtml(iso) {
  const ex = exposure(), L = LENSES()[S.lens];
  const e = ex[iso], s = S.signals[iso];
  if (!e || !s) return "";

  const d = s.riskDelta;
  const tag = d > 0 ? ["worsening", "up"] : d < 0 ? ["improving", "dn"] : ["flat", "fl"];
  const clients = clientsExposedIn(iso);
  const bookSize = (S.portfolios || []).length || clients.length;
  const share = Math.max(4, Math.min(100, bookSize ? (clients.length / bookSize) * 100 : 0));

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
      <span class="gt-big">${clients.length}</span>
      <span class="gt-cap">client${clients.length === 1 ? "" : "s"} with positions here</span>
    </div>
    <div class="gt-bar"><i style="width:${share.toFixed(0)}%; background:${L.col(L.val(s))}"></i></div>

    <div class="gt-rows">
      <div class="gt-r"><span>${esc(L.label.split(",")[0])}</span>
        <b style="color:${L.col(L.val(s))}">${L.fmt(L.val(s))}</b></div>
      <div class="gt-r"><span>Holdings exposed</span><b>${e.instrumentIds.length}</b></div>
    </div>

    ${clients.length ? `<div class="gt-clients">
      <div class="gt-lb">Exposed clients
        <em>hover to open</em></div>
      <div class="gt-bubs">${bubbles}${clients.length > 6
        ? `<span class="gt-more">+${clients.length - 6}</span>` : ""}</div>
    </div>` : ""}

    <div class="gt-ft"><div class="gt-lb">Exposure via</div>${via}</div>`;
}
