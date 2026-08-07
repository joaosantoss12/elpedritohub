import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  carregarTips, VERTICAL_LABELS, VERTICAL_COLORS, type RaioxTip,
} from '../lib/raiox';
import {
  Coins, Plus, Trash2, Loader2, TrendingUp, ShieldCheck, Info, Ticket, X,
} from 'lucide-react';
import '../styles/Simulador.css';

// ─── TIPOS ────────────────────────────────────────────────────

interface Selecao {
  tip_id: string;
  evento: string;
  pick: string;
  odd: number;
  vertical: string;
}

interface Aposta {
  id: string;
  tipo: 'simples' | 'multipla';
  selecoes: Selecao[];
  odd_total: number;
  stake: number;
  estado: 'pendente' | 'ganha' | 'perdida' | 'anulada';
  retorno: number;
  created_at: string;
  resolvido_em: string | null;
}

const ESTADO_LABELS: Record<Aposta['estado'], string> = {
  pendente: 'Pendente',
  ganha: 'Ganha',
  perdida: 'Perdida',
  anulada: 'Anulada',
};

const fmtEpc = (v: number) =>
  v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Simulador de Banca — substitui o Casino.
 * Nada aqui é gerado por RNG: as seleções são tips reais do histórico auditado
 * e a resolução vem do resultado do evento, não da casa. Sem dinheiro real.
 */
