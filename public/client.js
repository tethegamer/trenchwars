const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let me = null, sound = localStorage.tw_sound === '1';
const api = async (url, body, method) => {
  const r = await fetch(url, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); if (j.user) setUser(j.user); if (body && /coinflip|crash|blackjack/.test(url)) { clearTimeout(api.t); api.t = setTimeout(loadLb, 1200); } return j;
};
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2200); };
const fmt = n => Math.floor(n).toLocaleString();
// ---- optional sound (WebAudio blips, off by default) ----
let ac; function beep(f = 600, d = .08, type = 'square') { if (!sound) return; ac ||= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.value = .05; o.connect(g).connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d); }
const winSfx = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .1), i * 70)), loseSfx = () => beep(140, .35, 'sawtooth');
$('#soundBtn').textContent = sound ? '🔊' : '🔇';
$('#soundBtn').onclick = () => { sound = !sound; localStorage.tw_sound = sound ? '1' : '0'; $('#soundBtn').textContent = sound ? '🔊' : '🔇'; beep(); };

function setUser(u) {
  me = u; $('#login').classList.add('hide'); $('#main').classList.remove('hide');
  ['#who', '#bal', '#logoutBtn', '#claimBtn'].forEach(s => $(s).classList.remove('hide'));
  $('#who').textContent = (u.wallet ? '👻 ' : '🪖 ') + u.name; $('#bal').textContent = '💰 ' + fmt(u.credits);
  $('#claimBtn').disabled = u.nextClaim > 0; $('#claimBtn').textContent = u.nextClaim > 0 ? '⏳ ' + Math.ceil(u.nextClaim / 36e5) + 'h' : '🎁 Claim 500';
  $('#fHash').textContent = u.seed.serverSeedHash; $('#fNonce').textContent = u.seed.nonce; if (document.activeElement !== $('#fClient')) $('#fClient').value = u.seed.clientSeed;
}
// ---- auth ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b) break; s = '1' + s; } return s; }
$('#phantomBtn').onclick = async () => {
  const p = window.phantom?.solana || window.solana;
  if (!p?.isPhantom) { window.open('https://phantom.app/', '_blank'); return $('#loginErr').textContent = 'Phantom not found — install it or use a username.'; }
  try { const { publicKey } = await p.connect(); const address = publicKey.toString();
    const { message } = await api('/api/auth/nonce?address=' + address);
    const { signature } = await p.signMessage(new TextEncoder().encode(message), 'utf8');
    await api('/api/auth/wallet', { address, signature: b58(signature) }); boot();
  } catch (e) { $('#loginErr').textContent = e.message; }
};
$('#userBtn').onclick = async () => { try { await api('/api/auth/username', { username: $('#uName').value.trim(), password: $('#uPass').value }); boot(); } catch (e) { $('#loginErr').textContent = e.message; } };
$('#logoutBtn').onclick = async () => { await api('/api/auth/logout', {}); location.reload(); };
$('#claimBtn').onclick = async () => { try { await api('/api/claim', {}); toast('+500 free credits 🎁'); winSfx(); } catch (e) { toast(e.message); } };
// ---- tabs ----
$$('.tabs button').forEach(b => b.onclick = () => { $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $$('.tab').forEach(t => t.classList.add('hide')); $('#t-' + b.dataset.t).classList.remove('hide'); if (b.dataset.t === 'lb') loadLb(); if (b.dataset.t === 'crash') drawCrash(1, 0); });
// ---- crash ----
const cv = $('#crashCanvas'), cx = cv.getContext('2d'); let crashT0 = 0, crashOn = false, crashPoll, pts = [];
function drawCrash(m, ms, state) {
  const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio; cx.clearRect(0, 0, W, H);
  cx.strokeStyle = '#2a235055'; cx.lineWidth = 1; for (let i = 1; i < 6; i++) { cx.beginPath(); cx.moveTo(0, H * i / 6); cx.lineTo(W, H * i / 6); cx.stroke(); }
  const maxT = Math.max(8000, ms * 1.15), maxM = Math.max(2, m * 1.2), X = t => t / maxT * W, Y = v => H - (v - 1) / (maxM - 1) * H * .9 - 8;
  const grad = cx.createLinearGradient(0, H, W, 0); grad.addColorStop(0, '#22e4ff'); grad.addColorStop(1, state === 'bust' ? '#ff3b5c' : '#ff2bd6');
  cx.beginPath(); cx.moveTo(0, Y(1)); for (let t = 0; t <= ms; t += Math.max(16, ms / 200)) cx.lineTo(X(t), Y(Math.exp(6e-5 * t))); cx.lineTo(X(ms), Y(m));
  cx.lineWidth = 5 * devicePixelRatio; cx.strokeStyle = grad; cx.shadowColor = '#ff2bd6'; cx.shadowBlur = 20; cx.stroke(); cx.shadowBlur = 0;
  cx.lineTo(X(ms), H); cx.lineTo(0, H); cx.fillStyle = '#ff2bd61a'; cx.fill();
  if (ms > 0) { cx.font = `${28 * devicePixelRatio}px serif`; cx.fillText(state === 'bust' ? '💥' : '🚀', X(ms) - 14 * devicePixelRatio, Y(m)); }
}
function crashHist(v, won) { const s = document.createElement('span'); s.textContent = v.toFixed(2) + '×'; s.className = won ? 'win' : v < 2 ? 'lose' : ''; $('#crashHist').prepend(s); }
function crashEnd(r) {
  crashOn = false; clearInterval(crashPoll); const el = $('#crashMult');
  if (r.cashedAt) { el.className = 'win'; el.innerHTML = `${r.cashedAt.toFixed(2)}×<br><small style="font-size:20px">+${fmt(r.payout)} · crashed @ ${r.crashPoint.toFixed(2)}×</small>`; winSfx(); }
  else { el.className = 'lose'; el.innerHTML = `💥 ${r.crashPoint.toFixed(2)}×<br><small style="font-size:20px">BUSTED</small>`; drawCrash(r.crashPoint, Math.log(r.crashPoint) / 6e-5, 'bust'); loseSfx(); }
  crashHist(r.crashPoint, !!r.cashedAt); $('#crashGo').textContent = 'BET'; $('#crashGo').className = '';
}
$('#crashGo').onclick = async () => {
  if (crashOn) { try { const r = await api('/api/crash/cashout', {}); if (r.done) crashEnd(r); } catch (e) { toast(e.message); } return; }
  try { const r = await api('/api/crash/start', { bet: +$('#crashBet').value, autoCashout: +$('#crashAuto').value || 0 });
    crashOn = true; crashT0 = performance.now() - (r.serverNow - r.start); $('#crashMult').className = ''; $('#crashGo').textContent = 'CASH OUT'; $('#crashGo').className = 'red'; beep(880);
    const tick = () => { if (!crashOn) return; const ms = performance.now() - crashT0, m = Math.exp(6e-5 * ms); $('#crashMult').textContent = m.toFixed(2) + '×'; drawCrash(m, ms); requestAnimationFrame(tick); }; tick();
    crashPoll = setInterval(async () => { const s = await api('/api/crash/state'); if (s.done && crashOn) crashEnd(s); }, 250);
  } catch (e) { toast(e.message); }
};
// ---- coinflip ----
$$('.flipBtn').forEach(b => b.onclick = async () => {
  $$('.flipBtn').forEach(x => x.disabled = true); const coin = $('#coin');
  try { const r = await api('/api/coinflip', { bet: +$('#flipBet').value, pick: b.dataset.pick });
    coin.classList.remove('flip'); void coin.offsetWidth; coin.classList.add('flip'); beep(400);
    setTimeout(() => { coin.textContent = r.result.toUpperCase(); coin.classList.toggle('tails', r.result === 'tails');
      $('#flipMsg').innerHTML = r.win ? `<span class="win">WIN +${fmt(r.payout)}</span>` : '<span class="lose">REKT</span>'; r.win ? winSfx() : loseSfx(); }, 900);
  } catch (e) { toast(e.message); } setTimeout(() => $$('.flipBtn').forEach(x => x.disabled = false), 1000);
});
// ---- blackjack ----
const cardEl = c => { const d = document.createElement('div'); if (c === '??') { d.className = 'pc back'; return d; } const suit = c.slice(-1), rank = c.slice(0, -1); d.className = 'pc' + ('♥♦'.includes(suit) ? ' red' : ''); d.innerHTML = `<span>${rank}</span><span style="align-self:flex-end">${suit}</span>`; return d; };
function bjRender(s) {
  if (s.none) return; $('#dHand').replaceChildren(...s.dealer.map(cardEl)); $('#pHand').replaceChildren(...s.player.map(cardEl));
  $('#dVal').textContent = '(' + s.dealerValue + ')'; $('#pVal').textContent = '(' + s.playerValue + ')';
  ['#bjHit', '#bjStand'].forEach(x => $(x).disabled = s.done); $('#bjDouble').disabled = !s.canDouble; $('#bjDeal').disabled = !s.done;
  const msg = { win: ['win', `WIN +${fmt(s.payout)}`], blackjack: ['win', `BLACKJACK! +${fmt(s.payout)}`], push: ['', 'PUSH'], lose: ['lose', 'DEALER WINS'], bust: ['lose', 'BUST'] }[s.outcome];
  $('#bjMsg').innerHTML = s.done && msg ? `<span class="${msg[0]}">${msg[1]}</span>` : ''; if (s.done) (s.payout > s.bet ? winSfx : s.payout ? beep : loseSfx)(); else beep(500);
}
const bj = act => async () => { try { bjRender(await api('/api/blackjack/' + act, act === 'deal' ? { bet: +$('#bjBet').value } : {})); } catch (e) { toast(e.message); } };
$('#bjDeal').onclick = bj('deal'); $('#bjHit').onclick = bj('hit'); $('#bjStand').onclick = bj('stand'); $('#bjDouble').onclick = bj('double');
// ---- fairness ----
$('#fSetClient').onclick = async () => { try { await api('/api/fair/client-seed', { clientSeed: $('#fClient').value }); toast('Client seed set'); } catch (e) { toast(e.message); } };
$('#fRotate').onclick = async () => { try { const r = await api('/api/fair/rotate', {}); $('#fRevealed').textContent = JSON.stringify(r.revealed, null, 1); $('#vS').value = r.revealed.serverSeed; $('#vC').value = r.revealed.clientSeed; $('#vN').value = 0; } catch (e) { toast(e.message); } };
$('#vGo').onclick = async () => { const q = new URLSearchParams({ serverSeed: $('#vS').value, clientSeed: $('#vC').value, nonce: $('#vN').value, game: $('#vG').value }); $('#vOut').textContent = JSON.stringify(await api('/api/fair/verify?' + q), null, 1); };
// ---- leaderboard & prizes ----
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function loadLb() {
  const r = await api('/api/leaderboard'); const medal = i => ['🥇', '🥈', '🥉'][i - 1] || i;
  $('#lbBody').innerHTML = r.rows.map(x => `<tr class="top${x.rank}"><td>${medal(x.rank)}</td><td>${esc(x.name)}</td><td>${x.profit >= 0 ? '+' : ''}${fmt(x.profit)}</td><td>${x.games}</td></tr>`).join('') || '<tr><td colspan=4 class=muted>No plays yet this week — be first.</td></tr>';
  const left = r.resetsAt - Date.now(); $('#lbReset').textContent = `resets in ${Math.floor(left / 864e5)}d ${Math.floor(left % 864e5 / 36e5)}h`;
  $('#miniLb').innerHTML = r.rows.slice(0, 5).map(x => `<div>${medal(x.rank)} ${esc(x.name)} <b class="cr" style="float:right">${fmt(x.profit)}</b></div>`).join('') || 'No plays yet';
  const p = r.prizes; $('#prTitle').textContent = '🏆 ' + p.title; $('#prNote').textContent = p.note;
  $('#prList').innerHTML = p.items.length ? p.items.map(i => `<div>${medal(i.rank)} <b>${esc(i.prize)}</b></div>`).join('') : '<span class="muted">Prizes TBA by the owner.</span>';
}
async function boot() { try { await api('/api/me'); loadLb(); drawCrash(1, 0); const s = await api('/api/blackjack/state'); if (!s.none) bjRender(s); } catch { } }
boot(); setInterval(() => me && loadLb(), 30000);
