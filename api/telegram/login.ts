import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyTelegramIdToken } from '../_lib/telegramAuth';
import { signSession, sessionCookieHeader } from '../_lib/session';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.TELEGRAM_CLIENT_ID;
  if (!clientId || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'Login com Telegram não está configurado' });
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as
    | { id_token?: unknown }
    | null;
  const idToken = body && typeof body.id_token === 'string' ? body.id_token : null;
  if (!idToken) {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const auth = await verifyTelegramIdToken(idToken, clientId);
  if (!auth) {
    return res.status(401).json({ error: 'Autenticação inválida' });
  }

  const session = {
    id: auth.id,
    username: auth.username,
    first_name: auth.first_name,
    photo_url: auth.photo_url,
  };
  res.setHeader(
    'Set-Cookie',
    sessionCookieHeader(signSession(session), 60 * 60 * 24 * 30)
  );
  return res.status(200).json({ ok: true, user: session });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
