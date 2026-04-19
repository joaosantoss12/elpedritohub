import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId } = req.body as { sessionId: string };

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId é obrigatório' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(200).json({ success: false, reason: 'not_paid' });
    }

    const userId = session.client_reference_id || session.metadata?.userId;
    if (!userId) {
      return res.status(200).json({ success: false, reason: 'no_user' });
    }

    // Get current badges to add VIP without removing others
    const { data: membroData } = await supabase
      .from('membros')
      .select('badges, subscription_status')
      .eq('id', userId)
      .single();

    // Already active — no need to update again
    if (membroData?.subscription_status === 'active') {
      return res.status(200).json({ success: true, alreadyActive: true });
    }

    const currentBadges: string[] = membroData?.badges || [];
    const updatedBadges = currentBadges.includes('VIP') ? currentBadges : [...currentBadges, 'VIP'];

    const telegramLink = session.metadata?.telegramLink ?? null;

    const { error } = await supabase
      .from('membros')
      .update({
        subscription_status: 'active',
        stripe_customer_id: session.customer as string | null,
        badges: updatedBadges,
        ...(telegramLink ? { vip_telegram_link: telegramLink } : {}),
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: message });
  }
}
