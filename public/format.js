// Small text helpers shared by the page (and unit-tested in Node).
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The pills shown next to every guest: an adults pill ("1 adult", "2 adults") that every guest gets, plus a
// separate kids pill ("1 kid", "2 kids") only when there are kids. RSVPs made before adults/kids were asked
// only have a total, so they get a single "party of N" pill.
function groupPills(p) {
  if (p.adults == null) {
    return [{ text: p.partySize > 1 ? `party of ${p.partySize}` : plural(1, 'adult', 'adults'), kind: 'adult' }];
  }
  const pills = [{ text: plural(p.adults, 'adult', 'adults'), kind: 'adult' }];
  if (p.kids) pills.push({ text: plural(p.kids, 'kid', 'kids'), kind: 'kid' });
  return pills;
}

if (typeof module !== 'undefined') module.exports = { plural, groupPills };
