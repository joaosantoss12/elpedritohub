import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ShieldCheck, TrendingUp, Target, Percent,
  Flame, Hash, Loader2, Inbox, Clock, Radio,
} from 'lucide-react';
import {
  carregarCanais, alcance, fmtSubscritores, fmtEngagement,
  type CanalTelegram,
} from '../lib/canais';
import {
  carregarTips, calcularStats, statsPorVertical, curvaAcumulada, lucroDaTip,
  fmtRoi, fmtUnidades, fmtPercent,
  VERTICAL_LABELS, VERTICAL_COLORS,
  type RaioxTip, type Vertical, type PontoCurva,
} from '../lib/raiox';
import '../styles/RaioX.css';

// ─── FILTROS ──────────────────────────────────────────────────

const PERIODOS = [
  { label: '30 dias', dias: 30 },
  { label: '90 dias', dias: 90 },
  { label: '6 meses', dias: 180 },
  { label: 'Tudo', dias: 0 },
] as const;

// ─── TOOLTIP ──────────────────────────────────────────────────

function CurvaTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PontoCurva }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="raiox-tooltip">
      <div className="raiox-tooltip__data">
        {new Date(p.data).toLocaleString('pt-PT', {
          day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
        })}
      </div>
      <div className="raiox-tooltip__row">
        <span>Esta tip</span>
        <strong className={p.lucro >= 0 ? 'pos' : 'neg'}>{fmtUnidades(p.lucro)}</strong>
      </div>
      <div className="raiox-tooltip__row">
        <span>Acumulado</span>
        <strong className={p.acumulado >= 0 ? 'pos' : 'neg'}>{fmtUnidades(p.acumulado)}</strong>
      </div>
    </div>
  );
}

/**
 * Raio-X — historial auditado do canal público. Vive dentro do Passaporte
 * (mesmo separador na topbar) e funciona sem sessão iniciada: é a prova
 * social que convence quem ainda não é membro.
 */
