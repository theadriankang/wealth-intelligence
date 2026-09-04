export function renderTitle(root, onEnter) {
  const reduced = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const el = document.createElement("div");
  el.className = "title-screen" + (reduced ? " static" : "");
  el.innerHTML = `
    <div class="ts-globe" aria-hidden="true"></div>
    <div class="ts-top"><span>Julius Baer · SingHacks 2026</span><span>Prototype · fabricated data</span></div>
    <div class="ts-center">
      <div class="ts-kicker">From portfolio monitoring to</div>
      <h1 class="ts-title">Wealth <em>Intelligence</em></h1>
      <p class="ts-thesis">An adviser cockpit that reads a client's portfolio against live world
        signals — and answers the question a private bank actually cares about: does this change
        whether my client gets what they want, and what do I say to them about it?</p>
      <button class="ts-enter" type="button">Enter the cockpit <span>→</span></button>
    </div>
    <div class="ts-foot">
      <span><b>Look-through</b> a fund is not a country</span>
      <span><b>Citation gate</b> every claim sourced or dropped</span>
      <span><b>Prepare once</b> deliver to the whole book</span>
    </div>`;
  let done = false;
  const enter = () => {
    if (done) return; done = true;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), reduced ? 0 : 260);
    removeEventListener("keydown", onKey);
  };
  const onKey = () => enter();
  el.querySelector(".ts-enter").addEventListener("click", enter);
  el.addEventListener("click", e => { if (e.target === el) enter(); });
  addEventListener("keydown", onKey);
  root.appendChild(el);
  onEnter();               // build the cockpit behind the overlay immediately
}
