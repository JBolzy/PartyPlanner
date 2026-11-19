const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../lib/api');
const { fakeDb } = require('./helpers/fakedb');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function setup(opts = {}) {
  const { db, stores } = fakeDb();
  const handler = createHandler(async () => db, opts);
  const call = (method, path, body, headers = {}) =>
    handler({ httpMethod: method, path, headers, body: body === undefined ? null : JSON.stringify(body) })
      .then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }));
  return { call, stores };
}
const VISITOR = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

test('a page open is recorded with only what we need: time, anonymous device id, guest, mobile/desktop', async () => {
  const { call, stores } = setup();
  const r = await call('POST', '/api/visit', { visitorId: VISITOR }, { 'user-agent': IPHONE });
  assert.equal(r.status, 201);
  const [doc] = stores.visit;
  assert.deepEqual(Object.keys(doc).sort(), ['_id', 'at', 'device', 'kind', 'personId', 'visitorId']);
  assert.equal(doc.kind, 'open');
  assert.equal(doc.visitorId, VISITOR);
  assert.equal(doc.device, 'mobile');
  assert.equal(doc.personId, null);
  assert.ok(!Number.isNaN(Date.parse(doc.at)));
});

test('no IP address or browser string is ever stored', async () => {
  const { call, stores } = setup();
  await call('POST', '/api/visit', { visitorId: VISITOR }, { 'user-agent': ANDROID, 'x-forwarded-for': '203.0.113.9', 'client-ip': '203.0.113.9' });
  const stored = JSON.stringify(stores.visit);
  assert.ok(!stored.includes('203.0.113.9'), 'IP');
  assert.ok(!stored.includes('Pixel'), 'user agent');
  assert.ok(!stored.includes('Mozilla'), 'user agent');
});

test('phones and tablets count as mobile, computers as desktop', async () => {
  const { call, stores } = setup();
  await call('POST', '/api/visit', { visitorId: VISITOR }, { 'user-agent': IPHONE });
  await call('POST', '/api/visit', { visitorId: VISITOR }, { 'user-agent': ANDROID });
  await call('POST', '/api/visit', { visitorId: VISITOR }, { 'user-agent': MAC });
  await call('POST', '/api/visit', { visitorId: VISITOR }, {});
  assert.deepEqual(stores.visit.map((v) => v.device), ['mobile', 'mobile', 'desktop', 'desktop']);
});

test('the signed-in guest (if this device remembers one) is attached to the open', async () => {
  const { call, stores } = setup();
  await call('POST', '/api/visit', { visitorId: VISITOR }, { 'x-person-id': 'guest-123' });
  assert.equal(stores.visit[0].personId, 'guest-123');
});

test("a \"That's me\" click is recorded as a sign-in for the guest that was picked", async () => {
  const { call, stores } = setup();
  const r = await call('POST', '/api/visit', { visitorId: VISITOR, kind: 'signin', personId: 'guest-123' }, { 'user-agent': IPHONE });
  assert.equal(r.status, 201);
  assert.deepEqual(
    { kind: stores.visit[0].kind, personId: stores.visit[0].personId, visitorId: stores.visit[0].visitorId, device: stores.visit[0].device },
    { kind: 'signin', personId: 'guest-123', visitorId: VISITOR, device: 'mobile' },
  );
});

test('a sign-in needs a guest, and unknown kinds are rejected', async () => {
  const { call, stores } = setup();
  assert.equal((await call('POST', '/api/visit', { visitorId: VISITOR, kind: 'signin' })).status, 400);
  assert.equal((await call('POST', '/api/visit', { visitorId: VISITOR, kind: 'signin', personId: '  ' })).status, 400);
  assert.equal((await call('POST', '/api/visit', { visitorId: VISITOR, kind: 'signin', personId: 'x'.repeat(65) })).status, 400);
  assert.equal((await call('POST', '/api/visit', { visitorId: VISITOR, kind: 'delete-everything' })).status, 400);
  assert.equal((stores.visit || []).length, 0);
});

