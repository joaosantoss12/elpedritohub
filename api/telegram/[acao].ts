import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyTelegramIdToken } from '../_lib/telegramAuth.js';
import { signSession, verifySession, sessionCookieHeader, SESSION_COOKIE } from '../_lib/session.js';

/* As três rotas do Telegram (login/logout/me) vivem numa só função para não
   estourar o limite de 12 Serverless Functions do plano Hobby. O caminho
   `/api/telegram/<acao>` mantém-se igual para o frontend. */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const acao = Array.isArray(req.query.acao) ? req.query.acao[0] : req.query.acao;

  if (acao === 'me') return me(req, res);
  if (acao === 'logout') return logout(req, res);
  if (acao === 'login') return login(req, res);
  return res.status(404).json({ error: 'Rota desconhecida' });
}

function me(req: VercelRequest, res: VercelResponse) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    return res.status(200).json({ loggedIn: false });
  }
  return res.status(200).json({ loggedIn: true, user: session });
}

function logout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', sessionCookieHeader('', 0));
  return res.status(200).json({ ok: true });
}

async function login(req: VercelRequest, res: VercelResponse) {
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
