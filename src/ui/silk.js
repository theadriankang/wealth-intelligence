const DEFAULTS = {
  speed: 5,
  scale: 1,
  color: "#7B7481",
  noiseIntensity: 1.5,
  rotation: 0
};

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

export function mountSilk(host, options = {}) {
  if (!host) return () => {};
  const cfg = { ...DEFAULTS, ...options };
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha:true });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  let t = 0;

  host.replaceChildren(canvas);
  canvas.setAttribute("aria-hidden", "true");

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const size = Math.max(host.clientWidth || 1080, host.clientHeight || 1080);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const w = canvas.width / Math.min(devicePixelRatio || 1, 2);
    const h = canvas.height / Math.min(devicePixelRatio || 1, 2);
    const [r, g, b] = hexToRgb(cfg.color);
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cfg.rotation + Math.sin(t * 0.08) * 0.025);
    ctx.scale(cfg.scale, cfg.scale);
    ctx.translate(-cx, -cy);

    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, `rgba(${Math.min(r + 96, 255)},${Math.min(g + 102, 255)},${Math.min(b + 110, 255)},0.98)`);
    base.addColorStop(0.42, `rgba(${r},${g},${b},0.84)`);
    base.addColorStop(1, "rgba(214,234,255,0.94)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 18; i++) {
      const y = (i / 17) * h;
      const amp = 34 + Math.sin(i * 1.7 + t) * 18;
      const drift = t * cfg.speed * 7 + i * 41;
      const grad = ctx.createLinearGradient(0, y - amp, w, y + amp);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.48, `rgba(255,255,255,${0.17 + (i % 3) * 0.045})`);
      grad.addColorStop(1, "rgba(123,116,129,0.02)");
      ctx.beginPath();
      ctx.moveTo(-80, y);
      for (let x = -80; x <= w + 80; x += 24) {
        const wave = Math.sin((x + drift) * 0.008 + i) * amp + Math.sin((x - drift) * 0.018) * 10;
        ctx.lineTo(x, y + wave);
      }
      ctx.lineWidth = 28 + i * 0.45;
      ctx.strokeStyle = grad;
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.52);
    glow.addColorStop(0, "rgba(255,255,255,0.30)");
    glow.addColorStop(0.56, "rgba(216,236,255,0.12)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const grainStep = 6;
    ctx.globalAlpha = Math.min(0.12, cfg.noiseIntensity * 0.04);
    ctx.fillStyle = "#fff";
    for (let y = 0; y < h; y += grainStep) {
      for (let x = 0; x < w; x += grainStep) {
        if (Math.sin(x * 12.9898 + y * 78.233 + t * 31.7) % 1 > 0.35) ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  function frame() {
    t += 0.012;
    draw();
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  resize();
  addEventListener("resize", resize);
  if (!reduce) raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
  };
}
