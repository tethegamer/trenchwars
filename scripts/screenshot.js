// Headless browser smoke test + screenshots. CHROME_PATH=/usr/bin/google-chrome node scripts/screenshot.js [outdir]
const puppeteer = require('puppeteer-core'), os = require('os'), path = require('path'), fs = require('fs');
const { createApp } = require('../app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = process.argv[2] || '/workspace'; const extra = path.join(out, 'tw-shots'); fs.mkdirSync(extra, { recursive: true });
  const app = createApp({ dbFile: path.join(os.tmpdir(), 'tw-shot-' + Date.now() + '.json'), adminPassword: 'x', publicRandomness: () => ({ hash: 'CbBa9Hv3zctNmx43LX3n3S6UitS1rd4f71qBbisRSrD9', slot: 457501004 }) });
  const srv = app.listen(0); const url = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, b, tok, h = {}) => fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...h }, body: JSON.stringify(b) }).then(r => r.json());
  // seed demo activity
  await post('/api/admin/prizes', { title: 'Week 42 Prize Pool', note: 'Paid in $BONK to winners\' connected wallets within 48h.', items: [{ prize: '5,000,000 $BONK' }, { prize: '2,000,000 $BONK' }, { prize: '1,000,000 $BONK' }, { prize: '250,000 $BONK' }, { prize: '250,000 $BONK' }] }, null, { 'x-admin-password': 'x' });
  for (const n of ['moonboi', 'rugsurvivor', 'gigachad_sol', 'pepe_maxi', 'wifhat', 'ape_lord', 'bonkbonk']) {
    const { token } = await post('/api/auth/username', { username: n, password: 'hunter22' }); await post('/api/claim', {}, token);
    for (let i = 0; i < 6; i++) await post('/api/coinflip', { bet: 50 + Math.floor(Math.random() * 300), pick: i % 2 ? 'heads' : 'tails' }, token);
  }
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text()) && errs.push(m.text()));
  await p.setViewport({ width: 1440, height: 900 }); await p.goto(url + '/#/'); await sleep(600);
  await p.screenshot({ path: path.join(extra, 'lobby-loggedout.png') });
  await p.click('#loginTop'); await p.type('#uName', 'degen_dave'); await p.type('#uPass', 'hunter22'); await p.click('#userBtn');
  await p.waitForSelector('#walletBox:not(.hide)'); await p.click('#claimTop'); await sleep(2500);
  await p.screenshot({ path: path.join(out, 'trenchwars-v2-desktop.png') });
  // play each game
  await p.goto(url + '/#/flip'); await sleep(400); await p.click('#flipGo'); await sleep(1800); await p.screenshot({ path: path.join(extra, 'flip.png') });
  await p.goto(url + '/#/bj'); await sleep(400); await p.click('#bjDeal'); await sleep(900);
  const bjCards = await p.$$eval('#pHand .pc', e => e.length); await p.screenshot({ path: path.join(extra, 'bj.png') });
  if (await p.$eval('#bjStand', e => !e.disabled)) await p.click('#bjStand'); await sleep(600);
  await p.goto(url + '/#/crash'); await sleep(400); await p.click('#crashGo'); await sleep(2200);
  const mult = await p.$eval('#crashMult', e => e.textContent); await p.screenshot({ path: path.join(extra, 'crash.png') });
  try { await p.click('#crashGo'); } catch { } await sleep(800);
  await p.goto(url + '/#/fair'); await sleep(700); await p.click('#fRotate'); await sleep(700);
  await p.click('[data-check]'); await sleep(700); const verified = await p.$eval('#vBody', e => e.textContent.includes('Verified fair')); await p.screenshot({ path: path.join(extra, 'fair-verify.png') });
  await p.goto(url + '/#/lb'); await sleep(700); await p.screenshot({ path: path.join(extra, 'leaderboard.png') });
  await p.goto(url + '/#/rewards'); await sleep(700); await p.screenshot({ path: path.join(extra, 'rewards.png') });
  await p.goto(url + '/fair'); await sleep(500); await p.screenshot({ path: path.join(extra, 'fair-page.png'), fullPage: true });
  const m = await b.newPage(); m.on('pageerror', e => errs.push(e.message));
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const cookies = await p.cookies(); await m.setCookie(...cookies);
  await m.goto(url + '/#/'); await sleep(1500); await m.screenshot({ path: path.join(out, 'trenchwars-v2-mobile.png') });
  await m.goto(url + '/#/crash'); await sleep(600); await m.screenshot({ path: path.join(extra, 'mobile-crash.png') });
  await m.goto(url + '/#/bj'); await sleep(600); await m.screenshot({ path: path.join(extra, 'mobile-bj.png') });
  console.log(JSON.stringify({ bjCards, crashMult: mult, verified, pageErrors: errs }));
  await b.close(); srv.close(); if (errs.length || bjCards < 2 || !verified) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
