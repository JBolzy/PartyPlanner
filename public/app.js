(() => {
  const CATEGORIES = [
    ['side', 'Sides', '🥗'],
    ['dessert', 'Desserts', '🍰'],
    ['drink', 'Drinks', '🥤'],
    ['other', 'Other', '🍽️'],
  ];
  const ME_KEY = 'partyplanner.me.v1';
  const $ = (id) => document.getElementById(id);

  // "Who are you?" is an honor system: whoever you pick is who the server treats you as.
  let me = localStorage.getItem(ME_KEY) || null;
  const state = { person: [], food: [] };
  const editing = { person: false, foodId: null };
  const ui = { foodFormOpen: false }; // the add-a-dish form is collapsed until asked for

  async function api(method, path, body) {
    const res = await fetch(`/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(me ? { 'x-person-id': me } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids) n.append(kid);
    return n; // all text goes through append() => rendered as text, never HTML
  };

  const meGuest = () => state.person.find((p) => p.id === me) || null;
  const norm = (s) => s.trim().toLowerCase();
  // Entries made before dishes were linked to guests only have a typed name.
  const bringerOf = (f) => (state.person.find((p) => p.id === f.personId) || {}).name || f.bringerName || 'someone';

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // "2 adults · 1 kid". RSVPs made before adults/kids were asked only have a total.
  function groupLabel(p) {
    if (p.partySize <= 1) return '';
    if (p.adults == null) return `party of ${p.partySize}`;
    return p.kids ? `${plural(p.adults, 'adult', 'adults')} · ${plural(p.kids, 'kid', 'kids')}` : plural(p.adults, 'adult', 'adults');
  }

  function setMe(id) {
    me = id;
    if (id) localStorage.setItem(ME_KEY, id);
    else localStorage.removeItem(ME_KEY);
    editing.person = false;
    editing.foodId = null;
    ui.foodFormOpen = false;
    forms.food.reset();
    render();
    window.scrollTo({ top: 0 });
  }

  function actions(onEdit, onRemove) {
    return el('div', { class: 'row-actions' },
      el('button', { type: 'button', onclick: onEdit }, 'Edit'),
      el('button', { type: 'button', class: 'del', onclick: onRemove }, 'Remove'),
    );
  }

  function renderGate() {
    const sel = $('gate-person');
    sel.replaceChildren();
    if (!state.person.length) {
      sel.append(el('option', { value: '', disabled: '' }, 'No one yet. RSVP below'));
      return;
    }
    sel.append(el('option', { value: '', disabled: '', selected: '' }, 'Choose your name…'));
    for (const p of state.person) sel.append(el('option', { value: p.id }, p.name));
    sel.value = '';
  }

  function renderPeople() {
    const list = $('guest-list');
    list.replaceChildren();
    const total = state.person.reduce((n, p) => n + p.partySize, 0);
    const kids = state.person.reduce((n, p) => n + (p.kids || 0), 0);
    $('guest-count').replaceChildren(...(state.person.length ? [
      plural(total, 'person', 'people'),
      el('small', {}, kids ? `${plural(total - kids, 'adult', 'adults')} · ${plural(kids, 'kid', 'kids')}` : plural(total, 'adult', 'adults')),
    ] : []));
    if (!state.person.length) {
      list.append(el('li', { class: 'empty' }, 'No one yet. Be the first!'));
      return;
    }
    for (const p of state.person) {
      const dishes = state.food.filter((f) => f.personId === p.id).map((f) => f.dish);
      const text = el('div', {},
        el('span', { class: 'who' }, p.name),
        p.id === me ? el('span', { class: 'you' }, 'you') : '',
        groupLabel(p) ? el('span', { class: 'badge' }, groupLabel(p)) : '',
        p.note ? el('span', { class: 'sub' }, p.note) : '',
        dishes.length ? el('span', { class: 'sub bringing' }, `Bringing: ${dishes.join(', ')}`) : '',
      );
      list.append(el('li', {}, text, p.id === me ? actions(startEditPerson, removeMe) : ''));
    }
  }

  function renderFood() {
    const root = $('food-list');
    root.replaceChildren();
    $('food-count').textContent =
      state.food.length ? `${state.food.length} ${state.food.length === 1 ? 'dish' : 'dishes'}` : '';
    const known = new Set(CATEGORIES.map(([key]) => key));
    for (const [key, label, icon] of CATEGORIES) {
      // Entries with a retired category (e.g. an old "main") are shown under Other, not hidden.
      const items = state.food.filter((f) =>
        key === 'other' ? !known.has(f.category) || f.category === 'other' : f.category === key);
      if (!items.length && key === 'other') continue;
      const panel = el('section', { class: `cat-panel cat-${key}${items.length ? '' : ' is-empty'}` },
        el('header', { class: 'cat-head' },
          el('span', { class: 'cat-icon', 'aria-hidden': 'true' }, icon),
          el('h4', {}, label),
          items.length ? el('span', { class: 'cat-count' }, String(items.length)) : el('span', { class: 'cat-none' }, 'Nothing yet'),
        ));
      if (items.length) {
        const ul = el('ul', { class: 'dishes' });
        for (const f of items) {
          ul.append(el('li', { class: 'dish' },
            el('div', {}, el('span', { class: 'who' }, f.dish), el('span', { class: 'sub' }, `from ${bringerOf(f)}`)),
            f.personId === me ? actions(() => startEditFood(f.id), () => removeFood(f.id)) : '',
          ));
        }
        panel.append(ul);
      }
      root.append(panel);
    }
  }

  function render() {
    // If the guest you picked no longer exists (removed from another device), go back to "Who are you?".
    if (me && !meGuest()) {
      me = null;
      localStorage.removeItem(ME_KEY);
    }
    const signedIn = Boolean(me);
    $('gate').hidden = signedIn;
    $('app').hidden = !signedIn;
    // Countdown, party details and the calendar button only show once someone has signed in.
    $('party-details').hidden = !signedIn;
    if (!signedIn) return renderGate();

    $('me-name').textContent = meGuest().name;
    $('guest-form').hidden = !editing.person;
    const formOpen = ui.foodFormOpen || Boolean(editing.foodId);
    forms.food.hidden = !formOpen;
    $('add-dish-btn').hidden = formOpen;
    $('add-dish-btn').textContent = state.food.some((f) => f.personId === me) ? '+ Add another dish' : '+ Add a dish';
    $('food-form-title').textContent = editing.foodId ? 'Edit your dish' : `Add a dish for ${meGuest().name}`;
    forms.food.querySelector('.primary').textContent = editing.foodId ? 'Save changes' : 'Add dish';
    renderPeople();
    renderFood();
  }

  const forms = { rsvp: $('rsvp-form'), person: $('guest-form'), food: $('food-form') };
  const showError = (form, msg) => { form.querySelector('.error').textContent = msg; };

  // "Total: 3 people" = adults + kids, kept live as you type.
  function syncTotal(form) {
    const n = (Number(form.elements.adults.value) || 0) + (Number(form.elements.kids.value) || 0);
    form.querySelector('[data-total] strong').textContent = plural(n, 'person', 'people');
  }
  for (const form of [forms.rsvp, forms.person]) form.addEventListener('input', () => syncTotal(form));
  const resetRsvp = () => { forms.rsvp.reset(); syncTotal(forms.rsvp); };

  function startEditPerson() {
    const mine = meGuest();
    const form = forms.person;
    form.elements.name.value = mine.name;
    form.elements.adults.value = mine.adults ?? mine.partySize; // older RSVPs only have a total
    form.elements.kids.value = mine.kids ?? 0;
    syncTotal(form);
    form.elements.note.value = mine.note || '';
    showError(form, '');
    editing.person = true;
    render();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function startEditFood(id) {
    const dish = state.food.find((f) => f.id === id);
    if (!dish) return;
    const form = forms.food;
    form.elements.dish.value = dish.dish;
    form.elements.category.value = CATEGORIES.some(([key]) => key === dish.category) ? dish.category : 'other';
    showError(form, '');
    editing.foodId = id;
    render();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function removeMe() {
    const n = state.food.filter((f) => f.personId === me).length;
    const msg = n
      ? `Remove yourself and your ${n} ${n === 1 ? 'dish' : 'dishes'}?`
      : 'Remove yourself from the list?';
    if (!confirm(msg)) return;
    try {
      await api('DELETE', `person/${me}`);
      state.person = state.person.filter((p) => p.id !== me);
      state.food = state.food.filter((f) => f.personId !== me);
      setMe(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function removeFood(id) {
    if (!confirm('Remove this dish?')) return;
    try {
      await api('DELETE', `food/${id}`);
      state.food = state.food.filter((f) => f.id !== id);
      render();
    } catch (err) {
      alert(err.message);
    }
  }

  // Run a form submit with a disabled button and an inline error message.
  function onSubmit(form, handler) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.primary');
      showError(form, '');
      btn.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(form)));
      } catch (err) {
        showError(form, err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  $('gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('gate-person').value;
    if (id) setMe(id);
  });

  onSubmit(forms.rsvp, async (body) => {
    // Typing a name that is already on the list signs you in as that person instead of making a duplicate.
    const existing = state.person.find((p) => norm(p.name) === norm(body.name));
    if (existing) { resetRsvp(); return setMe(existing.id); }
    try {
      const created = await api('POST', 'person', body);
      state.person.push(created);
      resetRsvp();
      setMe(created.id);
    } catch (err) {
      if (err.status === 409 && err.data.existingId) {
        await load(); // someone else just added the same name; sign in as them
        resetRsvp();
        return setMe(err.data.existingId);
      }
      throw err;
    }
  });

  onSubmit(forms.person, async (body) => {
    const updated = await api('PUT', `person/${me}`, body);
    state.person = state.person.map((p) => (p.id === me ? updated : p));
    editing.person = false;
    render();
  });
  forms.person.querySelector('.cancel').addEventListener('click', () => { editing.person = false; render(); });

  onSubmit(forms.food, async (body) => {
    if (editing.foodId) {
      const updated = await api('PUT', `food/${editing.foodId}`, body);
      state.food = state.food.map((f) => (f.id === editing.foodId ? updated : f));
      editing.foodId = null;
    } else {
      state.food.push(await api('POST', 'food', body));
    }
    forms.food.reset();
    ui.foodFormOpen = false;
    render();
  });
  forms.food.querySelector('.cancel').addEventListener('click', () => {
    editing.foodId = null;
    ui.foodFormOpen = false;
    forms.food.reset();
    showError(forms.food, '');
    render();
  });
  $('add-dish-btn').addEventListener('click', () => {
    ui.foodFormOpen = true;
    render();
    forms.food.elements.dish.focus();
    forms.food.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('not-me').addEventListener('click', () => setMe(null));

  async function load() {
    [state.person, state.food] = await Promise.all([api('GET', 'person'), api('GET', 'food')]);
    $('loading').hidden = true;
    render();
  }

  load().catch(() => { $('loading').textContent = 'Could not load the list. Refresh to retry.'; });

  // Pick up other people's changes when someone comes back to the tab.
  document.addEventListener('visibilitychange', () => {
    // ($('loading').hidden is true once the first load succeeded.)
    if (document.visibilityState === 'visible' && $('loading').hidden) load().catch(() => {});
  });
})();
