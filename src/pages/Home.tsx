import {
  CheckCircle2, User,
  Trophy, Clock, Gift, BarChart3, Navigation, Check, X, ArrowUp, ShieldCheck
} from 'lucide-react';
import '../index.css';
import { useState, useEffect, useMemo } from 'react';
import { Navbar } from '../components/Navbar';
import { CountingNumber } from '../components/CountingNumber';
import { RaioXResumo } from '../components/RaioXResumo';
import SlotWinsSlider from '../components/SlotWinsSlider';
import { supabase } from '../lib/supabase';
import {
  carregarTips, calcularStats, lucroDaTip, fmtUnidades, fmtPercent,
  VERTICAL_LABELS, type RaioxTip,
} from '../lib/raiox';
import { useNavigate } from 'react-router';

interface LucroMes {
  lucro: number;
}

interface LucroSemana {
  lucro: number;
}

interface BilheteDia {
  acertos: number;
  possiveis: number;
  odd: number;
  ganhos: number;
}

interface TopAposta {
  mercado: string;
  jogo: string;
  odd: number;
  valor_apostado: number;
  valor_ganho: number;
  imagem_url: string | null;
}

interface PalpiteDia {
  id: string;
  team: string;
  league: string;
  odd: string;
  time: string;
  color: string;
}

