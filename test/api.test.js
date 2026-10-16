const test = require('node:test'), assert = require('node:assert');
const nacl = require('tweetnacl'), bs58 = require('bs58');
const { createApp, weekKey } = require('../app'); const F = require('../fair');

let clock = Date.parse('2026-10-14T12:00:00Z'); // a Wednesday
const app = createApp({ adminPassword: 'secret', now: () => clock });
let srv, base;
test.before(() => new Promise(r => { srv = app.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; r(); }); }));
test.after(() => srv.close());
async function call(path, body, tok, headers = {}) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
const signup = async n => (await call('/api/auth/username', { username: n, password: 'hunter22' })).body;

test('fair functions are deterministic and verifiable', () => {
  const s = 'abc', c = 'xyz';
  assert.equal(F.crashPoint(s, c, 1), F.crashPoint(s, c, 1));
  assert.ok(F.crashPoint(s, c, 1) >= 1);
  const d = F.shuffledDeck(s, c, 0); assert.equal(new Set(d).size, 52);
  assert.deepEqual(d, F.shuffledDeck(s, c, 0)); assert.notDeepEqual(d, F.shuffledDeck(s, c, 1));
  assert.equal(F.handValue([0, 12]), 21); assert.equal(F.handValue([0, 0, 8]), 21); assert.equal(F.handValue([12, 11, 1]), 22);
  // crash distribution sanity: ~50% >= 2x (house edge ~1%)
  let n = 0; for (let i = 0; i < 20000; i++) if (F.crashPoint('seed', 'c', i) >= 2) n++;
  assert.ok(n / 20000 > 0.46 && n / 20000 < 0.52, 'p(>=2x)=' + n / 20000);
});

test('username signup gives 1000, daily streak claim once per 24h', async () => {
  const { token, user } = await signup('alice'); assert.equal(user.credits, 1000);
  assert.equal((await call('/api/auth/username', { username: 'alice', password: 'wrongpw' })).status, 401);
  assert.equal((await call('/api/claim', {}, token)).body.user.credits, 1500);
  assert.equal((await call('/api/claim', {}, token)).status, 429);
  clock += 864e5 + 1; const c2 = (await call('/api/claim', {}, token)).body; assert.equal(c2.streak, 2); assert.equal(c2.user.credits, 2100);
});

test('Phantom-style wallet signature login', async () => {
  const kp = nacl.sign.keyPair(), address = bs58.encode(kp.publicKey);
  const { message } = (await call('/api/auth/nonce?address=' + address)).body;
  assert.match(message, /does NOT send a transaction/);
  const bad = bs58.encode(nacl.sign.detached(new TextEncoder().encode('other'), kp.secretKey));
  assert.equal((await call('/api/auth/wallet', { address, signature: bad })).status, 401);
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  const r = await call('/api/auth/wallet', { address, signature: sig });
  assert.equal(r.status, 200); assert.equal(r.body.user.wallet, address); assert.equal(r.body.user.credits, 1000);
});

test('coinflip pays 1.96x and matches provably fair result after reveal', async () => {
  const { token, user } = await signup('flipper'); const hash = user.seed.serverSeedHash; const log = [];
  for (let i = 0; i < 20; i++) { const r = (await call('/api/coinflip', { bet: 10, pick: 'heads' }, token)).body; log.push(r); assert.equal(r.payout, r.win ? 19 : 0); assert.equal(r.fair.nonce, i); }
  assert.equal((await call('/api/coinflip', { bet: 999999, pick: 'heads' }, token)).status, 400);
  const rev = (await call('/api/fair/rotate', {}, token)).body.revealed;
  assert.equal(F.sha256(rev.serverSeed), hash);
  log.forEach(r => assert.equal(F.coinflip(rev.serverSeed, rev.clientSeed, r.fair.nonce), r.result));
});

