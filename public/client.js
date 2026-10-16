const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Math.floor(n).toLocaleString('en-US'), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, meta = null, sound = localStorage.tw_sound === '1', lbData = null, feedData = null, feedTab = 'big', view = 'lobby';
const ref = new URLSearchParams(location.search).get('ref'); if (ref) localStorage.tw_ref = ref;

// ---------- api ----------
async function api(url, body) {
  const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith('/api/auth') && url !== '/api/me') { openAuth(); throw new Error('Sign in to play'); }
  if (!r.ok) throw new Error(j.error || r.statusText);
  if (j.user) setUser(j.user);
  if (body && /coinflip|crash|blackjack/.test(url)) { clearTimeout(api.t); api.t = setTimeout(() => { loadLb(); loadFeed(); }, 900); }
  return j;
}
// ---------- feedback: sound, toast, confetti ----------
let ac; function tone(f = 600, d = .08, type = 'sine', v = .06) { if (!sound) return; ac ||= new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g).connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d); }
const sfx = { win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .14, 'triangle'), i * 70)), lose: () => tone(160, .35, 'sawtooth', .04), tick: () => tone(900, .03, 'square', .02), click: () => tone(500, .05) };
$('#soundBtn').textContent = sound ? '🔊' : '🔇';
$('#soundBtn').onclick = () => { sound = !sound; localStorage.tw_sound = sound ? '1' : '0'; $('#soundBtn').textContent = sound ? '🔊' : '🔇'; sfx.click(); };
function toast(title, sub = '', icon = '⚡', cls = '') { const t = document.createElement('div'); t.className = 'toast ' + cls; t.innerHTML = `<div class="ti">${icon}</div><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`; $('#toasts').prepend(t); setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = 0; t.style.transform = 'translateX(30px)'; setTimeout(() => t.remove(), 300); }, 3600); }
const err = e => toast(e.message, '', '⚠️', 'bad');
const cf = $('#confetti'), cfx = cf.getContext('2d'); let parts = [];
function confetti(n = 140, x = .5, y = .45) {
  cf.width = innerWidth; cf.height = innerHeight; const cols = ['#3dff9a', '#00d4ff', '#8b5cf6', '#ff4fd8', '#ffcc4d'];
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 10; parts.push({ x: x * cf.width, y: y * cf.height, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * 6 + 3, c: cols[i % 5], rot: Math.random() * 6, vr: Math.random() * .3 - .15, life: 0 }); }
  if (parts.length === n) requestAnimationFrame(cfLoop);
}
function cfLoop() { cfx.clearRect(0, 0, cf.width, cf.height); parts = parts.filter(p => p.life < 140 && p.y < cf.height + 20);
  for (const p of parts) { p.life++; p.vy += .35; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; cfx.save(); cfx.translate(p.x, p.y); cfx.rotate(p.rot); cfx.globalAlpha = Math.max(0, 1 - p.life / 140); cfx.fillStyle = p.c; cfx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); cfx.restore(); }
  if (parts.length) requestAnimationFrame(cfLoop); else cfx.clearRect(0, 0, cf.width, cf.height); }
function countUp(el, to) { const from = +(el.dataset.v || 0); el.dataset.v = to; if (from === to) { el.textContent = fmt(to); return; } const t0 = performance.now(), d = 600;
  const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - (1 - k) ** 3; el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
  if (to > from) { $('#walletBox').classList.remove('bump'); void $('#walletBox').offsetWidth; $('#walletBox').classList.add('bump'); } }

