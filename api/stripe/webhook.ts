import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { supabaseSelect, supabaseInsert, supabaseUpdate } from '../_lib/supabaseAdmin';
import { createChannelInviteLink } from '../_lib/inviteLink';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Real subscription length is a number of calendar months (mirrors the bot).
const PLAN_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

type SubscriptionRow = { id: string; expires_at: string; invite_link_id: string | null };

function addCalendarMonths(start: Date, months: number): Date {
  const d = new Date(start);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function computeExpiry(current: SubscriptionRow | undefined, planId: string): Date {
  const now = new Date();
  const base = current
    ? new Date(Math.max(new Date(current.expires_at).getTime(), now.getTime()))
    : now;
  return addCalendarMonths(base, PLAN_MONTHS[planId] ?? 0);
}

/**
 * FOOTMILLION-style provisioning: when the checkout carried a Telegram session,
 * mint a single-use VIP channel invite link and upsert the subscriptions row.
 * Idempotent via invite_links.stripe_session_id. Best-effort — never throws.
 */
async function provisionTelegramSubscription(session: Stripe.Checkout.Session) {
  const telegramUserId = session.metadata?.telegram_user_id;
  const planId = session.metadata?.planId;
  if (!telegramUserId || !planId || !PLAN_MONTHS[planId]) return;
  if (!process.env.BOT_TOKEN || !process.env.NEW_GROUP_ID) return;

  try {
    const already = await supabaseSelect<{ id: string }>('invite_links', {
      stripe_session_id: `eq.${session.id}`,
      select: 'id',
      limit: '1',
    });
    if (already.length) return;

    const existing = await supabaseSelect<SubscriptionRow>('subscriptions', {
      telegram_user_id: `eq.${telegramUserId}`,
      active: 'eq.true',
      select: 'id,expires_at,invite_link_id',
      order: 'expires_at.desc',
      limit: '1',
    });
    const current = existing[0];
    const expiresAt = computeExpiry(current, planId);
    const email = session.customer_details?.email ?? '';

    const { id: inviteLinkId } = await createChannelInviteLink({
      planId,
      subscriptionExpiresAt: expiresAt.toISOString(),
      sessionId: session.id,
      email,
    });

    if (current) {
      await supabaseUpdate(
        'subscriptions',
        { id: `eq.${current.id}` },
        {
          plan: planId,
          expires_at: expiresAt.toISOString(),
          invite_link_id: inviteLinkId,
          renewal_notified_at: null,
        }
      );
    } else {
      await supabaseInsert('subscriptions', {
        telegram_user_id: Number(telegramUserId),
        telegram_username: session.metadata?.telegram_username ?? null,
        telegram_name: session.metadata?.telegram_name ?? '',
        plan: planId,
        expires_at: expiresAt.toISOString(),
        invite_link_id: inviteLinkId,
        active: true,
      });
    }
  } catch (err) {
    console.error('Telegram subscription provisioning failed:', err);
  }
}

// Necessário para ler o raw body e validar a assinatura do Stripe
export const config = { api: { bodyParser: false } };

function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let rawBody: Buffer;
  try {
    rawBody = await getRawBody(req);
  } catch {
    return res.status(400).json({ error: 'Erro ao ler o body do request' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(400).json({ error: `Webhook Error: ${message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        const telegramLink = session.metadata?.telegramLink ?? null;
        if (userId) {
          const { data: membroData } = await supabase
            .from('membros')
            .select('badges')
            .eq('id', userId)
            .single();
          const currentBadges: string[] = membroData?.badges || [];
          const updatedBadges = currentBadges.includes('VIP') ? currentBadges : [...currentBadges, 'VIP'];
          await supabase
            .from('membros')
            .update({
              subscription_status: 'active',
              stripe_customer_id: session.customer as string | null,
              badges: updatedBadges,
              ...(telegramLink ? { vip_telegram_link: telegramLink } : {}),
            })
            .eq('id', userId);
        }
        await provisionTelegramSubscription(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status === 'active' ? 'active' : 'inactive';
        await supabase
          .from('membros')
          .update({ subscription_status: status })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const { data: membroData } = await supabase
          .from('membros')
          .select('badges')
          .eq('stripe_subscription_id', subscription.id)
          .single();
        const currentBadges: string[] = membroData?.badges || [];
        const updatedBadges = currentBadges.filter((b: string) => b !== 'VIP');
        await supabase
          .from('membros')
          .update({
            subscription_status: 'inactive',
            stripe_subscription_id: null,
            stripe_customer_id: null,
            subscription_cancel_at: null,
            badges: updatedBadges,
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
        if (invoice.subscription) {
          await supabase
            .from('membros')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', invoice.subscription as string);
        }
        break;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('Erro ao processar webhook:', message);
    return res.status(500).json({ error: 'Erro interno ao processar evento' });
  }

  return res.status(200).json({ received: true });
}
