import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { priceId, userId, userEmail, successUrl, cancelUrl } = req.body as {
    priceId: string;
    userId: string;
    userEmail: string;
    successUrl: string;
    cancelUrl: string;
  };

  if (!priceId || !successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'Campos obrigatórios em falta: priceId, successUrl, cancelUrl' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
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
