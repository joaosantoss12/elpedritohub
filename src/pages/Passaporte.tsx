import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Navbar } from '../components/Navbar';
import { Toast } from '../components/Toast';
import { RaioXPublico } from '../components/RaioXPublico';
import { User, Shield, CheckCircle, Target, ShieldCheck, Activity, Trophy, Loader2 } from 'lucide-react';
import {
  carregarTips, calcularStats, statsPorVertical, fmtUnidades, fmtPercent, fmtRoi,
  VERTICAL_LABELS, VERTICAL_COLORS, type RaioxTip,
} from '../lib/raiox';
import '../index.css';

/** Perfis de risco do Passaporte — cruzam-se com o historial auditado do expert. */
const PERFIS_RISCO = [
  {
    valor: 'conservador',
    nome: 'Conservador',
    desc: 'Odds baixas, stake constante. Preferes crescer devagar sem sustos.',
    faixa: 'Odds até 1.80',
  },
  {
    valor: 'equilibrado',
    nome: 'Equilibrado',
    desc: 'O meio-termo. Aceitas variação para captar valor a médio prazo.',
    faixa: 'Odds 1.80 – 3.00',
  },
  {
    valor: 'agressivo',
    nome: 'Agressivo',
    desc: 'Odds altas e sequências longas de red não te tiram o sono.',
    faixa: 'Odds acima de 3.00',
  },
] as const;

type PerfilRisco = typeof PERFIS_RISCO[number]['valor'];

