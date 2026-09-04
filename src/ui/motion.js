/**
 * motion.js — the house motion system.
 *
 * One vocabulary, applied everywhere: things enter from below with a short
 * settle, quantities count rather than snap, and bars grow from their origin.
 * Nothing loops, nothing bounces, nothing moves further than it has to.
 *
 * Durations are deliberately short (140–520ms). This is a professional tool;
 * motion here exists to show causality — what changed, and because of what —
 * not to decorate.
 */
import { animate, stagger, createTimeline, utils, svg } from "animejs";

export const REDUCED = matchMedia("(prefers-reduced-motion:reduce)").matches;

/* A single easing family keeps everything feeling like one object. */
export const EASE = {
  out: "out(3)",          // entrances — decisive, no overshoot
  settle: "cubicBezier(.32,.72,0,1)", // surfaces, drawers, panes
  soft: "outQuad"         // numbers and widths
};

const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Re-render guard.                                                    */
/* The paint functions run on every poll tick. Motion should only fire  */
/* when something structurally changed, so each animated region keeps a */
/* key and replays only when that key moves.                            */
/* ------------------------------------------------------------------ */
const keys = new Map();
export function once(name, key, fn) {
  if (REDUCED) return;
  if (keys.get(name) === key) return;
  keys.set(name, key);
  requestAnimationFrame(fn);
}
export function invalidate(name) { keys.delete(name); }

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Entrance: rise and resolve. The workhorse. */
export function enter(targets, { y = 8, delay = 26, duration = 420, from = 0 } = {}) {
  const els = typeof targets === "string" ? $$(targets) : targets;
  if (REDUCED || !els.length) return;
  return animate(els, {
    opacity: [0, 1],
    translateY: [y, 0],
    duration,
    delay: stagger(delay, { start: from }),
    ease: EASE.out
  });
}

/** A pane or surface taking the stage — slightly larger gesture than enter(). */
export function surface(target, { y = 10, duration = 340 } = {}) {
  if (REDUCED || !target) return;
  return animate(target, {
    opacity: [0, 1], translateY: [y, 0], duration, ease: EASE.settle
  });
}

/**
 * Count a number up to its printed value.
 * Reads the text already in the DOM, so callers do not have to pass the number
 * twice — the rendered string stays the source of truth, including its
 * prefix, suffix, sign and decimal places.
 */
export function count(el, { duration = 620, from = null } = {}) {
  if (!el) return;
  const printed = el.textContent;
  const m = printed.match(/-?[\d,]+(\.\d+)?/);
  if (!m) return;
  const target = parseFloat(m[0].replace(/,/g, ""));
  if (!isFinite(target)) return;
  if (REDUCED) return;
  const dec = (m[1] || "").length ? m[1].length - 1 : 0;
  const pre = printed.slice(0, m.index);
  const post = printed.slice(m.index + m[0].length);
  const start = from == null ? (target >= 0 ? 0 : target * 0.35) : from;
  const o = { v: start };
  animate(o, {
    v: target, duration, ease: EASE.soft,
    onUpdate: () => { el.textContent = pre + o.v.toFixed(dec) + post; },
    onComplete: () => { el.textContent = printed; }
  });
}

/** Grow a bar from zero to the width the renderer already set. */
export function grow(targets, { duration = 620, delay = 30, axis = "width" } = {}) {
  const els = typeof targets === "string" ? $$(targets) : targets;
  if (REDUCED || !els.length) return;
  els.forEach(el => {
    const to = el.style[axis] || getComputedStyle(el)[axis];
    animate(el, { [axis]: [0, to], duration, delay: stagger(delay), ease: EASE.soft });
  });
}

/** A value that just changed draws the eye once, then lets go. */
export function flash(el, colour = "var(--warn)") {
  if (REDUCED || !el) return;
  const was = el.style.color;
  animate(el, {
    color: [colour, was || "currentColor"],
    duration: 900, ease: "outExpo"
  });
}

/* ------------------------------------------------------------------ */
/* Composed sequences                                                  */
/* ------------------------------------------------------------------ */

/** First paint. The one place a longer, choreographed sequence is earned. */
export function boot() {
  if (REDUCED) return;
  // Hold the first frame so nothing flashes in at full opacity before the
  // timeline takes ownership of it.
  utils.set(".bar, .demo-strip, .tick-strip, .book, .ch, .goals, .tabs, .globe-wrap, .pfrail, .globe-wrap .overlay",
    { opacity: 0 });
  const tl = createTimeline({ defaults: { ease: EASE.out } });
  tl.add(".bar", { opacity: [0, 1], translateY: [-10, 0], duration: 420 })
    .add(".demo-strip", { opacity: [0, 1], duration: 300 }, "-=280")
    .add(".tick-strip", { opacity: [0, 1], duration: 380 }, "-=260")
    .add(".book", { opacity: [0, 1], translateX: [-14, 0], duration: 460 }, "-=300")
    .add(".ch", { opacity: [0, 1], translateY: [8, 0], duration: 380 }, "-=380")
    .add(".goals", { opacity: [0, 1], duration: 380 }, "-=300")
    .add(".tabs", { opacity: [0, 1], duration: 320 }, "-=280")
    .add(".globe-wrap", { opacity: [0, 1], duration: 700, ease: "outQuad" }, "-=300")
    .add(".pfrail", { opacity: [0, 1], translateX: [16, 0], duration: 520 }, "-=560");

  // Globe furniture arrives after the sphere, not with it.
  animate($$(".globe-wrap .overlay"), {
    opacity: [0, 1], translateY: [6, 0], duration: 460,
    delay: stagger(70, { start: 700 }), ease: EASE.out
  });
  return tl;
}