test('a bad visitor id is rejected and nothing is stored', async () => {
  const { call, stores } = setup();
  for (const visitorId of [undefined, '', 'short', 'has spaces in it ok?', '<script>alert(1)</script>', 'x'.repeat(65), 12345678]) {
    assert.equal((await call('POST', '/api/visit', { visitorId })).status, 400, String(visitorId));
  }
  assert.equal((stores.visit || []).length, 0);
});

test('visit only accepts POST, stats only accepts GET, neither takes an id', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/visit')).status, 405);
  assert.equal((await call('POST', '/api/stats', {})).status, 405);
  assert.equal((await call('POST', '/api/visit/abc', { visitorId: VISITOR })).status, 404);
  assert.equal((await call('GET', '/api/stats/abc')).status, 404);
});

test('the log is capped so it cannot grow without limit', async () => {
  const { call, stores } = setup({ maxVisits: 3 });
  for (let i = 0; i < 6; i++) await call('POST', '/api/visit', { visitorId: VISITOR });
  assert.equal(stores.visit.length, 3);
});

test('stats on an empty log are all zeros, with seven days listed', async () => {
  const { call } = setup({ now: () => new Date('2026-12-20T15:00:00Z') });
  const s = (await call('GET', '/api/stats')).json;
  assert.equal(s.totalOpens, 0);
  assert.equal(s.uniqueVisitors, 0);
  assert.equal(s.opensToday, 0);
  assert.equal(s.lastOpenAt, null);
  assert.deepEqual(s.devices, { mobile: 0, desktop: 0 });
  assert.equal(s.last7Days.length, 7);
  assert.equal(s.last7Days.at(-1).date, '2026-12-20');
  assert.equal(s.last7Days[0].date, '2026-12-14');
});

test('stats count opens, unique devices, today, and the mobile/desktop split', async () => {
  const { call, stores } = setup({ now: () => new Date('2026-12-20T15:00:00Z') });
  const seed = (at, visitorId, device, kind = 'open', personId = null) =>
    (stores.visit ||= []).push({ _id: at + visitorId + kind, at, kind, visitorId, personId, device });
  seed('2026-12-20T14:00:00Z', 'visitor-aaaa', 'mobile');
  seed('2026-12-20T14:30:00Z', 'visitor-aaaa', 'mobile'); // same person opens it again
  seed('2026-12-20T14:45:00Z', 'visitor-bbbb', 'mobile');
  seed('2026-12-19T15:00:00Z', 'visitor-cccc', 'desktop');
  seed('2026-12-20T14:01:00Z', 'visitor-aaaa', 'mobile', 'signin', 'g1'); // a "That's me" click is NOT a page open
  const s = (await call('GET', '/api/stats')).json;
  assert.equal(s.totalOpens, 4);
  assert.equal(s.uniqueVisitors, 3);
  assert.equal(s.opensToday, 3);
  assert.equal(s.visitorsToday, 2);
  assert.deepEqual(s.devices, { mobile: 3, desktop: 1 });
  assert.equal(s.lastOpenAt, '2026-12-20T14:45:00Z');
  assert.deepEqual(s.last7Days.at(-1), { date: '2026-12-20', opens: 3, visitors: 2 });
  assert.deepEqual(s.last7Days.at(-2), { date: '2026-12-19', opens: 1, visitors: 1 });
});

test('days are Eastern days: 10:30 PM Eastern counts for that evening, not the next UTC day', async () => {
  const { call, stores } = setup({ now: () => new Date('2026-12-20T15:00:00Z') });
  stores.visit = [{ _id: '1', at: '2026-12-20T03:30:00Z', visitorId: 'visitor-aaaa', personId: null, device: 'mobile' }]; // Dec 19, 10:30 PM EST
  const s = (await call('GET', '/api/stats')).json;
  assert.equal(s.opensToday, 0);
  assert.equal(s.last7Days.find((d) => d.date === '2026-12-19').opens, 1);
});

