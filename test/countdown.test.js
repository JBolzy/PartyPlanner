const test = require('node:test');
const assert = require('node:assert/strict');
const { breakdown, getState, PARTY_START, PARTY_END } = require('../public/countdown');

const start = Date.parse(PARTY_START);

test('party starts Tue Dec 22 2026, 1:00 PM Eastern (18:00 UTC)', () => {
  assert.equal(new Date(start).toISOString(), '2026-12-22T18:00:00.000Z');
  assert.equal(new Date(start).getUTCDay(), 2); // Tuesday
});

test('breakdown splits ms into days/hours/minutes/seconds', () => {
  const ms = ((33 * 24 + 5) * 60 + 7) * 60 * 1000 + 9 * 1000;
  assert.deepEqual(breakdown(ms), { days: 33, hours: 5, minutes: 7, seconds: 9 });
});

test('breakdown never goes negative', () => {
  assert.deepEqual(breakdown(-5000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(breakdown(0), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test('breakdown rounds partial seconds up so it never shows 0 early', () => {
  assert.deepEqual(breakdown(500), { days: 0, hours: 0, minutes: 0, seconds: 1 });
});

test('getState: before, live, after', () => {
  assert.equal(getState(start - 1), 'before');
  assert.equal(getState(start), 'live');
  assert.equal(getState(Date.parse(PARTY_END) - 1), 'live');
  assert.equal(getState(Date.parse(PARTY_END)), 'after');
});
