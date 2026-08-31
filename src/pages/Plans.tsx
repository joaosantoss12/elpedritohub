import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, X, ShieldCheck, Lock, Zap } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import TelegramGate from '../components/TelegramGate';
import FunilVip from '../components/FunilVip';
import { Toast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Plans.css';

interface PlanoDB {
  id: string;
  nome: string;
  preco: string;
  precoOriginal?: string;
  periodo: string;
  destaque: boolean;
  badge: string | null;
  poupanca: string | null;
  funcionalidades: string[];
  ordem: number;
}

interface Plan extends PlanoDB {
  amountCents: number;
}

const PLANS_FALLBACK: Plan[] = [
  {
    id: 'monthly', nome: '1 Mês', preco: '24,59', precoOriginal: '49,19', periodo: 'pagamento único',
    destaque: false, badge: null, poupanca: null, ordem: 0,
    amountCents: 2459,
    funcionalidades: ['Acesso total ao grupo VIP', 'Palpites diários premium', 'Análises pré-jogo', 'Suporte por mensagem', 'Gestão de banca básica'],
  },
  {
    id: 'quarterly', nome: '3 Meses', preco: '61,49', precoOriginal: '135,29', periodo: 'pagamento único',
    destaque: false, badge: '⚡ MAIS POPULAR', poupanca: null, ordem: 1,
    amountCents: 6149,
    funcionalidades: ['Tudo do plano 1 Mês', 'Palpites live em tempo real', 'Análises ao vivo', 'Suporte prioritário 24/7', 'Estratégias avançadas', 'Grupo de discussão exclusivo'],
  },
  {
    id: 'yearly', nome: '1 Ano', preco: '245,99', precoOriginal: '307,49', periodo: 'pagamento único',
    destaque: true, badge: '👑 MELHOR VALOR', poupanca: null, ordem: 2,
    amountCents: 24599,
    funcionalidades: ['Tudo do plano 3 Meses', 'Acesso durante 1 ano completo', 'Mentoria personalizada', 'Acesso antecipado a novidades', 'Badge exclusiva de fundador', 'Canal VIP dentro do VIP', 'Bónus: curso de apostas'],
  },
];

function pctOff(plan: Plan): number | null {
  if (!plan.precoOriginal) return null;
  const now = parseFloat(plan.preco.replace(',', '.'));
  const orig = parseFloat(plan.precoOriginal.replace(',', '.'));
  if (!now || !orig || orig <= now) return null;
  return Math.round((1 - now / orig) * 100);
}

export default function Plans() {
  const [loadingStripe, setLoadingStripe] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>(PLANS_FALLBACK);
  const [pending, setPending] = useState<Plan | null>(null);
  const [telegramLoggedIn, setTelegramLoggedIn] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ id: string; message: string } | null>(null);
  const { user, membro } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('planos')
      .select('*')
      .order('ordem')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const merged: Plan[] = (data as PlanoDB[]).map((dbPlan, i) => {
            const fallback = PLANS_FALLBACK[i % PLANS_FALLBACK.length];
            return {
              ...fallback,
              ...dbPlan,
              id: fallback.id, // always keep the string key used by the API
              amountCents: fallback.amountCents,
            };
          });
          setPlans(merged);
        }
      });
  }, []);

  const refreshTelegram = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/me');
      const data = await res.json();
      setTelegramLoggedIn(Boolean(data.loggedIn));
    } catch {
      setTelegramLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    refreshTelegram();
    window.addEventListener('tg-auth', refreshTelegram);
    return () => window.removeEventListener('tg-auth', refreshTelegram);
  }, [refreshTelegram]);

  const startCheckout = async (plan: Plan) => {
    if (!user || !membro) {
      navigate('/login');
      return;
    }
    setPending(null);
    setLoadingStripe(plan.id);
    try {
      const origin = window.location.origin;
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          userId: user.id,
          userEmail: membro.email,
          successUrl: `${origin}/profile?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/plans`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Erro ao criar sessão de pagamento');
      }
      window.location.href = data.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setToast({ id: String(Date.now()), message });
      setLoadingStripe(null);
    }
  };

  const isActive = membro?.subscription_status === 'active';
  const gateReady = telegramLoggedIn === true;

  const ctaLabel = (plan: Plan) => {
    if (isActive) return 'Plano Ativo';
    if (loadingStripe === plan.id) return null;
    if (!gateReady) return 'Inicia sessão com o Telegram';
    return `Escolher ${plan.nome}`;
  };

  return (
    <div className="plans-page">
      <Navbar />

      <div className="plans-wrapper">
        <div className="plans-header">
          <h1 className="plans-title">Escolhe o teu Plano VIP</h1>
          <p className="plans-subtitle">Pagamento único · acesso imediato ao grupo VIP no Telegram</p>
          {isActive && (
            <div className="plans-active-badge">✓ Já tens uma subscrição VIP ativa</div>
          )}
        </div>

        <TelegramGate />

        <div className="plans-grid">
          {plans.map((plan) => {
            const off = pctOff(plan);
            return (
              <div key={plan.id} className={`plan-card ${plan.destaque ? 'featured' : ''} ${plan.badge && !plan.destaque ? 'popular' : ''}`}>
                {plan.badge && <div className="best-value-badge">{plan.badge}</div>}

                <h3 className="plan-name">{plan.nome}</h3>

                <div className="price-section">
                  <div className="price">
                    {plan.preco}€<span className="period"> {plan.periodo}</span>
                  </div>
                  <div className="price-compare">
                    {plan.precoOriginal && <span className="price-original">{plan.precoOriginal}€</span>}
                    {off !== null && <span className="price-off">-{off}%</span>}
                  </div>
                </div>

                <ul className="features-list">
                  {(plan.funcionalidades ?? []).map((feature, index) => (
                    <li key={index}>
                      <Check size={18} color={plan.destaque ? '#9a6238' : '#10b981'} className="feature-icon" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => (gateReady ? setPending(plan) : undefined)}
                  disabled={loadingStripe !== null || isActive || !gateReady}
                  className={`plan-btn ${plan.destaque ? 'featured-btn' : ''} ${loadingStripe === plan.id ? 'loading' : ''}`}
                >
                  {loadingStripe === plan.id ? <Loader2 size={18} className="animate-spin" /> : ctaLabel(plan)}
                </button>
              </div>
            );
          })}
        </div>

        <div className="plans-trust">
          <div className="plans-trust__item"><ShieldCheck size={18} /> Pagamento seguro via Stripe</div>
          <div className="plans-trust__item"><Lock size={18} /> Encriptação SSL</div>
          <div className="plans-trust__item"><Zap size={18} /> Acesso imediato</div>
        </div>

        <FunilVip />
      </div>

      {pending && (
        <div className="plans-confirm" role="dialog" aria-modal="true" onClick={() => setPending(null)}>
          <div className="plans-confirm__box" onClick={(e) => e.stopPropagation()}>
            <button className="plans-confirm__close" onClick={() => setPending(null)} aria-label="Fechar">
              <X size={18} />
            </button>
            <h3>Confirmar plano</h3>
            <p className="plans-confirm__plan">
              {pending.nome} — <strong>{pending.preco}€</strong> <span>(pagamento único)</span>
            </p>
            <p className="plans-confirm__note">
              Após o pagamento, o link de acesso ao grupo VIP aparece nesta página automaticamente.
            </p>
            <button className="plan-btn featured-btn" onClick={() => startCheckout(pending)}>
              Continuar para o pagamento
            </button>
            <button className="plans-confirm__cancel" onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {toast && (
        <Toast id={toast.id} message={toast.message} type="error" onClose={() => setToast(null)} />
      )}
    </div>
  );
}