// ---------- user state ----------
function setUser(u) {
  const first = !me; me = u;
  ['#walletBox', '#uchip', '#logoutBtn'].forEach(s => $(s).classList.remove('hide')); $('#loginTop').classList.add('hide');
  countUp($('#bal'), u.credits);
  $('#uname').textContent = u.name; $('#urank').textContent = `Lv ${u.level} · ${u.rank.name}`; $('#rankIcon').textContent = u.rank.icon;
  const pct = Math.round((u.xp - u.levelXp) / (u.nextLevelXp - u.levelXp) * 100); $('#lvlRing').style.setProperty('--p', pct);
  const ready = u.nextClaim <= 0; $('#claimTop').disabled = !ready; $('#claimTopTx').textContent = ready ? '+' + fmt(u.nextClaimAmount) : hms(u.nextClaim, true);
  $('#claimBig').disabled = !ready; $('#claimBig').textContent = ready ? `Claim ${fmt(u.nextClaimAmount)} free credits` : `Next reward in ${hms(u.nextClaim)}`;
  $('#streakNum').textContent = u.streak + '🔥'; renderStreak('#streakDays'); renderStreak('#streakDays2');
  // rewards
  $('#rankIconBig').textContent = u.rank.icon; $('#rankName').textContent = u.rank.name; $('#lvlBig').style.setProperty('--p', pct); $('#lvlTx').textContent = `Level ${u.level} · ${u.games} games played`;
  $('#xpFill').style.width = pct + '%'; $('#xpTx').textContent = `${fmt(u.xp - u.levelXp)} / ${fmt(u.nextLevelXp - u.levelXp)} XP`; $('#lvlBonus').textContent = '+' + fmt(100 * (u.level + 1));
  $('#refCode').textContent = u.refCode; $('#refStats').textContent = `${u.refs} friend${u.refs === 1 ? '' : 's'} recruited`;
  renderAch();
  $('#fHash').textContent = u.seed.serverSeedHash; $('#fNonce').textContent = u.seed.nonce; if (document.activeElement !== $('#fClient')) $('#fClient').value = u.seed.clientSeed;
  for (const ev of u.unseen || []) {
    if (ev.type === 'level') { toast(`Level ${ev.level}! ${ev.rank.icon} ${ev.rank.name}`, `+${fmt(ev.reward)} bonus credits`, '⬆️', 'good'); confetti(80, .5, .2); }
    if (ev.type === 'achievement') { toast(`Achievement: ${ev.title}`, `${ev.desc} · +${fmt(ev.reward)}`, '🎖️', 'gold'); confetti(100, .5, .2); sfx.win(); }
    if (ev.type === 'referral') toast('Referral bonus!', `+${fmt(ev.reward)} credits${ev.name ? ' · ' + ev.name + ' joined' : ''}`, '🤝', 'good');
  }
  if (first) { closeAuth(); $('#heroCta').textContent = 'Play now →'; }
}
const hms = (ms, short) => { const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return short ? (h ? h + 'h' : m + 'm') : `${h}h ${m}m`; };
function renderStreak(sel) {
  const rw = me?.streakRewards || [500, 600, 700, 800, 1000, 1200, 1500], s = me?.streak || 0, ready = me && me.nextClaim <= 0;
  const base = s >= 7 ? s - 6 : 0; // after day 7 keep sliding window
  $(sel).innerHTML = rw.map((r, i) => { const d = base + i + 1, done = d <= s, next = ready && d === s + 1; return `<div class="sd ${done ? 'done' : ''} ${next ? 'next' : ''}"><small>Day ${d}</small><b>${done ? '✓' : fmt(r >= 1000 ? r / 1000 : r) + (r >= 1000 ? 'k' : '')}</b></div>`; }).join('');
}
function renderAch() {
  if (!meta || !me) return; const ids = Object.keys(meta.achievements);
  $('#achCount').textContent = `${me.achievements.length} / ${ids.length} unlocked`;
  $('#achGrid').innerHTML = ids.map(id => { const a = meta.achievements[id], got = me.achievements.includes(id); return `<div class="ac ${got ? 'got' : ''}"><b>${got ? '🏅' : '🔒'} ${esc(a.title)}</b><div class="muted">${esc(a.desc)}</div><div class="rw">+${fmt(a.reward)}</div></div>`; }).join('');
}
// ---------- auth ----------
function openAuth() { $('#authModal').classList.remove('hide'); $('#refNote').classList.toggle('hide', !localStorage.tw_ref); }
function closeAuth() { $('#authModal').classList.add('hide'); }
$('#loginTop').onclick = openAuth; $('#heroCta').onclick = () => me ? (location.hash = '#/crash') : openAuth();
$('#authModal').onclick = e => { if (e.target.id === 'authModal') closeAuth(); };
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b) break; s = '1' + s; } return s; }
function openWallets() {
  const ws = TWWallets.list(), mobile = TWWallets.isMobile(); $('#wErr').textContent = '';
  $('#wList').innerHTML = ws.map((w, i) => `<${w.detected ? 'button' : 'a'} class="wopt" data-w="${i}" ${w.href ? `href="${esc(w.href)}" ${mobile ? '' : 'target="_blank" rel="noopener"'}` : ''}>${w.img ? `<img src="${esc(w.img)}" alt="">` : `<span class="wi">${w.icon}</span>`}<span>${esc(w.name)}</span><span class="st ${w.detected ? 'det' : ''}">${w.detected ? 'Detected' : w.label}</span></${w.detected ? 'button' : 'a'}>`).join('');
  $('#wMobileHint').textContent = mobile && !ws.some(w => w.detected) ? 'On mobile, tap a wallet to open TrenchWars in its in-app browser, then sign in there. Mobile Safari and Chrome can\'t use wallet extensions.' : '';
  $$('#wList button.wopt').forEach(b => b.onclick = () => walletLogin(ws[+b.dataset.w], b));
  $('#authModal').classList.add('hide'); $('#wModal').classList.remove('hide');
}
async function walletLogin(w, el) {
  el.classList.add('busy'); $('#wErr').textContent = '';
  try { const address = await w.adapter.connect();
    const { message } = await api('/api/auth/nonce?address=' + address);
    const sig = await w.adapter.sign(new TextEncoder().encode(message));
    await api('/api/auth/wallet', { address, signature: b58(sig), ref: localStorage.tw_ref }); $('#wModal').classList.add('hide'); welcome();
  } catch (e) { $('#wErr').textContent = e?.message || 'Wallet request was rejected'; } finally { el.classList.remove('busy'); }
}
$('#walletBtn').onclick = openWallets;
$('#wClose').onclick = () => { $('#wModal').classList.add('hide'); openAuth(); };
$('#wModal').onclick = e => { if (e.target.id === 'wModal') $('#wModal').classList.add('hide'); };
$('#userBtn').onclick = async () => { try { await api('/api/auth/username', { username: $('#uName').value.trim(), password: $('#uPass').value, ref: localStorage.tw_ref }); welcome(); } catch (e) { $('#loginErr').textContent = e.message; } };
$('#uPass').onkeydown = e => { if (e.key === 'Enter') $('#userBtn').click(); };
function welcome() { delete localStorage.tw_ref; toast(`Welcome, ${me.name}`, 'Your free credits are ready', '🪖', 'good'); confetti(); boot(); }
$('#logoutBtn').onclick = async () => { await api('/api/auth/logout', {}); location.reload(); };
async function claim() { try { const r = await api('/api/claim', {}); toast(`Day ${r.streak} streak! +${fmt(r.claimed)}`, 'Come back tomorrow for more', '🎁', 'gold'); confetti(160, .5, .3); sfx.win(); } catch (e) { err(e); } }
$('#claimTop').onclick = claim; $('#claimBig').onclick = () => me ? claim() : openAuth();
$('#copyRef').onclick = () => { navigator.clipboard?.writeText(`${location.origin}/?ref=${me.refCode}`); toast('Invite link copied', `${location.origin}/?ref=${me.refCode}`, '🔗'); };

