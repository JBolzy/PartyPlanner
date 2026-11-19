const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../lib/validate');

test('person: trims and accepts valid input', () => {
  const r = validate('person', { name: '  Aunt Sue ', partySize: '3', note: ' vegan ' });
  assert.deepEqual(r, { ok: true, value: { name: 'Aunt Sue', partySize: 3, note: 'vegan' } });
});

test('person: note optional, partySize defaults to 1', () => {
  const r = validate('person', { name: 'Bob' });
  assert.deepEqual(r.value, { name: 'Bob', partySize: 1, note: '' });
});

test('person: rejects blank or whitespace name', () => {
  assert.equal(validate('person', { name: '   ' }).ok, false);
  assert.equal(validate('person', {}).ok, false);
});

test('person: rejects bad party size', () => {
  for (const n of [0, -1, 21, 1.5, 'abc']) {
    assert.equal(validate('person', { name: 'A', partySize: n }).ok, false, String(n));
  }
});

test('person: rejects oversized fields', () => {
  assert.equal(validate('person', { name: 'x'.repeat(61) }).ok, false);
  assert.equal(validate('person', { name: 'A', note: 'x'.repeat(201) }).ok, false);
});

test('food: accepts side, dessert, drink, other', () => {
  for (const category of ['side', 'dessert', 'drink', 'other']) {
    const r = validate('food', { dish: ' Mac & cheese ', category });
    assert.deepEqual(r.value, { dish: 'Mac & cheese', category });
  }
});

test('food: who is bringing it is never taken from the body (the server uses the signed-in guest)', () => {
  const r = validate('food', { dish: 'Pie', category: 'dessert', personId: 'someone-else', bringerName: 'Hacker' });
  assert.deepEqual(r.value, { dish: 'Pie', category: 'dessert' });
});

test('food: pizza is covered, so "main" is no longer a category', () => {
  assert.equal(validate('food', { dish: 'Lasagna', category: 'main' }).ok, false);
});

test('food: rejects bad category, blanks, oversized, non-string input', () => {
  assert.equal(validate('food', { dish: 'X', category: 'snack' }).ok, false);
  assert.equal(validate('food', { dish: '   ', category: 'side' }).ok, false);
  assert.equal(validate('food', { dish: 'x'.repeat(81), category: 'side' }).ok, false);
  assert.equal(validate('food', { dish: { a: 1 }, category: 'side' }).ok, false);
  assert.equal(validate('food', null).ok, false);
});
