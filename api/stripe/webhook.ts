import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              badges: updatedBadges,
            })
            .eq('id', userId);
        }
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
