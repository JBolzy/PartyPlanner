const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PARTY_START } = require('../public/countdown');

const ics = fs.readFileSync(path.join(__dirname, '../public/christmas-party.ics'), 'utf8');
const toIcsUtc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

test('ics is a valid-looking calendar with CRLF line endings', () => {
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line break must be CRLF');
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /BEGIN:VEVENT/);
});

test('ics starts exactly when the countdown does, and blocks five hours (1-6 PM) since there is no real end time', () => {
  assert.ok(ics.includes(`DTSTART:${toIcsUtc(PARTY_START)}`), 'DTSTART');
  const blockedUntil = new Date(Date.parse(PARTY_START) + 5 * 60 * 60 * 1000).toISOString();
  assert.equal(blockedUntil, '2026-12-22T23:00:00.000Z'); // 6:00 PM Eastern
  assert.ok(ics.includes(`DTEND:${toIcsUtc(blockedUntil)}`), 'DTEND');
});

test('ics description tells guests there is no set end time', () => {
  assert.match(ics, /DESCRIPTION:[^\r\n]*no set end time/i);
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

test('both RSVP forms ask for adults and kids (no single party-size box) and show a total', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  for (const id of ['rsvp-form', 'guest-form']) {
    const form = html.slice(html.indexOf(`id="${id}"`), html.indexOf('</form>', html.indexOf(`id="${id}"`)));
    assert.match(form, /name="adults"/, `${id} adults`);
    assert.match(form, /name="kids"/, `${id} kids`);
    assert.match(form, /data-total/, `${id} total`);
    assert.doesNotMatch(form, /name="partySize"/, `${id} no partySize`);
  }
});

test('sign-in copy sends people to find their name first and only RSVP if they cannot', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  // "First time here?" made people already on the list RSVP again.
  assert.doesNotMatch(html, /first time/i);
  assert.match(html, /Find your name/);
  assert.match(html, /Can't find your name\? RSVP here/);
  assert.match(html, /already on the list/i);
  // the dropdown placeholder (static markup and the one app.js rebuilds) agree
  assert.match(html, /Find your name in the list…/);
  assert.match(js, /Find your name in the list…/);
  assert.doesNotMatch(html + js, /Choose your name/);
  // the "find your name" card comes before the RSVP form
  assert.ok(html.indexOf('id="gate-form"') < html.indexOf('id="rsvp-form"'));
});

test('the site uses SVG icons, not emoji', () => {
  for (const file of ['index.html', 'app.js', 'countdown.js', 'style.css']) {
    const text = fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
    const found = text.match(/[\p{Extended_Pictographic}️‍]/gu);
    assert.equal(found, null, `${file} contains emoji: ${found}`);
  }
});

test('every food category and the pizza/tree spots have an icon', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  for (const key of ['side', 'dessert', 'drink', 'other']) {
    assert.match(js, new RegExp(`\\b${key}:\\s*\\[`), `ICONS.${key}`);
  }
  assert.match(html, /class="inline-icon"/, 'pizza icon in The plan');
  assert.match(html, /id="cd-tree"/, 'tree icon for the party-time message');
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