function Home() {
  const [showImageModal, setShowImageModal] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  const [lucroMes, setLucroMes] = useState<LucroMes | null>(null);
  const [lucroSemana, setLucroSemana] = useState<LucroSemana | null>(null);
  const [bilheteDia, setBilheteDia] = useState<BilheteDia | null>(null);
  const [topAposta, setTopAposta] = useState<TopAposta | null>(null);
  const [palpites, setPalpites] = useState<PalpiteDia[]>([]);
  const [raioxTips, setRaioxTips] = useState<RaioxTip[]>([]);

  const navigate = useNavigate();

  // Histórico auditado do canal público — serve de prova social enquanto os
  // dados internos ainda são modestos (roadmap 5).
  useEffect(() => {
    carregarTips({ canal: 'publico', desdeDias: 90, limite: 400 }).then(setRaioxTips);
  }, []);

  const raioxStats = useMemo(() => calcularStats(raioxTips), [raioxTips]);

  const raioxMes = useMemo(() => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    return calcularStats(raioxTips.filter(t => new Date(t.publicado_em) >= inicioMes));
  }, [raioxTips]);

  /** Últimos greens do canal público — substituem os resultados fictícios. */
  const ultimosGreens = useMemo(
    () => raioxTips.filter(t => t.resultado === 'green').slice(0, 4),
    [raioxTips]
  );

  /** Green mais recente, para o cartão do bilhete quando não há bilhete do dia. */
  const ultimoGreen = ultimosGreens[0] ?? null;

  /** Maior green do período — substitui a Top Aposta em falta. */
  const melhorGreen = useMemo(() => {
    const greens = raioxTips.filter(t => t.resultado === 'green');
    if (!greens.length) return null;
    return greens.reduce((a, b) => (lucroDaTip(b) > lucroDaTip(a) ? b : a));
  }, [raioxTips]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const mesPrefix = today.slice(0, 7) + '-01';

    const fetchWithFallback = async () => {
      const [lucroRes, semanaRes, bilheteRes, topRes, palpitesRes] = await Promise.all([
        supabase.from('home_lucro_mes').select('lucro').eq('mes', mesPrefix).maybeSingle(),
        supabase.from('home_lucro_semana').select('lucro').lte('semana', today).order('semana', { ascending: false }).limit(1),
        supabase.from('home_bilhete_dia').select('acertos, possiveis, odd, ganhos').eq('data', today).maybeSingle(),
        supabase.from('home_top_aposta').select('mercado, jogo, odd, valor_apostado, valor_ganho, imagem_url').eq('data', today).maybeSingle(),
        supabase.from('home_palpites_dia').select('id, team, league, odd, time, color').eq('data', today).order('ordem'),
      ]);

      if (lucroRes.data) setLucroMes(lucroRes.data);
      if (semanaRes.data && semanaRes.data.length > 0) setLucroSemana(semanaRes.data[0]);

      // Bilhete: fallback para o mais recente
      if (bilheteRes.data) {
        setBilheteDia(bilheteRes.data);
      } else {
        const { data } = await supabase
          .from('home_bilhete_dia')
          .select('acertos, possiveis, odd, ganhos')
          .lt('data', today)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setBilheteDia(data);
      }

      // Top Aposta: fallback para o mais recente
      if (topRes.data) {
        setTopAposta(topRes.data);
      } else {
        const { data } = await supabase
          .from('home_top_aposta')
          .select('mercado, jogo, odd, valor_apostado, valor_ganho, imagem_url')
          .lt('data', today)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setTopAposta(data);
      }

      // Palpites: fallback para o dia mais recente com palpites
      if (palpitesRes.data && palpitesRes.data.length > 0) {
        setPalpites(palpitesRes.data as PalpiteDia[]);
      } else {
        const { data: latestDate } = await supabase
          .from('home_palpites_dia')
          .select('data')
          .lt('data', today)
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestDate?.data) {
          const { data } = await supabase
            .from('home_palpites_dia')
            .select('id, team, league, odd, time, color')
            .eq('data', latestDate.data)
            .order('ordem');
          if (data) setPalpites(data as PalpiteDia[]);
        }
      }
    };

    fetchWithFallback();
  }, []);
  
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '5rem', overflowX: 'clip' }}>
      <style>{`
        @media (max-width: 768px) {
          main {
            flex-direction: column !important;
            padding: 2rem 5% !important;
            background-attachment: scroll !important;
          }

          main > div:first-child {
            max-width: 100% !important;
          }

          main > div:last-child {
            width: 100% !important;
            height: auto !important;
            margin-top: 2rem !important;
            position: relative !important;
          }

          nav {
            flex-direction: column !important;
            align-items: center !important;
            gap: 1rem !important;
          }

          nav > div:first-child {
            order: 0;
            flex: 0 0 auto;
            width: 100% !important;
            display: flex !important;
            justify-content: center !important;
          }

          nav ul {
            flex-direction: row !important;
            gap: 0.8rem !important;
            font-size: 0.65rem !important;
            order: 0;
            flex: 1 1 100%;
            justify-content: center !important;
            width: 100% !important;
          }

          nav > div:last-child {
            flex-direction: row !important;
            width: 100% !important;
            order: 0;
            gap: 0.5rem !important;
            justify-content: center !important;
          }

          nav > div:last-child button {
            width: auto !important;
            font-size: 0.7rem !important;
            padding: 0.5rem 0.8rem !important;
          }

          section[style*="background: var(--gold-primary)"] {
            flex-direction: column !important;
            gap: 1.5rem !important;
            padding: 1.5rem 2rem !important;
            margin: 2rem 5% !important;
            text-align: center !important;
            align-items: center !important;
          }

          section[style*="background: var(--gold-primary)"] > div {
            flex-direction: row !important;
            width: auto !important;
            text-align: center !important;
            flex: 0 0 auto !important;
            gap: 0.5rem !important;
          }

          .promo-banner {
            flex-direction: column !important;
            text-align: center !important;
            padding: 1.5rem !important;
            gap: 1.5rem !important;
            align-items: center !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }

          .promo-banner > div:first-child {
            flex-direction: column !important;
            gap: 1rem !important;
            align-items: center !important;
            width: 100% !important;
          }

          .promo-banner > div:last-child {
            flex-direction: column !important;
            gap: 1rem !important;
            width: 100% !important;
            align-items: center !important;
          }

          .promo-banner > div:last-child > svg {
            display: none !important;
          }

          .promo-banner button {
            width: 100% !important;
          }

          h1 {
            font-size: 2.5rem !important;
            line-height: 1.2 !important;
          }

          .font-signature {
            margin-left: 0 !important;
            font-size: 2rem !important;
          }

          [style*="display: flex"][style*="gap: 1rem"][style*="marginBottom: 3.5rem"] {
            flex-direction: column !important;
            width: 100% !important;
          }

          [style*="display: flex"][style*="gap: 2rem"][style*="color: var(--text-gray)"][style*="fontSize: 0.85rem"] {
            flex-direction: column !important;
            gap: 1rem !important;
            align-items: flex-start !important;
          }

          .hero-card {
            position: relative !important;
            top: auto !important;
            right: auto !important;
            left: auto !important;
            bottom: auto !important;
            margin-bottom: 1rem !important;
            width: 100% !important;
            min-width: auto !important;
            display: none !important;
          }

          [style*="gridTemplateColumns: 'repeat(auto-fit"] {
            grid-template-columns: 1fr !important;
          }

          section[style*="margin: '0 5% 4rem 5%'"] {
            flex-direction: column !important;
            width: calc(100% - 10%) !important;
          }

          .card-premium > div:first-child {
            flex-wrap: wrap !important;
            gap: 1rem !important;
            justify-content: center !important;
          }

          .card-premium > div:first-child h3 {
            flex: 0 1 auto !important;
            white-space: nowrap !important;
            font-size: 0.9rem !important;
          }

          .card-premium > div:first-child span {
            flex: 0 0 auto !important;
            white-space: nowrap !important;
          }

          section[id="resultados-section"] > div:first-child {
            flex-direction: column !important;
            align-items: center !important;
            gap: 1.5rem !important;
            text-align: center !important;
          }

          section[id="resultados-section"] button {
            align-self: center !important;
          }

          .desktop-only {
            display: none !important;
          }
        }

          .hero-checks {
            display: flex;
            gap: 2rem;
            color: var(--text-gray);
            font-size: 0.85rem;
            font-weight: 500;
          }

          @media (max-width: 768px) {
            .hero-checks {
              display: grid !important;
              grid-template-columns: 1fr 1fr !important;
              gap: 0.75rem !important;
              justify-items: center !important;
            }
          }
      `}</style>
      
      {/* BOTÃO SCROLL PARA TOPO */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--gold-primary), #b38b3b)',
            border: 'none',
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: '999',
            boxShadow: '0 10px 30px rgba(230,185,92,0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 15px 40px rgba(230,185,92,0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(230,185,92,0.3)';
          }}
        >
          <ArrowUp size={24} />
        </button>
      )}
      
      {/* MODAL PARA IMAGEM BET DO DIA */}
      {showImageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{ position: 'relative' }}>
            <img 
              src={topAposta?.imagem_url ?? '/betdodia.jpeg'} 
              alt="Top Aposta" 
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                borderRadius: '16px',
                border: '2px solid rgba(230,185,92,0.6)'
              }}
            />
            <button
              onClick={() => setShowImageModal(false)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.5rem',
                padding: '0.5rem'
              }}
            >
              <X size={32} />
            </button>
          </div>
        </div>
      )}
      {/* NAVBAR */}
      <Navbar />

      {/* --------------------------------------------------- */}
      {/* HERO SECTION                                        */}
      {/* --------------------------------------------------- */}
      <main style={{ 
        display: 'flex', 
        padding: '5rem 5%', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        position: 'relative',
        backgroundImage: 'linear-gradient(rgba(10, 10, 10, 0.75), rgba(10, 10, 10, 0.75)), url(/elpedrito.jpeg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}>
        
        {/* Coluna Esquerda - Texto */}
        <div style={{ maxWidth: '600px', zIndex: 10 }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            background: 'rgba(34, 197, 94, 0.1)', 
            padding: '0.4rem 1rem', 
            borderRadius: '20px', 
            fontSize: '0.75rem',
            color: 'var(--green-success)',
            marginBottom: '2rem',
            border: '1px solid rgba(34, 197, 94, 0.2)'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green-success)' }}></div>
            42.000+ MEMBROS ATIVOS
          </div>

          <h1 style={{ 
            fontSize: '4.8rem', 
            lineHeight: '1.05', 
            fontWeight: '900', 
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '-1px'
          }}>
            Transforma <br />
            apostas em <br />
            <span style={{ color: 'var(--gold-primary)' }}>Lucro Real</span>
          </h1>
          <p className="font-signature" style={{ 
            fontSize: '3.5rem', 
            color: 'var(--gold-primary)',
            marginBottom: '1.5rem',
            marginTop: '-1.5rem',
            marginLeft: '2rem',
            transform: 'rotate(-2deg)'
          }}>
            todos os dias
          </p>

          <p style={{ color: 'var(--text-gray)', fontSize: '1.1rem', marginBottom: '2.5rem', maxWidth: '420px', lineHeight: '1.6' }}>
            As melhores análises, as odds mais valiosas e uma comunidade que não para de ganhar.
          </p>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '3.5rem' }}>
            <button className="btn-gold" style={{ fontSize: '1rem', padding: '1.2rem 2rem' }} onClick={() => window.open('https://t.me/+ScE3U93x9IVkNDY0', '_blank')}>
              <Navigation size={20} fill="currentColor" style={{ transform: 'rotate(45deg)' }} /> ENTRAR <span style={{ display: 'none' }} className="desktop-only"> NO GRUPO</span>
            </button>
            <button className="btn-outline" style={{ fontSize: '1rem', padding: '1.2rem 2rem' }} onClick={() => document.getElementById('resultados-section')?.scrollIntoView({ behavior: 'smooth' })}>
              VER RESULTADOS
            </button>
          </div>

          <div className="hero-checks">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle2 size={16} color="var(--gold-primary)" /> PALPITES DIÁRIOS</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle2 size={16} color="var(--gold-primary)" /> BILHETES PRONTOS</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle2 size={16} color="var(--gold-primary)" /> ANÁLISES EXCLUSIVAS</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle2 size={16} color="var(--gold-primary)" /> LUCROS REAIS</span>
          </div>
        </div>

        {/* --------------------------------------------------- */}
        {/* HERO SECTION - COLUNA DIREITA (IMAGEM + CARDS)      */}
        {/* --------------------------------------------------- */}
        <div style={{ 
          position: 'relative', 
          width: '550px', 
          height: '650px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          marginTop: '-50px' 
        }}>
          
          {/* CARTÃO 1: LUCRO DO MÊS */}
          <div className="hero-card" style={{ 
            position: 'absolute', 
            top: '5%', 
            right: '-10%', 
            background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
            backdropFilter: 'blur(10px)', 
            padding: '1.2rem 2rem', 
            borderRadius: '16px',
            border: '1px solid rgba(230,185,92,0.4)', 
            zIndex: 10,
            '--base-rotate': '3deg',
            '--base-translate-y': '0px',
            boxShadow: '0 30px 60px -15px rgba(0,0,0,0.9), 0 0 25px rgba(230,185,92,0.15), inset 0 1px 1px rgba(255,255,255,0.15)', 
            minWidth: '220px'
          } as React.CSSProperties}>
            {lucroMes && lucroMes.lucro > 0 ? (
              <>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)', marginBottom: '0.5rem', fontWeight: '600' }}>LUCRO DO MÊS</p>
                <p style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--green-success)' }}>
                  +<CountingNumber value={lucroMes.lucro} duration={2500} decimals={2} suffix="€" />
                </p>
              </>
            ) : (
              /* Sem lucro interno registado, mostra o canal público em vez de 0,00€ */
              <>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)', marginBottom: '0.5rem', fontWeight: '600' }}>LUCRO DO MÊS · CANAL PÚBLICO</p>
                <p style={{ fontSize: '2.2rem', fontWeight: '900', color: raioxMes.lucroUnidades >= 0 ? 'var(--green-success)' : '#ef4444' }}>
                  {raioxMes.resolvidas > 0 ? fmtUnidades(raioxMes.lucroUnidades) : '—'}
                </p>
                <p style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={11} /> {raioxMes.resolvidas} tips auditadas
                </p>
              </>
            )}
          </div>

          {/* CARTÃO 2: BILHETE DO DIA */}
          <div className="hero-card" style={{ 
            position: 'absolute', 
            top: '35%', 
            right: '-5%', 
            background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
            backdropFilter: 'blur(10px)', 
            padding: '1.2rem', 
            borderRadius: '16px',
            border: '1px solid rgba(34,197,94,0.3)', 
            zIndex: 10,
            '--base-rotate': '-2.5deg',
            '--base-translate-y': '0px',
            boxShadow: '0 30px 60px -15px rgba(0,0,0,0.9), 0 0 25px rgba(34,197,94,0.1), inset 0 1px 1px rgba(255,255,255,0.15)', 
            minWidth: '220px'
          } as React.CSSProperties}>
            {bilheteDia ? (
              <>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)', marginBottom: '0.8rem', fontWeight: '600' }}>BILHETE DO DIA</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                   <div style={{ background: 'var(--green-success)', padding: '3px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <Check size={16} strokeWidth={4} color="#000" />
                   </div>
                   <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--green-success)' }}>
                     {bilheteDia.acertos}/{bilheteDia.possiveis} ACERTOS
                   </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                   <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', fontWeight: '500' }}>
                     ODD <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '1rem', marginLeft: '5px' }}>
                       {bilheteDia.odd.toFixed(2)}
                     </span>
                   </span>
                   <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)' }}>GANHOS</p>
                      <p style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--green-success)' }}>
                        <CountingNumber value={bilheteDia.ganhos} duration={2500} suffix="€" />
                      </p>
                   </div>
                </div>
              </>
            ) : (
              /* Sem bilhete registado, mostra o último green real do canal */
              <>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)', marginBottom: '0.8rem', fontWeight: '600' }}>ÚLTIMO GREEN · CANAL PÚBLICO</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem' }}>
                   <div style={{ background: 'var(--green-success)', padding: '3px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <Check size={16} strokeWidth={4} color="#000" />
                   </div>
                   <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--green-success)', lineHeight: 1.2 }}>
                     {ultimoGreen?.evento ?? '—'}
                   </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                   <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', fontWeight: '500' }}>
                     ODD <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '1rem', marginLeft: '5px' }}>
                       {ultimoGreen?.odd.toFixed(2) ?? '—'}
                     </span>
                   </span>
                   <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)' }}>LUCRO</p>
                      <p style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--green-success)' }}>
                        {ultimoGreen ? fmtUnidades(lucroDaTip(ultimoGreen)) : '—'}
                      </p>
                   </div>
                </div>
              </>
            )}
          </div>

          {/* CARTÃO 3: TOP APOSTA */}
          <div className="hero-card" style={{ 
            position: 'absolute', 
            bottom: '15%', 
            left: '-20%', 
            background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
            backdropFilter: 'blur(10px)', 
            padding: '1rem', 
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 10,
            '--base-rotate': '2deg',
            '--base-translate-y': '-10px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 15px rgba(255,255,255,0.05), inset 0 1px 1px rgba(255,255,255,0.15)',
            width: '260px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem'
          } as React.CSSProperties}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-gray)', fontWeight: '600', letterSpacing: '1px' }}>
                {topAposta ? 'TOP APOSTA' : 'MAIOR GREEN · CANAL PÚBLICO'}
              </p>
              {topAposta?.imagem_url && (
                <button
                  onClick={() => setShowImageModal(true)}
                  style={{
                    background: 'rgba(230,185,92,0.1)',
                    border: '1px solid rgba(230,185,92,0.3)',
                    color: 'var(--gold-primary)',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.6rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  VER IMAGEM
                </button>
              )}
            </div>
            <div>
              <p style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>
                {topAposta?.mercado ?? melhorGreen?.pick ?? '—'}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginTop: '0.3rem' }}>
                {topAposta?.jogo ?? melhorGreen?.evento ?? '—'}
              </p>
            </div>
            <div style={{ borderTop: '1px solid #333', paddingTop: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)' }}>ODD</p>
                <p style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--gold-primary)' }}>
                  {(topAposta?.odd ?? melhorGreen?.odd)?.toFixed(2) ?? '—'}
                </p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)' }}>{topAposta ? 'APOSTA' : 'STAKE'}</p>
                <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                  {topAposta
                    ? `${topAposta.valor_apostado.toFixed(0)}€`
                    : melhorGreen ? `${melhorGreen.stake}u` : '—'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-gray)' }}>{topAposta ? 'GANHOS' : 'LUCRO'}</p>
                <p style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--green-success)' }}>
                  {topAposta
                    ? <CountingNumber value={topAposta.valor_ganho} duration={2500} suffix="€" />
                    : melhorGreen ? fmtUnidades(lucroDaTip(melhorGreen)) : '—'}
                </p>
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* --------------------------------------------------- */}
      {/* FAIXA DE ESTATÍSTICAS (GOLDEN BANNER)               */}
      {/* --------------------------------------------------- */}
      <section style={{ 
        background: 'var(--gold-primary)', 
        color: '#000', 
        margin: '0 5% 3rem 5%', 
        padding: '2rem 4rem', 
        borderRadius: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <User size={36} />
          <div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: '900', lineHeight: '1.1' }}>42.000+</h3>
            <p style={{ fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1px' }}>MEMBROS</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Gift size={36} />
          <div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: '900', lineHeight: '1.1' }}>
              {raioxStats.resolvidas > 0 ? fmtPercent(raioxStats.taxaAcerto) : '—'}
            </h3>
            <p style={{ fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1px' }}>TAXA DE ACERTOS</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <BarChart3 size={36} /> 
          <div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: '900', lineHeight: '1.1' }}>
              {raioxStats.resolvidas > 0 ? fmtUnidades(raioxStats.lucroUnidades) : '—'}
            </h3>
            <p style={{ fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1px' }}>
              {raioxStats.resolvidas > 0 ? 'LUCRO · 90 DIAS' : 'LUCRO GERADO'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Clock size={36} />
          <div>
            <h3 style={{ fontSize: '1.8rem', fontWeight: '900', lineHeight: '1.1' }}>24/7</h3>
            <p style={{ fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1px' }}>SUPORTE ATIVO</p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- */}
      {/* RAIO-X EPC — prova social do canal público           */}
      {/* --------------------------------------------------- */}
      <div style={{ padding: '0 5%', marginBottom: '3rem' }}>
        <RaioXResumo />
      </div>

      {/* --------------------------------------------------- */}
      {/* GRELHA PRINCIPAL (3 COLUNAS)                        */}
      {/* --------------------------------------------------- */}
      <section style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: '1.5rem', 
        padding: '0 5%', 
        marginBottom: '3rem' 
      }}>
        
        {/* Cartão 1: Picks do Dia */}
        <div className="card-premium">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>PALPITES DO DIA</h3>
            <span style={{ fontSize: '0.65rem', color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: 'bold', border: '1px solid #333', padding: '0.3rem 0.6rem', borderRadius: '4px' }}>VER TODOS</span>
          </div>
          
          {palpites.length === 0 ? (
            <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>Sem palpites para hoje</p>
          ) : (
            palpites.map((pick, i) => (
              <div key={pick.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: i !== palpites.length - 1 ? '1px solid #222' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: pick.color, border: '2px solid #333' }}></div>
                  <div>
                    <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{pick.team}</p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-gray)' }}>{pick.league}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '0.95rem' }}>♦ {pick.odd}</p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-gray)' }}>{pick.time}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cartão 2: Comunidade */}
        <div className="card-premium">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>COMUNIDADE QUE GANHA</h3>
            <span style={{ fontSize: '0.65rem', color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: 'bold', border: '1px solid #333', padding: '0.3rem 0.6rem', borderRadius: '4px' }}>VER PROVAS</span>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', background: '#0a0a0a', padding: '1rem', borderRadius: '8px', border: '1px solid #222' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#222', flexShrink: 0, border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={20} color="#888" />
            </div>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Nome Privado</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginTop: '0.2rem', lineHeight: '1.4' }}>Fiz +620€ com o VIP só ontem! 🔥</p>
              <p style={{ fontSize: '0.65rem', color: '#666', textAlign: 'right', marginTop: '0.5rem' }}>há 3 horas</p>
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '2.5rem', color: 'var(--gold-primary)', fontWeight: '900', lineHeight: '1' }}>+<CountingNumber value={lucroSemana?.lucro ?? 0} duration={2500} decimals={2} suffix="€" /></h2>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-gray)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '0.5rem' }}>Lucro gerado esta semana</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
               <div style={{ display: 'flex' }}>
                 {[1,2,3,4].map(n => (
                   <div key={n} style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#222', border: '2px solid var(--bg-card)', marginLeft: n !== 1 ? '-10px' : '0', zIndex: 5-n, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     <User size={14} color="#888" />
                   </div>
                 ))}
               </div>
               <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', fontWeight: 'bold' }}>+234 membros</span>
            </div>
          </div>
        </div>

        {/* Cartão 3: Melhores Ofertas */}
        <div id="ofertas-section" className="card-premium">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>MELHOR CASINO PARA TI</h3>
            <img src="/capitansbet.png" alt="CapitansBet" style={{ height: '40px', objectFit: 'contain' }} />
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '340px', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '4px' }}>
            {[
              {
                title: 'Bónus de Boas-Vindas – 100% no 1º Depósito',
                tag: '1º DEPÓSITO',
                tagColor: 'var(--gold-primary)',
                details: ['👉 5€ a 100€ → Bónus 100% até 100€', '🔁 Wagering: 8x depósito', '✅ Odds: 1.5–25 | Total: 3.5+ | Mín. 3 jogos'],
              },
              {
                title: '50% no 2º Depósito',
                tag: '2º DEPÓSITO',
                tagColor: '#e07b39',
                details: ['👉 5€ a 100€ → Bónus 50%', '🔁 Wagering: 5x depósito', '✅ Odds: 1.5–10 | Mín. 2 jogos | ⏳ 24h'],
              },
              {
                title: '30% no 3º Depósito',
                tag: '3º DEPÓSITO',
                tagColor: '#e07b39',
                details: ['👉 5€ a 100€ → Bónus 30%', '🔁 Wagering: 5x depósito', '✅ Odds: 1.5–10 | Mín. 2 jogos | ⏳ 24h'],
              },
              {
                title: '20% no 4º Depósito',
                tag: '4º DEPÓSITO',
                tagColor: '#e07b39',
                details: ['👉 5€ a 100€ → Bónus 20%', '🔁 Wagering: 5x depósito', '✅ Odds: 1.5–10 | Mín. 2 jogos | ⏳ 24h'],
              },
              {
                title: 'Free Spins – Até 100 Rodadas Grátis!',
                tag: 'FREE SPINS',
                tagColor: '#9b59b6',
                details: ['🎰 Flaming Bells (Playson)', '👉 30–50€ → 30 FS | 50–100€ → 50 FS | 100€+ → 100 FS', '🔁 5x depósito | ⏳ 24h | ✅ Seg, Qui, Sáb, Dom'],
              },
              {
                title: 'Segunda-Feira – Free Bet Semanal',
                tag: 'SEGUNDA',
                tagColor: 'var(--green-success)',
                details: ['👉 10–20€ → 10€ FB | 20–40€ → 20€ FB', '🔁 5x depósito | Odds: 1.5–10 | Mín. 3 seleções'],
              },
              {
                title: 'Quarta-Feira – Free Bet Especial',
                tag: 'QUARTA',
                tagColor: 'var(--green-success)',
                details: ['👉 15–25€ → 15€ FB | 25–50€ → 25€ FB | 50–100€ → 50€ FB', '🔁 10x depósito | Odds: 1.7–10 | Mín. 3 seleções'],
              },
              {
                title: 'Seg & Ter – Bónus até 100%',
                tag: 'SEG / TER',
                tagColor: 'var(--gold-primary)',
                details: ['👉 30–50€ → 30% | 50–100€ → 50% | 100€+ → 100%', '🔁 35x depósito | Odds: 1.6–10 | Mín. 3 seleções'],
              },
              {
                title: 'Quarta – 25 Free Spins Sun of Egypt',
                tag: 'FREE SPINS',
                tagColor: '#9b59b6',
                details: ['🎰 Sun of Egypt', '👉 25–100€ → 25 Rodadas Grátis', '🔁 5x depósito | ⏳ 24h | ✅ Todas as quartas'],
              },
              {
                title: 'Ter, Qui & Sex – Free Bets',
                tag: 'TER / QUI / SEX',
                tagColor: 'var(--green-success)',
                details: ['👉 10–20€→5€ | 20–40€→12€ | 40–80€→20€ | 80€+→50€ FB', '🔁 5x depósito | Odds: 1.5–10 | Mín. 3 seleções'],
              },
              {
                title: 'Sexta – 15 Free Spins Scarab Riches',
                tag: 'FREE SPINS',
                tagColor: '#9b59b6',
                details: ['🎰 Scarab Riches', '👉 20–50€ → 15 Free Spins', '⏳ 24h | ✅ Todas as sextas'],
              },
              {
                title: 'Sexta – Bónus de Depósito',
                tag: 'SEXTA',
                tagColor: '#e07b39',
                details: ['💎 Depósito: 50€ a 1000€', '🎁 5€ Bónus garantido'],
              },
              {
                title: 'Fim de Semana – 100% Free Bet',
                tag: 'SÁB / DOM',
                tagColor: 'var(--gold-primary)',
                details: ['👉 30€ → 30€ Free Bet (100%)', '🔁 35x depósito | Odds: 1.6–10 | Mín. 3 seleções', '⚽ Futebol | 🎾 Ténis'],
              },
            ].map((promo, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #222',
                borderRadius: '10px',
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '0.82rem', flex: 1, lineHeight: '1.3' }}>{promo.title}</p>
                  <span style={{
                    background: `color-mix(in srgb, ${promo.tagColor} 15%, transparent)`,
                    color: promo.tagColor,
                    border: `1px solid color-mix(in srgb, ${promo.tagColor} 30%, transparent)`,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.55rem',
                    fontWeight: '700',
                    letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>{promo.tag}</span>
                </div>
                {promo.details.map((d, j) => (
                  <p key={j} style={{ fontSize: '0.68rem', color: 'var(--text-gray)', lineHeight: '1.4' }}>{d}</p>
                ))}
                <a
                  href="https://captainspartners.com/processing/click?btag=16361_18466"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    alignSelf: 'flex-end',
                    background: 'var(--gold-primary)',
                    color: '#000',
                    border: 'none',
                    padding: '0.45rem 1rem',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    marginTop: '0.2rem',
                    textDecoration: 'none',
                    display: 'inline-block'
                  }}
                >
                  VAMOS
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- */}
      {/* GANHOS RECENTES (SLIDER CAPITANSBET)                */}
      {/* --------------------------------------------------- */}
      <SlotWinsSlider />

      {/* --------------------------------------------------- */}
      {/* BANNER PROMOCIONAL                                  */}
      {/* --------------------------------------------------- */}
      <section className="promo-banner" style={{
        margin: '0 5% 4rem 5%',
        background: 'linear-gradient(90deg, #1f180a 0%, #050505 50%, #1f180a 100%)',
        border: '1px solid rgba(230,185,92,0.3)',
        borderRadius: '12px',
        padding: '2.5rem 4rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ background: 'rgba(230,185,92,0.1)', padding: '1rem', borderRadius: '12px' }}>
            <Gift size={40} color="var(--gold-primary)" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--gold-primary)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              Entra hoje e ganha prémios
            </h2>
            <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem' }}>
              Sorteios diários • Desafios • Prémios exclusivos
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
          <button className="btn-gold" style={{ padding: '1.2rem 2.5rem', fontSize: '1rem' }} onClick={() => navigate('/register')}>
            <Gift size={18} /> QUERO PARTICIPAR
          </button>
          <Trophy size={64} color="var(--gold-primary)" opacity={0.5} />
        </div>
      </section>

      {/* --------------------------------------------------- */}
      {/* RESULTADOS (4 COLUNAS)                              */}
      {/* --------------------------------------------------- */}
      <section id="resultados-section" style={{ padding: '0 5%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '900', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Resultados que falam por si</h2>
            <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem' }}>Não mostramos promessas, mostramos resultados.</p>
          </div>
          <button
            className="btn-outline"
            style={{ fontSize: '0.8rem', padding: '0.6rem 1.2rem' }}
            onClick={() => navigate('/passaporte')}
          >
            VER TODOS
          </button>
        </div>

        {ultimosGreens.length === 0 ? (
          <div className="card-premium" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-gray)', fontSize: '0.85rem' }}>
            Ainda sem greens registados no histórico auditado.
          </div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {ultimosGreens.map((tip) => (
            <div key={tip.id} className="card-premium hover-scale" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-gray)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>
                  {VERTICAL_LABELS[tip.vertical] ?? tip.vertical}
                </span>
                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green-success)', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <div style={{ width: '6px', height: '6px', background: 'var(--green-success)', borderRadius: '50%' }}></div> Green
                </span>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <h3 style={{ fontSize: '2.2rem', color: 'var(--green-success)', fontWeight: '900' }}>{fmtUnidades(lucroDaTip(tip))}</h3>
                <p style={{ color: 'var(--text-gray)', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: '600' }}>ODD <span style={{color: '#fff'}}>{tip.odd.toFixed(2)}</span></p>
              </div>
              <div style={{ borderTop: '1px solid #222', paddingTop: '1rem' }}>
                 <p style={{ fontSize: '0.8rem', color: '#fff', fontWeight: '600', marginBottom: '0.2rem' }}>{tip.evento}</p>
                 <p style={{ fontSize: '0.75rem', color: 'var(--text-gray)' }}>{tip.pick}</p>
              </div>
            </div>
          ))}
        </div>
        )}
      </section>

      {/* --------------------------------------------------- */}
      {/* FOOTER                                              */}
      {/* --------------------------------------------------- */}
      <footer style={{ 
        marginTop: '4rem', 
        padding: '2rem 5%', 
        borderTop: '1px solid var(--border-color)', 
        textAlign: 'center',
        color: 'var(--text-gray)',
        fontSize: '0.85rem'
      }}>
        <p style={{ margin: 0 }}>© 2026 El Pedrito. Todos os direitos reservados.</p>
      </footer>

    </div>
  );
}

export default Home;
