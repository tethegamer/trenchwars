const { createApp } = require('./app');
const port = process.env.PORT || 3000;
const app = createApp({ dbFile: process.env.DATA_FILE || require('path').join(__dirname, 'data', 'db.json') });
if (!process.env.ADMIN_PASSWORD) console.warn('⚠ ADMIN_PASSWORD not set — admin page disabled');
const srv = app.listen(port, () => console.log(`TrenchWars on http://localhost:${port}`));
const bye = () => { app.locals.db.flush(); srv.close(() => process.exit(0)); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
