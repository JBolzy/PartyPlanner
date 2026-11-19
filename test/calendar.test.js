const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PARTY_START, PARTY_END } = require('../public/countdown');

const ics = fs.readFileSync(path.join(__dirname, '../public/christmas-party.ics'), 'utf8');
const toIcsUtc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

test('ics is a valid-looking calendar with CRLF line endings', () => {
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line break must be CRLF');
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /BEGIN:VEVENT/);
});

test('ics start/end match the countdown times', () => {
  assert.ok(ics.includes(`DTSTART:${toIcsUtc(PARTY_START)}`), 'DTSTART');
  assert.ok(ics.includes(`DTEND:${toIcsUtc(PARTY_END)}`), 'DTEND');
});

test('ics has the party name and the address, commas escaped', () => {
  assert.match(ics, /SUMMARY:Family Christmas Get-Together/);
  assert.ok(ics.includes("LOCATION:Doug & Debbie's house\\, 5355 Jillian Dr\\, Bay City\\, MI 48706"));
});

test('ics has a UID so re-adding updates instead of duplicating', () => {
  assert.match(ics, /UID:[^\r\n]+@/);
});

test('countdown, details and calendar button live in a wrapper that starts hidden (shown after sign-in)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const wrapper = html.indexOf('id="party-details"');
  assert.ok(wrapper > -1, 'wrapper exists');
  assert.match(html.slice(wrapper - 5, wrapper + 40), /id="party-details" hidden/);
  const at = (s) => html.indexOf(s);
  // title + intro stay visible; everything from the countdown down is inside the wrapper
  assert.ok(at('<h1>') < wrapper && at('class="lede"') < wrapper);
  assert.ok(wrapper < at('id="countdown"') && at('id="countdown"') < at('class="details"'));
  assert.ok(at('class="details"') < at('class="cal-btn"') && at('class="cal-btn"') < at('</header>'));
});

test('each countdown unit puts only the number in the card, with the label outside it', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const units = html.match(/<div class="cd-unit">[\s\S]*?<\/div>\s*<span class="cd-label">[a-z]+<\/span>\s*<\/div>/g) || [];
  assert.equal(units.length, 4);
  for (const u of units) {
    const card = u.match(/<div class="cd-card">([\s\S]*?)<\/div>/)[1];
    assert.match(card, /class="cd-num"/);
    assert.doesNotMatch(card, /cd-label/);
  }
});

test('add-a-dish form starts collapsed behind a button', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<button[^>]*id="add-dish-btn"/);
  assert.match(html, /<form id="food-form"[^>]*\bhidden\b/);
});

test('page links to the calendar file with a download attribute', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<a [^>]*href="christmas-party\.ics"[^>]*download/);
});
