import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, SESSION_COOKIE } from '../_lib/session.js';
import { supabaseSelect } from '../_lib/supabaseAdmin.js';
import { LINK_TTL_DAYS } from '../_lib/inviteLink.js';
import { claimGrantedVip } from '../_lib/legacyClaim.js';

type Subscription = {
  id: string;
  plan: string;
  expires_at: string;
  invite_link_id: string | null;
};

type InviteLink = { link: string; created_at: string; used_at: string | null };

const LINK_TTL_MS = LINK_TTL_DAYS * 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    return res.status(200).json({ kind: 'logged_out' });
  }

  try {
    const subs = await supabaseSelect<Subscription>('subscriptions', {
      telegram_user_id: `eq.${session.id}`,
      active: 'eq.true',
      select: 'id,plan,expires_at,invite_link_id',
      order: 'expires_at.desc',
      limit: '1',
    });

    const sub = subs[0];
    if (!sub) {
      const granted = await claimGrantedVip(session);
      if (granted) {
        return res.status(200).json({
          kind: 'ready',
          plan: granted.plan,
          expiresAt: granted.expiresAt,
          telegramLink: granted.telegramLink,
        });
      }
      return res.status(200).json({ kind: 'none' });
    }

    if (!sub.invite_link_id) {
      return res.status(200).json({ kind: 'pending', plan: sub.plan, expiresAt: sub.expires_at });
    }

    const links = await supabaseSelect<InviteLink>('invite_links', {
      id: `eq.${sub.invite_link_id}`,
      select: 'link,created_at,used_at',
    });

    const rec = links[0];
    const usable =
      rec &&
      (rec.used_at !== null ||
        Date.now() - new Date(rec.created_at).getTime() < LINK_TTL_MS);

    if (!usable) {
      return res.status(200).json({ kind: 'pending', plan: sub.plan, expiresAt: sub.expires_at });
    }

    return res.status(200).json({
      kind: 'ready',
      plan: sub.plan,
      expiresAt: sub.expires_at,
      telegramLink: rec.link,
    });
  } catch (err) {
    console.error('subscription/status failed:', err);
    return res.status(200).json({ kind: 'none' });
  }
}
