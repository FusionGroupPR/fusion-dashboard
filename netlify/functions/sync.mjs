// Corre cada 10 minutos y lanza la copia de Cognito en una función de fondo.
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const r = await fetch(base + '/.netlify/functions/sync-background', { method: 'POST', headers: { 'x-sync-key': process.env.SESSION_SECRET } });
  console.log('[sync] lanzado', r.status);
  return new Response('ok');
};

export const config = { schedule: '0 * * * *' };
