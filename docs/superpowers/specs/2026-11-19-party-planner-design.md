# Party Planner – Design (short)

**Intent:** Free, simple site for the extended family's Christmas party: who's coming and a food signup so dishes don't overlap.

**Goals:** one public page; guest list; food list; works on phones; zero cost.
**Non-goals:** accounts/logins, email reminders, RSVP deadlines.
**Anti-goals:** exposing the DB connection string; touching the Bolzman Financials Supabase or the `MyWebsite` Mongo database.

## Approaches considered
1. Supabase inside Bolzman Financials – free but sits beside real finance data.
2. **MongoDB Atlas (existing free `MyWebsite` cluster, new `partyplanner` DB) via Netlify Functions – chosen by user** for separation. Needs functions because a connection string can't live in browser code.

## Design
- Static HTML/CSS/vanilla JS page: party details (placeholders for date/time/address), **Who's coming** list, **What we're bringing** list, add forms.
- `person`: name, partySize, note. `food`: dish, personId (references a `person`; chosen from a dropdown of guests, one person can have many dishes; removing a guest removes their dishes), category (side/dessert/drink/other; host provides pizza as the main, so no "main" category).
- No logins. Anyone with the link can add. Edit/delete only for entries created from the same browser (random edit token stored in localStorage, hashed/compared server-side).
- Netlify Functions (Node, `mongodb` driver) read `MONGODB_URI` from env; DB user `partyplanner-app` has readWrite on `partyplanner` only.
- Basic validation and length limits server-side.

## Builder's calls
Vanilla JS, no framework; collections created on first write; party details are placeholders the user fills in.