// ---- who is opening it a lot, and who is tapping "That's me"
function seeded() {
  const t = setup({ now: () => new Date('2026-12-20T15:00:00Z') });
  t.stores.person = [{ _id: 'g1', name: 'Aunt Sue' }, { _id: 'g2', name: 'Bob' }];
  const add = (at, visitorId, kind = 'open', personId = null, device = 'mobile') =>
    (t.stores.visit ||= []).push({ _id: `${at}${visitorId}${kind}`, at, kind, visitorId, personId, device });
  return { ...t, add };
}
const SUE = 'aaaaaaaa-1111-2222-3333-444444444444';
const BOB = 'bbbbbbbb-1111-2222-3333-444444444444';
const ANON = 'cccccccc-1111-2222-3333-444444444444';

test('busiest devices: short device id, how many opens, last open, busiest first', async () => {
  const { call, add } = seeded();
  for (let i = 0; i < 5; i++) add(`2026-12-20T1${i}:00:00Z`, SUE);
  add('2026-12-19T10:00:00Z', BOB); add('2026-12-19T11:00:00Z', BOB);
  add('2026-12-18T10:00:00Z', ANON);
  const s = (await call('GET', '/api/stats')).json;
  assert.deepEqual(s.topDevices.map((d) => [d.device, d.opens]), [['aaaaaaaa', 5], ['bbbbbbbb', 2], ['cccccccc', 1]]);
  assert.equal(s.topDevices[0].lastOpenAt, '2026-12-20T14:00:00Z');
  assert.ok(!JSON.stringify(s.topDevices).includes(SUE), 'full device id is never returned, only the short one');
});

test('a device shows the guest(s) who signed in on it, so you can see "Aunt Sue opens it a lot"', async () => {
  const { call, add } = seeded();
  add('2026-12-20T10:00:00Z', SUE);
  add('2026-12-20T10:01:00Z', SUE, 'signin', 'g1');
  add('2026-12-20T11:00:00Z', SUE, 'open', 'g1');   // later open on the same device, now remembered as Sue
  add('2026-12-20T12:00:00Z', SUE, 'signin', 'g2'); // someone else picked Bob on Sue's device
  add('2026-12-20T13:00:00Z', ANON);
  const s = (await call('GET', '/api/stats')).json;
  const sue = s.topDevices.find((d) => d.device === 'aaaaaaaa');
  assert.deepEqual([...sue.guests].sort(), ['Aunt Sue', 'Bob']);
  assert.deepEqual(s.topDevices.find((d) => d.device === 'cccccccc').guests, []);
});

test('only 10 devices are listed', async () => {
  const { call, add } = seeded();
  for (let i = 0; i < 14; i++) add('2026-12-20T10:00:00Z', `${String(i).padStart(8, '0')}-xxxx-xxxx`);
  assert.equal((await call('GET', '/api/stats')).json.topDevices.length, 10);
});

test('"That\'s me" clicks per guest: name, count, last click, most clicks first', async () => {
  const { call, add } = seeded();
  add('2026-12-19T10:00:00Z', SUE, 'signin', 'g1');
  add('2026-12-20T10:00:00Z', SUE, 'signin', 'g1');
  add('2026-12-20T09:00:00Z', SUE, 'signin', 'g1');
  add('2026-12-18T09:00:00Z', BOB, 'signin', 'g2');
  add('2026-12-20T09:30:00Z', BOB, 'open', 'g2'); // an open is not a click
  const s = (await call('GET', '/api/stats')).json;
  assert.deepEqual(s.signIns, [
    { personId: 'g1', name: 'Aunt Sue', count: 3, lastAt: '2026-12-20T10:00:00Z' },
    { personId: 'g2', name: 'Bob', count: 1, lastAt: '2026-12-18T09:00:00Z' },
  ]);
});

test('a guest who has since been removed still shows up, by a placeholder name', async () => {
  const { call, add } = seeded();
  add('2026-12-20T10:00:00Z', SUE, 'signin', 'gone');
  const s = (await call('GET', '/api/stats')).json;
  assert.equal(s.signIns[0].name, '(removed guest)');
});

test('stats with nothing recorded have empty device and sign-in lists', async () => {
  const { call } = seeded();
  const s = (await call('GET', '/api/stats')).json;
  assert.deepEqual([s.topDevices, s.signIns], [[], []]);
});
