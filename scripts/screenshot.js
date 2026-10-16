// Headless browser smoke test + screenshot. CHROME_PATH=/usr/bin/google-chrome node scripts/screenshot.js [out.png]
const puppeteer = require('puppeteer-core'), os = require('os'), path = require('path');
const { createApp } = require('../app');
(async () => {
  const app = createApp({ dbFile: path.join(os.tmpdir(), 'tw-shot-' + Date.now() + '.json'), adminPassword: 'x' });
  const srv = app.listen(0); const url = `http://127.0.0.1:${srv.address().port}`;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 1280, height: 900 }); await p.goto(url);
  await p.type('#uName', 'degen_dave'); await p.type('#uPass', 'hunter22'); await p.click('#userBtn');
  await p.waitForSelector('#main:not(.hide)');
  await p.click('#claimBtn'); await new Promise(r => setTimeout(r, 300));
  // blackjack + coinflip in the background to populate leaderboard
  for (let i = 0; i < 5; i++) await p.evaluate(() => fetch('/api/coinflip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bet: 50, pick: 'heads' }) }));
  await p.click('[data-t=bj]'); await p.click('#bjDeal'); await p.waitForSelector('#pHand .pc');
  const bjCards = await p.$$eval('#pHand .pc', e => e.length);
  if (await p.$eval('#bjStand', e => !e.disabled)) await p.click('#bjStand'); await new Promise(r => setTimeout(r, 1500));
  await p.click('[data-t=crash]'); await p.click('#crashGo'); await new Promise(r => setTimeout(r, 1800));
  const mult = await p.$eval('#crashMult', e => e.textContent);
  await p.screenshot({ path: process.argv[2] || '/workspace/trenchwars-screenshot.png' });
  await p.setViewport({ width: 390, height: 844, isMobile: true }); await p.screenshot({ path: (process.argv[2] || '/workspace/trenchwars-screenshot.png').replace('.png', '-mobile.png') });
  console.log(JSON.stringify({ bjCards, crashMult: mult, pageErrors: errs }));
  await b.close(); srv.close(); if (errs.length || bjCards < 2) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
