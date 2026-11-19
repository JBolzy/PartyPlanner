// Santa's sleigh occasionally flies across the top of the screen. Purely decorative.
// Mobile-first: one small element, transform-only animation, never blocks taps, never runs in a hidden tab
// or for anyone who asked their device to reduce motion.
const SANTA = {
  firstDelay: [6000, 20000], // first flyby: soon enough that people actually see it
  gap: [30000, 90000], // after that: random pause between flybys
  duration: [8000, 12000], // time to cross the screen
  topPct: [0.06, 0.3], // flies somewhere in the top third of the viewport
};

const between = (r, [a, b]) => a + r * (b - a);
const nextDelay = (rand, first) => Math.round(between(rand, first ? SANTA.firstDelay : SANTA.gap));
const pickFlight = (rDuration, rTop, rDirection, viewportH) => ({
  durationMs: Math.round(between(rDuration, SANTA.duration)),
  top: Math.round(viewportH * between(rTop, SANTA.topPct)),
  rtl: rDirection < 0.5, // half the time he flies right-to-left
});
const canFly = ({ reducedMotion, hidden }) => !reducedMotion && !hidden;

if (typeof module !== 'undefined') module.exports = { SANTA, nextDelay, pickFlight, canFly };

if (typeof document !== 'undefined') {
  (() => {
    // Facing right: sparkle trail, sleigh with Santa, two reindeer (the lead one has a red nose).
    // Filled shapes get class "o", a light outline so the sleigh shows on both the green header and cream cards.
    const SLEIGH = `
<svg viewBox="0 0 200 80" aria-hidden="true">
  <defs>
    <g id="santa-reindeer">
      <path d="M107 38l-5-3" stroke="#7a4b24" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <path d="M111 44l-9 6M115 45l-6 8" stroke="#7a4b24" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <path d="M124 44l8 6M121 45l5 8" stroke="#7a4b24" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <ellipse class="o" cx="117" cy="40" rx="11" ry="6" fill="#7a4b24"/>
      <path d="M125 36l7-9" stroke="#7a4b24" stroke-width="4.4" stroke-linecap="round" fill="none"/>
      <ellipse class="o" cx="135.5" cy="26.5" rx="5.2" ry="3.4" transform="rotate(-22 135.5 26.5)" fill="#7a4b24"/>
      <path d="M133 23l-2-7M132.2 19.5l-4-1.5M135.5 22l2-7M136.3 18.5l3.5-1" stroke="#6b4423" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    </g>
  </defs>
  <g fill="#c8962e">
    <circle cx="6" cy="54" r="2" opacity=".35"/><circle cx="15" cy="49" r="2.6" opacity=".55"/><circle cx="25" cy="55" r="2" opacity=".45"/>
  </g>
  <path d="M26 64h46c8 0 11-6 8-12" stroke="#c8962e" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  <path d="M35 64v-8M62 64v-8" stroke="#c8962e" stroke-width="2.2" stroke-linecap="round"/>
  <path class="o" d="M31 41q-3-15 6-15 7 0 6 15z" fill="#a8741f"/>
  <path class="o" d="M28 40h48c0 8-4 16-12 16H36c-6 0-8-6-8-16z" fill="#b3261e"/>
  <path d="M28 40h48" stroke="#c8962e" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M28 40c-6 0-8-6-6-10" stroke="#b3261e" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  <ellipse class="o" cx="55" cy="35" rx="8.5" ry="8" fill="#b3261e"/>
  <circle class="o" cx="55" cy="23" r="5.4" fill="#f6d3b3"/>
  <path d="M50 24.5q5 9.5 10 0z" fill="#fff"/>
  <path class="o" d="M49.6 20.5Q52 8.5 63.5 12.5L60.4 20.5z" fill="#b3261e"/>
  <rect x="49" y="19.2" width="12.4" height="3.6" rx="1.8" fill="#fff"/>
  <circle class="o" cx="64" cy="12.5" r="2.4" fill="#fff"/>
  <path d="M76 43C88 41 92 40 100 40M127 40C138 40 142 38 148 37" stroke="#7a4b24" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <use href="#santa-reindeer"/>
  <use href="#santa-reindeer" x="46" y="-3"/>
  <circle cx="186.5" cy="23.2" r="1.7" fill="#e53935"/>
</svg>`;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state = () => ({ reducedMotion: reduced.matches, hidden: document.hidden });
    let timer = null;
    let first = true;
    let waiting = false; // a flyby came due while we weren't allowed to fly; resume when allowed again

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(tryFly, nextDelay(Math.random(), first));
      first = false;
    }

    function tryFly() {
      if (!canFly(state())) { waiting = true; return; }
      fly();
    }

    function fly() {
      const f = pickFlight(Math.random(), Math.random(), Math.random(), window.innerHeight);
      const el = document.createElement('div');
      el.className = `santa${f.rtl ? ' rtl' : ''}`;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `<div class="santa-flip">${SLEIGH}</div>`; // static markup above, no user content
      el.style.top = `${f.top}px`;
      el.style.setProperty('--dur', `${f.durationMs}ms`);

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        schedule();
      };
      el.addEventListener('animationend', (e) => { if (e.target === el) finish(); });
      setTimeout(finish, f.durationMs + 1500); // safety net if the animation event never fires
      document.body.append(el);
    }

    function resume() {
      if (waiting && canFly(state())) { waiting = false; schedule(); }
    }
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener?.('change', resume);

    window.Santa = { fly }; // handy for trying it out from the browser console
    schedule();
  })();
}
