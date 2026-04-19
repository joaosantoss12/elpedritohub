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

  const { subscriptionId, userId } = req.body as { subscriptionId: string; userId: string };

  if (!subscriptionId || !userId) {
    return res.status(400).json({ error: 'subscriptionId e userId são obrigatórios' });
  }

  // Verify the subscription belongs to this user
  const { data: membro, error: dbError } = await supabase
    .from('membros')
    .select('stripe_subscription_id')
    .eq('id', userId)
    .single();

  if (dbError || !membro || membro.stripe_subscription_id !== subscriptionId) {
    return res.status(403).json({ error: 'Não autorizado' });
  }

  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: message });
  }
}
