const crypto = require('node:crypto');

const newToken = () => crypto.randomBytes(24).toString('hex');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function tokenMatches(token, hash) {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { newToken, hashToken, tokenMatches };
