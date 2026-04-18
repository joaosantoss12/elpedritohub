import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Plans.css';

interface PlanoDB {
  id: string;
  nome: string;
  preco: string;
  periodo: string;
  destaque: boolean;
  badge: string | null;
  poupanca: string | null;
  funcionalidades: string[];
  ordem: number;
  stripe_price_id: string | null;
}

const PLANS_FALLBACK: PlanoDB[] = [
  {
    id: 'monthly', nome: 'Mensal', preco: '19,99€', periodo: '/mês',
    destaque: false, badge: null, poupanca: null, ordem: 0,
    stripe_price_id: null,
    funcionalidades: ['Acesso ao grupo VIP Telegram', 'Tips Diárias', 'Análises Pré-Jogo', 'Gestão de Banca'],
  },
  {
    id: 'quarterly', nome: 'Trimestral', preco: '49,99€', periodo: '/3 meses',
    destaque: false, badge: null, poupanca: 'Poupa 10€', ordem: 1,
    stripe_price_id: null,
    funcionalidades: ['Acesso ao grupo VIP Telegram', 'Tudo do Mensal', 'Acesso Prioritário', 'Live Exclusiva Mensal', 'Suporte VIP Direto'],
  },
  {
    id: 'yearly', nome: 'Anual', preco: '189,99€', periodo: '/ano',
    destaque: true, badge: '🔥 Melhor Preço', poupanca: 'Poupa 50€', ordem: 2,
    stripe_price_id: null,
    funcionalidades: ['Acesso ao grupo VIP Telegram', 'Tudo do Mensal', 'Acesso Prioritário', 'Live Exclusiva Mensal', 'Suporte VIP Direto', 'Mentoria 1-on-1 (1x)'],
  },
];

export default function Plans() {
  const [loadingStripe, setLoadingStripe] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanoDB[]>(PLANS_FALLBACK);
  const { user, membro } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('planos')
      .select('*')
      .order('ordem')
      .then(({ data }) => {
        if (data && data.length > 0) setPlans(data as PlanoDB[]);
      });
  }, []);

  const handleCheckout = async (plan: PlanoDB) => {
    if (!user || !membro) {
      navigate('/login');
      return;
    }

    if (!plan.stripe_price_id) {
      alert('Este plano ainda não está configurado para pagamento. Contacta o suporte.');
      return;
    }

    setLoadingStripe(plan.id);

    try {
      const origin = window.location.origin;
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.stripe_price_id,
          userId: user.id,
          userEmail: membro.email,
          successUrl: `${origin}/profile?checkout=success`,
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
      alert(`Erro: ${message}`);
      setLoadingStripe(null);
    }
  };

  return (
    <div className="plans-page">
      <Navbar />
      
      <div className="plans-wrapper">
        <div className="plans-header">
          <h1 className="plans-title">Escolhe o teu Plano VIP</h1>
          <p className="plans-subtitle">Acesso a ferramentas e conhecimento exclusivo</p>
        </div>

        <div className="plans-grid">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${plan.destaque ? 'featured' : ''}`}
            >
              {plan.badge && (
                <div className="best-value-badge">{plan.badge}</div>
              )}

              <h3 className="plan-name">{plan.nome}</h3>

              <div className="price-section">
                <div className="price">
                  {plan.preco}€
                  <span className="period">{plan.periodo}</span>
                </div>
                {plan.poupanca && (
                  <p className="savings">{plan.poupanca}</p>
                )}
              </div>

              <ul className="features-list">
                {(plan.funcionalidades ?? []).map((feature, index) => (
                  <li key={index}>
                    <Check
                      size={18}
                      color={plan.destaque ? '#fbbf24' : '#10b981'}
                      className="feature-icon"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan)}
                disabled={loadingStripe !== null}
                className={`plan-btn ${plan.destaque ? 'featured-btn' : ''} ${loadingStripe === plan.id ? 'loading' : ''}`}
              >
                {loadingStripe === plan.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  `Escolher ${plan.nome}`
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="plans-benefits">
          <h2>O que inclui a subscrição VIP?</h2>
          <div className="benefits-grid">
            <div className="benefit-item">
              <div className="benefit-icon">📊</div>
              <h4>Análises Detalhadas</h4>
              <p>Tips e análises pré-jogo com base em dados concretos</p>
            </div>
            <div className="benefit-item">
              <div className="benefit-icon">💡</div>
              <h4>Estratégias Exclusivas</h4>
              <p>Acesso a estratégias de gestão de banca e risco</p>
            </div>
            <div className="benefit-item">
              <div className="benefit-icon">👥</div>
              <h4>Comunidade VIP</h4>
              <p>Acesso direto a suporte e comunidade exclusiva</p>
            </div>
            <div className="benefit-item">
              <div className="benefit-icon">🎯</div>
              <h4>Mentoria Personalizada</h4>
              <p>Sessões 1-on-1 com especialistas (plano anual)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
