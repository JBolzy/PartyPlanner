const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../lib/api');

// Minimal in-memory stand-in for the subset of the mongodb driver the API uses.
function fakeDb() {
  const stores = {};
  return {
    collection(name) {
      const rows = (stores[name] ||= []);
      return {
        find: () => ({ sort: () => ({ toArray: async () => rows.map((r) => ({ ...r })) }) }),
        findOne: async (q) => rows.find((r) => r._id === q._id) || null,
        countDocuments: async () => rows.length,
        insertOne: async (d) => void rows.push({ ...d }),
        updateOne: async (q, u) => void Object.assign(rows.find((r) => r._id === q._id), u.$set),
        deleteOne: async (q) => void rows.splice(rows.findIndex((r) => r._id === q._id), 1),
        deleteMany: async (q) => {
          const keep = rows.filter((r) => Object.entries(q).some(([k, v]) => r[k] !== v));
          const deletedCount = rows.length - keep.length;
          rows.splice(0, rows.length, ...keep);
          return { deletedCount };
        },
      };
    },
  };
}

// `as` = the person id the visitor picked on the "Who are you?" screen (honor system, no passwords).
function setup() {
  const db = fakeDb();
  const handler = createHandler(async () => db);
  const call = async (method, path, body, as) =>
    handler({
      httpMethod: method,
      path,
      headers: as ? { 'x-person-id': as } : {},
      body: body === undefined ? null : JSON.stringify(body),
    }).then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }));
  const rsvp = async (name, partySize = 1) => (await call('POST', '/api/person', { name, partySize })).json;
  return { call, rsvp };
}

test('RSVP creates a guest anyone can see; nothing secret is exposed', async () => {
  const { call } = setup();
  const created = await call('POST', '/api/person', { name: 'Sue', partySize: 2 });
  assert.equal(created.status, 201);
  assert.ok(created.json.id);
  assert.equal(created.json.editToken, undefined);
  const list = (await call('GET', '/api/person')).json;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Sue');
  assert.equal(list[0]._id, undefined);
  assert.equal(list[0].editTokenHash, undefined);
});

test('invalid body -> 400', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  assert.equal((await call('POST', '/api/person', { name: '' })).status, 400);
  assert.equal((await call('POST', '/api/food', { dish: 'x' }, sue.id)).status, 400);
});

test('unknown collection/path -> 404, malformed JSON -> 400', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/api/person/a/b')).status, 404);
  const h = createHandler(async () => fakeDb());
  const r = await h({ httpMethod: 'POST', path: '/api/person', headers: {}, body: '{bad' });
  assert.equal(r.statusCode, 400);
});

test('the same name cannot RSVP twice (case/space-insensitive) and the response names the existing guest', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Aunt Sue');
  const dupe = await call('POST', '/api/person', { name: '  aunt sue ' });
  assert.equal(dupe.status, 409);
  assert.equal(dupe.json.existingId, sue.id);
  assert.equal((await call('GET', '/api/person')).json.length, 1);
});

test('renaming into someone else\'s name is rejected, keeping your own name is fine', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  await rsvp('Bob');
  assert.equal((await call('PUT', `/api/person/${sue.id}`, { name: 'bob', partySize: 1 }, sue.id)).status, 409);
  assert.equal((await call('PUT', `/api/person/${sue.id}`, { name: 'Sue', partySize: 4 }, sue.id)).status, 200);
});

test('you can only edit or remove your own RSVP', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  const bob = await rsvp('Bob');
  const patch = { name: 'Sue S', partySize: 3 };

  assert.equal((await call('PUT', `/api/person/${sue.id}`, patch)).status, 401, 'no identity');
  assert.equal((await call('PUT', `/api/person/${sue.id}`, patch, bob.id)).status, 403, 'someone else');
  assert.equal((await call('DELETE', `/api/person/${sue.id}`, undefined, bob.id)).status, 403);

  const ok = await call('PUT', `/api/person/${sue.id}`, patch, sue.id);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.name, 'Sue S');
  assert.equal((await call('DELETE', `/api/person/${sue.id}`, undefined, sue.id)).status, 200);
  assert.equal((await call('DELETE', `/api/person/${sue.id}`, undefined, sue.id)).status, 404);
});

test('adding a dish requires picking who you are, and it is always yours', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  const bob = await rsvp('Bob');
  const dish = { dish: 'Pie', category: 'dessert' };

  assert.equal((await call('POST', '/api/food', dish)).status, 401, 'no identity');
  assert.equal((await call('POST', '/api/food', dish, 'ghost')).status, 401, 'identity not on the list');

  // A typed-in personId must not let Sue add a dish for Bob.
  const r = await call('POST', '/api/food', { ...dish, personId: bob.id }, sue.id);
  assert.equal(r.status, 201);
  assert.equal(r.json.personId, sue.id);
});

test('one person can bring several dishes', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  const a = await call('POST', '/api/food', { dish: 'Mac & cheese', category: 'side' }, sue.id);
  const b = await call('POST', '/api/food', { dish: 'Cookies', category: 'dessert' }, sue.id);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const list = (await call('GET', '/api/food')).json;
  assert.deepEqual(list.map((f) => f.personId), [sue.id, sue.id]);
});

test('you can only edit or remove your own dishes', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  const bob = await rsvp('Bob');
  const dish = (await call('POST', '/api/food', { dish: 'Pie', category: 'dessert' }, sue.id)).json;
  const patch = { dish: 'Apple Pie', category: 'dessert' };

  assert.equal((await call('PUT', `/api/food/${dish.id}`, patch)).status, 401);
  assert.equal((await call('PUT', `/api/food/${dish.id}`, patch, bob.id)).status, 403);
  assert.equal((await call('DELETE', `/api/food/${dish.id}`, undefined, bob.id)).status, 403);

  const ok = await call('PUT', `/api/food/${dish.id}`, patch, sue.id);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.dish, 'Apple Pie');
  assert.equal(ok.json.personId, sue.id, 'owner cannot be changed by an edit');

  assert.equal((await call('DELETE', `/api/food/${dish.id}`, undefined, sue.id)).status, 200);
  assert.equal((await call('GET', '/api/food')).json.length, 0);
  assert.equal((await call('DELETE', `/api/food/${dish.id}`, undefined, sue.id)).status, 404);
});

test('removing yourself also removes your dishes, and only yours', async () => {
  const { call, rsvp } = setup();
  const sue = await rsvp('Sue');
  const bob = await rsvp('Bob');
  await call('POST', '/api/food', { dish: 'Salad', category: 'side' }, sue.id);
  await call('POST', '/api/food', { dish: 'Rolls', category: 'side' }, sue.id);
  await call('POST', '/api/food', { dish: 'Pop', category: 'drink' }, bob.id);

  const del = await call('DELETE', `/api/person/${sue.id}`, undefined, sue.id);
  assert.equal(del.status, 200);
  assert.equal(del.json.removedDishes, 2);
  assert.deepEqual((await call('GET', '/api/food')).json.map((f) => f.dish), ['Pop']);
});

test('works with the netlify functions path prefix too', async () => {
  const { call } = setup();
  const r = await call('POST', '/.netlify/functions/api/person', { name: 'Zed' });
  assert.equal(r.status, 201);
});

test('caps total entries per collection', async () => {
  const { call } = setup();
  for (let i = 0; i < 300; i++) await call('POST', '/api/person', { name: `P${i}` });
  assert.equal((await call('POST', '/api/person', { name: 'extra' })).status, 429);
});