// ---------- routing ----------
function route() {
  $('#vModal').classList.add('hide'); view = (location.hash.replace('#/', '') || 'lobby'); if (!$(`[data-view="${view}"]`)) view = 'lobby';
  $$('[data-view]').forEach(s => s.classList.toggle('hide', s.dataset.view !== view));
  $$('[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === view));
  if (view === 'crash') requestAnimationFrame(() => drawCrash(crashOn ? curM : 1, crashOn ? performance.now() - crashT0 : 0));
  if (view === 'fair' && me) loadHistory(); if (view === 'lb') loadLb();
  scrollTo({ top: 0, behavior: 'smooth' });
}
addEventListener('hashchange', route);
$$('[data-half]').forEach(b => b.onclick = () => { const i = $('#' + b.dataset.half); i.value = Math.max(1, Math.floor(i.value / 2)); updPot(); });
$$('[data-dbl]').forEach(b => b.onclick = () => { const i = $('#' + b.dataset.dbl); i.value = Math.min(me?.credits || 1e5, i.value * 2) || 1; updPot(); });

// ---------- crash ----------
const cv = $('#crashCanvas'), cx = cv.getContext('2d'); let crashBetAmt = 0, crashT0 = 0, crashOn = false, crashPoll, curM = 1, lastTick = 0;
function drawCrash(m, ms, state) {
  const dpr = devicePixelRatio || 1, W = cv.width = cv.clientWidth * dpr, H = cv.height = cv.clientHeight * dpr; if (!W) return; cx.clearRect(0, 0, W, H);
  const maxT = Math.max(9000, ms * 1.2), maxM = Math.max(2, m * 1.25), pad = 36 * dpr, X = t => pad + t / maxT * (W - pad * 1.5), Y = v => H - pad - (v - 1) / (maxM - 1) * (H - pad * 2);
  cx.font = `${11 * dpr}px Inter,sans-serif`; cx.fillStyle = '#6b7189'; cx.strokeStyle = '#ffffff0d'; cx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = 1 + (maxM - 1) * i / 4, y = Y(v); cx.beginPath(); cx.moveTo(pad, y); cx.lineTo(W, y); cx.stroke(); cx.fillText(v.toFixed(1) + '×', 4 * dpr, y + 4 * dpr); }
  if (ms <= 0) return;
  const col = state === 'bust' ? '#ff4d6a' : state === 'win' ? '#3dff9a' : '#8b5cf6';
  const g = cx.createLinearGradient(0, H, W, 0); g.addColorStop(0, '#00d4ff'); g.addColorStop(1, state === 'bust' ? '#ff4d6a' : '#ff4fd8');
  cx.beginPath(); cx.moveTo(X(0), Y(1)); const N = 120; for (let i = 1; i <= N; i++) { const t = ms * i / N; cx.lineTo(X(t), Y(Math.exp(6e-5 * t))); }
  const fill = cx.createLinearGradient(0, Y(m), 0, H); fill.addColorStop(0, col + '40'); fill.addColorStop(1, col + '00');
  cx.save(); cx.lineTo(X(ms), H - pad); cx.lineTo(X(0), H - pad); cx.closePath(); cx.fillStyle = fill; cx.fill(); cx.restore();
  cx.beginPath(); cx.moveTo(X(0), Y(1)); for (let i = 1; i <= N; i++) { const t = ms * i / N; cx.lineTo(X(t), Y(Math.exp(6e-5 * t))); }
  cx.lineWidth = 4 * dpr; cx.lineCap = 'round'; cx.strokeStyle = g; cx.shadowColor = col; cx.shadowBlur = 24 * dpr; cx.stroke(); cx.shadowBlur = 0;
  const px = X(ms), py = Y(m); cx.beginPath(); cx.arc(px, py, 7 * dpr, 0, 7); cx.fillStyle = '#fff'; cx.shadowColor = col; cx.shadowBlur = 30 * dpr; cx.fill(); cx.shadowBlur = 0;
}
function crashUi(on) { const b = $('#crashGo'); b.textContent = on ? 'Cash out' : 'Place bet'; b.className = 'lg block ' + (on ? 'red' : ''); }
function updPot() { const b = +$('#crashBet').value || 0; $('#crashPot').textContent = crashOn ? fmt(b * curM) : ($('#crashAuto').value ? fmt(b * $('#crashAuto').value) : '—'); }
$('#crashBet').oninput = $('#crashAuto').oninput = updPot;
function hist(sel, label, cls) { const s = document.createElement('span'); s.textContent = label; s.className = cls; $(sel).prepend(s); while ($(sel).children.length > 14) $(sel).lastChild.remove(); }
function crashEnd(r) {
  crashOn = false; clearInterval(crashPoll); crashUi(false); const el = $('#crashMult');
  if (r.cashedAt) { el.className = 'win'; el.innerHTML = `+${fmt(r.payout - crashBetAmt)}<small>Cashed out @ ${r.cashedAt.toFixed(2)}× · rugged @ ${r.crashPoint.toFixed(2)}×</small>`; drawCrash(curM, performance.now() - crashT0, 'win'); sfx.win(); if (r.cashedAt >= 2) confetti(); }
  else { el.className = 'lose'; el.innerHTML = `${r.crashPoint.toFixed(2)}×<small>Rugged 💥</small>`; drawCrash(r.crashPoint, Math.log(r.crashPoint) / 6e-5, 'bust'); sfx.lose(); }
  hist('#crashHist', r.crashPoint.toFixed(2) + '×', r.cashedAt ? 'hi' : 'lo');
}
$('#crashGo').onclick = async () => {
  if (!me) return openAuth();
  if (crashOn) { try { const r = await api('/api/crash/cashout', {}); if (r.done) crashEnd(r); } catch (e) { err(e); } return; }
  try { crashBetAmt = +$('#crashBet').value; const r = await api('/api/crash/start', { bet: crashBetAmt, autoCashout: +$('#crashAuto').value || 0 });
    crashOn = true; crashT0 = performance.now() - (r.serverNow - r.start); $('#crashMult').className = ''; crashUi(true); sfx.click();
    const tick = () => { if (!crashOn) return; const ms = performance.now() - crashT0; curM = Math.exp(6e-5 * ms);
      $('#crashMult').innerHTML = curM.toFixed(2) + '×<small>Potential ' + fmt(+$('#crashBet').value * curM) + '</small>'; $('#crashMult').style.color = curM > 2 ? '#3dff9a' : ''; updPot();
      if (view === 'crash') drawCrash(curM, ms); if (ms - lastTick > 400) { lastTick = ms; sfx.tick(); } requestAnimationFrame(tick); }; tick();
    crashPoll = setInterval(async () => { try { const s = await api('/api/crash/state'); if (s.done && crashOn) crashEnd(s); } catch { } }, 250);
  } catch (e) { err(e); }
};
// ---------- coinflip ----------
let pick = 'heads', rot = 0;
$$('#flipSeg button').forEach(b => b.onclick = () => { pick = b.dataset.pick; $$('#flipSeg button').forEach(x => x.classList.toggle('on', x === b)); sfx.click(); });
$('#flipGo').onclick = async () => {
  if (!me) return openAuth(); $('#flipGo').disabled = true; $('#flipMsg').textContent = '';
  try { const fb = +$('#flipBet').value, r = await api('/api/coinflip', { bet: fb, pick });
    rot += 1800 + ((r.result === 'tails') !== (rot % 360 === 180) ? 180 : 0); $('#coin').style.transform = `rotateY(${rot}deg)`; sfx.click();
    setTimeout(() => { $('#flipMsg').innerHTML = r.win ? `<span class="win">${r.result.toUpperCase()} · +${fmt(r.payout - fb)}</span>` : `<span class="lose">${r.result.toUpperCase()} · Rekt</span>`;
      $('#flipStreak').textContent = r.win ? +$('#flipStreak').textContent + 1 : 0; hist('#flipHist', r.result === 'heads' ? 'H' : 'T', r.win ? 'hi' : 'lo');
      if (r.win) { sfx.win(); confetti(70, .6, .4); } else sfx.lose(); $('#flipGo').disabled = false; }, 1400);
  } catch (e) { err(e); $('#flipGo').disabled = false; }
};
// ---------- blackjack ----------
let shown = { p: 0, d: 0 };
const cardEl = (c, i) => { const d = document.createElement('div'); d.style.animationDelay = (i * .12) + 's'; if (c === '??') { d.className = 'pc back'; return d; } const suit = c.slice(-1), rank = c.slice(0, -1); d.className = 'pc' + ('♥♦'.includes(suit) ? ' red' : ''); d.innerHTML = `<span>${rank}</span><span class="c">${suit}</span><span style="align-self:flex-end;transform:rotate(180deg)">${rank}</span>`; return d; };
function renderHand(el, cards, key) { const prev = shown[key]; if (cards.length < prev || el.children.length !== prev || (key === 'd' && el.querySelector('.back'))) { el.replaceChildren(...cards.map((c, i) => cardEl(c, i))); } else cards.slice(prev).forEach((c, i) => el.append(cardEl(c, i))); shown[key] = cards.length; }
function bjRender(s, fresh) {
  if (s.none) return; if (fresh) { shown = { p: 0, d: 0 }; $('#dHand').innerHTML = $('#pHand').innerHTML = ''; }
  renderHand($('#dHand'), s.dealer, 'd'); renderHand($('#pHand'), s.player, 'p');
  $('#dVal').textContent = s.dealerValue; $('#pVal').textContent = s.playerValue;
  ['#bjHit', '#bjStand'].forEach(x => $(x).disabled = s.done); $('#bjDouble').disabled = !s.canDouble; $('#bjDeal').disabled = !s.done;
  const msg = { win: ['win', `YOU WIN · +${fmt(s.payout - s.bet)}`], blackjack: ['win', `BLACKJACK · +${fmt(s.payout - s.bet)}`], push: ['', 'PUSH · BET RETURNED'], lose: ['lose', 'DEALER WINS'], bust: ['lose', 'BUST'] }[s.outcome];
  $('#bjMsg').innerHTML = s.done && msg ? `<span class="${msg[0]}" style="font:700 22px var(--fd);letter-spacing:0">${msg[1]}</span>` : 'BLACKJACK PAYS 3 TO 2';
  if (s.done && fresh !== 'restore') { if (s.payout > s.bet) { sfx.win(); confetti(s.outcome === 'blackjack' ? 180 : 80); } else if (!s.payout) sfx.lose(); } else sfx.click();
}
const bj = act => async () => { if (!me) return openAuth(); try { bjRender(await api('/api/blackjack/' + act, act === 'deal' ? { bet: +$('#bjBet').value } : {}), act === 'deal'); } catch (e) { err(e); } };
$('#bjDeal').onclick = bj('deal'); $('#bjHit').onclick = bj('hit'); $('#bjStand').onclick = bj('stand'); $('#bjDouble').onclick = bj('double');

