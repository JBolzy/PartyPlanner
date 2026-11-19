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

function validatePerson(body) {
  const name = required('Name', body.name, 60);
  if (name.error) return fail(name.error);

  const note = str(body.note ?? '');
  if (note === null) return fail('Note must be text');
  if (note.length > 200) return fail('Note must be 200 characters or fewer');

  const rawSize = body.partySize ?? 1;
  const size = typeof rawSize === 'string' && rawSize.trim() !== '' ? Number(rawSize) : rawSize;
  if (!Number.isInteger(size) || size < 1 || size > 20) {
    return fail('Party size must be a whole number from 1 to 20');
  }
  return { ok: true, value: { name: name.value, partySize: size, note } };
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
