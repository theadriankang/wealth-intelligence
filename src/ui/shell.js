const initialsFor = name => (name || "Relationship Manager")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase() || "")
  .join("") || "RM";

export const shellHtml = (operator = {}) => {
  const operatorName = operator.name || "Relationship Manager";
  const initials = operator.initials || initialsFor(operatorName);
  return `
<div class="app">
  <div class="silk-stage" style="width:1080px;height:1080px;position:relative" aria-hidden="true">
    <div id="silk-bg" class="silk-bg"></div>
  </div>
  <header class="bar operator-header liquid-glass">
    <div class="operator-greeting">
      <button class="wi-logo-btn" id="wi-logo-home" type="button" aria-label="Return to Wealth Intelligence dashboard">
        <span class="wi-logo-mark">A</span>
      </button>
      <div>
        <span class="eyebrow">Welcome Back to Wealth Intelligence</span>
        <h1>Good evening, ${operatorName}</h1>
      </div>
    </div>
    <div class="spacer"></div>
    <label class="snapshot-picker" id="snapshot-picker" hidden>
      <span>Snapshot</span>
      <select id="snapshot-select"></select>
    </label>
    <div class="operator-controls" aria-label="Operator controls">
      <button class="icon-btn has-alert" type="button" aria-label="Notifications">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </button>
      <button class="icon-btn" type="button" aria-label="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.07 7.07 0 0 0-1.69-.98L14.5 2.42A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.24-1.18.57-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.38-2.65c.61-.24 1.18-.57 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z"/></svg>
      </button>
      <button class="avatar-btn" type="button" aria-label="${operatorName} profile"><span>${initials}</span></button>
    </div>
  </header>

  <div class="tick-strip market-ticker liquid-glass">
    <div class="tick-lab"><span class="pulse" style="width:5px;height:5px"></span> Breaking News</div>
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
      <div class="client-sort-row">
        <label>Sort by:<select id="client-sort"><option value="urgency-desc">Urgency Score (Desc)</option><option value="aum-desc">AUM (Desc)</option><option value="name-asc">Name (A-Z)</option><option value="review-asc">Next Review</option><option value="risk-desc">Risk Level</option></select></label>
        <button class="ghost sm" id="filter-toggle" aria-expanded="false">Filters</button>
      </div>
      <div class="filter-panel" id="filter-panel" hidden>
        <label>Risk<select id="risk-popover-filter"><option value="all">All risk levels</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label>Driver<select id="driver-filter"><option value="all">All drivers</option><option value="Collateral/Leverage">Collateral/Leverage</option><option value="Liquidity">Liquidity</option><option value="Mandate/Suitability">Mandate/Suitability</option><option value="Concentration">Concentration</option><option value="Event Exposure">Event Exposure</option><option value="Compliance/KYC">Compliance/KYC</option></select></label>
        <label>Profile<select id="profile-filter"><option value="all">All profiles</option><option>Conservative</option><option>Income</option><option>Balanced</option><option>Balanced Growth</option><option>Growth</option><option>Sustainable Balanced</option><option>Dynamic Opportunistic</option></select></label>
        <label>Booking<select id="booking-filter"><option value="all">All centres</option><option>Singapore</option><option>Hong Kong</option></select></label>
        <label>AUM<select id="aum-filter"><option value="all">All AUM</option><option value="hnw">HNW</option><option value="uhnw">UHNW</option></select></label>
        <button class="ghost sm" id="clear-client-filters">Clear all</button>
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
        <button role="tab" aria-selected="false" data-tab="comp">Compliance<span class="n" id="tn-comp"></span></button>
        <button role="tab" aria-selected="false" data-tab="econ">News</button>
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
            </div>
            <div class="overlay evid liquid-glass" id="evid-card" hidden>
              <div class="k" id="ev-k"></div>
              <div class="big" id="ev-v"></div>
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
};
