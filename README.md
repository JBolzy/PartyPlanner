# Party Planner

Family Christmas party page: who's coming + a food signup. Static page in `public/`, one Netlify Function (`netlify/functions/api.js`) backed by MongoDB Atlas (database `partyplanner`, collections `person` and `food`, created on first write).

## Deploy (Netlify)
1. Netlify → Add new site → Import from GitHub → pick this repo. Build settings are read from `netlify.toml` (no build command; publish `public`).
2. Site configuration → Environment variables → add `MONGODB_URI` = your Atlas connection string for the `partyplanner-app` user (readWrite on `partyplanner` only). Mark it **Secret**.
3. Trigger a redeploy so the function sees the variable.
4. Optional: Site configuration → Change site name for a nicer `*.netlify.app` URL.

## Develop
```
npm install
npm test
```
Tests use an in-memory stand-in for the database. To run against the real DB locally: `npx netlify dev` with `MONGODB_URI` in a git-ignored `.env`.

## How "who are you" works
No passwords on the app itself (put the site behind Netlify's site password). On first load a visitor either picks their name from the list or RSVPs (name + group size). The page remembers the choice on that device, and it works from any device by picking the name again. The page sends the chosen guest id in an `x-person-id` header; the API only lets that guest add, edit or remove their own RSVP and dishes. Everyone can read everything. This is an honor system: anyone can pick any name.

## Usage stats
Each page open and each tap on "That's me" is logged to the `visit` collection (`POST /api/visit`): time, a random anonymous device id, the guest (if known), and a mobile/desktop flag. No IP address and no browser string are stored, and the log is capped at 50,000 rows.

Read it at `/api/stats` (while signed in to the site password): total opens, unique devices, opens today, the last 7 days (Eastern time), the mobile/desktop split, the 10 busiest devices (short device id, opens, last open, and the guests seen on that device) and how many times each guest has tapped "That's me".
