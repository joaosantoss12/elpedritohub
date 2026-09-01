import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, SESSION_COOKIE } from '../_lib/session.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    return res.status(200).json({ loggedIn: false });
  }
  return res.status(200).json({ loggedIn: true, user: session });
}
