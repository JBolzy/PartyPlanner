const { createHandler } = require('../../lib/api');
const { getDb } = require('../../lib/db');

exports.handler = createHandler(getDb);
