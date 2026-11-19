# Party Planner

Family Christmas party page: who's coming + a food signup. Static page in `public/`, one Netlify Function (`netlify/functions/api.js`) backed by MongoDB Atlas (database `partyplanner`, collections `person` and `food`, created on first write).

## Deploy (Netlify)
1. Netlify → Add new site → Import from GitHub → pick this repo. Build settings are read from `netlify.toml` (no build command; publish `public`).
2. Site configuration → Environment variables → add `MONGODB_URI` = your Atlas connection string for the `partyplanner-app` user (readWrite on `partyplanner` only). Mark it **Secret**.
3. Trigger a redeploy so the function sees the variable.
4. Optional: Site configuration → Change site name for a nicer `*.netlify.app` URL.

## Edit the party details
`public/index.html`, the `<dl class="details">` block (date, place, notes).

## Develop
```
npm install
npm test
```
Tests use an in-memory stand-in for the database. To run against the real DB locally: `npx netlify dev` with `MONGODB_URI` in a git-ignored `.env`.

## How editing works
No logins. Creating an entry returns a random token, saved in that browser's localStorage; the server stores only its hash. Edit/Remove need that token, so people can only change their own entries from the same device.
