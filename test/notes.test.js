const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const at = (s) => html.indexOf(s);

test('a notes card sits between "Who\'s coming" and "What we\'re bringing"', () => {
  assert.ok(at('id="guests-h"') < at('id="notes-h"') && at('id="notes-h"') < at('id="food-h"'));
});

test('notes form has a note box, mentions dietary needs, and a save button', () => {
  const start = at('id="notes-form"');
  assert.ok(start > -1, 'form exists');
  const form = html.slice(start, html.indexOf('</form>', start));
  assert.match(form, /name="note"[^>]*maxlength="200"/);
  assert.match(form, /type="submit"[^>]*class="primary"|class="primary"[^>]*type="submit"/);
  assert.match(html.slice(at('id="notes-h"'), start), /dietary|allerg/i);
});

test('the RSVP edit form no longer has its own note box (one place to edit it)', () => {
  const start = at('id="guest-form"');
  const form = html.slice(start, html.indexOf('</form>', start));
  assert.doesNotMatch(form, /name="note"/);
});

test('saving notes keeps name/adults/kids; saving the RSVP edit keeps the note', () => {
  assert.match(js, /\$\('notes-form'\)|forms\.notes/);
  assert.match(js, /note: mine\.note|note: meGuest\(\)\.note/, 'RSVP edit preserves note');
  assert.match(js, /adults: mine\.adults|adults: .*\.adults/, 'notes save sends the rest of the RSVP');
});

test('the guest list shows each family note under their name', () => {
  assert.match(js, /p\.note \? el\('span', \{ class: 'sub note' \}/);
});

test('after saving, the note shows as read-only text with an Edit note button, not a lingering form', () => {
  const start = at('id="notes-h"');
  const card = html.slice(start, html.indexOf('</section>', start));
  assert.match(card, /id="notes-view"[^>]*\bhidden\b/, 'saved view starts hidden');
  assert.match(card, /id="notes-text"/);
  assert.match(card, /<button[^>]*id="edit-note-btn"[^>]*>\s*Edit note/);
  assert.match(card, /class="ghost cancel"/, 'edit mode can be cancelled');
  assert.match(js, /notesEditing/);
  assert.match(js, /\$\('notes-view'\)\.hidden/);
  assert.match(js, /\$\('notes-form'\)\.hidden|forms\.notes\.hidden/);
});

test('saving a note shows a polite "Note saved" toast', () => {
  assert.match(html, /id="toast"[^>]*role="status"[^>]*aria-live="polite"|id="toast"[^>]*aria-live="polite"[^>]*role="status"/);
  assert.match(js, /function showToast/);
  assert.match(js, /showToast\(.*'Note saved'/);
  const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
  assert.match(css, /\.toast\s*\{/);
  assert.match(css, /prefers-reduced-motion[\s\S]*\.toast/);
});
