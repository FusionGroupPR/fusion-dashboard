import { isAuthed, json } from './_session.mjs';
import { store, syncStep } from './_cognito.mjs';

// Lee la copia guardada en Netlify Blobs (rápido). La copia la actualiza sync.mjs cada 10 min.
const nc = r => { r.headers.set('Cache-Control', 'no-store'); return r; };
export default async (req) => nc(await handle(req));
async function handle(req) {
  if (!isAuthed(req)) return json({ error: 'No autorizado' }, 401);
  const q = new URL(req.url).searchParams;
  try {
    const s = store();
    if (q.get('reset') === '1') { await s.delete('cfg'); await s.delete('progress'); return json({ reset: true }); }
    if (q.get('sync') === '1') return json(await syncStep(8000));
    let data = await s.get('data', { type: 'json' });
    if (q.get('debug') === '1') {
      const p = await s.get('progress', { type: 'json' });
      return json({
        total: data ? data.rows.length : 0, syncedAt: data && data.syncedAt, syncMs: data && data.ms, pages: data && data.pages,
        enProgreso: p && { filas: p.rows.length, lotes: p.page },
        cfg: await s.get('cfg', { type: 'json' }),
        ultimaEjecucion: await s.get('lastRun', { type: 'json' }),
        ultimoError: await s.get('lastError', { type: 'json' }),
        sample: data ? data.rows.slice(0, 2) : []
      });
    }
    if (!data) {
      // Primera vez: avanzar la copia unos segundos; el navegador reintenta solo.
      const r = await syncStep(7000);
      if (!r.done) return json({ syncing: true, total: r.total, pages: r.pages }, 503);
      data = await s.get('data', { type: 'json' });
    }
    return json({ rows: data.rows, syncedAt: data.syncedAt });
  } catch (err) {
    return json({ error: 'No se pudo leer Cognito: ' + err.message }, 502);
  }
}

export const config = { path: '/api/data' };
