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
  assert.match(ics, /SUMMARY:Family Christmas Party/);
  assert.ok(ics.includes("LOCATION:Doug & Debbie's house\\, 5355 Jillian Dr\\, Bay City\\, MI 48706"));
});

test('ics has a UID so re-adding updates instead of duplicating', () => {
  assert.match(ics, /UID:[^\r\n]+@/);
});

test('page links to the calendar file with a download attribute', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<a [^>]*href="christmas-party\.ics"[^>]*download/);
});
