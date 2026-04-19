import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLANS: Record<string, { name: string; amount: number; telegramLink: string }> = {
  monthly: {
    name: 'Footmillion VIP — 1 Mês',
    amount: 1999,
    telegramLink: 'https://t.me/+mgN-Uonc-g4yNjE0',
  },
  quarterly: {
    name: 'Footmillion VIP — 3 Meses',
    amount: 4999,
    telegramLink: 'https://t.me/+BXD7gmFf9OZjNDc0',
  },
  yearly: {
    name: 'Footmillion VIP — 1 Ano',
    amount: 18999,
    telegramLink: 'https://t.me/+yvMIUb8B01wzMTM8',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { planId, userId, userEmail, successUrl, cancelUrl } = req.body as {
    planId: string;
    userId: string;
    userEmail: string;
    successUrl: string;
    cancelUrl: string;
  };

  if (!planId || !PLANS[planId] || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta' });
  }

  const plan = PLANS[planId];

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'mb_way', 'multibanco', 'klarna'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            product_data: { name: plan.name },
            unit_amount: plan.amount,
          },
        },
      ],
      customer_email: userEmail || undefined,
      client_reference_id: userId || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId || '',
        planId,
        planName: plan.name,
        telegramLink: plan.telegramLink,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: message });
  }
}