function Passaporte() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading, refreshMembro } = useAuth();

  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  // --- Passaporte: perfil de risco + historial auditado do expert ---
  const [perfilRisco, setPerfilRisco] = useState<PerfilRisco>('equilibrado');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [guardandoRanking, setGuardandoRanking] = useState(false);
  const [tips, setTips] = useState<RaioxTip[]>([]);

  useEffect(() => {
    if (membro?.perfil_risco) setPerfilRisco(membro.perfil_risco);
  }, [membro?.perfil_risco]);

  useEffect(() => {
    carregarTips({ canal: 'publico', desdeDias: 180, limite: 600 }).then(setTips);
  }, []);

  const statsExpert = calcularStats(tips);
  const porVertical = statsPorVertical(tips);

  /**
   * O cruzamento do passaporte: dentro do historial auditado, que fatia
   * corresponde à faixa de odds do perfil de risco escolhido pelo membro.
   */
  const faixaOdd: Record<PerfilRisco, [number, number]> = {
    conservador: [1, 1.8],
    equilibrado: [1.8, 3],
    agressivo: [3, Infinity],
  };
  const [minOdd, maxOdd] = faixaOdd[perfilRisco];
  const statsNoPerfil = calcularStats(tips.filter(t => t.odd >= minOdd && t.odd < maxOdd));

  const isVip = membro?.subscription_status === 'active'
    || (membro?.badges?.some(b => ['vip', 'administrador'].includes(b.toLowerCase())) ?? false);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  /**
   * Opt-out do ranking mensal (roadmap 10). O ranking só mostra username e
   * percentagens, mas a performance de aposta de alguém é dele — quem não
   * quiser aparecer sai sem perder nada do resto do Hub.
   */
  const handleAlternarRanking = async () => {
    if (!user) return;
    const proximo = !(membro?.ranking_oculto ?? false);
    try {
      setGuardandoRanking(true);
      const { error } = await supabase
        .from('membros')
        .update({ ranking_oculto: proximo })
        .eq('id', user.id);
      if (error) throw error;
      await refreshMembro();
      addToast(proximo ? 'Saíste do ranking mensal.' : 'Voltaste ao ranking mensal.', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Não foi possível guardar a preferência.', 'error');
    } finally {
      setGuardandoRanking(false);
    }
  };

  const handleGuardarPerfil = async (valor: PerfilRisco) => {
    if (!user) return;
    setPerfilRisco(valor);
    try {
      setGuardandoPerfil(true);
      const { error } = await supabase
        .from('membros')
        .update({
          perfil_risco: valor,
          passaporte_criado_em: membro?.passaporte_criado_em ?? new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      await refreshMembro();
      addToast('Perfil de risco guardado.', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Não foi possível guardar o perfil de risco.', 'error');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      {/* RAIO-X — histórico auditado do canal público. Sempre visível,
          com ou sem sessão iniciada: é a prova social que convence quem
          ainda não é membro. */}
      <RaioXPublico />

      {authLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <Loader2 size={32} className="spin" color="var(--gold-primary)" />
          <style>{`
            .spin { animation: spin 1s linear infinite; }
            @keyframes spin { 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      ) : !user ? (
        <div style={{ padding: '0 5% 4rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
            border: '1px solid rgba(230,185,92,0.25)',
            borderRadius: '16px',
            padding: '2.5rem',
            textAlign: 'center',
          }}>
            <User size={36} color="var(--gold-primary)" style={{ marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#fff', marginBottom: '0.6rem' }}>
              O teu <span style={{ color: 'var(--gold-primary)' }}>Passaporte</span>
            </h2>
            <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
              Inicia sessão para cruzares este historial com o teu perfil de risco,
              geres a tua conta e vires o teu progresso no Hub.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn-gold" style={{ padding: '0.8rem 1.8rem', fontWeight: 'bold' }} onClick={() => navigate('/login')}>
                ENTRAR
              </button>
              <button className="btn-outline" style={{ padding: '0.8rem 1.8rem', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.15)' }} onClick={() => navigate('/register')}>
                REGISTAR
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div style={{ padding: '2rem 5%', display: 'flex', flexDirection: 'column', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
      <div style={{ width: '100%', alignSelf: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', marginBottom: '0.5rem', textAlign: 'center' }}>
          Passaporte do <span style={{ color: 'var(--gold-primary)' }}>Membro</span>
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.9rem', maxWidth: '640px', margin: '0 auto 2rem auto', lineHeight: 1.6 }}>
          O teu perfil de risco cruzado com o historial auditado do canal público —
          hora, odd e resultado, tal como foram publicados. Nada é editado à posteriori.
        </p>

        {/* --------------------------------------------------- */}
        {/* FREE vs VIP — a pergunta que se repete no chat        */}
        {/* --------------------------------------------------- */}
        <div style={{
          background: isVip ? 'rgba(139,92,246,0.08)' : 'rgba(0,0,0,0.4)',
          border: `1px solid ${isVip ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '16px',
          padding: '1.5rem 2rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Shield size={28} color={isVip ? '#8b5cf6' : 'var(--text-gray)'} />
            <div>
              <p style={{ fontWeight: 'bold', color: '#fff', fontSize: '1rem', marginBottom: '0.2rem' }}>
                {isVip ? 'És membro VIP' : 'Estás no plano Free'}
              </p>
              <p style={{ color: 'var(--text-gray)', fontSize: '0.82rem', lineHeight: 1.5, maxWidth: '520px' }}>
                {isVip
                  ? 'O VIP do Hub é o mesmo do Telegram: o teu acesso ao grupo Footmillion VIP está incluído nesta subscrição — não pagas duas vezes.'
                  : 'No Free tens o Raio-X, a Sala de Comando e o Simulador. O VIP acrescenta o grupo Footmillion VIP no Telegram — e é o mesmo VIP, não há duas subscrições diferentes.'}
              </p>
            </div>
          </div>
          {!isVip && (
            <button className="btn-gold" style={{ padding: '0.7rem 1.5rem', fontSize: '0.85rem', fontWeight: 'bold' }} onClick={() => navigate('/plans')}>
              VER PLANOS
            </button>
          )}

          {/* Regra de partilha. As queixas cruzadas entre grátis e pago nascem
              de resultados do VIP a circular no grupo grátis — o membro tem de
              saber a regra, não adivinhá-la. */}
          <p style={{
            flexBasis: '100%',
            margin: 0,
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            color: 'var(--text-gray)',
            fontSize: '0.78rem',
            lineHeight: 1.6,
          }}>
            {isVip
              ? 'Regra da comunidade: as tips e os resultados do Footmillion VIP ficam dentro do VIP. Partilhá-los nos grupos grátis tira valor a quem pagou e gera discussões que não ajudam ninguém.'
              : 'Nos grupos grátis circulam por vezes resultados do VIP. Não são conteúdo do plano Free — o que tens direito a ver está tudo aqui e no canal público.'}
          </p>
        </div>

        {/* --------------------------------------------------- */}
        {/* PERFIL DE RISCO × HISTORIAL AUDITADO                 */}
        {/* --------------------------------------------------- */}
        <div style={{
          background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
          border: '1px solid rgba(230,185,92,0.2)',
          borderRadius: '16px',
          padding: '2rem',
          marginBottom: '3rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={20} color="var(--gold-primary)" /> O Meu Perfil de Risco
          </h2>
          <p style={{ color: 'var(--text-gray)', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
            Escolhe como apostas. O Hub usa isto para te mostrar a parte do historial que te diz respeito.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {PERFIS_RISCO.map(p => {
              const ativo = perfilRisco === p.valor;
              return (
                <button
                  key={p.valor}
                  onClick={() => handleGuardarPerfil(p.valor)}
                  disabled={guardandoPerfil}
                  style={{
                    textAlign: 'left',
                    background: ativo ? 'rgba(230,185,92,0.08)' : 'rgba(0,0,0,0.5)',
                    border: `1px solid ${ativo ? 'var(--gold-primary)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '12px',
                    padding: '1.2rem',
                    cursor: guardandoPerfil ? 'wait' : 'pointer',
                    transition: 'all 0.2s',
                    color: '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: ativo ? 'var(--gold-primary)' : '#fff' }}>{p.nome}</span>
                    {ativo && <CheckCircle size={16} color="var(--gold-primary)" />}
                  </div>
                  <p style={{ color: 'var(--text-gray)', fontSize: '0.78rem', lineHeight: 1.5, marginBottom: '0.6rem' }}>{p.desc}</p>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gold-primary)', fontWeight: '600' }}>{p.faixa}</span>
                </button>
              );
            })}
          </div>

          {statsExpert.resolvidas === 0 ? (
            <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
              Ainda sem historial auditado para cruzar. Assim que houver tips registadas, aparece aqui.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--green-success)' }}>
                <ShieldCheck size={15} />
                Historial auditado do canal público · últimos 180 dias · {statsExpert.resolvidas} tips
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                  { lbl: 'Tips no teu perfil', val: String(statsNoPerfil.resolvidas), cor: '#fff' },
                  { lbl: 'Taxa de acerto', val: statsNoPerfil.resolvidas ? fmtPercent(statsNoPerfil.taxaAcerto) : '—', cor: 'var(--gold-primary)' },
                  { lbl: 'Lucro', val: statsNoPerfil.resolvidas ? fmtUnidades(statsNoPerfil.lucroUnidades) : '—', cor: statsNoPerfil.lucroUnidades >= 0 ? 'var(--green-success)' : '#ef4444' },
                  { lbl: 'ROI', val: statsNoPerfil.resolvidas ? fmtRoi(statsNoPerfil.roi) : '—', cor: statsNoPerfil.roi >= 0 ? 'var(--green-success)' : '#ef4444' },
                  { lbl: 'Odd média', val: statsNoPerfil.resolvidas ? statsNoPerfil.oddMedia.toFixed(2) : '—', cor: '#fff' },
                ].map(k => (
                  <div key={k.lbl} style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '12px', padding: '1.2rem 1rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: k.cor, marginBottom: '0.3rem' }}>{k.val}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-gray)' }}>{k.lbl}</div>
                  </div>
                ))}
              </div>

              {statsNoPerfil.resolvidas === 0 && (
                <p style={{ color: 'var(--text-gray)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                  Ainda não há tips auditadas nesta faixa de odds. Experimenta outro perfil ou volta quando o historial crescer.
                </p>
              )}

              <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} color="var(--gold-primary)" /> Por vertical
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {porVertical.map(v => (
                  <div key={v.vertical} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                    background: 'rgba(0,0,0,0.4)', borderLeft: `3px solid ${VERTICAL_COLORS[v.vertical] ?? 'var(--gold-primary)'}`,
                    borderRadius: '8px', padding: '0.8rem 1rem',
                  }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff' }}>
                      {VERTICAL_LABELS[v.vertical] ?? v.vertical}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-gray)' }}>
                      {v.resolvidas} tips · {fmtPercent(v.taxaAcerto)} acerto
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: v.lucroUnidades >= 0 ? 'var(--green-success)' : '#ef4444', minWidth: '70px', textAlign: 'right' }}>
                      {fmtUnidades(v.lucroUnidades)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* --------------------------------------------------- */}
        {/* RANKING MENSAL — participação                        */}
        {/* --------------------------------------------------- */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1.5rem', flexWrap: 'wrap',
          background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
          border: '1px solid var(--border-color)', borderRadius: '16px',
          padding: '1.5rem', marginBottom: '3rem',
        }}>
          <div style={{ flex: '1 1 320px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Trophy size={16} color="var(--gold-primary)" /> Ranking mensal de banca
            </h3>
            <p style={{ color: 'var(--text-gray)', fontSize: '0.82rem', lineHeight: 1.6, margin: 0 }}>
              {membro?.ranking_oculto
                ? 'Estás fora do ranking. As tuas apostas continuam a contar para a tua Banca, simplesmente não apareces na tabela pública.'
                : 'Apareces na tabela com o teu username, o ROI e o número de apostas resolvidas. Nunca são mostrados valores em euros nem apostas individuais.'}
            </p>
          </div>
          <button
            onClick={handleAlternarRanking}
            disabled={guardandoRanking}
            style={{
              padding: '0.7rem 1.3rem', borderRadius: '10px', cursor: guardandoRanking ? 'wait' : 'pointer',
              fontSize: '0.82rem', fontWeight: 'bold', whiteSpace: 'nowrap',
              background: 'transparent',
              border: `1px solid ${membro?.ranking_oculto ? 'var(--gold-primary)' : 'var(--border-color)'}`,
              color: membro?.ranking_oculto ? 'var(--gold-primary)' : 'var(--text-gray)',
            }}
          >
            {membro?.ranking_oculto ? 'Voltar ao ranking' : 'Sair do ranking'}
          </button>
        </div>

      </div>
      </div>
      )}

      {/* Toasts */}
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={removeToast}
        />
      ))}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default Passaporte;
