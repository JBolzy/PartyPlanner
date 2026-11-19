const crypto = require('node:crypto');
const { validate } = require('./validate');

const COLLECTIONS = new Set(['person', 'food']);
const MAX_ENTRIES = 300;
const MAX_VISITS = 50000; // page-open log cap
const VISIT_KINDS = new Set(['open', 'signin']); // a page open, or a tap on "That's me"
const VISITOR_ID = /^[A-Za-z0-9-]{8,64}$/;
const SIGNIN_VIA = new Set(['pick', 'rsvp']); // a "That's me" tap, or a new RSVP

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

// ---- page-open tracking helpers. We keep only: time, an anonymous random device id, the guest (if known),
// and a coarse mobile/desktop flag. No IP address and no browser string are ever stored.
const deviceOf = (ua = '') => (/Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop');
const easternDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(date); // YYYY-MM-DD
const shortId = (visitorId) => visitorId.slice(0, 8); // enough to tell devices apart; never the full id

async function buildStats(db, now) {
  const visits = await db.collection('visit').find({}).sort({ at: 1 }).toArray();
  const people = await db.collection('person').find({}).sort({ createdAt: 1 }).toArray();
  const nameOf = (id) => (people.find((p) => p._id === id) || {}).name || '(removed guest)';
  const opens = visits.filter((v) => (v.kind || 'open') === 'open');
  const signins = visits.filter((v) => v.kind === 'signin');

  const today = easternDay(now);
  const byDay = new Map();
  for (const v of opens) {
    const day = easternDay(new Date(v.at));
    const entry = byDay.get(day) || { opens: 0, ids: new Set() };
    entry.opens += 1;
    entry.ids.add(v.visitorId);
    byDay.set(day, entry);
  }
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = easternDay(new Date(now.getTime() - i * 86400000));
    const e = byDay.get(date);
    last7Days.push({ date, opens: e ? e.opens : 0, visitors: e ? e.ids.size : 0 });
  }

  // Busiest devices (who is opening it a lot), with any guest names seen on that device.
  const devices = new Map();
  for (const v of opens) {
    const d = devices.get(v.visitorId) || { device: shortId(v.visitorId), opens: 0, lastOpenAt: null, guestIds: new Set() };
    d.opens += 1;
    d.lastOpenAt = d.lastOpenAt && d.lastOpenAt > v.at ? d.lastOpenAt : v.at;
    devices.set(v.visitorId, d);
  }
  for (const v of visits) {
    if (v.personId && devices.has(v.visitorId)) devices.get(v.visitorId).guestIds.add(v.personId);
  }
  const topDevices = [...devices.values()]
    .sort((a, b) => b.opens - a.opens || (b.lastOpenAt > a.lastOpenAt ? 1 : -1))
    .slice(0, 10)
    .map(({ guestIds, ...d }) => ({ ...d, guests: [...guestIds].map(nameOf) }));

  // How often each guest has tapped "That's me".
  const clicks = new Map();
  for (const v of signins) {
    const c = clicks.get(v.personId) || { personId: v.personId, name: nameOf(v.personId), count: 0, lastAt: null };
    c.count += 1;
    c.lastAt = c.lastAt && c.lastAt > v.at ? c.lastAt : v.at;
    clicks.set(v.personId, c);
  }
  const signIns = [...clicks.values()].sort((a, b) => b.count - a.count || (b.lastAt > a.lastAt ? 1 : -1));

  const todays = byDay.get(today);
  return {
    totalOpens: opens.length,
    uniqueVisitors: new Set(opens.map((v) => v.visitorId)).size,
    opensToday: todays ? todays.opens : 0,
    visitorsToday: todays ? todays.ids.size : 0,
    devices: {
      mobile: opens.filter((v) => v.device === 'mobile').length,
      desktop: opens.filter((v) => v.device === 'desktop').length,
    },
    lastOpenAt: opens.reduce((latest, v) => (v.at > latest ? v.at : latest), '') || null, // max, not "last row"
    last7Days,
    topDevices,
    signIns,
  };
}

/*
 * Identity is an honor system: the visitor picks who they are on the "Who are you?" screen and the
 * page sends that person's id in the x-person-id header. The site itself sits behind a password.
 * Anyone can read; you can only add/change/remove your own RSVP and your own dishes.
 */
function createHandler(getDb, { now = () => new Date(), maxVisits = MAX_VISITS } = {}) {
  return async (event) => {
    const parts = event.path
      .replace(/^\/(\.netlify\/functions\/api|api)\/?/, '')
      .split('/')
      .filter(Boolean);
    const [name, id] = parts;
    const isTracking = name === 'visit' || name === 'stats';
    if (!(COLLECTIONS.has(name) || isTracking) || parts.length > 2 || (isTracking && id)) {
      return json(404, { error: 'Not found' });
    }

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

      if (name === 'stats') {
        if (method !== 'GET') return json(405, { error: 'Method not allowed' });
        return json(200, await buildStats(db, now()));
      }

      if (name === 'visit') {
        // The public hit counter shown in the page footer: just the number of page opens (taps on "That's me" excluded).
        if (method === 'GET') return json(200, { opens: await col.countDocuments({ kind: 'open' }) });
        if (method !== 'POST') return json(405, { error: 'Method not allowed' });
        const visitorId = body.visitorId;
        if (typeof visitorId !== 'string' || !VISITOR_ID.test(visitorId)) return json(400, { error: 'Invalid visitor id' });
        const kind = body.kind === undefined ? 'open' : body.kind;
        if (!VISIT_KINDS.has(kind)) return json(400, { error: 'Invalid kind' });

        let personId = actor.slice(0, 64) || null; // an open: whoever this device already remembers
        let via; // only sign-ins carry one
        if (kind === 'signin') {
          via = body.via === undefined ? 'pick' : body.via;
          if (!SIGNIN_VIA.has(via)) return json(400, { error: 'Invalid via' });
          // a "That's me" tap names the guest that was just picked (the device doesn't remember them yet)
          personId = typeof body.personId === 'string' ? body.personId.trim() : '';
          if (!personId || personId.length > 64) return json(400, { error: 'Pick a guest' });
        }
        if ((await col.countDocuments({})) >= maxVisits) return json(200, { ok: true, counted: false });
        await col.insertOne({
          _id: crypto.randomUUID(),
          at: now().toISOString(),
          kind,
          visitorId,
          personId,
          ...(via ? { via } : {}),
          device: deviceOf((event.headers || {})['user-agent']),
        });
        return json(201, { ok: true });
      }

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
