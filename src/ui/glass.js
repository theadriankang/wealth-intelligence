const SURFACE_SELECTOR = [
  ".bar", ".demo-strip", ".tick-strip", ".client-rail", ".cockpit", ".priority-stack",
  ".drawer", ".legend", ".evid", ".lensbar", ".gt", ".copilot-box", ".copilot-launch",
  ".priority-card", ".urgent-mini", ".client-search", ".filter-panel select",
  ".goal", ".card", ".act", ".blk", ".trial-card", ".thought", ".econ div"
].join(",");

export function installLiquidGlass() {
  if (!document.getElementById("liquid-glass-defs")) {
    document.body.insertAdjacentHTML("afterbegin", `
      <svg id="liquid-glass-defs" class="liquid-glass-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id="liquid-glass-filter" color-interpolation-filters="sRGB" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.015 0.045" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="-18" xChannelSelector="R" yChannelSelector="G" result="warp" />
            <feColorMatrix in="warp" type="matrix" values="1 0 0 0 0.012 0 1 0 0 0.018 0 0 1 0 0.028 0 0 0 1 0" />
          </filter>
        </defs>
      </svg>`);
  }
  applyLiquidGlass();
}

export function applyLiquidGlass(root = document) {
  root.querySelectorAll(SURFACE_SELECTOR).forEach(el => el.classList.add("liquid-glass"));
}
