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

let globe = null;

export function mountGlobe(el, { onSelect }) {
  globe = Globe({ animateIn:false })(el)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true).atmosphereColor("#f0a03c").atmosphereAltitude(0.15)
    .polygonsData(COUNTRIES.features)
    .polygonSideColor(() => "rgba(255,255,255,0.05)")
    .onPolygonClick(f => onSelect(exposure()[a3(f)] ? a3(f) : null))
    .pointLat("lat").pointLng("lng").pointAltitude(0.012).pointRadius(0.27)
    .pointLabel(p => `<div class="gt"><div class="n">${p.name}</div>
      <div class="r"><span>${p.kind}</span><span>${p.detail}</span></div></div>`)
    .ringsData(CHOKEPOINTS.filter(c => c.status === "strained"))
    .ringLat("lat").ringLng("lng").ringColor(() => (t => `rgba(226,104,60,${1 - t})`))
    .ringMaxRadius(4.5).ringPropagationSpeed(1.6).ringRepeatPeriod(1500)
    .arcsData(LANES)
    .arcStartLat("sLat").arcStartLng("sLng").arcEndLat("eLat").arcEndLng("eLng")
    .arcColor(a => a.hot ? ["rgba(245,197,66,0.05)","rgba(245,197,66,0.75)"]
                         : ["rgba(92,122,143,0.03)","rgba(92,122,143,0.25)"])
    .arcStroke(a => a.hot ? 0.4 : 0.22).arcAltitudeAutoScale(0.42)
    .arcDashLength(0.4).arcDashGap(0.9).arcDashAnimateTime(a => a.hot ? 3200 : 6000)
    .onGlobeClick(() => onSelect(null));

  globe.globeMaterial().color.set("#0c0d10");
  globe.globeMaterial().emissive.set("#f5c542");
  globe.globeMaterial().emissiveIntensity = 0.02;
  globe.globeMaterial().shininess = 2;
  globe.pointOfView({ lat:14, lng:104, altitude:2.15 }, 0);

  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  globe.controls().autoRotate = !reduced;
  globe.controls().autoRotateSpeed = 0.16;
  globe.controls().enableDamping = true;
  sizeGlobe();
  addEventListener("resize", sizeGlobe);
  return globe;
}

export function sizeGlobe() {
  const el = document.querySelector(".glass");
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
  globe.polygonStrokeColor(f => ex[a3(f)] ? "rgba(245,197,66,0.35)" : "rgba(255,255,255,0.08)");
  globe.polygonLabel(f => {
    const iso = a3(f), e = ex[iso], s = sig(iso);
    if (!e || !s) return `<div class="gt"><div class="n">${f.properties.name}</div>
      <div class="r"><span>Mandate exposure</span><span>none</span></div></div>`;
    return `<div class="gt"><div class="n">${s.name}</div>
      <div class="r"><span>Capital at risk</span><span>${e.weightPct.toFixed(1)}%</span></div>
      <div class="r"><span>${L.label.split(",")[0]}</span>
        <span style="color:${L.col(L.val(s))}">${L.fmt(L.val(s))}</span></div>
      <div class="r"><span>Via</span><span>${e.instrumentIds.join(" ")}</span></div>
      ${S.lens === "ai" && S.evaluation?.countries?.[iso] ? `<div class="r"><span>Drivers</span><span>${
        S.evaluation.countries[iso].drivers.filter(d => d.contribution > 0).map(d => d.label).join(", ") || "—"}</span></div>` : ""}</div>`;
  });

  /* points: chokepoints + any exposed micro-state */
  const pts = CHOKEPOINTS.map(c => ({ ...c, kind:"Chokepoint", detail:c.detail }));
  for (const [iso, meta] of Object.entries(POINT_STATES)) {
    const e = ex[iso];
    if (e) pts.push({ ...meta, iso3:iso, status:"holding", kind:"Mandate exposure",
                      detail:`${e.weightPct.toFixed(1)}% via ${e.instrumentIds.join(" ")}` });
  }
  globe.pointsData(pts).pointColor(p =>
    p.status === "strained" ? css("--ember")
    : p.status === "holding" && sig(p.iso3) ? L.col(L.val(sig(p.iso3)))
    : P.INK4);
}

export const isoFromFeature = a3;
