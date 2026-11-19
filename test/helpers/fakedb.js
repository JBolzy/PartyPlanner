// Minimal in-memory stand-in for the subset of the mongodb driver the API uses.
// `stores` is exposed so tests can look at exactly what was written.
function fakeDb() {
  const stores = {};
  const db = {
    collection(name) {
      const rows = (stores[name] ||= []);
      return {
        find: () => ({ sort: () => ({ toArray: async () => rows.map((r) => ({ ...r })) }) }),
        findOne: async (q) => rows.find((r) => r._id === q._id) || null,
        countDocuments: async (q = {}) => rows.filter((r) => Object.entries(q).every(([k, v]) => r[k] === v)).length,
        insertOne: async (d) => void rows.push({ ...d }),
        updateOne: async (q, u) => void Object.assign(rows.find((r) => r._id === q._id), u.$set),
        deleteOne: async (q) => void rows.splice(rows.findIndex((r) => r._id === q._id), 1),
        deleteMany: async (q) => {
          const keep = rows.filter((r) => Object.entries(q).some(([k, v]) => r[k] !== v));
          const deletedCount = rows.length - keep.length;
          rows.splice(0, rows.length, ...keep);
          return { deletedCount };
        },
      };
    },
  };
  return { db, stores };
}
module.exports = { fakeDb };
