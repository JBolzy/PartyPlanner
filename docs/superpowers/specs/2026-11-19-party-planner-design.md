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
- `person`: name, adults (>=1), kids (>=0), partySize (always adults + kids, computed server-side), note. RSVP forms show a live total; older records with only a total are treated as all adults. `food`: dish, personId (references a `person`; chosen from a dropdown of guests, one person can have many dishes; removing a guest removes their dishes), category (side/dessert/drink/other; host provides pizza as the main, so no "main" category).
- Unofficial sign-in (honor system, device-independent): on load the visitor picks their name from the guest dropdown or RSVPs (name + group size; a name already on the list signs you in as that guest). Everyone sees all lists. The client sends the chosen guest id as `x-person-id`; the API lets a guest add/edit/remove only their own RSVP and dishes (401 if nobody picked, 403 if it's not theirs). The site itself is expected to sit behind a Netlify site password.
- Netlify Functions (Node, `mongodb` driver) read `MONGODB_URI` from env; DB user `partyplanner-app` has readWrite on `partyplanner` only.
- Basic validation and length limits server-side.

## Builder's calls
Vanilla JS, no framework; collections created on first write; party details are placeholders the user fills in.