export default function Simulador() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading, refreshMembro } = useAuth();

  const [tips, setTips] = useState<RaioxTip[]>([]);
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [boletim, setBoletim] = useState<Selecao[]>([]);
  const [stake, setStake] = useState('10');
  const [aColocar, setAColocar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const saldo = membro?.saldo_simulador ?? 0;

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  // Só tips ainda por resolver: apostar num resultado já conhecido não simula nada.
  useEffect(() => {
    carregarTips({ limite: 60 }).then(todas => {
      setTips(todas.filter(t => t.resultado === 'pendente'));
    });
  }, []);

  const carregarApostas = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('simulador_apostas')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) console.warn('simulador_apostas:', error.message);
    setApostas((data ?? []) as Aposta[]);
    setCarregando(false);
  };

  useEffect(() => {
    if (!user) return;
    carregarApostas();
    const sub = supabase
      .channel(`simulador_${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'simulador_apostas', filter: `user_id=eq.${user.id}` },
        () => { carregarApostas(); refreshMembro(); })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const oddTotal = useMemo(
    () => boletim.reduce((acc, s) => acc * s.odd, 1),
    [boletim],
  );
  const stakeNum = Number(stake.replace(',', '.'));
  const stakeValido = Number.isFinite(stakeNum) && stakeNum > 0 && stakeNum <= saldo;
  const retornoPotencial = stakeValido ? stakeNum * oddTotal : 0;

  const stats = useMemo(() => {
    const resolvidas = apostas.filter(a => a.estado === 'ganha' || a.estado === 'perdida');
    const ganhas = resolvidas.filter(a => a.estado === 'ganha').length;
    const investido = resolvidas.reduce((s, a) => s + a.stake, 0);
    const devolvido = resolvidas.reduce((s, a) => s + a.retorno, 0);
    return {
      total: apostas.length,
      pendentes: apostas.filter(a => a.estado === 'pendente').length,
      resolvidas: resolvidas.length,
      taxaAcerto: resolvidas.length ? (ganhas / resolvidas.length) * 100 : 0,
      lucro: devolvido - investido,
      roi: investido ? ((devolvido - investido) / investido) * 100 : 0,
    };
  }, [apostas]);

  const toggleSelecao = (tip: RaioxTip) => {
    setErro(null);
    setBoletim(prev => {
      if (prev.some(s => s.tip_id === tip.id)) return prev.filter(s => s.tip_id !== tip.id);
      return [...prev, {
        tip_id: tip.id,
        evento: tip.evento,
        pick: tip.pick,
        odd: tip.odd,
        vertical: tip.vertical,
      }];
    });
  };

  const colocarAposta = async () => {
    if (boletim.length === 0 || !stakeValido) return;
    setErro(null);
    setAColocar(true);
    try {
      const { error } = await supabase.rpc('simulador_colocar_aposta', {
        p_tipo: boletim.length > 1 ? 'multipla' : 'simples',
        p_selecoes: boletim,
        p_odd_total: Number(oddTotal.toFixed(2)),
        p_stake: stakeNum,
      });
      if (error) throw error;
      setBoletim([]);
      await Promise.all([carregarApostas(), refreshMembro()]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível colocar a aposta.');
    } finally {
      setAColocar(false);
    }
  };

  return (
    <div className="sim-page">
      <Navbar />

      <div className="sim-wrapper">

        <header className="sim-header">
          <div>
            <h1 className="sim-title">
              <Ticket size={24} color="var(--gold-primary)" />
              Simulador de Banca
            </h1>
            <p className="sim-sub">
              Testa a tua gestão de banca com moedas EPC sobre as tips reais do canal.
              Sem dinheiro real e sem casa a jogar contra ti — o resultado é o do evento.
            </p>
          </div>
          <div className="sim-saldo">
            <Coins size={20} color="var(--gold-primary)" />
            <div>
              <span className="sim-saldo__val">{fmtEpc(saldo)}</span>
              <span className="sim-saldo__lbl">EPC de simulação</span>
            </div>
          </div>
        </header>

        <div className="sim-aviso">
          <Info size={15} />
          Moedas de simulação. Não há depósitos, levantamentos nem prémios em dinheiro.
        </div>

        {/* ── KPIs ── */}
        <div className="sim-kpis">
          {[
            { lbl: 'Apostas', val: String(stats.total) },
            { lbl: 'Pendentes', val: String(stats.pendentes) },
            { lbl: 'Taxa de acerto', val: stats.resolvidas ? `${stats.taxaAcerto.toFixed(1)}%` : '—', cor: 'gold' },
            { lbl: 'Lucro', val: stats.resolvidas ? `${stats.lucro >= 0 ? '+' : '−'}${fmtEpc(Math.abs(stats.lucro))}` : '—', cor: stats.lucro >= 0 ? 'pos' : 'neg' },
            { lbl: 'ROI', val: stats.resolvidas ? `${stats.roi >= 0 ? '+' : '−'}${Math.abs(stats.roi).toFixed(1)}%` : '—', cor: stats.roi >= 0 ? 'pos' : 'neg' },
          ].map(k => (
            <div key={k.lbl} className="sim-kpi">
              <span className={`sim-kpi__val ${k.cor ?? ''}`}>{k.val}</span>
              <span className="sim-kpi__lbl">{k.lbl}</span>
            </div>
          ))}
        </div>

        <div className="sim-split">

          {/* ── Tips disponíveis ── */}
          <section className="sim-card">
            <h2 className="sim-card__title">
              <ShieldCheck size={17} color="var(--green-success)" />
              Tips em aberto
            </h2>
            {tips.length === 0 ? (
              <p className="sim-empty">
                Sem tips por resolver de momento. Assim que o canal publicar novas entradas,
                aparecem aqui para simulares.
              </p>
            ) : (
              <div className="sim-tips">
                {tips.map(tip => {
                  const escolhida = boletim.some(s => s.tip_id === tip.id);
                  return (
                    <button
                      key={tip.id}
                      className={`sim-tip${escolhida ? ' sim-tip--on' : ''}`}
                      onClick={() => toggleSelecao(tip)}
                    >
                      <span
                        className="sim-tip__vertical"
                        style={{ color: VERTICAL_COLORS[tip.vertical] ?? 'var(--gold-primary)' }}
                      >
                        {VERTICAL_LABELS[tip.vertical] ?? tip.vertical}
                      </span>
                      <span className="sim-tip__evento">{tip.evento}</span>
                      <span className="sim-tip__pick">{tip.pick}</span>
                      <span className="sim-tip__odd">{tip.odd.toFixed(2)}</span>
                      <span className="sim-tip__acao">{escolhida ? <X size={14} /> : <Plus size={14} />}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Boletim ── */}
          <aside className="sim-card sim-boletim">
            <h2 className="sim-card__title">
              <Ticket size={17} color="var(--gold-primary)" />
              Boletim
              {boletim.length > 1 && <span className="sim-badge">Múltipla</span>}
            </h2>

            {boletim.length === 0 ? (
              <p className="sim-empty">Escolhe tips à esquerda para montar o boletim.</p>
            ) : (
              <>
                <div className="sim-boletim__lista">
                  {boletim.map(s => (
                    <div key={s.tip_id} className="sim-boletim__linha">
                      <div>
                        <p className="sim-boletim__evento">{s.evento}</p>
                        <p className="sim-boletim__pick">{s.pick}</p>
                      </div>
                      <span className="sim-boletim__odd">{s.odd.toFixed(2)}</span>
                      <button
                        className="sim-boletim__rm"
                        onClick={() => setBoletim(prev => prev.filter(x => x.tip_id !== s.tip_id))}
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="sim-boletim__odd-total">
                  <span>Odd total</span>
                  <strong>{oddTotal.toFixed(2)}</strong>
                </div>

                <label className="sim-label" htmlFor="sim-stake">Stake (EPC)</label>
                <input
                  id="sim-stake"
                  className="sim-input"
                  inputMode="decimal"
                  value={stake}
                  onChange={e => { setStake(e.target.value); setErro(null); }}
                />
                <div className="sim-atalhos">
                  {[5, 10, 25, 50].map(v => (
                    <button key={v} className="sim-atalho" onClick={() => setStake(String(v))}>{v}</button>
                  ))}
                  <button
                    className="sim-atalho"
                    onClick={() => setStake(String(Math.floor(saldo)))}
                    disabled={saldo <= 0}
                  >
                    Máx
                  </button>
                </div>

                <div className="sim-boletim__retorno">
                  <span><TrendingUp size={14} /> Retorno potencial</span>
                  <strong>{fmtEpc(retornoPotencial)} EPC</strong>
                </div>

                {erro && <p className="sim-erro">{erro}</p>}
                {!stakeValido && stake.trim() !== '' && (
                  <p className="sim-erro">
                    {stakeNum > saldo ? 'Saldo insuficiente para este stake.' : 'Introduz um stake válido.'}
                  </p>
                )}

                <button
                  className="sim-submit"
                  onClick={colocarAposta}
                  disabled={aColocar || !stakeValido || boletim.length === 0}
                >
                  {aColocar ? <><Loader2 size={15} className="sim-spin" /> A colocar…</> : 'COLOCAR APOSTA'}
                </button>
              </>
            )}
          </aside>
        </div>

        {/* ── Histórico ── */}
        <section className="sim-card">
          <h2 className="sim-card__title">O meu histórico</h2>
          {carregando ? (
            <p className="sim-empty"><Loader2 size={16} className="sim-spin" /> A carregar…</p>
          ) : apostas.length === 0 ? (
            <p className="sim-empty">Ainda não colocaste nenhuma aposta simulada.</p>
          ) : (
            <div className="sim-tabela-wrap">
              <table className="sim-tabela">
                <thead>
                  <tr>
                    <th>Data</th><th>Tipo</th><th>Seleções</th>
                    <th>Odd</th><th>Stake</th><th>Estado</th><th>Retorno</th>
                  </tr>
                </thead>
                <tbody>
                  {apostas.map(a => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</td>
                      <td>{a.tipo === 'multipla' ? 'Múltipla' : 'Simples'}</td>
                      <td className="sim-tabela__selecoes">
                        {(a.selecoes ?? []).map(s => `${s.evento} — ${s.pick}`).join(' · ')}
                      </td>
                      <td>{Number(a.odd_total).toFixed(2)}</td>
                      <td>{fmtEpc(Number(a.stake))}</td>
                      <td><span className={`sim-estado sim-estado--${a.estado}`}>{ESTADO_LABELS[a.estado]}</span></td>
                      <td className={a.retorno > 0 ? 'pos' : ''}>{fmtEpc(Number(a.retorno))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
