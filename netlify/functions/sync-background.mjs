import { syncStep } from '../lib/cognito.mjs';

// Función de fondo (hasta 15 min). La llaman sync.mjs (cada 10 min) y el botón ↻ del dashboard.
export default async (req) => {
  if (req.headers.get('x-sync-key') !== process.env.SESSION_SECRET) { console.log('[sync] llamada no autorizada'); return; }
  try {
    for (let i = 0; i < 20; i++) {
      const r = await syncStep(4 * 60 * 1000);
      console.log('sync', JSON.stringify(r));
      if (r.done) break;
    }
  } catch (e) { console.error('sync error', e.message); }
};