/** Switching tabs: the outgoing pane is already hidden, so only entry matters. */
export function pane(id) {
  if (REDUCED) return;
  const el = document.getElementById("pane-" + id);
  if (!el) return;
  surface(el, { y: 8, duration: 300 });
  enter($$(".act, .blk, .econ, .pf", el), { y: 10, delay: 45, duration: 400 });
}

/** Drawer contents, once the panel itself has slid in. */
export function drawer(root) {
  if (REDUCED || !root) return;
  enter($$(".dr-h > div, .dr-sec", root), { y: 10, delay: 42, duration: 420, from: 120 });
  grow($$(".lt-bar i", root), { duration: 520, delay: 22 });
}

/** The goals strip: cards rise, tracks fill, percentages count. */
export function goals() {
  enter(".goal", { y: 10, delay: 55, duration: 440 });
  grow(".goal .track i", { duration: 720, delay: 55 });
  $$(".goal .pct").forEach((el, i) =>
    setTimeout(() => count(el, { duration: 700 }), i * 55));
}

/** The positions rail: cards, weight bars, look-through bars, policy stances. */
export function rail() {
  enter("#pfrail .sec", { y: 10, delay: 60, duration: 420 });
  enter("#pfrail .card", { y: 8, delay: 32, duration: 380, from: 90 });
  grow("#pfrail .wt i", { duration: 560, delay: 26 });
  grow("#pfrail .lt-bar i", { duration: 560, delay: 18 });
  grow("#pfrail .st-track i", { duration: 620, delay: 40 });
}

/** The evidence card over the globe — its headline number is the point. */
export function evidence() {
  count(document.getElementById("ev-v"), { duration: 560 });
}

/** Impact tab: four numbers that carry the whole argument. */
export function economics() {
  enter(".econ div", { y: 8, delay: 60, duration: 380 });
  $$(".econ .v").forEach((el, i) => setTimeout(() => count(el, { duration: 760 }), 90 + i * 60));
}

/** Action cards. */
export function actions() {
  enter("#actions .act", { y: 12, delay: 60, duration: 440 });
}

/** Expanding the suitability record — height, not a jump cut. */
export function expand(el, open) {
  if (REDUCED) { el.hidden = !open; return; }
  if (open) {
    el.hidden = false;
    const h = el.scrollHeight;
    animate(el, {
      height: [0, h], opacity: [0, 1], duration: 340, ease: EASE.settle,
      onComplete: () => { el.style.height = "auto"; }
    });
  } else {
    animate(el, {
      height: [el.scrollHeight, 0], opacity: [1, 0], duration: 260, ease: EASE.settle,
      onComplete: () => { el.hidden = true; el.style.height = ""; }
    });
  }
}

/** The colour ramp redrawing when the globe lens changes. */
export function ramp() {
  if (REDUCED) return;
  animate($$("#lg-ramp span"), {
    scaleY: [0.2, 1], opacity: [0, 1], duration: 380,
    delay: stagger(26), ease: EASE.out
  });
  animate(["#lg-title", "#lg-cap"], { opacity: [0, 1], translateY: [4, 0], duration: 300, ease: EASE.out });
}

/** A newly arrived ticker item announces itself once. */
export function tick() {
  if (REDUCED) return;
  const el = document.querySelector("#ticker .tk.new");
  if (el) animate(el, { opacity: [0, 1], translateY: [-6, 0], duration: 420, ease: EASE.out });
}

/** Client-facing view — slower, print-like, one pass down the page. */
export function clientView(root) {
  if (REDUCED) return;
  const tl = createTimeline({ defaults: { ease: EASE.out } });
  tl.add(".cv .back", { opacity: [0, 1], duration: 300 })
    .add(".cv h1", { opacity: [0, 1], translateY: [12, 0], duration: 520 }, "-=180")
    .add(".cv .sub", { opacity: [0, 1], translateY: [8, 0], duration: 440 }, "-=380")
    .add(".cv .lead", { opacity: [0, 1], translateY: [10, 0], duration: 520 }, "-=340");
  animate($$(".cv-goal"), {
    opacity: [0, 1], translateY: [10, 0], duration: 460,
    delay: stagger(70, { start: 620 }), ease: EASE.out
  });
  animate($$(".cv-goal .tr i"), {
    width: (el) => [0, el.style.width], duration: 760,
    delay: stagger(70, { start: 760 }), ease: EASE.soft
  });
  $$(".cv-goal .p").forEach((el, i) => setTimeout(() => count(el, { duration: 720 }), 660 + i * 70));
  animate(".cv .talk", { opacity: [0, 1], translateY: [12, 0], duration: 520, delay: 900, ease: EASE.out });
  animate(".cv .foot", { opacity: [0, 1], duration: 400, delay: 1050 });
}

export { animate, stagger, createTimeline, utils, svg };
