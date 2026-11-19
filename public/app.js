(() => {
  const CATEGORIES = [
    ['side', 'Sides'],
    ['dessert', 'Desserts'],
    ['drink', 'Drinks'],
    ['other', 'Other'],
  ];

  // Line icons (24x24, stroked in the panel's colour). Built with createElementNS, never innerHTML.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    side: ['M3 11h18a9 9 0 0 1-18 0z', 'M8 11c0-3 2-5 4-5s4 2 4 5'], // salad bowl
    dessert: ['M6 13h12l-1.5 8h-9z', 'M5 13a7 7 0 0 1 14 0', 'M12 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0'], // cupcake
    drink: ['M6 8h12l-1.5 13h-9z', 'M5 8h14', 'M13 8l1.5-5h3'], // cup with straw
    other: ['M5 3v6a3 3 0 0 0 6 0V3', 'M8 3v6', 'M8 12v9', 'M17 21V3c-2 1.5-3 4-3 7s1 3 3 3'], // fork and knife
  };
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of Object.entries({
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    })) svg.setAttribute(k, v);
    for (const d of ICONS[name]) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }
  const ME_KEY = 'partyplanner.me.v1';
  const $ = (id) => document.getElementById(id);

  // "Who are you?" is an honor system: whoever you pick is who the server treats you as.
  let me = localStorage.getItem(ME_KEY) || null;
  // ---- Anonymous usage counting: one note per page open, and one per tap on "That's me". It sends a random
  // device id (no name, no IP), and a failure here can never break the page.
  const VISITOR_KEY = 'partyplanner.visitor.v1';
  function visitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-dev`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }
  function track(kind, personId, via) {
    try {
      return fetch('/api/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(me ? { 'x-person-id': me } : {}) },
        body: JSON.stringify({ visitorId: visitorId(), kind, ...(personId ? { personId } : {}), ...(via ? { via } : {}) }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* tracking must never break the page */ }
    return Promise.resolve();
  }

  // Fine print at the bottom: how many times the page has been opened (this open included).
  async function showOpenCount() {
    try {
      const { opens } = await api('GET', 'visit');
      const el = $('open-count');
      el.textContent = `Opened ${opens.toLocaleString()} ${opens === 1 ? 'time' : 'times'}`;
      el.hidden = false;
    } catch { /* the counter is a nicety; if it fails, just don't show it */ }
  }

  const state = { person: [], food: [] };
  const editing = { person: false, foodId: null };
  // Both start collapsed: the add-a-dish form, and the "Who's coming" list (only its headcount shows).
  const ui = { foodFormOpen: false, guestsOpen: false };

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

  // plural() and groupPills() come from format.js (loaded before this file).

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
      sel.append(el('option', { value: '', disabled: '' }, 'No one on the list yet. RSVP below'));
      return;
    }
    sel.append(el('option', { value: '', disabled: '', selected: '' }, 'Find your name in the list…'));
    for (const p of state.person) sel.append(el('option', { value: p.id }, p.name));
    sel.value = '';
  }

  function renderPeople() {
    const list = $('guest-list');
    list.replaceChildren();
    $('guest-count').textContent = headcountSummary(state.person); // "29 people | 22 adults · 7 kids"
    if (!state.person.length) {
      list.append(el('li', { class: 'empty' }, 'No one yet. Be the first!'));
      return;
    }
    for (const p of state.person) {
      const dishes = state.food.filter((f) => f.personId === p.id).map((f) => f.dish);
      const text = el('div', {},
        el('span', { class: 'who' }, p.name),
        p.id === me ? el('span', { class: 'you' }, 'you') : '',
        ...groupPills(p).map(({ text, kind }) => el('span', { class: `badge badge-${kind}` }, text)),
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
    for (const [key, label] of CATEGORIES) {
      // Entries with a retired category (e.g. an old "main") are shown under Other, not hidden.
      const items = state.food.filter((f) =>
        key === 'other' ? !known.has(f.category) || f.category === 'other' : f.category === key);
      if (!items.length && key === 'other') continue;
      const panel = el('section', { class: `cat-panel cat-${key}${items.length ? '' : ' is-empty'}` },
        el('header', { class: 'cat-head' },
          el('span', { class: 'cat-icon', 'aria-hidden': 'true' }, icon(key)),
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
    if (!signedIn) {
      renderGate();
      refreshAllSubmits();
      return;
    }

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
    setGuestsOpen(ui.guestsOpen);
    refreshAllSubmits();
  }

  const forms = { rsvp: $('rsvp-form'), person: $('guest-form'), food: $('food-form') };
  const showError = (form, msg) => { form.querySelector('.error').textContent = msg; };

  // Submit buttons stay disabled until the form has what it needs: every required text box has real text
  // (spaces don't count), every required choice is made, and numbers are in range.
  const submitForms = [$('gate-form'), forms.rsvp, forms.person, forms.food];
  function isReady(form) {
    const textFilled = [...form.querySelectorAll('input[required]')]
      .filter((i) => i.type !== 'number')
      .every((i) => i.value.trim() !== '');
    return textFilled && form.checkValidity();
  }
  function refreshSubmit(form) {
    const btn = form.querySelector('.primary');
    if (btn) btn.disabled = !isReady(form);
  }
  const refreshAllSubmits = () => submitForms.forEach(refreshSubmit);
  for (const form of submitForms) {
    form.addEventListener('input', () => refreshSubmit(form));
    form.addEventListener('change', () => refreshSubmit(form));
  }

  // "Total: 3 people" = adults + kids, kept live as you type.
  function syncTotal(form) {
    const n = (Number(form.elements.adults.value) || 0) + (Number(form.elements.kids.value) || 0);
    form.querySelector('[data-total] strong').textContent = plural(n, 'person', 'people');
  }
  for (const form of [forms.rsvp, forms.person]) form.addEventListener('input', () => syncTotal(form));
  const resetRsvp = () => { forms.rsvp.reset(); syncTotal(forms.rsvp); refreshSubmit(forms.rsvp); };

  function setGuestsOpen(open) {
    ui.guestsOpen = open;
    $('guests-toggle').setAttribute('aria-expanded', String(open));
    $('guests-body').hidden = !open;
  }
  $('guests-toggle').addEventListener('click', () => setGuestsOpen(!ui.guestsOpen));

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
    setGuestsOpen(true); // the edit form lives inside the collapsible part
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
        refreshSubmit(form); // enabled again only if the form still has what it needs
      }
    });
  }

  $('gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('gate-person').value;
    if (id) {
      track('signin', id, 'pick'); // a "That's me" tap
      setMe(id);
    }
  });

  onSubmit(forms.rsvp, async (body) => {
    // Typing a name that is already on the list signs you in as that person instead of making a duplicate.
    const existing = state.person.find((p) => norm(p.name) === norm(body.name));
    if (existing) { resetRsvp(); track('signin', existing.id, 'rsvp'); return setMe(existing.id); }
    try {
      const created = await api('POST', 'person', body);
      state.person.push(created);
      resetRsvp();
      track('signin', created.id, 'rsvp'); // a new guest's first identification
      setMe(created.id);
    } catch (err) {
      if (err.status === 409 && err.data.existingId) {
        await load(); // someone else just added the same name; sign in as them
        resetRsvp();
        track('signin', err.data.existingId, 'rsvp'); // someone else just added the same name
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

  track('open').then(showOpenCount); // count our own open first so the number includes it
  load().catch(() => { $('loading').textContent = 'Could not load the list. Refresh to retry.'; });

  // Pick up other people's changes when someone comes back to the tab.
  document.addEventListener('visibilitychange', () => {
    // ($('loading').hidden is true once the first load succeeded.)
    if (document.visibilityState === 'visible' && $('loading').hidden) load().catch(() => {});
  });
})();
