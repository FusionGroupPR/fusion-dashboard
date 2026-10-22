// Capa de datos aislada. Toda la data del dashboard entra por getData().
(function () {
  const CFG = () => window.FUSION_CONFIG || {};
  function isDemo() {
    try { if (new URLSearchParams(location.search).get('demo') === '1') return true; } catch (e) {}
    return (CFG().mode || 'demo') === 'demo';
  }

  async function login(password) {
    if (isDemo()) {
      return password === CFG().demoPassword ? { ok: true } : { ok: false, error: 'Contraseña incorrecta.' };
    }
    const r = await fetch('/api/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (r.ok) return { ok: true };
    return { ok: false, error: r.status === 401 ? 'Contraseña incorrecta.' : 'Error del servidor (' + r.status + ').' };
  }

  async function logout() {
    if (isDemo()) return;
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch (e) {}
  }

  async function getData() {
    let raw;
    if (isDemo()) {
      await new Promise(r => setTimeout(r, 450));
      raw = demoRaw();
    } else {
      const r = await fetch('/api/data', { credentials: 'include' });
      if (r.status === 401) { const e = new Error('Sesión expirada'); e.code = 401; throw e; }
      if (!r.ok) throw new Error('Error al cargar datos (' + r.status + ')');
      const j = await r.json();
      raw = Array.isArray(j) ? j : (j.rows || []);
    }
    return { rows: normalize(raw), updatedAt: new Date().toISOString() };
  }

  function brandOf(store) {
    const s = String(store).trim().toLowerCase();
    if (s.startsWith('acai')) return 'ACAI';
    if (s.startsWith('wingstop')) return 'Wingstop';
    if (s.startsWith('gong cha')) return 'GONGCHA';
    return 'Subway';
  }

  // Ajustar nombres de campos de inventario a los de Cognito Forms si difieren.
  function normalize(raw) {
    const map = new Map();
    for (const r of raw) {
      const store = String(r.STORE || '').trim();
      const week = String(r.WEEKENDING || '').slice(0, 10);
      if (!store || !week) continue;
      const key = store + '|' + week;
      const ts = String(r.SUBMITTED || '');
      const prev = map.get(key);
      if (prev && prev._ts > ts) continue; // gana el más reciente
      const sales = +r.FOODCOST_SALES2 || 0;
      const purchases = +r.FOODCOST_PURCHASE || 0;
      const begInv = +r.FOODCOST_BEGINV || 0;
      const endInv = +r.FOODCOST_ENDINV || 0;
      const fc = begInv + purchases - endInv;
      map.set(key, {
        store, brand: brandOf(store), week, sales, purchases, begInv, endInv, fc,
        fcPct: sales ? fc / sales * 100 : 0,
        lcPct: (+r.LABORCOST_LABOR || 0) * 100,
        _ts: ts
      });
    }
    return [...map.values()];
  }

  // ---------- Datos de ejemplo ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const SUBWAY = ['65TH INF', 'Aibonito', 'Arecibo 129', 'Arecibo Pueblo', 'Barbosa 65th', 'Barbosa Gulf', 'Barceloneta Cinema', 'Burlington', 'Carolina', 'Cayey Grande', 'Centro Sur', 'Ceramica', 'Cidra', 'Citibank', 'Coamo', 'College Park', 'Coto Laurel', 'Cruce Davila', 'Cupey', 'Encantada', 'Fajardo Market Square', 'Guayama la Fuente', 'Hatillo', 'Humacao Candela', 'Lomas Verdes', 'Manati MR', 'Ponce By Pass', 'Ponce Mall', 'Quebradillas', 'Rio Hondo', 'Santa Rosa', 'Utuado', 'Walmart Fajardo'];
  const ACAI = ['ACAI AIBONITO', 'ACAI ARECIBO', 'ACAI CAROLINA', 'ACAI GARDEN HILLS', 'ACAI HUMACAO', 'ACAI LAS AMERICAS', 'ACAI LAS PIEDRAS', 'ACAI LOS PRADOS', 'ACAI QUEBRADILLAS'];
  const WING = ['Wingstop Añasco', 'Wingstop Bayamón', 'Wingstop Caguas', 'Wingstop Guaynabo', 'Wingstop Humacao'];
  const GONG = ['Gong Cha Plaza', 'Gong Cha Caguas', 'Gong Cha Manati', 'Gong Cha San German', 'Gong Cha Guayama'];
  const P = {
    Subway:   { s: [9000, 33000],  fc: [29, 34], lc: [17, 22], inv: [6000, 13000] },
    ACAI:     { s: [7000, 10000],  fc: [33, 38], lc: [14, 17], inv: [4000, 7000] },
    Wingstop: { s: [24000, 36000], fc: [34, 38], lc: [13, 17], inv: [16000, 25000] },
    GONGCHA:  { s: [4000, 8000],   fc: [25, 38], lc: [30, 36], inv: [4000, 6500] }
  };

  function demoRaw() {
    const R = rng(20261020);
    const u = (a, b) => a + (b - a) * R();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const r2 = v => Math.round(v * 100) / 100;
    const weeks = [];
    const end = Date.UTC(2026, 9, 20);
    for (let i = 29; i >= 0; i--) weeks.push(new Date(end - i * 7 * 864e5).toISOString().slice(0, 10));
    const missingLast = new Set(['Cidra', 'Utuado', 'ACAI LAS PIEDRAS']);
    const closedFrom = { 'Gong Cha Manati': '2026-08-04', 'Gong Cha San German': '2026-08-25', 'Gong Cha Guayama': '2026-09-08' };
    const stores = [].concat(SUBWAY.map(n => [n, 'Subway']), ACAI.map(n => [n, 'ACAI']), WING.map(n => [n, 'Wingstop']), GONG.map(n => [n, 'GONGCHA']));
    const out = [];
    for (const [name, brand] of stores) {
      const p = P[brand];
      const base = u(p.s[0], p.s[1]);
      const fcB = u(p.fc[0] + 0.8, p.fc[1] - 0.8);
      const lcB = u(p.lc[0] + 0.6, p.lc[1] - 0.6);
      const invB = u(p.inv[0], p.inv[1]);
      let beg = invB * u(0.95, 1.05);
      weeks.forEach((w, i) => {
        const last = i === weeks.length - 1;
        if (brand === 'GONGCHA' && w < '2026-04-07') return;
        if (closedFrom[name] && w >= closedFrom[name]) return;
        if (last && missingLast.has(name)) return;
        if (!last && R() < 0.025) return;
        const season = 1 + 0.07 * Math.sin((i + 3) / 4.5) + 0.04 * (i / 29);
        const sales = clamp(base * season * u(0.93, 1.07), p.s[0] * 0.9, p.s[1] * 1.05);
        const fcPct = clamp(fcB + u(-1.2, 1.2), p.fc[0], p.fc[1]);
        const fc = sales * fcPct / 100;
        const endI = invB * u(0.94, 1.06);
        const purch = Math.max(0, fc + endI - beg);
        out.push({
          STORE: name, WEEKENDING: w,
          FOODCOST_SALES2: r2(sales), FOODCOST_PURCHASE: r2(purch),
          FOODCOST_BEGINV: r2(beg), FOODCOST_ENDINV: r2(endI),
          LABORCOST_LABOR: +(clamp(lcB + u(-1.3, 1.3), p.lc[0], p.lc[1]) / 100).toFixed(4),
          SUBMITTED: w + 'T20:00:00Z'
        });
        beg = endI;
      });
    }
    // Duplicado intencional (envío anterior corregido): debe ganar el más reciente.
    const dup = out.find(r => r.STORE === 'Carolina' && r.WEEKENDING === '2026-10-20');
    if (dup) out.push(Object.assign({}, dup, { FOODCOST_SALES2: 1, SUBMITTED: '2026-10-20T08:00:00Z' }));
    return out;
  }

  window.FusionAPI = { getData, login, logout, normalize, brandOf, isDemo };
})();
