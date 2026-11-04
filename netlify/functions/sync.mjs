import { syncStep } from '../lib/cognito.mjs';

// Corre cada 10 minutos en Netlify y copia los datos de Cognito a Netlify Blobs.
export default async () => {
  try { const r = await syncStep(25000); console.log('sync', JSON.stringify(r)); }
  catch (e) { console.error('sync error', e.message); }
  return new Response('ok');
};

export const config = { schedule: '*/10 * * * *' };
