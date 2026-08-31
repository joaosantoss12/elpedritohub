import { jwtVerify, createRemoteJWKSet } from 'jose';

// Verifies the Telegram Login OIDC id_token (telegram-login.js widget).
// Ported from FOOTMILLION LP (src/lib/telegramAuth.ts). Needs TELEGRAM_CLIENT_ID.

export type TelegramIdTokenUser = {
  id: number;
  username?: string;
  first_name: string;
  photo_url?: string;
};

const JWKS = createRemoteJWKSet(
  new URL('https://oauth.telegram.org/.well-known/jwks.json')
);

export async function verifyTelegramIdToken(
  idToken: string,
  clientId: string
): Promise<TelegramIdTokenUser | null> {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: 'https://oauth.telegram.org',
    });

    // Telegram may encode `aud` as a number, which jose's string-based audience
    // option would reject — check it ourselves.
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.some((a) => String(a) === String(clientId))) {
      console.error('Telegram id_token aud mismatch:', payload.aud, 'expected', clientId);
      return null;
    }

    // `id` is the real Telegram user id. `sub` is the OIDC subject — a much
    // larger number that overflows a JS/Postgres bigint.
    const id = Number(payload.id ?? payload.sub);
    if (!Number.isFinite(id)) return null;

    const username =
      typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : undefined;
    const firstName =
      (typeof payload.given_name === 'string' && payload.given_name) ||
      (typeof payload.name === 'string' && payload.name) ||
      'Telegram';
    const photoUrl =
      typeof payload.picture === 'string' ? payload.picture : undefined;

    return { id, username, first_name: firstName, photo_url: photoUrl };
  } catch (err) {
    console.error('Telegram id_token verification failed:', err);
    return null;
  }
}
