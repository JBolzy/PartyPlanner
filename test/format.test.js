const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plural, groupPills, headcountSummary } = require('../public/format');

test('plural', () => {
  assert.equal(plural(1, 'adult', 'adults'), '1 adult');
  assert.equal(plural(0, 'kid', 'kids'), '0 kids');
  assert.equal(plural(2, 'person', 'people'), '2 people');
});

const texts = (p) => groupPills(p).map((x) => x.text);
const kinds = (p) => groupPills(p).map((x) => x.kind);

test('EVERY guest gets an adults pill, including one adult on their own', () => {
  assert.deepEqual(groupPills({ adults: 1, kids: 0, partySize: 1 }), [{ text: '1 adult', kind: 'adult' }]);
});

test('adults and kids are TWO separate pills, each count + word', () => {
  assert.deepEqual(groupPills({ adults: 2, kids: 1, partySize: 3 }), [
    { text: '2 adults', kind: 'adult' },
    { text: '1 kid', kind: 'kid' },
  ]);
  assert.deepEqual(texts({ adults: 1, kids: 2, partySize: 3 }), ['1 adult', '2 kids']);
  assert.deepEqual(texts({ adults: 2, kids: 2, partySize: 4 }), ['2 adults', '2 kids']);
});

test('no kids means no kids pill (no "0 kids" clutter)', () => {
  assert.deepEqual(texts({ adults: 2, kids: 0, partySize: 2 }), ['2 adults']);
  assert.deepEqual(texts({ adults: 2, partySize: 2 }), ['2 adults'], 'kids field missing');
});

test('the two pills are tagged so they can be coloured differently', () => {
  assert.deepEqual(kinds({ adults: 2, kids: 1, partySize: 3 }), ['adult', 'kid']);
});

test('RSVPs made before adults/kids existed (only a total) still get a pill', () => {
  assert.deepEqual(groupPills({ partySize: 3 }), [{ text: 'party of 3', kind: 'adult' }]);
  assert.deepEqual(texts({ partySize: 1 }), ['1 adult']);
});

test('page loads format.js before app.js; app.js renders one pill per entry and never hides a lone guest', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.ok(html.indexOf('src="format.js"') > -1 && html.indexOf('src="format.js"') < html.indexOf('src="app.js"'));
  const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.doesNotMatch(js, /partySize <= 1\) return ''/);
  assert.match(js, /groupPills\(p\)\.map/);
  const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
  assert.match(css, /\.badge-kid\s*\{/);
});

test('headcount summary: "29 people | 22 adults · 7 kids"', () => {
  const people = [
    { adults: 1, kids: 2, partySize: 3 },
    { adults: 2, kids: 0, partySize: 2 },
    { adults: 2, kids: 2, partySize: 4 },
    { adults: 2, kids: 1, partySize: 3 },
  ];
  assert.equal(headcountSummary(people), '12 people | 7 adults · 5 kids');
});

test('headcount summary leaves kids out when there are none, and handles singulars', () => {
  assert.equal(headcountSummary([{ adults: 2, kids: 0, partySize: 2 }, { adults: 1, kids: 0, partySize: 1 }]), '3 people | 3 adults');
  assert.equal(headcountSummary([{ adults: 1, kids: 0, partySize: 1 }]), '1 person | 1 adult');
  assert.equal(headcountSummary([{ adults: 1, kids: 1, partySize: 2 }]), '2 people | 1 adult · 1 kid');
});

test('headcount summary counts older RSVPs (only a total) as adults, and an empty list says so', () => {
  assert.equal(headcountSummary([{ partySize: 3 }, { adults: 1, kids: 1, partySize: 2 }]), '5 people | 4 adults · 1 kid');
  assert.equal(headcountSummary([]), 'No one yet');
});

test("Who's coming starts collapsed behind an accessible toggle, with the list inside the collapsed part", () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<button[^>]*id="guests-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="guests-body"|<button[^>]*aria-controls="guests-body"[^>]*aria-expanded="false"/);
  assert.match(html, /<div id="guests-body"[^>]*\bhidden\b/);
  const at = (x) => html.indexOf(x);
  assert.ok(at('id="guests-body"') < at('id="guest-list"') && at('id="guest-list"') < at('id="guest-form"'), 'list and edit form are inside the body');
  assert.ok(at('id="guest-form"') < at('id="food-h"'), 'and the body closes before the food card');
  const toggle = html.slice(at('id="guests-toggle"'), at('id="guests-body"'));
  assert.match(toggle, /id="guest-count"/, 'the summary line is part of the always-visible header');
  assert.match(toggle, /class="chevron"/, 'with a chevron');
});

test('app.js wires the toggle to aria-expanded and uses the shared summary', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.match(js, /setAttribute\('aria-expanded'/);
  assert.match(js, /headcountSummary\(state\.person\)/);
});
