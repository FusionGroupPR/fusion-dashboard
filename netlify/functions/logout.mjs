import { clearSessionCookie, json } from './_session.mjs';

export default async () => json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });

export const config = { path: '/api/logout' };
