const crypto = require('node:crypto');
const { validate } = require('./validate');
const { newToken, hashToken, tokenMatches } = require('./token');

const COLLECTIONS = new Set(['person', 'food']);
const MAX_ENTRIES = 300;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

function toPublic(doc) {
  const { _id, editTokenHash, ...rest } = doc;
  return { id: _id, ...rest };
}

function createHandler(getDb) {
  return async (event) => {
    const parts = event.path
      .replace(/^\/(\.netlify\/functions\/api|api)\/?/, '')
      .split('/')
      .filter(Boolean);
    const [name, id] = parts;
    if (!COLLECTIONS.has(name) || parts.length > 2) return json(404, { error: 'Not found' });

    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        return json(400, { error: 'Invalid JSON' });
      }
    }

    try {
      const db = await getDb();
      const col = db.collection(name);
      const method = event.httpMethod;
      // A dish must belong to someone actually on the guest list.
      const personExists = async (v) => Boolean(await db.collection('person').findOne({ _id: v.personId }));
      const NO_PERSON = { error: "Pick who's bringing it from the guest list" };
      const token = (event.headers || {})['x-edit-token'] || '';

      if (!id) {
        if (method === 'GET') {
          const rows = await col.find({}).sort({ createdAt: 1 }).toArray();
          return json(200, rows.map(toPublic));
        }
        if (method === 'POST') {
          const v = validate(name, body);
          if (!v.ok) return json(400, { error: v.error });
          if (name === 'food' && !(await personExists(v.value))) return json(400, NO_PERSON);
          if ((await col.countDocuments({})) >= MAX_ENTRIES) {
            return json(429, { error: 'The list is full' });
          }
          const editToken = newToken();
          const doc = {
            _id: crypto.randomUUID(),
            ...v.value,
            createdAt: new Date().toISOString(),
            editTokenHash: hashToken(editToken),
          };
          await col.insertOne(doc);
          return json(201, { ...toPublic(doc), editToken });
        }
        return json(405, { error: 'Method not allowed' });
      }

      if (method !== 'PUT' && method !== 'DELETE') return json(405, { error: 'Method not allowed' });
      const existing = await col.findOne({ _id: id });
      if (!existing) return json(404, { error: 'Not found' });
      if (!tokenMatches(token, existing.editTokenHash)) {
        return json(403, { error: 'You can only change entries you added from this browser' });
      }
      if (method === 'DELETE') {
        await col.deleteOne({ _id: id });
        if (name === 'person') {
          // Their dishes go with them so the food list never names someone who isn't coming.
          const { deletedCount } = await db.collection('food').deleteMany({ personId: id });
          return json(200, { ok: true, removedDishes: deletedCount });
        }
        return json(200, { ok: true });
      }
      const v = validate(name, body);
      if (!v.ok) return json(400, { error: v.error });
      if (name === 'food' && !(await personExists(v.value))) return json(400, NO_PERSON);
      await col.updateOne({ _id: id }, { $set: v.value });
      return json(200, toPublic({ ...existing, ...v.value }));
    } catch (err) {
      console.error(err);
      return json(500, { error: 'Something went wrong. Try again in a moment.' });
    }
  };
}

module.exports = { createHandler };
