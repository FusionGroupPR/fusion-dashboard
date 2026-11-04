import { getStore } from '@netlify/blobs';

// Campos del formulario STORE ANALYSIS REPORT. Cada campo prueba el nombre plano y el anidado.
const FIELDS = {
  STORE: ['STORE'],
  WEEKENDING: ['WEEKENDING'],
  FOODCOST_SALES2: ['FOODCOST_SALES2', 'FOODCOST.SALES2'],
  FOODCOST_PURCHASE: ['FOODCOST_PURCHASE', 'FOODCOST.PURCHASE'],
  FOODCOST_BEGINV: ['FOODCOST_BEGINNINV', 'FOODCOST.BEGINNINV'],
  FOODCOST_ENDINV: ['FOODCOST_ENDINGINV', 'FOODCOST.ENDINGINV'],
  LABORCOST_LABOR: ['LABORCOST_LABOR', 'LABORCOST.LABOR'],
  SUBMITTED: ['Entry_DateSubmitted', 'Entry.DateSubmitted']
};
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const pick = (obj, paths) => { for (const p of paths) { const v = get(obj, p); if (v !== undefined && v !== null) return v; } return undefined; };
const mapEntry = e => { const o = {}; for (const [k, src] of Object.entries(FIELDS)) o[k] = pick(e, src); return o; };
const clean = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

export const store = () => getStore('fusion-dashboard');

// Opciones de $select: primero campos anidados, luego planos, luego sin $select.
const SELECTS = [
  'Id,STORE,WEEKENDING,FOODCOST,LABORCOST,Entry',
  'Id,STORE,WEEKENDING,FOODCOST_SALES2,FOODCOST_PURCHASE,FOODCOST_BEGINNINV,FOODCOST_ENDINGINV,LABORCOST_LABOR,Entry_DateSubmitted',
  null
];
// Conserva los parámetros de la URL de Cognito (incluye el access token) y quita solo los de OData ($...).
const keepAuth = u => { for (const k of [...u.searchParams.keys()]) if (k.startsWith('$')) u.searchParams.delete(k); };
const buildUrl = (base, mode, size, skip) => {
  const u = new URL(base);
  if (SELECTS[mode]) u.searchParams.set('$select', SELECTS[mode]);
  u.searchParams.set('$top', String(size));
  if (skip) u.searchParams.set('$skip', String(skip));
  return u.toString();
};

// Lee lotes pequeños de Cognito durante budgetMs y guarda el avance en Netlify Blobs
// después de cada lote. Si no termina, la próxima llamada continúa desde donde quedó.
export async function syncStep(budgetMs) {
  const url = process.env.COGNITO_ODATA_URL;
  if (!url) throw new Error('Falta COGNITO_ODATA_URL');
  const s = store(), t0 = Date.now();
  const headers = { Accept: 'application/json' };
  if (process.env.COGNITO_API_KEY) headers.Authorization = 'Bearer ' + process.env.COGNITO_API_KEY;
  let cfg = (await s.get('cfg', { type: 'json' })) || { base: null, mode: 0, size: 100 };
  if (cfg.src !== url) cfg = { base: null, mode: 0, size: 100, src: url };
  let prog = await s.get('progress', { type: 'json' });
  if (!prog || Date.now() - (prog.startedAt || 0) > 60 * 60 * 1000) prog = { rows: [], skip: 0, page: 0, next: null, chunk: 0, startedAt: Date.now() };

  const finish = async (done) => {
    await s.setJSON('cfg', cfg);
    await s.setJSON('lastRun', { at: new Date().toISOString(), done, filas: prog.rows.length, lotes: prog.page, tamañoLote: cfg.size, modoSelect: cfg.mode });
    if (done) {
      await s.setJSON('data', { rows: prog.rows, syncedAt: new Date().toISOString(), ms: Date.now() - prog.startedAt, pages: prog.page });
      await s.delete('progress'); await s.delete('lastError');
    } else await s.setJSON('progress', prog);
    return { done, total: prog.rows.length, pages: prog.page, size: cfg.size };
  };
  const fail = async (msg) => {
    await s.setJSON('lastRun', { at: new Date().toISOString(), done: false, error: msg });
    await s.setJSON('lastError', { at: new Date().toISOString(), error: msg });
    throw new Error(msg);
  };

  for (;;) {
    const left = budgetMs - (Date.now() - t0);
    if (left < 2000) return finish(false);
    let target;
    if (!cfg.base) target = url;
    else target = prog.next || buildUrl(cfg.base, cfg.mode, cfg.size, prog.skip);
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), left - 1000);
    let r, txt;
    try { r = await fetch(target, { headers, signal: ac.signal }); txt = await r.text(); }
    catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        // Lote demasiado lento: reducir el tamaño para el próximo intento.
        if (cfg.base && !prog.next) cfg.size = Math.max(10, Math.floor(cfg.size / 2));
        return finish(false);
      }
      return fail('No se pudo conectar a Cognito: ' + e.message);
    }
    clearTimeout(timer);

    if (!cfg.base) {
      if (!r.ok) return fail('Cognito respondió ' + r.status + (r.status === 404 ? ' (URL no encontrada: revisa COGNITO_ODATA_URL)' : '') + ': ' + clean(txt));
      let j; try { j = JSON.parse(txt); } catch (e) { return fail('Cognito no devolvió JSON: ' + clean(txt)); }
      const isRoot = Array.isArray(j.value) && j.value.length && j.value.every(v => v.kind === 'EntitySet' || (v.url && v.name && Object.keys(v).length <= 4));
      if (isRoot) {
        const set = j.value.find(v => /entr/i.test(v.name)) || j.value[0];
        const u = new URL(url); u.pathname = u.pathname.replace(/\/$/, '') + '/' + set.url; keepAuth(u);
        cfg.base = u.toString();
      } else { const u = new URL(url); keepAuth(u); cfg.base = u.toString(); }
      continue;
    }

    if (r.status === 400 && cfg.mode < SELECTS.length - 1 && !prog.next) { cfg.mode++; continue; }
    if (!r.ok) return fail('Cognito respondió ' + r.status + ': ' + clean(txt));
    let j; try { j = JSON.parse(txt); } catch (e) { return fail('Cognito no devolvió JSON: ' + clean(txt)); }
    const vals = j.value || [];
    prog.rows.push(...vals.map(mapEntry));
    prog.page++;
    prog.chunk += vals.length;
    if (j['@odata.nextLink']) { prog.next = j['@odata.nextLink']; }
    else {
      prog.next = null;
      if (prog.chunk < cfg.size) return finish(true);
      prog.skip += prog.chunk; prog.chunk = 0;
    }
    await s.setJSON('progress', prog);
  }
}
