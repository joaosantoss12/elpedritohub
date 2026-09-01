import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, SESSION_COOKIE } from '../_lib/session.js';
import { supabaseSelect, supabaseUpdate } from '../_lib/supabaseAdmin.js';
import { createChannelInviteLink, LINK_TTL_DAYS } from '../_lib/inviteLink.js';

type Subscription = { id: string; plan: string; expires_at: string; invite_link_id: string | null };
type InviteLink = { id: string; link: string; created_at: string; used_at: string | null };

const LINK_TTL_MS = LINK_TTL_DAYS * 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    return res.status(401).json({ status: 'logged_out' });
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
      return res.status(404).json({ status: 'none' });
    }
    if (new Date(sub.expires_at).getTime() <= Date.now()) {
      return res.status(409).json({ status: 'expired' });
    }

    if (sub.invite_link_id) {
      const links = await supabaseSelect<InviteLink>('invite_links', {
        id: `eq.${sub.invite_link_id}`,
        select: 'id,link,created_at,used_at',
      });
      const cur = links[0];
      if (cur && !cur.used_at && Date.now() - new Date(cur.created_at).getTime() < LINK_TTL_MS) {
        return res.status(200).json({ status: 'ready', telegramLink: cur.link });
      }
    }

    const { id, link } = await createChannelInviteLink({
      planId: sub.plan,
      subscriptionExpiresAt: sub.expires_at,
      sessionId: `refresh_${session.id}_${Date.now()}`,
      email: '',
    });
    await supabaseUpdate('subscriptions', { id: `eq.${sub.id}` }, { invite_link_id: id });

    return res.status(200).json({ status: 'ready', telegramLink: link });
  } catch (err) {
    console.error('subscription/link generation failed:', err);
    return res.status(500).json({ status: 'error' });
  }
}
