import { supabaseInsert } from './supabaseAdmin.js';

// Ported from FOOTMILLION LP (src/lib/inviteLink.ts). Needs BOT_TOKEN and
// NEW_GROUP_ID (the VIP channel id). Writes an invite_links row.

const PLAN_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

// A generated link is single-use (member_limit=1) and valid for this long.
export const LINK_TTL_DAYS = 7;

export async function createChannelInviteLink(params: {
  planId: string;
  subscriptionExpiresAt: string; // ISO
  sessionId: string; // used as invite_links.stripe_session_id
  email: string;
}): Promise<{ id: string; link: string }> {
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.NEW_GROUP_ID;
  if (!botToken || !chatId) {
    throw new Error('BOT_TOKEN / NEW_GROUP_ID not configured');
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: Number(chatId),
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + LINK_TTL_DAYS * 24 * 60 * 60,
      name: `web_${params.sessionId}`.slice(0, 32),
    }),
  });
  const json = (await res.json()) as { ok: boolean; result?: { invite_link: string } };
  if (!json.ok || !json.result) {
    throw new Error(`Telegram createChatInviteLink failed: ${JSON.stringify(json)}`);
  }

  const row = await supabaseInsert<{ id: string }>('invite_links', {
    link: json.result.invite_link,
    plan: params.planId,
    duration_days: PLAN_DAYS[params.planId] ?? 0,
    subscription_expires_at: params.subscriptionExpiresAt,
    stripe_session_id: params.sessionId,
    customer_email: params.email,
  });
  return { id: row.id, link: json.result.invite_link };
}
