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

const addPerson = async (call, name = 'Sue') => (await call('POST', '/api/person', { name })).json;

test('invalid body -> 400', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/api/person', { name: '' })).status, 400);
  assert.equal((await call('POST', '/api/food', { dish: 'x' })).status, 400);
});

test('food must belong to a real person on the list', async () => {
  const { call } = setup();
  const r = await call('POST', '/api/food', { dish: 'Pie', category: 'dessert', personId: 'nobody' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /who/i);
});

test('one person can bring several dishes', async () => {
  const { call } = setup();
  const sue = await addPerson(call);
  const a = await call('POST', '/api/food', { dish: 'Mac & cheese', category: 'side', personId: sue.id });
  const b = await call('POST', '/api/food', { dish: 'Cookies', category: 'dessert', personId: sue.id });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const list = (await call('GET', '/api/food')).json;
  assert.deepEqual(list.map((f) => f.personId), [sue.id, sue.id]);
  assert.equal(list[0].bringerName, undefined, 'name is looked up from the person, not stored');
});

test('moving a dish to an unknown person is rejected', async () => {
  const { call } = setup();
  const sue = await addPerson(call);
  const dish = (await call('POST', '/api/food', { dish: 'Pie', category: 'dessert', personId: sue.id })).json;
  const r = await call('PUT', `/api/food/${dish.id}`, { dish: 'Pie', category: 'dessert', personId: 'ghost' }, dish.editToken);
  assert.equal(r.status, 400);
});

test('removing a guest also removes their dishes, and only theirs', async () => {
  const { call } = setup();
  const sue = await addPerson(call, 'Sue');
  const bob = await addPerson(call, 'Bob');
  await call('POST', '/api/food', { dish: 'Salad', category: 'side', personId: sue.id });
  await call('POST', '/api/food', { dish: 'Rolls', category: 'side', personId: sue.id });
  await call('POST', '/api/food', { dish: 'Pop', category: 'drink', personId: bob.id });

  const del = await call('DELETE', `/api/person/${sue.id}`, undefined, sue.editToken);
  assert.equal(del.status, 200);
  assert.equal(del.json.removedDishes, 2);
  const left = (await call('GET', '/api/food')).json;
  assert.deepEqual(left.map((f) => f.dish), ['Pop']);
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
  const al = await addPerson(call, 'Al');
  const c = await call('POST', '/api/food', { dish: 'Pie', personId: al.id, category: 'dessert' });
  const { id, editToken } = c.json;
  const patch = { dish: 'Apple Pie', personId: al.id, category: 'dessert' };

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
