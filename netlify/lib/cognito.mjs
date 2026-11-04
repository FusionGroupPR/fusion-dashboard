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
const buildUrl = (base) => base;

// Lee lotes pequeños de Cognito durante budgetMs y guarda el avance en Netlify Blobs
// después de cada lote. Si no termina, la próxima llamada continúa desde donde quedó.
const T = (ms, p, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo agotado en ' + what)), ms))]);
const L = (...a) => console.log('[sync]', ...a);

export async function syncStep(budgetMs) {
  const url = process.env.COGNITO_ODATA_URL;
  if (!url) throw new Error('Falta COGNITO_ODATA_URL');
  const t0 = Date.now(), raw = store();
  const s = { get: (k, o) => T(4000, raw.get(k, o), 'leer ' + k), setJSON: (k, v) => T(6000, raw.setJSON(k, v), 'guardar ' + k), delete: k => T(4000, raw.delete(k), 'borrar ' + k) };
  L('inicio');
  const headers = { Accept: 'application/json' };
  if (process.env.COGNITO_API_KEY) headers.Authorization = 'Bearer ' + process.env.COGNITO_API_KEY;
  let cfg = (await s.get('cfg', { type: 'json' })) || { base: null, mode: 0, size: 100 };
  if (cfg.src !== url) cfg = { base: null, mode: 0, size: 100, src: url };
  let prog = await s.get('progress', { type: 'json' });
  L('estado', 'base=' + !!cfg.base, 'modo=' + cfg.mode, 'lote=' + cfg.size, 'filas=' + (prog ? prog.rows.length : 0), (Date.now() - t0) + 'ms');
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
    else target = prog.next || buildUrl(cfg.base);
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), left - 1500);
    L('pidiendo', target.replace(/([?&](access_token|token|key)=)[^&]+/gi, '$1***'));
    let r, txt;
    try { const wait = left - 1200; [r, txt] = await T(wait, fetch(target, { headers, signal: ac.signal }).then(async x => [x, await x.text()]), 'Cognito'); }
    catch (e) {
      clearTimeout(timer);
      L('sin respuesta de Cognito', (Date.now() - t0) + 'ms');
      if (e.name === 'AbortError' || /Tiempo agotado en Cognito/.test(e.message)) { ac.abort();
        return finish(false);
      }
      return fail('No se pudo conectar a Cognito: ' + e.message);
    }
    clearTimeout(timer);
    L('respuesta', r.status, txt.length + ' bytes', (Date.now() - t0) + 'ms');

    let j0 = null;
    if (!cfg.base) {
      if (!r.ok) return fail('Cognito respondió ' + r.status + (r.status === 404 ? ' (URL no encontrada: revisa COGNITO_ODATA_URL)' : '') + ': ' + clean(txt));
      let j; try { j = JSON.parse(txt); } catch (e) { return fail('Cognito no devolvió JSON: ' + clean(txt)); }
      const isRoot = Array.isArray(j.value) && j.value.length && j.value.every(v => v.kind === 'EntitySet' || (v.url && v.name && Object.keys(v).length <= 4));
      if (isRoot) {
        const set = j.value.find(v => /entr/i.test(v.name)) || j.value[0];
        const u = new URL(url); u.pathname = u.pathname.replace(/\/$/, '') + '/' + set.url; keepAuth(u);
        cfg.base = u.toString();
        continue;
      }
      cfg.base = url; j0 = j; // la URL ya es la de entradas: usar esta respuesta
    }

    if (!j0 && !r.ok) { L('error', clean(txt)); return fail('Cognito respondió ' + r.status + ': ' + clean(txt)); }
    let j = j0; if (!j) try { j = JSON.parse(txt); } catch (e) { return fail('Cognito no devolvió JSON: ' + clean(txt)); }
    const vals = j.value || [];
    prog.rows.push(...vals.map(mapEntry));
    prog.page++;
    prog.next = j['@odata.nextLink'] || null;
    L('lote', prog.page, vals.length + ' filas', 'total=' + prog.rows.length, prog.next ? 'hay más' : 'fin');
    if (!prog.next) return finish(true);
    await s.setJSON('progress', prog);
  }
}
