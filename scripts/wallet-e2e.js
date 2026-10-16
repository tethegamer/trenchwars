// Headless E2E for multi-wallet sign-in using mocked wallets that sign with real ed25519 keys (tweetnacl in Node).
const puppeteer = require('puppeteer-core'), nacl = require('tweetnacl'), bs58 = require('bs58'), os = require('os'), path = require('path');
const { createApp } = require('../app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MOCKS = {
  solflare: `window.solflare = { isSolflare: true, publicKey: null, async connect() { this.publicKey = { toString: () => window.__pk }; return true; }, async signMessage(m) { return { signature: new Uint8Array(await window.__sign(Array.from(m))), publicKey: this.publicKey }; } };`,
  backpack: `window.backpack = { isBackpack: true, publicKey: null, async connect() { this.publicKey = { toString: () => window.__pk }; return { publicKey: this.publicKey }; }, async signMessage(m) { return new Uint8Array(await window.__sign(Array.from(m))); } };`,
  phantom: `window.phantom = { solana: { isPhantom: true, async connect() { return { publicKey: { toString: () => window.__pk } }; }, async signMessage(m) { return { signature: new Uint8Array(await window.__sign(Array.from(m))) }; } } };`,
  standard: `(() => { const acct = { get address() { return window.__pk; }, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signMessage'] };
    const w = { version: '1.0.0', name: 'Glow', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], accounts: [],
      features: { 'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [acct] }) }, 'solana:signMessage': { version: '1.0.0', signMessage: async ({ message }) => [{ signedMessage: message, signature: new Uint8Array(await window.__sign(Array.from(message))) }] } } };
    const cb = ({ register }) => register(w);
    try { window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: cb })); } catch {}
    window.addEventListener('wallet-standard:app-ready', e => cb(e.detail)); })();`,
};
(async () => {
  const app = createApp({ dbFile: path.join(os.tmpdir(), 'tw-w-' + Date.now() + '.json') }); const srv = app.listen(0); const url = `http://127.0.0.1:${srv.address().port}`;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const results = {}; let fail = false;
  for (const [id, label] of [['solflare', 'Solflare'], ['backpack', 'Backpack'], ['phantom', 'Phantom'], ['standard', 'Glow']]) {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); const kp = nacl.sign.keyPair(), pk = bs58.encode(kp.publicKey);
    await p.exposeFunction('__sign', arr => Array.from(nacl.sign.detached(Uint8Array.from(arr), kp.secretKey)));
    await p.evaluateOnNewDocument(`window.__pk=${JSON.stringify(pk)};` + MOCKS[id]);
    await p.goto(url); await sleep(400); await p.click('#loginTop'); await p.click('#walletBtn'); await sleep(200);
    const opts = await p.$$eval('.wopt', e => e.map(x => x.textContent));
    const btn = (await p.$$('button.wopt')).find(async () => true); const all = await p.$$('.wopt');
    let clicked = false; for (const el of all) { const t = await el.evaluate(e => e.textContent); if (t.includes(label) && t.includes('Detected')) { await el.click(); clicked = true; break; } }
    await sleep(1200);
    const who = await p.$eval('#uname', e => e.textContent).catch(() => '');
    const me = await p.evaluate(() => fetch('/api/me').then(r => r.json()));
    results[label] = { options: opts, clicked, signedIn: me.user?.wallet === pk, name: who };
    if (!results[label].signedIn) fail = true;
    if (id === 'standard') await p.screenshot({ path: '/workspace/tw-shots/wallet-picker-after-login.png' });
    await ctx.close();
  }
  // Mobile with no wallet injected -> deep links
  const ctx = await b.createBrowserContext(); const m = await ctx.newPage();
  await m.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(url + '/?ref=ABC123'); await sleep(400); await m.click('#loginTop'); await m.click('#walletBtn'); await sleep(300);
  const links = await m.$$eval('a.wopt', e => e.map(x => [x.textContent, x.getAttribute('href')]));
  await m.screenshot({ path: '/workspace/tw-shots/wallet-picker-mobile.png' });
  const enc = encodeURIComponent(url + '/?ref=ABC123'), ref = encodeURIComponent(url);
  results.mobileDeepLinks = links;
  if (!links.some(([t, h]) => t.includes('Phantom') && h === `https://phantom.app/ul/browse/${enc}?ref=${ref}`)) fail = true;
  if (!links.some(([t, h]) => t.includes('Solflare') && h === `https://solflare.com/ul/v1/browse/${enc}?ref=${ref}`)) fail = true;
  // Desktop picker screenshot with wallets present
  const d = await (await b.createBrowserContext()).newPage(); await d.setViewport({ width: 1280, height: 860 });
  await d.evaluateOnNewDocument('window.__pk="x";' + MOCKS.solflare + MOCKS.phantom + MOCKS.standard); await d.goto(url); await sleep(400); await d.click('#loginTop'); await d.click('#walletBtn'); await sleep(300);
  await d.screenshot({ path: '/workspace/tw-shots/wallet-picker-desktop.png' });
  console.log(JSON.stringify(results, null, 1)); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
