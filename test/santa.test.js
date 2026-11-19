const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SANTA, nextDelay, pickFlight, canFly } = require('../public/santa');

test('first sleigh shows up soon (6-20s) so people actually see it', () => {
  assert.equal(nextDelay(0, true), 6000);
  assert.equal(nextDelay(1, true), 20000);
  assert.ok(nextDelay(0.5, true) > 6000 && nextDelay(0.5, true) < 20000);
});

test('after that it comes at random every 30-90s', () => {
  assert.equal(nextDelay(0, false), 30000);
  assert.equal(nextDelay(1, false), 90000);
});

test('a flight is 8-12s, in the top third of the screen, either direction', () => {
  const H = 800;
  const low = pickFlight(0, 0, 0, H);
  const high = pickFlight(1, 1, 0.99, H);
  assert.equal(low.durationMs, 8000);
  assert.equal(high.durationMs, 12000);
  assert.equal(low.top, Math.round(H * SANTA.topPct[0]));
  assert.equal(high.top, Math.round(H * SANTA.topPct[1]));
  assert.ok(high.top <= H / 3, 'stays in the top third');
  assert.equal(pickFlight(0.5, 0.5, 0.1, H).rtl, true);
  assert.equal(pickFlight(0.5, 0.5, 0.9, H).rtl, false);
});

test('top position scales with the screen height (short phones, tall phones)', () => {
  assert.ok(pickFlight(0.5, 0.5, 0.5, 600).top < pickFlight(0.5, 0.5, 0.5, 900).top);
});

test('never flies for people who asked for reduced motion, or in a hidden tab', () => {
  assert.equal(canFly({ reducedMotion: true, hidden: false }), false);
  assert.equal(canFly({ reducedMotion: false, hidden: true }), false);
  assert.equal(canFly({ reducedMotion: false, hidden: false }), true);
});

test('page loads the sleigh script, and the sleigh can never block a tap', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
  assert.match(html, /<script src="santa\.js"><\/script>/);
  const rule = css.match(/\.santa \{[^}]*\}/)[0];
  assert.match(rule, /pointer-events:\s*none/);
  assert.match(rule, /position:\s*fixed/);
  // belt and braces: CSS also hides it for reduced motion, in case the script check is ever bypassed
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.santa\s*\{\s*display:\s*none/);
});
