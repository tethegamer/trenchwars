const { createApp } = require('./app');
const port = process.env.PORT || 3000;
// Public randomness: poll latest finalized Solana blockhash (set PUBLIC_RANDOMNESS=off to disable)
let latest = null; const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
async function poll() { try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'finalized' }] }), signal: AbortSignal.timeout(5000) });
  const j = await r.json(); if (j.result) latest = { hash: j.result.value.blockhash, slot: j.result.context.slot, at: Date.now() }; } catch {} }
if (process.env.PUBLIC_RANDOMNESS !== 'off') { poll(); setInterval(poll, 15000).unref(); }
const app = createApp({ publicRandomness: () => (latest && Date.now() - latest.at < 120000 ? latest : null), dbFile: process.env.DATA_FILE || require('path').join(__dirname, 'data', 'db.json') });
if (!process.env.ADMIN_PASSWORD) console.warn('⚠ ADMIN_PASSWORD not set — admin page disabled');
const srv = app.listen(port, () => console.log(`TrenchWars on http://localhost:${port}`));
const bye = () => { app.locals.db.flush(); srv.close(() => process.exit(0)); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
