import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { verifySession, SESSION_COOKIE } from '../_lib/session';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLANS: Record<string, { name: string; amount: number; telegramLink: string }> = {
  monthly: {
    name: 'EL PEDRITO VIP — 1 Mês',
    amount: 2459,
    telegramLink: 'https://t.me/+mgN-Uonc-g4yNjE0',
  },
  quarterly: {
    name: 'EL PEDRITO VIP — 3 Meses',
    amount: 6149,
    telegramLink: 'https://t.me/+BXD7gmFf9OZjNDc0',
  },
  yearly: {
    name: 'EL PEDRITO VIP — 1 Ano',
    amount: 24599,
    telegramLink: 'https://t.me/+yvMIUb8B01wzMTM8',
  },
};

// The Telegram-login gate is enforced only once it's configured. Until the env
// vars are set (see .env.example), checkout works with member login alone.
const TELEGRAM_GATE_ENABLED = Boolean(
  process.env.SESSION_SECRET && process.env.TELEGRAM_CLIENT_ID
);

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

  // Telegram session (optional member gate → mandatory once configured).
  const tgSession = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (TELEGRAM_GATE_ENABLED && !tgSession) {
    return res
      .status(401)
      .json({ error: 'Tens de iniciar sessão com o Telegram antes de comprar.' });
  }

  const telegramMetadata: Record<string, string> = {};
  if (tgSession) {
    telegramMetadata.telegram_user_id = String(tgSession.id);
    telegramMetadata.telegram_name = tgSession.first_name;
    if (tgSession.username) telegramMetadata.telegram_username = tgSession.username;
  }

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
        ...telegramMetadata,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return res.status(500).json({ error: message });
  }
}
