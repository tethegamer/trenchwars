// Multi-wallet sign-in: injected providers (Phantom, Solflare, Backpack) + any Wallet Standard wallet.
// Only signMessage is ever used. No transactions.
(function () {
  const std = new Map(); // name -> standard wallet
  const reg = w => { try { if (w.chains?.some(c => c.startsWith('solana:')) && w.features?.['solana:signMessage'] && w.features?.['standard:connect']) std.set(w.name, w); } catch { } return () => std.delete(w.name); };
  const api = { register: (...ws) => { ws.forEach(reg); return () => { }; } };
  addEventListener('wallet-standard:register-wallet', e => { try { e.detail(api); } catch { } });
  try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })); } catch { }

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const toBytes = s => { if (s instanceof Uint8Array) return s; if (s?.signature) return toBytes(s.signature); if (Array.isArray(s) || s?.data) return Uint8Array.from(s.data || s); if (s instanceof ArrayBuffer) return new Uint8Array(s); throw new Error('Wallet returned an unexpected signature'); };
  // Injected provider adapter (Phantom / Solflare / Backpack share connect + signMessage)
  const injected = (p) => ({
    async connect() { const r = await p.connect(); const pk = r?.publicKey || p.publicKey; if (!pk) throw new Error('Wallet did not return a public key'); return pk.toString(); },
    async sign(msg) { const r = await p.signMessage(msg, 'utf8'); return toBytes(r); },
  });
  const standard = (w) => { let acct; return {
    async connect() { const r = await w.features['standard:connect'].connect(); acct = (r?.accounts || w.accounts)[0]; if (!acct) throw new Error('No account'); return acct.address; },
    async sign(msg) { const [out] = await w.features['solana:signMessage'].signMessage({ account: acct, message: msg }); return toBytes(out.signature); },
  }; };
  const here = () => location.href.split('#')[0];
  const KNOWN = [
    { id: 'phantom', name: 'Phantom', icon: '👻', get: () => window.phantom?.solana?.isPhantom ? window.phantom.solana : null, install: 'https://phantom.app/download', deep: u => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}` },
    { id: 'solflare', name: 'Solflare', icon: '🔥', get: () => window.solflare?.isSolflare ? window.solflare : null, install: 'https://solflare.com/download', deep: u => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(location.origin)}` },
    { id: 'backpack', name: 'Backpack', icon: '🎒', get: () => window.backpack?.signMessage ? window.backpack : null, install: 'https://backpack.app/downloads', deep: null },
  ];
  // Returns [{ name, icon, img, detected, adapter?, href? }]
  function list() {
    const out = [], seen = new Set();
    for (const k of KNOWN) {
      const sw = [...std.values()].find(w => w.name.toLowerCase().includes(k.id)), p = k.get();
      if (sw || p) out.push({ name: k.name, icon: k.icon, img: sw?.icon, detected: true, adapter: sw ? standard(sw) : injected(p) });
      else if (isMobile() && k.deep) out.push({ name: k.name, icon: k.icon, detected: false, href: k.deep(here()), label: 'Open in app' });
      else out.push({ name: k.name, icon: k.icon, detected: false, href: k.install, label: 'Install' });
      seen.add(k.id);
    }
    for (const w of std.values()) if (![...seen].some(id => w.name.toLowerCase().includes(id))) out.splice(0, 0, { name: w.name, img: w.icon, icon: '💼', detected: true, adapter: standard(w) });
    return out.sort((a, b) => b.detected - a.detected);
  }
  window.TWWallets = { list, isMobile, _std: std };
})();
