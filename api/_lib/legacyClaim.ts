import { supabaseSelect, supabaseInsert, supabaseUpdate } from './supabaseAdmin.js';
import { createChannelInviteLink } from './inviteLink.js';
import type { TelegramSession } from './session.js';

// Ported from FOOTMILLION LP (src/lib/legacyClaim.ts).
// An admin can grant VIP by @username via the bot's /givevip before the member
// ever logs in. That writes a legacy_members row. Once the member logs in here
// — so we finally know their numeric id — turn an unclaimed, still-valid grant
// into a real subscription with an invite link.

type LegacyMember = {
  username: string;
  plan: string;
  expires_at: string;
  claimed_at: string | null;
};

export async function claimGrantedVip(
  session: TelegramSession
): Promise<{ plan: string; expiresAt: string; telegramLink: string } | null> {
  if (!session.username) return null;
  const username = session.username.toLowerCase();

  const rows = await supabaseSelect<LegacyMember>('legacy_members', {
    username: `eq.${username}`,
    claimed_at: 'is.null',
    select: 'username,plan,expires_at,claimed_at',
    limit: '1',
  });
  const grant = rows[0];
  if (!grant) return null;
  if (new Date(grant.expires_at).getTime() <= Date.now()) return null;

  const { id: linkId, link } = await createChannelInviteLink({
    planId: grant.plan,
    subscriptionExpiresAt: grant.expires_at,
    sessionId: `grant_${session.id}_${Date.now()}`,
    email: '',
  });

  await supabaseInsert('subscriptions', {
    telegram_user_id: session.id,
    telegram_username: session.username ?? null,
    telegram_name: session.first_name,
    plan: grant.plan,
    expires_at: grant.expires_at,
    invite_link_id: linkId,
    active: true,
  });

  // Mark claimed last: if anything above throws, the grant stays open and the
  // next login retries it instead of being silently lost.
  await supabaseUpdate(
    'legacy_members',
    { username: `eq.${username}` },
    { claimed_at: new Date().toISOString(), claimed_by_telegram_id: session.id }
  );

  return { plan: grant.plan, expiresAt: grant.expires_at, telegramLink: link };
}
