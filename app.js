const express = require('express'), crypto = require('crypto'), cookieParser = require('cookie-parser');
const nacl = require('tweetnacl'), bs58 = require('bs58');
const F = require('./fair'), DB = require('./db');

const START = 1000, DAILY = 500, DAY = 864e5, MIN_BET = 1, MAX_BET = 100000;

function weekKey(t) { // Monday 00:00 UTC of the week containing t
  const d = new Date(t); const dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

function createApp(opts = {}) {
  const db = DB.open(opts.dbFile), D = db.data;
  const now = opts.now || (() => Date.now());
  const adminPassword = opts.adminPassword ?? process.env.ADMIN_PASSWORD;
  const app = express();
  app.use(express.json({ limit: '20kb' })); app.use(cookieParser());
  app.locals.db = db;

  // ---------- users / auth ----------
  const pub = u => ({ id: u.id, name: u.name, wallet: u.wallet || null, credits: u.credits,
    nextClaim: Math.max(0, (u.lastClaim || 0) + DAY - now()),
    seed: { serverSeedHash: u.seed.hash, clientSeed: u.seed.client, nonce: u.seed.nonce } });
  const seedPair = () => { const s = F.newSeed(); return { server: s, hash: F.sha256(s), client: crypto.randomBytes(8).toString('hex'), nonce: 0 }; };
  function createUser(fields) {
    const id = crypto.randomUUID();
    const u = D.users[id] = { id, credits: START, created: now(), lastClaim: 0, seed: seedPair(), ...fields };
    return u;
  }
  function login(res, u) {
    const tok = crypto.randomBytes(24).toString('hex'); D.sessions[tok] = u.id; db.save();
    res.cookie('tw', tok, { httpOnly: true, sameSite: 'lax', maxAge: 30 * DAY });
    res.json({ user: pub(u), token: tok });
  }
  const auth = (req, res, next) => {
    const tok = req.cookies.tw || (req.headers.authorization || '').replace('Bearer ', '');
    const u = D.users[D.sessions[tok]]; if (!u) return res.status(401).json({ error: 'Not signed in' });
    req.user = u; next();
  };
  const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

  app.post('/api/auth/username', (req, res) => {
    const { username, password } = req.body || {};
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username || '')) return res.status(400).json({ error: 'Username: 3-16 letters, numbers, _' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be 6+ chars' });
    let u = Object.values(D.users).find(x => !x.wallet && x.name.toLowerCase() === username.toLowerCase());
    if (u) { if (hashPw(password, u.salt) !== u.pw) return res.status(401).json({ error: 'Wrong password (or name taken)' }); }
    else { const salt = crypto.randomBytes(16).toString('hex'); u = createUser({ name: username, salt, pw: hashPw(password, salt) }); }
    login(res, u);
  });
  app.get('/api/auth/nonce', (req, res) => {
    const address = String(req.query.address || '');
    try { if (bs58.decode(address).length !== 32) throw 0; } catch { return res.status(400).json({ error: 'Bad address' }); }
    const nonce = crypto.randomBytes(12).toString('hex');
    const message = `Sign in to TrenchWars\n\nThis is a free-to-play game. Signing this message does NOT send a transaction or cost anything.\n\nWallet: ${address}\nNonce: ${nonce}`;
    D.nonces[address] = { message, exp: now() + 5 * 60e3 }; res.json({ message });
  });
  app.post('/api/auth/wallet', (req, res) => {
    const { address, signature } = req.body || {}; const n = D.nonces[address];
    if (!n || n.exp < now()) return res.status(400).json({ error: 'Nonce expired, try again' });
    let ok = false;
    try { ok = nacl.sign.detached.verify(new TextEncoder().encode(n.message), bs58.decode(signature), bs58.decode(address)); } catch {}
    if (!ok) return res.status(401).json({ error: 'Signature invalid' });
    delete D.nonces[address];
    const u = Object.values(D.users).find(x => x.wallet === address) || createUser({ wallet: address, name: address.slice(0, 4) + '…' + address.slice(-4) });
    login(res, u);
  });
  app.post('/api/auth/logout', (req, res) => { delete D.sessions[req.cookies.tw]; res.clearCookie('tw'); res.json({ ok: true }); });
  app.get('/api/me', auth, (req, res) => res.json({ user: pub(req.user) }));
  app.post('/api/claim', auth, (req, res) => {
    const u = req.user; if (now() < (u.lastClaim || 0) + DAY) return res.status(429).json({ error: 'Already claimed', user: pub(u) });
    u.lastClaim = now(); u.credits += DAILY; db.save(); res.json({ claimed: DAILY, user: pub(u) });
  });

  // ---------- fairness ----------
  const busy = u => (u.crash && !u.crash.done) || (u.bj && !u.bj.done);
  app.post('/api/fair/client-seed', auth, (req, res) => {
    const s = String((req.body || {}).clientSeed || '').slice(0, 64); if (!s) return res.status(400).json({ error: 'Empty seed' });
    if (busy(req.user)) return res.status(409).json({ error: 'Finish your active game first' });
    req.user.seed.client = s; db.save(); res.json({ user: pub(req.user) });
  });
  app.post('/api/fair/rotate', auth, (req, res) => {
    const u = req.user; if (busy(u)) return res.status(409).json({ error: 'Finish your active game first' });
    const old = { serverSeed: u.seed.server, serverSeedHash: u.seed.hash, clientSeed: u.seed.client, noncesUsed: u.seed.nonce };
    u.seed = { ...seedPair(), client: u.seed.client }; db.save(); res.json({ revealed: old, user: pub(u) });
  });
  app.get('/api/fair/verify', (req, res) => {
    const { serverSeed, clientSeed, nonce, game } = req.query, n = +nonce;
    const out = { serverSeedHash: F.sha256(serverSeed || '') };
    if (game === 'crash') out.crashPoint = F.crashPoint(serverSeed, clientSeed, n);
    if (game === 'coinflip') out.result = F.coinflip(serverSeed, clientSeed, n);
    if (game === 'blackjack') out.deck = F.shuffledDeck(serverSeed, clientSeed, n).map(F.cardName);
    res.json(out);
  });

  // ---------- betting core ----------
  function takeBet(req, res) {
    const bet = Math.floor(Number((req.body || {}).bet));
    if (!(bet >= MIN_BET && bet <= MAX_BET)) { res.status(400).json({ error: `Bet ${MIN_BET}-${MAX_BET}` }); return null; }
    if (bet > req.user.credits) { res.status(400).json({ error: 'Not enough credits — claim your free daily drop' }); return null; }
    req.user.credits -= bet; const u = req.user;
    return { bet, nonce: u.seed.nonce++, serverSeed: u.seed.server, clientSeed: u.seed.client, hash: u.seed.hash };
  }
  function settle(u, bet, payout, game) {
    u.credits += payout;
    const wk = D.weeks[weekKey(now())] ??= {};
    const s = wk[u.id] ??= { wagered: 0, won: 0, profit: 0, games: 0 };
    s.wagered += bet; s.won += payout; s.profit += payout - bet; s.games++;
    db.save();
  }
  const fairInfo = g => ({ serverSeedHash: g.hash, clientSeed: g.clientSeed, nonce: g.nonce });

  // Coinflip — 1.96x
  app.post('/api/coinflip', auth, (req, res) => {
    const pick = (req.body || {}).pick; if (!['heads', 'tails'].includes(pick)) return res.status(400).json({ error: 'Pick heads or tails' });
    if (busy(req.user) && req.user.bj && !req.user.bj.done) return res.status(409).json({ error: 'Finish blackjack hand' });
    const g = takeBet(req, res); if (!g) return;
    const result = F.coinflip(g.serverSeed, g.clientSeed, g.nonce), win = result === pick, payout = win ? Math.floor(g.bet * 1.96) : 0;
    settle(req.user, g.bet, payout, 'coinflip');
    res.json({ result, win, payout, fair: fairInfo(g), user: pub(req.user) });
  });

  // Crash — per-player round, crash point fixed by seeds at bet time, server clock decides
  app.post('/api/crash/start', auth, (req, res) => {
    if (busy(req.user)) return res.status(409).json({ error: 'Finish your active game first' });
    const auto = Number((req.body || {}).autoCashout) || 0;
    const g = takeBet(req, res); if (!g) return;
    const cp = F.crashPoint(g.serverSeed, g.clientSeed, g.nonce);
    req.user.crash = { ...g, cp, auto: auto >= 1.01 ? auto : 0, start: now(), done: false }; db.save();
    res.json({ started: true, start: req.user.crash.start, serverNow: now(), fair: fairInfo(g), user: pub(req.user) });
  });
  function crashResolve(u) {
    const c = u.crash; if (!c || c.done) return null;
    const m = F.crashAt(now() - c.start);
    if (c.auto && c.auto < c.cp && m >= c.auto) { c.done = true; c.cashedAt = c.auto; c.payout = Math.floor(c.bet * c.auto); settle(u, c.bet, c.payout, 'crash'); }
    else if (m >= c.cp) { c.done = true; c.cashedAt = null; c.payout = 0; settle(u, c.bet, 0, 'crash'); }
    return m;
  }
  const crashView = u => { const c = u.crash; return { done: c.done, current: c.done ? undefined : F.crashAt(now() - c.start), crashPoint: c.done ? c.cp : undefined, cashedAt: c.cashedAt, payout: c.payout, fair: fairInfo(c), user: pub(u) }; };
  app.get('/api/crash/state', auth, (req, res) => { if (!req.user.crash) return res.json({ none: true }); crashResolve(req.user); res.json(crashView(req.user)); });
  app.post('/api/crash/cashout', auth, (req, res) => {
    const u = req.user, c = u.crash; if (!c || c.done) return res.status(400).json({ error: 'No active round' });
    const m = crashResolve(u);
    if (!c.done) { c.done = true; c.cashedAt = m; c.payout = Math.floor(c.bet * m); settle(u, c.bet, c.payout, 'crash'); }
    res.json(crashView(u));
  });

  // Blackjack — dealer stands on all 17s, BJ pays 3:2, double on first two cards
  const bjView = u => { const b = u.bj, hideHole = !b.done;
    return { done: b.done, bet: b.bet, player: b.player.map(F.cardName), playerValue: F.handValue(b.player),
      dealer: hideHole ? [F.cardName(b.dealer[0]), '??'] : b.dealer.map(F.cardName), dealerValue: hideHole ? F.handValue([b.dealer[0]]) : F.handValue(b.dealer),
      canDouble: !b.done && b.player.length === 2 && u.credits >= b.bet, outcome: b.outcome, payout: b.payout, fair: fairInfo(b), user: pub(u) }; };
  function bjFinish(u, outcome, mult) { const b = u.bj; b.done = true; b.outcome = outcome; b.payout = Math.floor(b.bet * mult); settle(u, b.bet, b.payout, 'blackjack'); }
  function bjDealer(u) {
    const b = u.bj; while (F.handValue(b.dealer) < 17) b.dealer.push(b.deck[b.pos++]);
    const p = F.handValue(b.player), d = F.handValue(b.dealer);
    if (d > 21 || p > d) bjFinish(u, 'win', 2); else if (p === d) bjFinish(u, 'push', 1); else bjFinish(u, 'lose', 0);
  }
  app.post('/api/blackjack/deal', auth, (req, res) => {
    if (busy(req.user)) return res.status(409).json({ error: 'Finish your active game first' });
    const g = takeBet(req, res); if (!g) return; const u = req.user;
    const deck = F.shuffledDeck(g.serverSeed, g.clientSeed, g.nonce);
    u.bj = { ...g, deck, player: [deck[0], deck[2]], dealer: [deck[1], deck[3]], pos: 4, done: false };
    const pbj = F.handValue(u.bj.player) === 21, dbj = F.handValue(u.bj.dealer) === 21;
    if (pbj && dbj) bjFinish(u, 'push', 1); else if (pbj) bjFinish(u, 'blackjack', 2.5); else if (dbj) bjFinish(u, 'lose', 0);
    db.save(); res.json(bjView(u));
  });
  const bjActive = (req, res) => { const b = req.user.bj; if (!b || b.done) { res.status(400).json({ error: 'No active hand' }); return null; } return b; };
  app.post('/api/blackjack/hit', auth, (req, res) => {
    const b = bjActive(req, res); if (!b) return; b.player.push(b.deck[b.pos++]);
    const v = F.handValue(b.player); if (v > 21) bjFinish(req.user, 'bust', 0); else if (v === 21) bjDealer(req.user);
    db.save(); res.json(bjView(req.user));
  });
  app.post('/api/blackjack/stand', auth, (req, res) => { if (!bjActive(req, res)) return; bjDealer(req.user); res.json(bjView(req.user)); });
  app.post('/api/blackjack/double', auth, (req, res) => {
    const b = bjActive(req, res); if (!b) return; const u = req.user;
    if (b.player.length !== 2) return res.status(400).json({ error: 'Double only on first two cards' });
    if (u.credits < b.bet) return res.status(400).json({ error: 'Not enough credits to double' });
    u.credits -= b.bet; b.bet *= 2; b.player.push(b.deck[b.pos++]);
    if (F.handValue(b.player) > 21) bjFinish(u, 'bust', 0); else bjDealer(u);
    res.json(bjView(u));
  });
  app.get('/api/blackjack/state', auth, (req, res) => res.json(req.user.bj ? bjView(req.user) : { none: true }));

  // ---------- leaderboard & prizes ----------
  function board(key, limit = 50) {
    const wk = D.weeks[key] || {};
    return Object.entries(wk).map(([id, s]) => ({ name: D.users[id]?.name, wallet: D.users[id]?.wallet || null, ...s }))
      .sort((a, b) => b.profit - a.profit).slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
  }
  const nextReset = () => { const k = weekKey(now()); return Date.parse(k + 'T00:00:00Z') + 7 * DAY; };
  const prevKey = () => weekKey(now() - 7 * DAY);
  app.get('/api/leaderboard', (req, res) => {
    const key = req.query.week || weekKey(now());
    res.json({ week: key, resetsAt: nextReset(), lastWeek: prevKey(), rows: board(key).map(({ wallet, ...r }) => ({ ...r, wallet: wallet ? wallet.slice(0, 4) + '…' + wallet.slice(-4) : null })), prizes: D.prizes });
  });
  app.get('/api/prizes', (req, res) => res.json(D.prizes));

  const admin = (req, res, next) => {
    const pw = req.headers['x-admin-password'] || '';
    if (!adminPassword) return res.status(503).json({ error: 'ADMIN_PASSWORD not set on server' });
    const a = Buffer.from(F.sha256(pw)), b = Buffer.from(F.sha256(adminPassword));
    if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong admin password' });
    next();
  };
  app.get('/api/admin/overview', admin, (req, res) => res.json({ prizes: D.prizes, users: Object.keys(D.users).length,
    thisWeek: { week: weekKey(now()), rows: board(weekKey(now()), 10) }, lastWeek: { week: prevKey(), rows: board(prevKey(), 10) } }));
  app.post('/api/admin/prizes', admin, (req, res) => {
    const { title, note, items } = req.body || {};
    if (!Array.isArray(items) || items.length > 10) return res.status(400).json({ error: 'items: array, max 10' });
    D.prizes = { title: String(title || 'Weekly Trench Prizes').slice(0, 80), note: String(note || '').slice(0, 500),
      items: items.map((it, i) => ({ rank: i + 1, prize: String(it.prize || '').slice(0, 120) })).filter(x => x.prize) };
    db.save(); res.json(D.prizes);
  });

  app.use(express.static(require('path').join(__dirname, 'public'), { extensions: ['html'] }));
  return app;
}
module.exports = { createApp, weekKey };
