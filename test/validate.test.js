const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../lib/validate');

test('person: adults + kids, total is their sum (form values arrive as strings)', () => {
  const r = validate('person', { name: '  Aunt Sue ', adults: '2', kids: '1', note: ' vegan ' });
  assert.deepEqual(r, { ok: true, value: { name: 'Aunt Sue', adults: 2, kids: 1, partySize: 3, note: 'vegan' } });
});

test('person: kids default to 0, adults default to 1, note optional', () => {
  assert.deepEqual(validate('person', { name: 'Bob' }).value, { name: 'Bob', adults: 1, kids: 0, partySize: 1, note: '' });
  assert.deepEqual(validate('person', { name: 'Bob', adults: 2, kids: '' }).value.kids, 0);
});

test('person: an older page that only sends partySize still works (counted as adults)', () => {
  const r = validate('person', { name: 'Al', partySize: '3' });
  assert.deepEqual(r.value, { name: 'Al', adults: 3, kids: 0, partySize: 3, note: '' });
});

test('person: the total can never disagree with adults + kids, whatever the client sends', () => {
  const r = validate('person', { name: 'Al', adults: 2, kids: 2, partySize: 99 });
  assert.equal(r.value.partySize, 4);
});

test('person: rejects blank or whitespace name', () => {
  assert.equal(validate('person', { name: '   ' }).ok, false);
  assert.equal(validate('person', {}).ok, false);
});

test('person: at least one adult, kids can be zero, counts must be whole numbers in range', () => {
  for (const adults of [0, -1, 21, 1.5, 'abc']) {
    assert.equal(validate('person', { name: 'A', adults }).ok, false, `adults ${adults}`);
  }
  for (const kids of [-1, 21, 1.5, 'abc']) {
    assert.equal(validate('person', { name: 'A', adults: 1, kids }).ok, false, `kids ${kids}`);
  }
  assert.equal(validate('person', { name: 'A', adults: 1, kids: 0 }).ok, true);
  assert.equal(validate('person', { name: 'A', adults: 20, kids: 20 }).ok, true);
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
