const crypto = require('node:crypto');
const { validate } = require('./validate');

const COLLECTIONS = new Set(['person', 'food']);
const MAX_ENTRIES = 300;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

// Older records may carry an editTokenHash from the per-device-token version; never expose it.
function toPublic(doc) {
  const { _id, editTokenHash, ...rest } = doc;
  return { id: _id, ...rest };
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/*
 * Identity is an honor system: the visitor picks who they are on the "Who are you?" screen and the
 * page sends that person's id in the x-person-id header. The site itself sits behind a password.
 * Anyone can read; you can only add/change/remove your own RSVP and your own dishes.
 */
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
      const actor = String((event.headers || {})['x-person-id'] || '');

      // 401 = nobody picked; 403 = picked, but it's not theirs.
      const notYours = (ownerId) => {
        if (!actor) return json(401, { error: 'Pick who you are first' });
        if (actor !== ownerId) return json(403, { error: 'You can only change your own entries' });
        return null;
      };
      const duplicateOf = async (value, exceptId) => {
        const rows = await col.find({}).sort({ createdAt: 1 }).toArray();
        return rows.find((r) => r._id !== exceptId && sameName(r.name, value.name));
      };
      const dupeResponse = (dupe) =>
        json(409, { error: "That name is already on the list. Pick it from 'Who are you?'", existingId: dupe._id });

      if (!id) {
        if (method === 'GET') {
          const rows = await col.find({}).sort({ createdAt: 1 }).toArray();
          return json(200, rows.map(toPublic));
        }
        if (method !== 'POST') return json(405, { error: 'Method not allowed' });

        const v = validate(name, body);
        if (!v.ok) return json(400, { error: v.error });

        let ownerId;
        if (name === 'food') {
          const me = actor && (await db.collection('person').findOne({ _id: actor }));
          if (!me) return json(401, { error: 'Pick who you are first' });
          ownerId = actor;
        } else {
          const dupe = await duplicateOf(v.value);
          if (dupe) return dupeResponse(dupe);
        }
        if ((await col.countDocuments({})) >= MAX_ENTRIES) return json(429, { error: 'The list is full' });

        const doc = {
          _id: crypto.randomUUID(),
          ...v.value,
          ...(ownerId ? { personId: ownerId } : {}),
          createdAt: new Date().toISOString(),
        };
        await col.insertOne(doc);
        return json(201, toPublic(doc));
      }

      if (method !== 'PUT' && method !== 'DELETE') return json(405, { error: 'Method not allowed' });
      const existing = await col.findOne({ _id: id });
      if (!existing) return json(404, { error: 'Not found' });
      const denied = notYours(name === 'person' ? existing._id : existing.personId);
      if (denied) return denied;

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
      if (name === 'person') {
        const dupe = await duplicateOf(v.value, id);
        if (dupe) return dupeResponse(dupe);
      }
      await col.updateOne({ _id: id }, { $set: v.value });
      return json(200, toPublic({ ...existing, ...v.value }));
    } catch (err) {
      console.error(err);
      return json(500, { error: 'Something went wrong. Try again in a moment.' });
    }
  };
}

module.exports = { createHandler };
