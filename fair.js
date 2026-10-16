// Provably fair helpers. Every outcome = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}[:cursor]`)
const crypto = require('crypto');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest('hex');
const newSeed = () => crypto.randomBytes(32).toString('hex');

// Crash point with ~1% house edge (applies to free credits only; no real value)
function crashPoint(serverSeed, clientSeed, nonce) {
  const h = hmac(serverSeed, `${clientSeed}:${nonce}`);
  if (parseInt(h.slice(0, 8), 16) % 100 === 0) return 1.0; // instant bust 1%
  const r = parseInt(h.slice(0, 13), 16), e = 2 ** 52;
  return Math.max(1, Math.floor((100 * e - r) / (e - r)) / 100);
}
// Coinflip: first byte parity
function coinflip(serverSeed, clientSeed, nonce) {
  return parseInt(hmac(serverSeed, `${clientSeed}:${nonce}`).slice(0, 2), 16) % 2 === 0 ? 'heads' : 'tails';
}
// Blackjack: 52-card deck shuffled with the same HMAC stream (cards 0..51 -> rank i%13, suit i/13)
function shuffledDeck(serverSeed, clientSeed, nonce) {
  const d = [...Array(52).keys()]; let cursor = 0, buf = '';
  const nf = () => { if (buf.length < 8) buf += hmac(serverSeed, `${clientSeed}:${nonce}:${cursor++}`); const v = parseInt(buf.slice(0, 8), 16) / 2 ** 32; buf = buf.slice(8); return v; };
  for (let i = 51; i > 0; i--) { const j = Math.floor(nf() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'], SUITS = ['♠','♥','♦','♣'];
const cardName = c => RANKS[c % 13] + SUITS[Math.floor(c / 13)];
function handValue(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const r = c % 13; if (r === 0) { aces++; t += 11; } else t += Math.min(10, r + 1); }
  while (t > 21 && aces) { t -= 10; aces--; }
  return t;
}
// Crash multiplier curve over elapsed ms
const crashAt = ms => Math.floor(Math.pow(Math.E, 0.00006 * ms) * 100) / 100;
const msFor = mult => Math.log(mult) / 0.00006;
module.exports = { sha256, hmac, newSeed, crashPoint, coinflip, crashAt, msFor, shuffledDeck, cardName, handValue };
