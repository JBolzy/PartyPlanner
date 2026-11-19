(() => {
  const CATEGORIES = [
    ['side', 'Sides'],
    ['dessert', 'Desserts'],
    ['drink', 'Drinks'],
    ['other', 'Other'],
  ];
  const TOKEN_KEY = 'partyplanner.tokens.v1';
  const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}'); // { "person:<id>": token }
  const saveTokens = () => localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  const mine = (kind, id) => Boolean(tokens[`${kind}:${id}`]);

  const state = { person: [], food: [] };
  const editing = { person: null, food: null };

  async function api(method, path, body, token) {
    const res = await fetch(`/api/${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { 'x-edit-token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
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

  function rowActions(kind, id) {
    if (!mine(kind, id)) return '';
    return el('div', { class: 'row-actions' },
      el('button', { type: 'button', onclick: () => startEdit(kind, id) }, 'Edit'),
      el('button', { type: 'button', class: 'del', onclick: () => remove(kind, id) }, 'Remove'),
    );
  }

  function renderPeople() {
    const list = document.getElementById('guest-list');
    list.replaceChildren();
    const total = state.person.reduce((n, p) => n + p.partySize, 0);
    document.getElementById('guest-count').textContent =
      state.person.length ? `${total} ${total === 1 ? 'person' : 'people'}` : '';
    if (!state.person.length) {
      list.append(el('li', { class: 'empty' }, 'No one yet. Be the first!'));
      return;
    }
    for (const p of state.person) {
      const text = el('div', {},
        el('span', { class: 'who' }, p.name),
        p.partySize > 1 ? el('span', { class: 'badge' }, `+${p.partySize - 1}`) : '',
        p.note ? el('span', { class: 'sub' }, p.note) : '',
      );
      list.append(el('li', {}, text, rowActions('person', p.id)));
    }
  }

  function renderFood() {
    const root = document.getElementById('food-list');
    root.replaceChildren();
    document.getElementById('food-count').textContent =
      state.food.length ? `${state.food.length} ${state.food.length === 1 ? 'dish' : 'dishes'}` : '';
    const known = new Set(CATEGORIES.map(([key]) => key));
    for (const [key, label] of CATEGORIES) {
      // Entries with a retired category (e.g. an old "main") are shown under Other, not hidden.
      const items = state.food.filter((f) => (key === 'other' ? !known.has(f.category) || f.category === 'other' : f.category === key));
      if (!items.length && key === 'other') continue;
      const cat = el('div', { class: `cat${items.length ? '' : ' empty-cat'}` }, el('h4', {}, label));
      if (!items.length) cat.append(el('p', { class: 'none' }, 'Nothing yet'));
      for (const f of items) {
        cat.append(el('div', { class: 'dish' },
          el('div', {}, el('span', { class: 'who' }, f.dish), el('span', { class: 'sub' }, `from ${f.bringerName}`)),
          rowActions('food', f.id),
        ));
      }
      root.append(cat);
    }
  }

  const render = () => { renderPeople(); renderFood(); };

  const forms = {
    person: document.getElementById('guest-form'),
    food: document.getElementById('food-form'),
  };
  const labels = {
    person: { add: 'Add me', save: 'Save changes', title: ['Count me in', 'Edit your entry'] },
    food: { add: 'Add dish', save: 'Save changes', title: ['Sign up a dish', 'Edit your dish'] },
  };

  function resetForm(kind) {
    const form = forms[kind];
    form.reset();
    if (kind === 'person') form.partySize.value = 1;
    editing[kind] = null;
    form.querySelector('.primary').textContent = labels[kind].add;
    form.querySelector('h3').textContent = labels[kind].title[0];
    form.querySelector('.cancel').hidden = true;
    form.querySelector('.error').textContent = '';
  }

  function startEdit(kind, id) {
    const item = state[kind].find((x) => x.id === id);
    if (!item) return;
    const form = forms[kind];
    for (const field of form.elements) {
      if (field.name && item[field.name] !== undefined) field.value = item[field.name];
    }
    if (kind === 'food' && !form.category.value) form.category.value = 'other'; // retired category
    editing[kind] = id;
    form.querySelector('.primary').textContent = labels[kind].save;
    form.querySelector('h3').textContent = labels[kind].title[1];
    form.querySelector('.cancel').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function remove(kind, id) {
    if (!confirm('Remove this entry?')) return;
    try {
      await api('DELETE', `${kind}/${id}`, null, tokens[`${kind}:${id}`]);
      delete tokens[`${kind}:${id}`];
      saveTokens();
      state[kind] = state[kind].filter((x) => x.id !== id);
      render();
    } catch (err) {
      alert(err.message);
    }
  }

  for (const kind of ['person', 'food']) {
    const form = forms[kind];
    form.querySelector('.cancel').addEventListener('click', () => resetForm(kind));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.primary');
      const errBox = form.querySelector('.error');
      errBox.textContent = '';
      btn.disabled = true;
      const body = Object.fromEntries(new FormData(form));
      try {
        if (editing[kind]) {
          const id = editing[kind];
          const updated = await api('PUT', `${kind}/${id}`, body, tokens[`${kind}:${id}`]);
          state[kind] = state[kind].map((x) => (x.id === id ? updated : x));
        } else {
          const created = await api('POST', kind, body);
          tokens[`${kind}:${created.id}`] = created.editToken;
          saveTokens();
          const { editToken, ...entry } = created;
          state[kind].push(entry);
        }
        resetForm(kind);
        render();
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function load() {
    try {
      [state.person, state.food] = await Promise.all([api('GET', 'person'), api('GET', 'food')]);
      render();
    } catch (err) {
      document.getElementById('guest-list').replaceChildren(el('li', { class: 'empty' }, 'Could not load the list. Refresh to retry.'));
      document.getElementById('food-list').replaceChildren(el('p', { class: 'empty' }, 'Could not load the list. Refresh to retry.'));
    }
  }

  load();
})();
