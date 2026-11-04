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

// Lee páginas de Cognito durante budgetMs y guarda el avance en Netlify Blobs.
// Si no termina, la próxima llamada continúa desde donde quedó.
export async function syncStep(budgetMs) {
  const url = process.env.COGNITO_ODATA_URL;
  if (!url) throw new Error('Falta COGNITO_ODATA_URL');
  const s = store(), t0 = Date.now();
  let prog = await s.get('progress', { type: 'json' });
  if (!prog || !prog.next || Date.now() - (prog.startedAt || 0) > 60 * 60 * 1000) prog = { next: url, rows: [], page: 0, startedAt: Date.now() };
  const headers = { Accept: 'application/json' };
  if (process.env.COGNITO_API_KEY) headers.Authorization = 'Bearer ' + process.env.COGNITO_API_KEY;

  while (prog.next) {
    const left = budgetMs - (Date.now() - t0);
    if (left < 1500) break;
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), left);
    let j;
    try {
      const r = await fetch(prog.next, { headers, signal: ac.signal });
      const txt = await r.text();
      if (!r.ok) throw new Error('Cognito respondió ' + r.status + (r.status === 404 ? ' (URL no encontrada: revisa COGNITO_ODATA_URL)' : '') + ': ' + clean(txt));
      try { j = JSON.parse(txt); } catch (e) { throw new Error('Cognito no devolvió JSON: ' + clean(txt)); }
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') break; // sin tiempo: se continúa en la próxima llamada
      await s.setJSON('lastRun', { at: new Date().toISOString(), done: false, error: e.message });
      await s.setJSON('lastError', { at: new Date().toISOString(), error: e.message });
      throw e;
    }
    clearTimeout(timer);
    // Si la URL es la raíz del servicio OData (lista de tablas), seguir a la tabla de entradas.
    if (prog.page === 0 && Array.isArray(j.value) && j.value.length && j.value.every(v => v.kind === 'EntitySet' || (v.url && v.name && Object.keys(v).length <= 4))) {
      const set = j.value.find(v => /entr/i.test(v.name)) || j.value[0];
      const u = new URL(prog.next); u.pathname = u.pathname.replace(/\/$/, '') + '/' + set.url;
      prog.next = u.toString(); prog.page = 1;
      continue;
    }
    prog.rows.push(...(j.value || []).map(mapEntry));
    prog.next = j['@odata.nextLink'] || null;
    prog.page++;
    if (prog.next) await s.setJSON('progress', prog);
  }

  await s.setJSON('lastRun', { at: new Date().toISOString(), done: !prog.next, filas: prog.rows.length, paginas: prog.page });
  if (!prog.next) {
    await s.setJSON('data', { rows: prog.rows, syncedAt: new Date().toISOString(), ms: Date.now() - prog.startedAt, pages: prog.page });
    await s.delete('progress');
    await s.delete('lastError');
    return { done: true, total: prog.rows.length, pages: prog.page };
  }
  await s.setJSON('progress', prog);
  return { done: false, total: prog.rows.length, pages: prog.page };
}
