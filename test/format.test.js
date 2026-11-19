const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plural, groupPills } = require('../public/format');

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
