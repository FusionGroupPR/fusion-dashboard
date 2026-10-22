import crypto from 'node:crypto';
import { createSessionCookie, json } from './_session.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  let password = '';
  try { ({ password } = await req.json()); } catch (e) {}
  const expected = process.env.DASHBOARD_PASSWORD || '';
  const a = Buffer.from(String(password || '')), b = Buffer.from(expected);
  const ok = expected && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    await new Promise(r => setTimeout(r, 600)); // frena intentos por fuerza bruta
    return json({ error: 'Contraseña incorrecta' }, 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': createSessionCookie() });
};

export const config = { path: '/api/login' };