test('crash: cash out before crash pays, waiting past crash busts', async () => {
  const { token } = await signup('rocket'); let won = 0, lost = 0;
  for (let i = 0; i < 30; i++) {
    const s = await call('/api/crash/start', { bet: 10 }, token); assert.equal(s.status, 200);
    assert.equal((await call('/api/crash/start', { bet: 10 }, token)).status, 409);
    clock += F.msFor(1.5) + 5; // move clock to ~1.5x
    const r = (await call('/api/crash/cashout', {}, token)).body; assert.ok(r.done);
    if (r.crashPoint > 1.5) { assert.equal(r.cashedAt, 1.5); assert.equal(r.payout, 15); won++; } else { assert.equal(r.payout, 0); assert.equal(r.cashedAt, null); lost++; }
  }
  assert.ok(won > 0 && lost > 0, `won ${won} lost ${lost}`);
  // auto cashout
  await call('/api/crash/start', { bet: 10, autoCashout: 1.01 }, token); clock += 60000;
  const st = (await call('/api/crash/state', null, token)).body; assert.ok(st.done); assert.ok(st.cashedAt === 1.01 || st.crashPoint <= 1.01);
});

test('blackjack: deal/hit/stand/double settle correctly and deck is verifiable', async () => {
  const { token } = await signup('dealer'); const outcomes = new Set();
  for (let i = 0; i < 60; i++) {
    let s = (await call('/api/blackjack/deal', { bet: 10 }, token)).body; const before = s.user.credits;
    if (!s.done) s = (await call('/api/blackjack/' + (i % 3 === 0 ? 'double' : s.playerValue < 15 ? 'hit' : 'stand'), {}, token)).body;
    while (!s.done) s = (await call('/api/blackjack/stand', {}, token)).body;
    outcomes.add(s.outcome);
    const mult = { win: 2, blackjack: 2.5, push: 1, lose: 0, bust: 0 }[s.outcome]; assert.equal(s.payout, Math.floor(s.bet * mult));
    if (s.outcome !== 'bust' && s.outcome !== 'blackjack' && s.dealer.length > 2) assert.ok(s.dealerValue >= 17);
    if (s.outcome === 'win' && s.dealerValue <= 21) assert.ok(s.playerValue > s.dealerValue);
    const deck = F.shuffledDeck('x', 'y', 0); // sanity
    assert.equal(deck.length, 52);
  }
  assert.ok(outcomes.has('win') && outcomes.has('lose'), [...outcomes].join());
  const rev = (await call('/api/fair/rotate', {}, token)).body.revealed;
  const v = (await call(`/api/fair/verify?game=blackjack&serverSeed=${rev.serverSeed}&clientSeed=${rev.clientSeed}&nonce=0`)).body;
  assert.equal(v.deck.length, 52);
});

test('weekly leaderboard ranks by net won and resets Monday 00:00 UTC; admin prizes', async () => {
  clock = Date.parse('2026-10-18T23:59:00Z'); // Sunday
  const lb = (await call('/api/leaderboard')).body; assert.equal(lb.week, '2026-10-12');
  assert.ok(lb.rows.length >= 3); for (let i = 1; i < lb.rows.length; i++) assert.ok(lb.rows[i - 1].profit >= lb.rows[i].profit);
  assert.equal(new Date(lb.resetsAt).toISOString(), '2026-10-19T00:00:00.000Z');
  clock = Date.parse('2026-10-19T00:00:01Z'); // Monday
  const lb2 = (await call('/api/leaderboard')).body; assert.equal(lb2.week, '2026-10-19'); assert.equal(lb2.rows.length, 0); assert.equal(lb2.lastWeek, '2026-10-12');
  assert.equal(weekKey(Date.parse('2026-10-25T23:00:00Z')), '2026-10-19');
  // admin
  assert.equal((await call('/api/admin/prizes', { items: [] }, null, { 'x-admin-password': 'nope' })).status, 401);
  const p = await call('/api/admin/prizes', { title: 'Week 1', note: 'paid in $BONK', items: [{ prize: '1M BONK' }, { prize: '500k BONK' }, { prize: '250k BONK' }] }, null, { 'x-admin-password': 'secret' });
  assert.equal(p.status, 200); assert.equal((await call('/api/leaderboard')).body.prizes.items[0].prize, '1M BONK');
  const ov = (await call('/api/admin/overview', null, null, { 'x-admin-password': 'secret' })).body; assert.ok(ov.lastWeek.rows.length >= 3);
});