// ---------- fairness ----------
$('#fSetClient').onclick = async () => { try { await api('/api/fair/client-seed', { clientSeed: $('#fClient').value }); toast('Client seed saved', '', '🛡️'); } catch (e) { err(e); } };
$('#fRotate').onclick = async () => { try { const r = await api('/api/fair/rotate', {}); toast('Server seed revealed', 'All earlier bets can now be verified', '🔓', 'good'); $('#vS').value = r.revealed.serverSeed; $('#vC').value = r.revealed.clientSeed; loadHistory(); } catch (e) { err(e); } };
$('#vGo').onclick = async () => { const q = new URLSearchParams({ serverSeed: $('#vS').value, clientSeed: $('#vC').value, publicSeed: $('#vP').value, nonce: $('#vN').value || 0, game: $('#vG').value }); const r = await api('/api/fair/verify?' + q); if (r.deck) r.deck = r.deck.slice(0, 12).join(' ') + ' …'; $('#vOut').textContent = JSON.stringify(r, null, 1); };
const gIcon = { crash: '🚀', coinflip: '🪙', blackjack: '🃏' };
const resTx = h => h.game === 'crash' ? `${h.result.crashPoint.toFixed(2)}×${h.result.cashedAt ? ' (out ' + h.result.cashedAt.toFixed(2) + '×)' : ''}` : h.game === 'coinflip' ? h.result.side : h.result.outcome;
async function loadHistory() {
  const { history } = await api('/api/history');
  $('#histBody').innerHTML = history.map(h => `<tr><td>${gIcon[h.game]} ${h.game}</td><td class="num">${fmt(h.bet)}</td><td>${esc(resTx(h))}</td><td class="num ${h.payout > h.bet ? 'win' : h.payout < h.bet ? 'lose' : ''}">${fmt(h.payout)}</td><td class="num">${h.fair.nonce}</td><td><button class="sm ${h.revealed ? '' : 'sec'}" data-check="${h.id}">${h.revealed ? '✓ Verify' : '🔒 Verify'}</button></td></tr>`).join('') || '<tr><td colspan=6 class="muted" style="text-align:center;padding:30px">No bets yet. Play a game and it shows up here.</td></tr>';
  $$('[data-check]').forEach(b => b.onclick = () => verifyBet(b.dataset.check));
}
async function verifyBet(id) {
  const r = await api('/api/fair/check/' + id); $('#vModal').classList.remove('hide');
  if (!r.revealed) { $('#vBody').innerHTML = `<p class="tx2">${esc(r.message)}</p><button class="vi block" id="vRot">Rotate and reveal now</button>`; $('#vRot').onclick = async () => { await $('#fRotate').onclick(); verifyBet(id); }; return; }
  const i = r.inputs; $('#vBody').innerHTML = `<div class="bignum ${r.ok && r.hashMatches ? 'ok' : 'bad'}" style="text-align:center;margin:6px 0 14px">${r.ok && r.hashMatches ? '✅ Verified fair' : '❌ Mismatch'}</div>
   <div class="stat"><span>sha256(server seed) = committed hash</span><b class="${r.hashMatches ? 'ok' : 'bad'}">${r.hashMatches ? 'match' : 'NO'}</b></div>
   <div class="stat"><span>Recomputed result = recorded result</span><b class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'match' : 'NO'}</b></div>
   <label class="lbl" style="margin-top:14px">Server seed</label><div class="mono">${esc(i.serverSeed)}</div>
   <label class="lbl" style="margin-top:10px">Client seed</label><div class="mono">${esc(i.clientSeed)}</div>
   <label class="lbl" style="margin-top:10px">Public randomness ${i.solanaSlot ? '(Solana slot ' + i.solanaSlot + ')' : ''}</label><div class="mono">${esc(i.publicSeed || 'none recorded')}</div>
   <label class="lbl" style="margin-top:10px">Nonce</label><div class="mono">${i.nonce}</div>
   <pre class="code" style="margin-top:12px">${esc(JSON.stringify({ recorded: r.recorded, recomputed: r.recomputed }, null, 1))}</pre><a href="/fair" class="muted">How this works →</a>`;
}
async function loadPub() { try { const r = await (await fetch('/api/fair/public')).json(); $('#fPub').textContent = r.current ? r.current.hash.slice(0, 10) + '… #' + r.current.slot : 'unavailable'; } catch { } }

