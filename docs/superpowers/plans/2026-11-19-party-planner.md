# Party Planner Implementation Plan

> For agentic workers: use superpowers:executing-plans. Native execution chosen (user said "go ahead and build it").

**Goal:** Public one-page site with guest list + food signup backed by MongoDB Atlas via Netlify Functions.
**Architecture:** Static page (`public/`) calls `/api/{person|food}`; a single Netlify function `api` (built by `createHandler(getDb)` for testability) talks to DB `partyplanner`.
**Tech Stack:** Vanilla JS, Node 18+, `mongodb` driver, `node:test`.
**Spec:** `docs/superpowers/specs/2026-11-19-party-planner-design.md`

## Global Constraints
- `MONGODB_URI` only from env; never in client code or git.
- DB name `partyplanner`; collections `person`, `food`.
- Edit/delete only with the per-entry token returned once at creation (stored hashed server-side).

## Review Focus
- Blank/whitespace/oversized fields rejected (tested in validate).
- Wrong or missing token on PUT/DELETE → 403 (tested in api).
- Token hash never returned by GET (tested in api).
- HTML in names rendered as text (client uses textContent).
- Unknown collection/path → 404 (tested in api).

## Tasks
1. `lib/validate.js` + `lib/token.js` with tests (`test/validate.test.js`).
2. `lib/api.js` `createHandler(getDb)` + `lib/db.js` + `netlify/functions/api.js`, tested with an in-memory fake db (`test/api.test.js`).
3. `public/index.html`, `style.css`, `app.js` frontend; `netlify.toml`, `package.json`, `.gitignore`, `README.md`.
4. Local smoke test of the static page; commit; push to GitHub.