export function RaioXPublico() {
  // tips e loading andam sempre juntos: um único setState por carregamento.
  const [{ tips, loading }, setDados] = useState<{ tips: RaioxTip[]; loading: boolean }>({
    tips: [], loading: true,
  });
  const [periodo, setPeriodo] = useState<number>(90);
  const [vertical, setVertical] = useState<Vertical | 'todas'>('todas');
  const [canais, setCanais] = useState<CanalTelegram[]>([]);
  const navigate = useNavigate();

  // Independente do período: o alcance dos canais não se filtra por data.
  useEffect(() => {
    let ativo = true;
    carregarCanais({ tipo: 'oficial' }).then(res => { if (ativo) setCanais(res); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    let ativo = true;
    carregarTips({ canal: 'publico', desdeDias: periodo || undefined, limite: 1000 })
      .then(res => { if (ativo) setDados({ tips: res, loading: false }); });
    return () => { ativo = false; };
  }, [periodo]);

  const filtradas = useMemo(
    () => vertical === 'todas' ? tips : tips.filter(t => t.vertical === vertical),
    [tips, vertical]
  );

  const stats = useMemo(() => calcularStats(filtradas), [filtradas]);
  const porVertical = useMemo(() => statsPorVertical(tips), [tips]);
  const curva = useMemo(() => curvaAcumulada(filtradas), [filtradas]);
  const resumoCanais = useMemo(() => alcance(canais), [canais]);
  const maiorSubs = resumoCanais.maiorCanal?.subscritores ?? 0;

  // Verticais realmente presentes nos dados — não inventar separadores vazios
  const verticaisDisponiveis = useMemo(
    () => [...new Set(tips.map(t => t.vertical))],
    [tips]
  );

  const yDomain = useMemo((): [number, number] => {
    if (!curva.length) return [0, 1];
    const vals = curva.map(p => p.acumulado);
    const min = Math.min(0, ...vals);
    const max = Math.max(0, ...vals);
    const margem = Math.max((max - min) * 0.15, 1);
    return [Math.floor(min - margem), Math.ceil(max + margem)];
  }, [curva]);

  const lucroPos = stats.lucroUnidades >= 0;

  return (
    <div className="raiox-wrapper">
      {/* ── CABEÇALHO ── */}
      <header className="raiox-header">
        <div className="raiox-header__eyebrow">
          <Activity size={14} /> PROVA SOCIAL · CANAL PÚBLICO
        </div>
        <h1>Raio-X <span>EPC</span></h1>
        <p>
          Cada boletim publicado no canal público, com a hora a que saiu, a odd a que
          saiu e o resultado que deu. Nada é editado depois do apito.
        </p>
        <div className="raiox-selo">
          <ShieldCheck size={15} />
          Histórico auditado — hora, odd e resultado registados à publicação
        </div>
      </header>

      {/* ── ALCANCE E FIDELIDADE ──
          Roadmap 5: o Raio-X tem de combinar dois sinais. O canal principal
          prova escala, os canais pequenos provam fidelidade. Volume sozinho
          não conta a história toda — e um canal com 51k e 3% de visualização
          diz menos do que um com 832 e a sala cheia. */}
      {canais.length > 0 && (
        <section className="raiox-canais">
          <div className="raiox-canais__head">
            <span className="raiox-card__title">
              <Radio size={17} color="var(--gold-primary)" /> Alcance e fidelidade
            </span>
            <span className="raiox-card__sub">
              {fmtSubscritores(resumoCanais.totalSubscritores)} subscritores nos canais oficiais
            </span>
          </div>

          <div className="raiox-canais__grid">
            {resumoCanais.oficiais.map(c => {
              const cor = c.vertical ? VERTICAL_COLORS[c.vertical] : 'var(--gold-primary)';
              // Barra relativa ao maior canal: é a leitura de escala.
              const largura = maiorSubs > 0 ? ((c.subscritores ?? 0) / maiorSubs) * 100 : 0;
              return (
                <div key={c.id} className="raiox-canal" style={{ borderLeftColor: cor }}>
                  <div className="raiox-canal__top">
                    <span className="raiox-canal__nome" style={{ color: cor }}>{c.nome}</span>
                    <span className="raiox-canal__subs">{fmtSubscritores(c.subscritores)}</span>
                  </div>
                  <div className="raiox-bar">
                    <div className="raiox-bar__fill" style={{ width: `${largura}%`, background: cor }} />
                  </div>
                  <div className="raiox-canal__meta">
                    <span>
                      Visualização <strong>{fmtEngagement(c.engagement_min, c.engagement_max)}</strong>
                    </span>
                    {c.cadencia && (
                      <span className={c.cadencia_estavel ? '' : 'raiox-canal__irregular'}>
                        {c.cadencia}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button className="raiox-canais__link" onClick={() => navigate('/sala', { state: { aba: 'canais' } })}>
            <ShieldCheck size={13} /> Confirmar quais são os canais oficiais
          </button>
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="raiox-filtros">
        <div className="raiox-filtro-grupo">
          <span className="raiox-filtro-grupo__label">Período</span>
          <div className="raiox-chips">
            {PERIODOS.map(p => (
              <button
                key={p.label}
                className={`raiox-chip${periodo === p.dias ? ' raiox-chip--active' : ''}`}
                onClick={() => setPeriodo(p.dias)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {verticaisDisponiveis.length > 1 && (
          <div className="raiox-filtro-grupo">
            <span className="raiox-filtro-grupo__label">Vertical</span>
            <div className="raiox-chips">
              <button
                className={`raiox-chip${vertical === 'todas' ? ' raiox-chip--active' : ''}`}
                onClick={() => setVertical('todas')}
              >
                Todas
              </button>
              {verticaisDisponiveis.map(v => (
                <button
                  key={v}
                  className={`raiox-chip${vertical === v ? ' raiox-chip--active' : ''}`}
                  onClick={() => setVertical(v)}
                >
                  {VERTICAL_LABELS[v] ?? v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="raiox-loading">
          <Loader2 size={26} className="raiox-spin" color="var(--gold-primary)" />
          A carregar histórico auditado…
        </div>
      ) : stats.resolvidas === 0 ? (
        <div className="raiox-empty">
          <Inbox size={44} color="#3f3f46" />
          <h3>Ainda sem histórico neste período</h3>
          <p>
            O Raio-X alimenta-se dos boletins do canal público. Assim que o histórico
            for carregado em Admin › Raio-X, os números aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="raiox-kpis">
            <div className="raiox-kpi raiox-kpi--destaque">
              <span className="raiox-kpi__label"><TrendingUp size={12} /> Lucro</span>
              <span className={`raiox-kpi__valor ${lucroPos ? 'pos' : 'neg'}`}>
                {fmtUnidades(stats.lucroUnidades)}
              </span>
              <span className="raiox-kpi__nota">{stats.unidadesApostadas.toFixed(0)}u apostadas</span>
            </div>
            <div className="raiox-kpi raiox-kpi--destaque">
              <span className="raiox-kpi__label"><Percent size={12} /> ROI</span>
              <span className={`raiox-kpi__valor ${stats.roi >= 0 ? 'pos' : 'neg'}`}>
                {fmtRoi(stats.roi)}
              </span>
              <span className="raiox-kpi__nota">retorno sobre o investido</span>
            </div>
            <div className="raiox-kpi">
              <span className="raiox-kpi__label"><Target size={12} /> Taxa de acerto</span>
              <span className="raiox-kpi__valor gold">{fmtPercent(stats.taxaAcerto)}</span>
              <span className="raiox-kpi__nota">{stats.greens}G · {stats.reds}R</span>
            </div>
            <div className="raiox-kpi">
              <span className="raiox-kpi__label"><Hash size={12} /> Tips resolvidas</span>
              <span className="raiox-kpi__valor">{stats.resolvidas}</span>
              <span className="raiox-kpi__nota">
                {stats.pendentes > 0 ? `${stats.pendentes} por resolver` : 'todas resolvidas'}
              </span>
            </div>
            <div className="raiox-kpi">
              <span className="raiox-kpi__label"><Activity size={12} /> Odd média</span>
              <span className="raiox-kpi__valor">{stats.oddMedia.toFixed(2)}</span>
              <span className="raiox-kpi__nota">por boletim</span>
            </div>
            <div className="raiox-kpi">
              <span className="raiox-kpi__label"><Flame size={12} /> Melhor streak</span>
              <span className="raiox-kpi__valor gold">{stats.melhorStreak}</span>
              <span className="raiox-kpi__nota">
                {stats.streakAtual > 0
                  ? `${stats.streakAtual} greens seguidos agora`
                  : stats.streakAtual < 0
                    ? `${Math.abs(stats.streakAtual)} reds seguidos agora`
                    : '—'}
              </span>
            </div>
          </div>

          {/* ── CURVA + VERTICAIS ── */}
          <div className="raiox-split">
            <div className="raiox-card">
              <div className="raiox-card__head">
                <span className="raiox-card__title">
                  <TrendingUp size={17} color="var(--gold-primary)" /> Curva de lucro
                </span>
                <span className="raiox-card__sub">em unidades, tip a tip</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={curva} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="raioxGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e6b95c" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#e6b95c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}u`}
                    width={52}
                  />
                  <Tooltip content={<CurvaTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    stroke="#e6b95c"
                    strokeWidth={2}
                    fill="url(#raioxGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="raiox-card">
              <div className="raiox-card__head">
                <span className="raiox-card__title">
                  <Target size={17} color="var(--gold-primary)" /> Por vertical
                </span>
                <span className="raiox-card__sub">período completo</span>
              </div>
              <div className="raiox-vertical-list">
                {porVertical.map(v => {
                  const cor = VERTICAL_COLORS[v.vertical] ?? 'var(--gold-primary)';
                  return (
                    <div
                      key={v.vertical}
                      className="raiox-vertical"
                      style={{ borderLeftColor: cor }}
                    >
                      <div className="raiox-vertical__top">
                        <span className="raiox-vertical__nome" style={{ color: cor }}>
                          {VERTICAL_LABELS[v.vertical] ?? v.vertical}
                        </span>
                        <span className={`raiox-vertical__lucro ${v.lucroUnidades >= 0 ? 'pos' : 'neg'}`}>
                          {fmtUnidades(v.lucroUnidades)}
                        </span>
                      </div>
                      <div className="raiox-bar">
                        <div
                          className="raiox-bar__fill"
                          style={{ width: `${Math.min(100, v.taxaAcerto)}%`, background: cor }}
                        />
                      </div>
                      <div className="raiox-vertical__meta">
                        <span>Acerto <strong>{fmtPercent(v.taxaAcerto, 0)}</strong></span>
                        <span>ROI <strong>{fmtRoi(v.roi)}</strong></span>
                        <span>Tips <strong>{v.resolvidas}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── TRILHA DE AUDITORIA ── */}
          <div className="raiox-card">
            <div className="raiox-card__head">
              <span className="raiox-card__title">
                <Clock size={17} color="var(--gold-primary)" /> Boletins publicados
              </span>
              <span className="raiox-card__sub">
                {filtradas.length} registos · ordenados do mais recente
              </span>
            </div>
            <div className="raiox-table-wrap">
              <table className="raiox-table">
                <thead>
                  <tr>
                    <th>Publicado</th>
                    <th>Vertical</th>
                    <th>Evento</th>
                    <th>Pick</th>
                    <th>Odd</th>
                    <th>Stake</th>
                    <th>Resultado</th>
                    <th style={{ textAlign: 'right' }}>Lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice(0, 100).map(t => {
                    const lucro = lucroDaTip(t);
                    const cor = VERTICAL_COLORS[t.vertical] ?? 'var(--gold-primary)';
                    const classeLucro =
                      t.resultado === 'green' ? 'pos' : t.resultado === 'red' ? 'neg' : 'neutro';
                    return (
                      <tr key={t.id}>
                        <td className="raiox-table__hora">
                          {new Date(t.publicado_em).toLocaleString('pt-PT', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td>
                          <span
                            className="raiox-tag"
                            style={{ color: cor, background: `${cor}1a`, border: `1px solid ${cor}40` }}
                          >
                            {VERTICAL_LABELS[t.vertical] ?? t.vertical}
                          </span>
                        </td>
                        <td>
                          <div className="raiox-table__evento">{t.evento}</div>
                          {t.competicao && <div className="raiox-table__comp">{t.competicao}</div>}
                        </td>
                        <td className="raiox-table__pick">{t.pick}</td>
                        <td className="raiox-table__odd">@{t.odd.toFixed(2)}</td>
                        <td className="raiox-table__hora">{t.stake}u</td>
                        <td>
                          <span className={`raiox-res raiox-res--${t.resultado}`}>
                            {t.resultado === 'green' ? 'GREEN'
                              : t.resultado === 'red' ? 'RED'
                              : t.resultado === 'void' ? 'ANULADA'
                              : 'PENDENTE'}
                          </span>
                        </td>
                        <td className={`raiox-table__lucro ${classeLucro}`}>
                          {t.resultado === 'green' || t.resultado === 'red' ? fmtUnidades(lucro) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtradas.length > 100 && (
              <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                A mostrar os 100 boletins mais recentes de {filtradas.length}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
