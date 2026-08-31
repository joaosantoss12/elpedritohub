import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sessionCookieHeader } from '../_lib/session';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', sessionCookieHeader('', 0));
  return res.status(200).json({ ok: true });
}
