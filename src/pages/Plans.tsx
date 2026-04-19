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
    id: 'monthly', nome: '1 Mês', preco: '29,99', precoOriginal: '39,99', periodo: 'pagamento único',
    destaque: false, badge: null, poupanca: null, ordem: 0,
    amountCents: 2999,
    funcionalidades: ['Acesso total ao grupo VIP', 'Palpites diários premium', 'Análises pré-jogo', 'Suporte por mensagem', 'Gestão de banca básica'],
  },
  {
    id: 'quarterly', nome: '3 Meses', preco: '69,99', precoOriginal: '109,99', periodo: 'pagamento único',
    destaque: false, badge: '⚡ MAIS POPULAR', poupanca: 'Poupa 20€', ordem: 1,
    amountCents: 6999,
    funcionalidades: ['Tudo do plano 1 Mês', 'Palpites live em tempo real', 'Análises ao vivo', 'Suporte prioritário 24/7', 'Estratégias avançadas', 'Grupo de discussão exclusivo'],
  },
  {
    id: 'yearly', nome: '1 Ano', preco: '149,99', precoOriginal: '249,99', periodo: 'pagamento único',
    destaque: true, badge: '👑 MELHOR VALOR', poupanca: 'Poupa 100€', ordem: 2,
    amountCents: 14999,
    funcionalidades: ['Tudo do plano 3 Meses', 'Acesso durante 1 ano completo', 'Mentoria personalizada', 'Acesso antecipado a novidades', 'Badge exclusiva de fundador', 'Canal VIP dentro do VIP', 'Bónus: curso de apostas'],
  },
];

export default function Plans() {
  const [loadingStripe, setLoadingStripe] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>(PLANS_FALLBACK);
  const { user, membro } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('planos')
      .select('*')
      .order('ordem')
      .then(({ data }) => {
        if (data && data.length > 0) {
          // merge Supabase display data with hardcoded billing info by position
          const merged: Plan[] = (data as PlanoDB[]).map((dbPlan, i) => ({
            ...PLANS_FALLBACK[i % PLANS_FALLBACK.length],
            ...dbPlan,
            amountCents: PLANS_FALLBACK[i % PLANS_FALLBACK.length].amountCents,
          }));
          setPlans(merged);
        }
      });
  }, []);

  const handleCheckout = async (plan: Plan) => {
    if (!user || !membro) {
      navigate('/login');
      return;
    }

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
      alert(`Erro: ${message}`);
      setLoadingStripe(null);
    }
  };

  const isActive = membro?.subscription_status === 'active';

  return (
    <div className="plans-page">
      <Navbar />
      
      <div className="plans-wrapper">
        <div className="plans-header">
          <h1 className="plans-title">Escolhe o teu Plano VIP</h1>
          <p className="plans-subtitle">Acesso a ferramentas e conhecimento exclusivo</p>
          {isActive && (
            <div style={{
              marginTop: '1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(139,92,246,0.12)',
              border: '1px solid rgba(139,92,246,0.5)',
              borderRadius: '20px',
              padding: '0.5rem 1.25rem',
              color: '#8b5cf6',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}>
              ✓ Já tens uma subscrição VIP ativa
            </div>
          )}
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
                  <span className="period"> {plan.periodo}</span>
                </div>
                {plan.precoOriginal && (
                  <p style={{ color: 'var(--text-gray)', fontSize: '0.8rem', textDecoration: 'line-through', marginTop: '0.2rem' }}>
                    {plan.precoOriginal}€
                  </p>
                )}
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
                disabled={loadingStripe !== null || isActive}
                className={`plan-btn ${plan.destaque ? 'featured-btn' : ''} ${loadingStripe === plan.id ? 'loading' : ''}`}
              >
                {isActive ? (
                  'Plano Ativo'
                ) : loadingStripe === plan.id ? (
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
