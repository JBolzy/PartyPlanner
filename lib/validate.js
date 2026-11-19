const CATEGORIES = ['side', 'dessert', 'drink', 'other']; // pizza (the main) is provided by the host

const str = (v) => (typeof v === 'string' ? v.trim() : null);

function fail(error) {
  return { ok: false, error };
}

function required(label, v, max) {
  const s = str(v);
  if (!s) return { error: `${label} is required` };
  if (s.length > max) return { error: `${label} must be ${max} characters or fewer` };
  return { value: s };
}

// A whole number in [min, max]. Form fields arrive as strings.
function count(label, raw, min, max) {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!Number.isInteger(n) || n < min || n > max) return { error: `${label} must be a whole number from ${min} to ${max}` };
  return { value: n };
}

function validatePerson(body) {
  const name = required('Name', body.name, 60);
  if (name.error) return fail(name.error);

  const note = str(body.note ?? '');
  if (note === null) return fail('Note must be text');
  if (note.length > 200) return fail('Note must be 200 characters or fewer');

  // partySize (the total) is always adults + kids. A page cached from before the split still sends
  // only partySize; treat that as adults.
  const adults = count('Adults', body.adults ?? body.partySize ?? 1, 1, 20);
  if (adults.error) return fail(adults.error);
  const kids = count('Kids', body.kids === '' || body.kids == null ? 0 : body.kids, 0, 20);
  if (kids.error) return fail(kids.error);

  return {
    ok: true,
    value: { name: name.value, adults: adults.value, kids: kids.value, partySize: adults.value + kids.value, note },
  };
}

function validateFood(body) {
  // Who is bringing it is NOT read from the body: the API uses the signed-in guest (x-person-id).
  const dish = required('Dish', body.dish, 80);
  if (dish.error) return fail(dish.error);
  if (!CATEGORIES.includes(body.category)) return fail('Pick a category');
  return { ok: true, value: { dish: dish.value, category: body.category } };
}

const validators = { person: validatePerson, food: validateFood };

function validate(collection, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request');
  return validators[collection](body);
}

module.exports = { validate, CATEGORIES };
