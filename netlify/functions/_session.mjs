import crypto from 'node:crypto';

const COOKIE = 'fusion_session';
const MAX_AGE = 60 * 60 * 12; // 12 horas

function sign(payload) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

export function createSessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = String(exp);
  const token = payload + '.' + sign(payload);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAuthed(req) {
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(new RegExp(COOKIE + '=([^;]+)'));
  if (!m) return false;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return false;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(payload) > Date.now() / 1000;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
}
