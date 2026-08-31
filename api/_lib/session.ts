import { createHmac, timingSafeEqual } from 'crypto';

// HMAC-signed cookie that proves "this browser logged in with this Telegram
// account". Ported from FOOTMILLION LP (src/lib/session.ts). Needs SESSION_SECRET.

export type TelegramSession = {
  id: number;
  username?: string;
  first_name: string;
  photo_url?: string;
};

export const SESSION_COOKIE = 'tg_session';

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signSession(data: TelegramSession): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySession(cookieValue: string | undefined): TelegramSession | null {
  if (!cookieValue || !process.env.SESSION_SECRET) return null;
  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Serialize a Set-Cookie header value for the tg_session cookie. */
export function sessionCookieHeader(value: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}