// ---------- leaderboard, prizes, feed ----------
let resetsAt = 0; const medal = i => ['🥇', '🥈', '🥉'][i - 1] || i;
async function loadLb() {
  const r = lbData = await (await fetch('/api/leaderboard')).json(); resetsAt = r.resetsAt; tickCd();
  $('#lbBody').innerHTML = r.rows.map(x => `<tr ${me && x.name === me.name ? 'style="background:#3dff9a0d"' : ''}><td>${medal(x.rank)}</td><td><b>${esc(x.name)}</b></td><td class="num ${x.profit >= 0 ? 'win' : 'lose'}">${x.profit >= 0 ? '+' : ''}${fmt(x.profit)}</td><td class="num tx2">${fmt(x.wagered)}</td><td class="num tx2">${x.games}</td></tr>`).join('') || '<tr><td colspan=5 class="muted" style="text-align:center;padding:30px">No plays yet this week. Go take #1.</td></tr>';
  const pr = r.prizes.items; const pod = [2, 1, 3].map(k => { const x = r.rows[k - 1]; return `<div class="pod p${k}"><div class="av">${medal(k)}</div><div class="nm">${esc(x?.name || '—')}</div><div class="num ${x ? 'win' : 'muted'}">${x ? '+' + fmt(x.profit) : 'open'}</div><div class="muted">${esc(pr[k - 1]?.prize || '')}</div></div>`; });
  $('#podium').innerHTML = pod.join('');
  $('#miniLb').innerHTML = r.rows.slice(0, 5).map(x => `<div class="fi"><div class="gi">${medal(x.rank)}</div><div class="who">${esc(x.name)}</div><div class="amt win">+${fmt(x.profit)}</div></div>`).join('') || '<div class="muted">No plays yet this week. Be the first.</div>';
  const pl = pr.length ? pr.map(i => `<div class="prow"><span class="m">${medal(i.rank)}</span><b>${esc(i.prize)}</b></div>`).join('') : '<div class="muted">The owner announces prizes soon. Climb now so you are ready.</div>';
  ['#prList', '#prList2', '#prList3'].forEach(s => $(s).innerHTML = pl); $('#prTitle').textContent = $('#prTitle2').textContent = $('#prTitle3').textContent = '🏆 ' + r.prizes.title; $('#prNote').textContent = r.prizes.note;
}
function tickCd() { if (!resetsAt) return; let s = Math.max(0, (resetsAt - Date.now()) / 1000); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60);
  const html = [[d, 'days'], [h, 'hrs'], [m, 'min'], [sec, 'sec']].map(([v, l]) => `<div><b>${String(v).padStart(2, '0')}</b><small>${l}</small></div>`).join(''); ['#cd', '#cd2', '#cd3'].forEach(s => $(s).innerHTML = html);
  if (me && me.nextClaim > 0) { me.nextClaim -= 1000; if (me.nextClaim <= 0) api('/api/me').catch(() => { }); } }
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };
function feedLine(e) {
  if (e.type === 'bet') return `<div class="fi"><div class="gi">${gIcon[e.game]}</div><div style="min-width:0"><div class="who">${esc(e.name)}</div><div class="muted">${e.game} · ${ago(e.t)}</div></div><div class="amt ${e.payout > e.bet ? 'win' : 'tx2'}">${e.payout > e.bet ? '+' + fmt(e.payout - e.bet) : '−' + fmt(e.bet - e.payout)}<div class="muted">${e.mult.toFixed(2)}×</div></div></div>`;
  const ic = { join: '🪖', achievement: '🎖️', streak: '🔥', rank: '⭐' }[e.type], tx = { join: 'joined the trenches', achievement: `unlocked ${esc(e.title)}`, streak: `hit a ${e.streak}-day streak`, rank: `ranked up to ${esc(e.rank)}` }[e.type];
  return `<div class="fi"><div class="gi">${ic}</div><div style="min-width:0"><div class="who">${esc(e.name)}</div><div class="muted">${tx}</div></div><div class="amt muted">${ago(e.t)}</div></div>`;
}
function tickerLine(e) { return e.type === 'bet' ? (e.payout > e.bet ? `<span>${gIcon[e.game]} <b>${esc(e.name)}</b> won <b class="win">+${fmt(e.payout - e.bet)}</b> @ ${e.mult.toFixed(2)}×</span>` : `<span>${gIcon[e.game]} <b>${esc(e.name)}</b> played ${e.game}</span>`) : `<span>${{ join: '🪖', achievement: '🎖️', streak: '🔥', rank: '⭐' }[e.type]} <b>${esc(e.name)}</b> ${{ join: 'joined the trenches', achievement: 'unlocked ' + esc(e.title), streak: `is on a ${e.streak}-day streak`, rank: 'ranked up to ' + esc(e.rank) }[e.type]}</span>`; }
async function loadFeed() {
  feedData = await (await fetch('/api/feed')).json(); renderFeed();
  const items = feedData.activity.length ? feedData.activity : [{ type: 'join', name: 'TrenchWars' }];
  const line = items.slice(0, 20).map(tickerLine).join('') + '<span>🛡️ <b>Every round is provably fair</b>: verify any bet</span><span>🆓 <b>No purchase necessary.</b> Free credits daily</span>';
  $('#ticker').innerHTML = line + line;
}
function renderFeed() { if (!feedData) return; const l = feedTab === 'big' ? feedData.bigWins : feedData.activity; $('#feed').innerHTML = l.map(feedLine).join('') || '<div class="muted" style="padding:10px">Nothing yet. Make some noise.</div>'; }
$$('[data-feed]').forEach(b => b.onclick = () => { feedTab = b.dataset.feed; $$('[data-feed]').forEach(x => x.classList.toggle('on', x === b)); renderFeed(); });

// ---------- boot ----------
async function boot() {
  meta ||= await (await fetch('/api/meta')).json();
  try { await api('/api/me'); const s = await api('/api/blackjack/state'); if (!s.none) bjRender(s, 'restore'); } catch { renderStreak('#streakDays'); }
  loadLb(); loadFeed(); loadPub(); renderAch();
}
route(); boot(); setInterval(tickCd, 1000); setInterval(() => { loadFeed(); loadLb(); }, 15000); setInterval(loadPub, 20000);
addEventListener('resize', () => { if (view === 'crash' && !crashOn) drawCrash(1, 0); });
