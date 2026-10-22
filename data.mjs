import { isAuthed, json } from './_session.mjs';

// Campos del formulario STORE ANALYSIS REPORT (según el modelo de Power BI).
// Cada campo prueba el nombre plano (FOODCOST_SALES2) y el anidado (FOODCOST.SALES2),
// porque el OData puede entregarlos de cualquiera de las dos formas.
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

export default async (req) => {
  if (!isAuthed(req)) return json({ error: 'No autorizado' }, 401);
  const url = process.env.COGNITO_ODATA_URL;
  if (!url) return json({ error: 'Falta COGNITO_ODATA_URL' }, 500);

  try {
    const debug = new URL(req.url).searchParams.get('debug') === '1';
    const entries = [];
    let next = url;
    for (let page = 0; next && page < 50; page++) {
      const headers = { Accept: 'application/json' };
      if (process.env.COGNITO_API_KEY) headers.Authorization = 'Bearer ' + process.env.COGNITO_API_KEY;
      const r = await fetch(next, { headers });
      if (!r.ok) { const t = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); return json({ error: 'Cognito respondió ' + r.status + (r.status === 404 ? ' (URL no encontrada: revisa COGNITO_ODATA_URL)' : '') + (t ? ': ' + t : ''), url: next.replace(/access_token=[^&]+/, 'access_token=***') }, 502); }
      const j = await r.json();
      // Si la URL es la raíz del servicio OData (lista de tablas), seguir a la primera tabla de entradas.
      if (page === 0 && Array.isArray(j.value) && j.value.length && j.value.every(v => v.kind === 'EntitySet' || (v.url && v.name && Object.keys(v).length <= 4))) {
        const set = j.value.find(v => /entr/i.test(v.name)) || j.value[0];
        const u = new URL(next);
        u.pathname = u.pathname.replace(/\/$/, '') + '/' + set.url;
        next = u.toString();
        continue;
      }
      entries.push(...(j.value || []));
      next = j['@odata.nextLink'] || null;
    }
    if (debug) return json({ total: entries.length, sample: entries.slice(0, 2) });
    const rows = entries.map(e => {
      const o = {};
      for (const [k, src] of Object.entries(FIELDS)) o[k] = pick(e, src);
      return o;
    });
    return json({ rows });
  } catch (err) {
    return json({ error: 'No se pudo leer Cognito: ' + err.message }, 502);
  }
};

export const config = { path: '/api/data' };
