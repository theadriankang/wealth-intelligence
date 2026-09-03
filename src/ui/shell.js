import { CONFIG } from "../config.js";

export const shellHtml = () => `
<div class="app">
  <header class="bar">
    <div class="brand"><h1>Wealth Intelligence</h1><span class="sub">prototype</span></div>
    <div class="live"><span class="pulse"></span><span id="live-t">live · updated 0s ago</span>
      <span class="mode" id="mode-tag">…</span></div>
    <div class="spacer"></div>
    <a class="ghost" id="client-view-btn" href="?view=client">Client view</a>
    <button class="ghost solid" id="brief-btn">Generate client note</button>
  </header>

  ${CONFIG.DEMO_BANNER ? `<div class="demo-strip">
    <b>Demonstration data.</b> Mandates, holdings and signal values are fabricated.
    Advisor decision support — not investment advice.</div>` : ""}

  <div class="tick-strip">
    <div class="tick-lab"><span class="pulse" style="width:5px;height:5px"></span> Signals</div>
    <div class="tick-view"><div class="tick-run" id="ticker"></div></div>
  </div>

  <div class="stage">
    <nav class="book">
      <div class="book-h"><h2>Book</h2><span id="book-n"></span></div>
      <div class="book-list" id="book"></div>
      <div class="book-f">Badge counts positions whose look-through country risk moved
        <b>+6 or more</b> in seven days.</div>
    </nav>

    <div class="cockpit">
      <div class="ch" id="client-head"></div>
      <div class="goals" id="goals"></div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-tab="pf">Portfolio</button>
        <button role="tab" aria-selected="false" data-tab="act">Actions<span class="n" id="tn-act"></span></button>
        <button role="tab" aria-selected="false" data-tab="conv">Conversation</button>
        <button role="tab" aria-selected="false" data-tab="comp">Compliance<span class="n" id="tn-comp"></span></button>
        <button role="tab" aria-selected="false" data-tab="econ">Impact</button>
      </div>

      <div class="pane" id="pane-pf">
        <div class="pf">
          <div class="globe-wrap">
            <div id="globe"></div>
            <div class="overlay hint">Drag to rotate · click a country</div>
            <div class="overlay lensbar" role="group" aria-label="Globe encoding">
              <button data-lens="d" aria-pressed="true">Risk Δ</button>
              <button data-lens="inst" aria-pressed="false">Instability</button>
              <button data-lens="tone" aria-pressed="false">Tone</button>
              <button data-lens="pol" aria-pressed="false">Policy</button>
            </div>
            <div class="overlay evid">
              <div class="k" id="ev-k">Risk-weighted concentration</div>
              <div class="big" id="ev-v">—</div>
              <div class="sm" id="ev-s"></div>
            </div>
            <div class="overlay legend">
              <h2 id="lg-title"></h2>
              <p class="cap" id="lg-cap"></p>
              <div class="ramp" id="lg-ramp" aria-hidden="true"></div>
              <div class="ramp-ax"><span id="lg-lo"></span><span id="lg-mid"></span><span id="lg-hi"></span></div>
              <div class="rule"></div>
              <div class="lg-row"><span class="bars" aria-hidden="true"><i style="height:35%"></i><i style="height:65%"></i><i style="height:100%"></i></span> Column height = capital at risk</div>
              <div class="lg-row"><span class="swatch" style="background:var(--dim)"></span> No mandate exposure</div>
              <div class="lg-row"><span class="swatch" style="background:var(--warn); border-radius:50%"></span> Chokepoint under strain</div>
            </div>
          </div>
          <div class="pfrail" id="pfrail"></div>
        </div>
      </div>

      <div class="pane" id="pane-act" hidden><div class="scrollpane"><div class="colw" id="actions"></div></div></div>
      <div class="pane" id="pane-conv" hidden><div class="scrollpane"><div class="colw" id="conv"></div></div></div>
      <div class="pane" id="pane-comp" hidden><div class="scrollpane"><div class="colw" id="comp"></div></div></div>
      <div class="pane" id="pane-econ" hidden><div class="scrollpane"><div class="colw" id="econ"></div></div></div>
    </div>
  </div>
</div>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Detail"></aside>
`;
