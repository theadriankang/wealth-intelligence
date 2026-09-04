export const shellHtml = () => `
<div class="app">
  <div class="silk-stage" style="width:1080px;height:1080px;position:relative" aria-hidden="true">
    <div id="silk-bg" class="silk-bg"></div>
  </div>
  <header class="bar liquid-glass">
    <div class="brand"><h1>Wealth Intelligence</h1><span class="sub">RM control tower</span></div>
    <div class="live"><span class="pulse"></span><span id="live-t">portfolio + intelligence · updated 0s ago</span>
      <span class="mode" id="mode-tag">…</span></div>
    <div class="rm-id">Priscilla Ong · Asia Desk</div>
    <div class="spacer"></div>
  </header>

  <div class="tick-strip liquid-glass">
    <div class="tick-lab"><span class="pulse" style="width:5px;height:5px"></span> Signals</div>
    <div class="tick-view"><div class="tick-run" id="ticker"></div></div>
  </div>

  <div class="stage mission-stage">
    <div class="mobile-dock" aria-label="Workbench drawers">
      <button class="ghost" id="open-client-rail">Clients</button>
      <button class="ghost" id="open-priority-rail">Action rail</button>
    </div>
    <nav class="book client-rail liquid-glass">
      <button class="rail-close" id="close-client-rail" aria-label="Close clients">×</button>
      <div class="book-h"><h2>Clients</h2><span id="book-n"></span></div>
      <label class="client-search liquid-glass"><span>⌕</span><input id="client-search" type="search" placeholder="Search client name or source of wealth"></label>
      <div class="filter-row" id="client-filters">
        <button data-filter="all" aria-pressed="true">All</button>
        <button data-filter="critical" aria-pressed="false">Critical</button>
        <button data-filter="high" aria-pressed="false">High</button>
        <button data-filter="medium" aria-pressed="false">Medium</button>
        <button data-filter="low" aria-pressed="false">Low</button>
      </div>
      <div class="active-filters"><button class="ghost sm">Filters</button><span id="filter-summary">Attention band</span><button class="ghost sm" id="clear-client-filters">Clear all</button></div>
      <div class="filter-panel" id="filter-panel">
        <label>Driver<select id="driver-filter"><option value="all">All drivers</option><option value="Collateral/Leverage">Collateral/Leverage</option><option value="Liquidity">Liquidity</option><option value="Mandate/Suitability">Mandate/Suitability</option><option value="Concentration">Concentration</option><option value="Event Exposure">Event Exposure</option><option value="Compliance/KYC">Compliance/KYC</option></select></label>
        <label>Profile<select id="profile-filter"><option value="all">All profiles</option><option>Conservative</option><option>Income</option><option>Balanced</option><option>Balanced Growth</option><option>Growth</option><option>Sustainable Balanced</option><option>Dynamic Opportunistic</option></select></label>
        <label>Booking<select id="booking-filter"><option value="all">All centres</option><option>Singapore</option><option>Hong Kong</option></select></label>
        <label>AUM<select id="aum-filter"><option value="all">All AUM</option><option value="hnw">HNW</option><option value="uhnw">UHNW</option></select></label>
      </div>
      <div class="book-list" id="book"></div>
      <div class="book-f" id="book-foot">Prioritised by client urgency, review date, mandate risk and event exposure.</div>
    </nav>

    <main class="cockpit liquid-glass">
      <div class="ch" id="client-head"></div>
      <div class="goals" id="goals"></div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-tab="pf">Overview</button>
        <button role="tab" aria-selected="false" data-tab="act">Risks & Actions<span class="n" id="tn-act"></span></button>
        <button role="tab" aria-selected="false" data-tab="conv">Conversation</button>
        <button role="tab" aria-selected="false" data-tab="intel">Intelligence<span class="n" id="tn-intel"></span></button>
        <button role="tab" aria-selected="false" data-tab="comp">Compliance<span class="n" id="tn-comp"></span></button>
        <button role="tab" aria-selected="false" data-tab="econ">Impact</button>
      </div>

      <div class="pane" id="pane-pf">
        <div class="pf">
          <div class="globe-wrap">
            <div id="globe"></div>
            <div class="overlay hint">Drag to rotate · click a country</div>
            <div class="overlay lensbar liquid-glass" role="group" aria-label="Globe encoding">
              <button data-lens="d" aria-pressed="true">Risk Δ</button>
              <button data-lens="inst" aria-pressed="false">Instability</button>
              <button data-lens="tone" aria-pressed="false">Tone</button>
              <button data-lens="pol" aria-pressed="false">Policy</button>
              <button data-lens="gtone" aria-pressed="false" id="lens-gtone" title="Live narrative tone from GDELT — the only lens reading today's world">Live tone</button>
            </div>
            <div class="overlay evid liquid-glass">
              <div class="k" id="ev-k">Risk-weighted concentration</div>
              <div class="big" id="ev-v">—</div>
              <div class="sm" id="ev-s"></div>
            </div>
            <div class="overlay legend liquid-glass">
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
        </div>
      </div>

      <div class="pane" id="pane-act" hidden><div class="scrollpane"><div class="colw" id="actions"></div></div></div>
      <div class="pane" id="pane-conv" hidden><div class="scrollpane"><div class="colw" id="conv"></div></div></div>
      <div class="pane" id="pane-intel" hidden><div class="scrollpane"><div class="colw" id="seg-intel"></div></div></div>
      <div class="pane" id="pane-comp" hidden><div class="scrollpane"><div class="colw" id="comp"></div></div></div>
      <div class="pane" id="pane-econ" hidden><div class="scrollpane"><div class="colw" id="econ"></div></div></div>
    </main>
    <aside class="pfrail priority-stack liquid-glass" id="pfrail"><button class="rail-close" id="close-priority-rail" aria-label="Close action rail">×</button></aside>
  </div>
  <section class="copilot-pop" id="copilot"></section>
</div>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Detail"></aside>
`;
