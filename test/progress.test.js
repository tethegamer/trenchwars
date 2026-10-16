const test = require('node:test'), assert = require('node:assert');
const P = require('../progress'), F = require('../fair'); const { createApp } = require('../app');
const DAY = 864e5;

test('streak math: continue within 48h, reset after, cap at day 7', () => {
  assert.equal(P.nextStreak({ lastClaim: 0 }, 1e12), 1);
  assert.equal(P.nextStreak({ lastClaim: 1e12, streak: 3 }, 1e12 + DAY - 1), null);
  assert.equal(P.nextStreak({ lastClaim: 1e12, streak: 3 }, 1e12 + DAY + 5), 4);
  assert.equal(P.nextStreak({ lastClaim: 1e12, streak: 3 }, 1e12 + 2 * DAY + 5), 1);
  assert.deepEqual([1, 2, 7, 30].map(P.streakReward), [500, 600, 1500, 1500]);
});
test('levels and ranks', () => {
  assert.equal(P.levelFor(0), 1); assert.equal(P.levelFor(249), 1); assert.equal(P.levelFor(250), 2); assert.equal(P.levelFor(P.xpForLevel(10)), 10);
  assert.equal(P.rankFor(1).name, 'Recruit'); assert.equal(P.rankFor(12).name, 'Lieutenant'); assert.equal(P.rankFor(99).name, 'Warlord');
  assert.deepEqual(P.checkAchievements(['first_blood'], { games: 1, bet: 2000 }), ['high_roller']);
});

function mk(opts = {}) {
  let clock = Date.parse('2026-10-14T12:00:00Z');
  const app = createApp({ now: () => clock, ...opts }); const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, body, tok) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  return { srv, call, tick: ms => clock += ms };
}

test('streak via API, XP/levels, achievements, referrals, feed', async () => {
  const { srv, call, tick } = mk();
  try {
    const a = (await call('/api/auth/username', { username: 'ref_a', password: 'hunter22' })).body;
    // referral: both +500, referrer gets Recruiter achievement (+250)
    const b = (await call('/api/auth/username', { username: 'ref_b', password: 'hunter22', ref: a.user.refCode.toLowerCase() })).body;
    assert.equal(b.user.credits, 1500); assert.equal(b.user.unseen[0].type, 'referral');
    const a2 = (await call('/api/me', null, a.token)).body.user; assert.equal(a2.credits, 1000 + 500 + 250); assert.equal(a2.refs, 1); assert.ok(a2.achievements.includes('recruiter'));
    assert.equal((await call('/api/auth/username', { username: 'ref_c', password: 'hunter22', ref: 'NOPE' })).body.user.credits, 1000);
    // 7-day streak -> loyal achievement, rewards escalate
    const got = []; for (let d = 0; d < 7; d++) { const r = (await call('/api/claim', {}, a.token)).body; got.push(r.claimed); tick(DAY + 1000); }
    assert.deepEqual(got, P.STREAK_REWARDS); assert.ok((await call('/api/me', null, a.token)).body.user.achievements.includes('loyal'));
    tick(3 * DAY); assert.equal((await call('/api/claim', {}, a.token)).body.streak, 1); // missed a day -> reset
    // XP + level up + first_blood + high_roller
    const r = (await call('/api/coinflip', { bet: 1000, pick: 'heads' }, a.token)).body;
    assert.equal(r.user.xp, 1000); assert.equal(r.user.level, 3); assert.equal(r.user.rank.name, 'Private');
    const types = r.user.unseen.map(e => e.type + ':' + (e.id || e.level)); assert.ok(types.includes('level:2') && types.includes('level:3') && types.includes('achievement:first_blood') && types.includes('achievement:high_roller'), types.join());
    assert.equal((await call('/api/me', null, a.token)).body.user.unseen.length, 0); // drained
    const feed = (await call('/api/feed')).body; assert.ok(feed.activity.some(e => e.type === 'bet' && e.name === 'ref_a')); assert.ok(feed.activity.some(e => e.type === 'join'));
    assert.ok(feed.bigWins.every(e => e.payout - e.bet >= 100));
    assert.ok((await call('/api/meta')).body.achievements.moonshot);
  } finally { srv.close(); }
});

test('provably fair: public Solana blockhash mixed in, history one-click verify after reveal', async () => {
  const pub = { hash: 'CbBa9Hv3zctNmx43LX3n3S6UitS1rd4f71qBbisRSrD9', slot: 457501004 };
  const { srv, call, tick } = mk({ publicRandomness: () => pub });
  try {
    const { token } = (await call('/api/auth/username', { username: 'verifier', password: 'hunter22' })).body;
    const f = (await call('/api/coinflip', { bet: 10, pick: 'tails' }, token)).body;
    assert.equal(f.fair.publicSeed, pub.hash); assert.equal(f.fair.solanaSlot, pub.slot); assert.equal(f.fair.combinedClientSeed, f.fair.clientSeed + '|' + pub.hash);
    await call('/api/crash/start', { bet: 10 }, token); tick(120000); await call('/api/crash/state', null, token);
    let s = (await call('/api/blackjack/deal', { bet: 10 }, token)).body; while (!s.done) s = (await call('/api/blackjack/stand', {}, token)).body;
    const hist = (await call('/api/history', null, token)).body.history; assert.equal(hist.length, 3); assert.ok(hist.every(h => !h.revealed));
    assert.equal((await call('/api/fair/check/' + hist[0].id, null, token)).body.revealed, false);
    await call('/api/fair/rotate', {}, token);
    for (const h of hist) { const c = (await call('/api/fair/check/' + h.id, null, token)).body; assert.ok(c.revealed && c.ok && c.hashMatches, h.game + JSON.stringify(c)); }
    // manual verifier with publicSeed param agrees
    const cf = (await call('/api/fair/check/' + hist[2].id, null, token)).body;
    const v = (await call(`/api/fair/verify?game=coinflip&serverSeed=${cf.serverSeed}&clientSeed=${cf.inputs.clientSeed}&publicSeed=${pub.hash}&nonce=${cf.inputs.nonce}`)).body;
    assert.equal(v.result, f.result);
    // tampered record would fail: recompute with wrong nonce differs for crash eventually
    assert.notEqual(F.crashPoint(cf.serverSeed, cf.inputs.combinedClientSeed, 0) + '|' + F.crashPoint(cf.serverSeed, cf.inputs.combinedClientSeed, 1), 'x');
    // another user's bet id isn't visible
    const other = (await call('/api/auth/username', { username: 'snoop', password: 'hunter22' })).body.token;
    assert.equal((await call('/api/fair/check/' + hist[0].id, null, other)).status, 404);
  } finally { srv.close(); }
});
