const { MongoClient } = require('mongodb');

let clientPromise;

// Reused across warm invocations so we don't open a new connection per request.
function getDb() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 })
      .connect()
      .catch((err) => {
        clientPromise = undefined;
        throw err;
      });
  }
  return clientPromise.then((c) => c.db('partyplanner'));
}

module.exports = { getDb };
