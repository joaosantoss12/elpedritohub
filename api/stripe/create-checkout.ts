import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amountCents, planName, interval, intervalCount, userId, userEmail, successUrl, cancelUrl } = req.body as {
    amountCents: number;
    planName: string;
    interval: 'month' | 'year';
    intervalCount: number;
    userId: string;
    userEmail: string;
    successUrl: string;
    cancelUrl: string;
  };

  if (!amountCents || !planName || !interval || !intervalCount || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card', 'link', 'klarna', 'paypal'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            product_data: { name: `El Pedrito VIP – ${planName}` },
            recurring: { interval, interval_count: intervalCount },
            unit_amount: amountCents,
          },
        },
      ],
      customer_email: userEmail || undefined,
      client_reference_id: userId || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId: userId || '' },
      subscription_data: {
        metadata: { userId: userId || '' },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: message });
  }
}
