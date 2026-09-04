import Globe from "globe.gl";
import COUNTRIES from "../data/countries.geo.json";
import { CHOKEPOINTS, LANES } from "../signals/fixtures/signals.js";
import { S, exposure } from "../store.js";
import { P, LENSES, css } from "./palette.js";

/* Natural Earth ids are numeric ISO-3166; the model speaks alpha-3. */
const N2A3 = { "158":"TWN","682":"SAU","410":"KOR","528":"NLD","156":"CHN","076":"BRA",
  "392":"JPN","840":"USA","356":"IND","756":"CHE","276":"DEU","826":"GBR","702":"SGP" };
const a3 = f => N2A3[f.properties.id] || null;

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

export function mountGlobe(el, { onSelect }) {
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
  globe.polygonLabel(f => {
    const iso = a3(f), e = ex[iso], s = sig(iso);
    if (!e || !s) return `<div class="gt"><div class="n">${f.properties.name}</div>
      <div class="r"><span>Mandate exposure</span><span>none</span></div></div>`;
    return `<div class="gt"><div class="n">${s.name}</div>
      <div class="r"><span>Capital at risk</span><span>${e.weightPct.toFixed(1)}%</span></div>
      <div class="r"><span>${L.label.split(",")[0]}</span>
        <span style="color:${L.col(L.val(s))}">${L.fmt(L.val(s))}</span></div>
      <div class="r"><span>Via</span><span>${e.instrumentIds.join(" ")}</span></div></div>`;
  });

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
