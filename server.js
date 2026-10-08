// Single Vercel entrypoint.
// Vercel auto-detects this CommonJS export as the Express application.
// Do NOT call app.listen() in this file; local listening lives in scripts/local-server.js.
const app = require('./src/application');
module.exports = app;
