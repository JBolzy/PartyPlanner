// Party time is fixed to Eastern (EST, UTC-5 in December) so every viewer sees the same countdown.
const PARTY_START = '2026-12-22T13:00:00-05:00';
// There is no set end time ("when the last person has left"), so the party counts as live all evening and the
// thank-you message only takes over at midnight, once the day is over.
const PARTY_END = '2026-12-23T00:00:00-05:00';

function breakdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function getState(now) {
  if (now < Date.parse(PARTY_START)) return 'before';
  if (now < Date.parse(PARTY_END)) return 'live';
  return 'after';
}

if (typeof module !== 'undefined') module.exports = { breakdown, getState, PARTY_START, PARTY_END };

if (typeof document !== 'undefined') {
  (() => {
    const root = document.getElementById('countdown');
    if (!root) return;
    const status = document.getElementById('cd-status');
    const tree = document.getElementById('cd-tree'); // little tree icon, only for the party-time message
    const sr = document.getElementById('cd-sr');
    const nums = Object.fromEntries(
      [...root.querySelectorAll('[data-unit]')].map((n) => [n.dataset.unit, n]),
    );
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pad = (n) => String(n).padStart(2, '0');
    let lastMinuteText = '';

    function setNum(unit, value) {
      const node = nums[unit];
      const text = unit === 'days' ? String(value) : pad(value);
      if (node.textContent === text) return;
      node.textContent = text;
      if (!reduceMotion) {
        node.classList.remove('tick');
        void node.offsetWidth; // restart the animation
        node.classList.add('tick');
      }
    }

    function render() {
      const now = Date.now();
      const state = getState(now);
      root.dataset.state = state;
      // SVG elements have no .hidden property (that's HTMLElement-only), so toggle the attribute itself.
      if (tree) tree.toggleAttribute('hidden', state !== 'live');
      if (state === 'before') {
        const b = breakdown(Date.parse(PARTY_START) - now);
        status.textContent = 'We get together in';
        for (const unit of Object.keys(nums)) setNum(unit, b[unit]);
        const minuteText = `${b.days} days, ${b.hours} hours and ${b.minutes} minutes until the get-together`;
        if (minuteText !== lastMinuteText) { sr.textContent = minuteText; lastMinuteText = minuteText; }
      } else if (state === 'live') {
        status.textContent = "It's time to get together!";
        sr.textContent = "It's time to get together!";
      } else {
        status.textContent = 'Merry Christmas! Thanks for celebrating with us.';
        sr.textContent = status.textContent;
      }
    }

    render();
    setInterval(render, 1000);
  })();
}
