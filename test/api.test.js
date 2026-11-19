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
      };
    },
  };
}

function setup() {
  const db = fakeDb();
  const handler = createHandler(async () => db);
  const call = async (method, path, body, token) =>
    handler({
      httpMethod: method,
      path,
      headers: token ? { 'x-edit-token': token } : {},
      body: body === undefined ? null : JSON.stringify(body),
    }).then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }));
  return { call };
}

test('create then list; token hash never exposed', async () => {
  const { call } = setup();
  const created = await call('POST', '/api/person', { name: 'Sue', partySize: 2 });
  assert.equal(created.status, 201);
  assert.ok(created.json.editToken);
  assert.ok(created.json.id);
  const list = await call('GET', '/api/person');
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].name, 'Sue');
  assert.equal(list.json[0].editToken, undefined);
  assert.equal(list.json[0].editTokenHash, undefined);
  assert.equal(list.json[0]._id, undefined);
});

test('invalid body -> 400', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/api/person', { name: '' })).status, 400);
  assert.equal((await call('POST', '/api/food', { dish: 'x' })).status, 400);
});

test('unknown collection/path -> 404, malformed JSON -> 400', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('GET', '/api/person/a/b')).status, 404);
  const h = createHandler(async () => fakeDb());
  const r = await h({ httpMethod: 'POST', path: '/api/person', headers: {}, body: '{bad' });
  assert.equal(r.statusCode, 400);
});

test('update/delete need the right token', async () => {
  const { call } = setup();
  const c = await call('POST', '/api/food', { dish: 'Pie', bringerName: 'Al', category: 'dessert' });
  const { id, editToken } = c.json;
  const patch = { dish: 'Apple Pie', bringerName: 'Al', category: 'dessert' };

  assert.equal((await call('PUT', `/api/food/${id}`, patch)).status, 403);
  assert.equal((await call('PUT', `/api/food/${id}`, patch, 'wrong')).status, 403);
  assert.equal((await call('DELETE', `/api/food/${id}`, undefined, 'wrong')).status, 403);

  const ok = await call('PUT', `/api/food/${id}`, patch, editToken);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.dish, 'Apple Pie');

  assert.equal((await call('DELETE', `/api/food/${id}`, undefined, editToken)).status, 200);
  assert.equal((await call('GET', '/api/food')).json.length, 0);
  assert.equal((await call('DELETE', `/api/food/${id}`, undefined, editToken)).status, 404);
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
