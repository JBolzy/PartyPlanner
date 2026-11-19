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

test('food: accepts side, dessert, drink, other, tied to a person by id', () => {
  for (const category of ['side', 'dessert', 'drink', 'other']) {
    const r = validate('food', { dish: 'Mac & cheese', personId: 'p-1', category });
    assert.deepEqual(r.value, { dish: 'Mac & cheese', personId: 'p-1', category });
  }
});

test('food: ignores a typed-in name; who is bringing it comes only from personId', () => {
  const r = validate('food', { dish: 'Pie', personId: 'p-1', category: 'dessert', bringerName: 'Hacker' });
  assert.deepEqual(r.value, { dish: 'Pie', personId: 'p-1', category: 'dessert' });
});

test('food: pizza is covered, so "main" is no longer a category', () => {
  assert.equal(validate('food', { dish: 'Lasagna', personId: 'p-1', category: 'main' }).ok, false);
});

test('food: rejects missing/blank/non-string personId', () => {
  assert.equal(validate('food', { dish: 'X', category: 'side' }).ok, false);
  assert.equal(validate('food', { dish: 'X', personId: '  ', category: 'side' }).ok, false);
  assert.equal(validate('food', { dish: 'X', personId: 5, category: 'side' }).ok, false);
});

test('food: rejects bad category, blanks, non-string input', () => {
  assert.equal(validate('food', { dish: 'X', personId: 'p', category: 'snack' }).ok, false);
  assert.equal(validate('food', { dish: '', personId: 'p', category: 'side' }).ok, false);
  assert.equal(validate('food', { dish: { a: 1 }, personId: 'p', category: 'side' }).ok, false);
  assert.equal(validate('food', null).ok, false);
});
