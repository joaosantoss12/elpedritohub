import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins, Gift, Loader2, ListChecks, ShoppingBag, Copy, Check, Ticket, UserPlus, History,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { PainelJackpot } from '../components/PainelJackpot';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarCatalogo, carregarExtrato, carregarMissoes, carregarSegmentosRoda,
  comprarItem, estadoSpin, girarRoda, resgatarMissao,
  type EstadoSpin, type ItemLoja, type Missao, type MovimentoEPC, type ResultadoSpin,
  type SegmentoRoda,
} from '../lib/epcoins';
import {
  carregarResumoConvites, linkDeConvite, type ResumoConvites,
} from '../lib/comunidade';
import '../styles/Gamificacao.css';

type Aba = 'missoes' | 'roda' | 'loja' | 'jackpot' | 'convites' | 'extrato';

/**
 * Recompensas — tudo o que se faz com as EPCoins.
 *
 * As moedas entram por actividade gratuita (entrar todos os dias, prever,
 * participar nas salas, missões, drops) e saem em merchandising, conteúdo e
 * cosméticos. Nunca ao contrário: não se compram, não se convertem e não
 * valem dinheiro.
 */
export default function Recompensas() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading, refreshMembro } = useAuth();

  const [aba, setAba] = useState<Aba>('missoes');
  const [missoes, setMissoes] = useState<Missao[]>([]);
  const [catalogo, setCatalogo] = useState<ItemLoja[]>([]);
  const [extrato, setExtrato] = useState<MovimentoEPC[]>([]);
  const [convites, setConvites] = useState<ResumoConvites | null>(null);
  const [spin, setSpin] = useState<EstadoSpin>({ disponivel: false, ultimo_rotulo: null });
  const [segmentos, setSegmentos] = useState<SegmentoRoda[]>([]);
  const [premio, setPremio] = useState<ResultadoSpin | null>(null);
  const [aGirar, setAGirar] = useState(false);
  const [voltas, setVoltas] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const carregar = useCallback(async () => {
    const [ms, cat, ext, cv, sp, seg] = await Promise.all([
      carregarMissoes(),
      carregarCatalogo(),
      carregarExtrato(60),
      carregarResumoConvites(),
      estadoSpin(),
      carregarSegmentosRoda(),
    ]);
    setMissoes(ms);
    setCatalogo(cat);
    setExtrato(ext);
    setConvites(cv);
    setSpin(sp);
    setSegmentos(seg);
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (user) void carregar();
  }, [user, carregar]);

  async function resgatar(m: Missao) {
    setErro('');
    setOcupado(m.id);
    try {
      await resgatarMissao(m.id);
      await refreshMembro();
      setMissoes(await carregarMissoes());
      setExtrato(await carregarExtrato(60));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível resgatar.');
    } finally {
      setOcupado(null);
    }
  }

  async function comprar(item: ItemLoja) {
    setErro('');
    setOcupado(item.id);
    try {
      await comprarItem(item.id);
      await refreshMembro();
      setCatalogo(await carregarCatalogo());
      setExtrato(await carregarExtrato(60));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível trocar.');
    } finally {
      setOcupado(null);
    }
  }

  /**
   * A roda gira no ecrã, mas o prémio já veio decidido do servidor. A
   * animação é só o tempo que se dá ao resultado para chegar.
   */
  async function girar() {
    setErro('');
    setPremio(null);
    setAGirar(true);
    setVoltas((v) => v + 5 + Math.random() * 2);
    try {
      const r = await girarRoda();
      setTimeout(async () => {
        setPremio(r);
        setAGirar(false);
        setSpin({ disponivel: false, ultimo_rotulo: r.rotulo });
        await refreshMembro();
        setExtrato(await carregarExtrato(60));
      }, 3200);
    } catch (e) {
      setAGirar(false);
      setErro(e instanceof Error ? e.message : 'Não foi possível girar.');
    }
  }

  function copiarConvite() {
    if (!convites) return;
    void navigator.clipboard.writeText(linkDeConvite(convites.codigo));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (authLoading || !user) {
    return (
      <div className='gm-page'>
        <Navbar />
        <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>
      </div>
    );
  }

  return (
    <div className='gm-page'>
      <Navbar />
      <div className='gm-wrap'>
        <div className='gm-topo'>
          <div>
            <div className='gm-eyebrow'><Coins size={14} /> EPCOINS</div>
            <h1>As tuas <span>recompensas</span></h1>
            <p>
              Ganha EPCoins a participar e troca-as por merchandising, conteúdo e
              cosméticos. As EPCoins não têm valor monetário e não se convertem
              em dinheiro nem em saldo de aposta.
            </p>
          </div>
          <div className='gm-saldo'>
            <Coins size={18} />
            {(membro?.epcoins ?? 0).toLocaleString('pt-PT')} EPC
          </div>
        </div>

        <div className='gm-tabs'>
          <button className={`gm-tab ${aba === 'missoes' ? 'ativo' : ''}`} onClick={() => setAba('missoes')}>
            <ListChecks size={15} /> Missões
          </button>
          <button className={`gm-tab ${aba === 'roda' ? 'ativo' : ''}`} onClick={() => setAba('roda')}>
            <Gift size={15} /> Roda diária
          </button>
          <button className={`gm-tab ${aba === 'loja' ? 'ativo' : ''}`} onClick={() => setAba('loja')}>
            <ShoppingBag size={15} /> Loja
          </button>
          <button className={`gm-tab ${aba === 'jackpot' ? 'ativo' : ''}`} onClick={() => setAba('jackpot')}>
            <Ticket size={15} /> Jackpot
          </button>
          <button className={`gm-tab ${aba === 'convites' ? 'ativo' : ''}`} onClick={() => setAba('convites')}>
            <UserPlus size={15} /> Convites
          </button>
          <button className={`gm-tab ${aba === 'extrato' ? 'ativo' : ''}`} onClick={() => setAba('extrato')}>
            <History size={15} /> Extrato
          </button>
        </div>

        {erro && <div className='gm-erro'>{erro}</div>}
        {!carregado && <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>}

        {/* ─── Missões ─────────────────────────────────────── */}
        {carregado && aba === 'missoes' && (
          <div className='gm-card'>
            <h2>Missões</h2>
            <p className='gm-sub'>
              Reiniciam sozinhas no fim de cada período. O progresso conta-se do
              lado do servidor, à medida que participas.
            </p>

            {missoes.length === 0 ? (
              <div className='gm-vazio'>Ainda não há missões activas.</div>
            ) : (
              <div className='gm-grid'>
                {missoes.map((m) => (
                  <div key={m.id} className='gm-missao'>
                    <div className='gm-missao-topo'>
                      <span className='gm-missao-titulo'>{m.titulo}</span>
                      <span className='gm-missao-premio'>+{m.recompensa} EPC</span>
                    </div>
                    {m.descricao && (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-gray)' }}>
                        {m.descricao}
                      </span>
                    )}
                    <div className='gm-progresso'>
                      <i style={{ width: `${Math.min(100, (m.progresso / m.alvo) * 100)}%` }} />
                    </div>
                    <div className='gm-missao-rodape'>
                      <span>{m.progresso} / {m.alvo}</span>
                      {m.resgatada ? (
                        <span className='gm-etiqueta'>Resgatada</span>
                      ) : m.concluida ? (
                        <button
                          className='gm-btn'
                          style={{ padding: '7px 14px' }}
                          disabled={ocupado === m.id}
                          onClick={() => resgatar(m)}
                        >
                          {ocupado === m.id ? '…' : 'Resgatar'}
                        </button>
                      ) : (
                        <span className='gm-etiqueta'>{rotuloPeriodo(m.periodo)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Roda diária ─────────────────────────────────── */}
        {carregado && aba === 'roda' && (
          <div className='gm-card'>
            <h2>Roda diária</h2>
            <p className='gm-sub'>Uma volta por dia, à borla.</p>

            <div className='gm-aviso' style={{ marginBottom: 22 }}>
              Isto não é um jogo de casino. Não há depósito, não há aposta e não há
              nada a pagar: a volta é gratuita, uma por dia, e o que sai são
              benefícios internos do Hub — EPCoins e badges — que não se convertem
              em dinheiro nem em saldo de aposta.
            </div>

            <div className='gm-roda-painel'>
              <div className='gm-roda'>
                <div
                  className='gm-roda-disco'
                  style={{ transform: `rotate(${voltas * 360}deg)` }}
                >
                  <div className='gm-roda-centro'>
                    {aGirar ? '…' : premio ? premio.rotulo : 'EPC'}
                  </div>
                </div>

                {premio && !aGirar && (
                  <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    {premio.tipo === 'nada'
                      ? 'Hoje não saiu nada. Amanhã há outra.'
                      : `Ganhaste ${premio.rotulo}.`}
                  </p>
                )}

                <button className='gm-btn' onClick={girar} disabled={!spin.disponivel || aGirar}>
                  {aGirar
                    ? 'A girar…'
                    : spin.disponivel
                      ? 'Girar'
                      : 'Já giraste hoje'}
                </button>

                {!spin.disponivel && spin.ultimo_rotulo && !premio && (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Última volta: {spin.ultimo_rotulo}
                  </span>
                )}
              </div>

              {segmentos.length > 0 && (
                <div className='gm-roda-tabela'>
                  <h3>Ganhos possíveis</h3>
                  <table>
                    <thead>
                      <tr><th>Prémio</th><th>Hipótese</th></tr>
                    </thead>
                    <tbody>
                      {segmentos.map((s) => (
                        <tr key={s.rotulo}>
                          <td>
                            <span
                              className='gm-roda-tabela__cor'
                              style={{ background: s.cor ?? 'var(--border-strong)' }}
                            />
                            {s.rotulo}
                          </td>
                          <td>{s.chance < 1 ? s.chance.toFixed(1) : Math.round(s.chance)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className='gm-roda-tabela__nota'>
                    Hipóteses aproximadas. O sorteio é feito no servidor.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Loja ────────────────────────────────────────── */}
        {carregado && aba === 'loja' && (
          <div className='gm-card'>
            <h2>Loja</h2>
            <p className='gm-sub'>
              O que precisa de envio ou marcação fica pendente e é tratado à mão
              depois da troca.
            </p>

            {catalogo.length === 0 ? (
              <div className='gm-vazio'>A loja está a ser preparada.</div>
            ) : (
              <div className='gm-grid'>
                {catalogo.map((i) => {
                  const semSaldo = (membro?.epcoins ?? 0) < i.preco;
                  const esgotado = i.stock !== null && i.stock <= 0;
                  return (
                    <div key={i.id} className='gm-item'>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <strong style={{ fontSize: '0.95rem' }}>{i.nome}</strong>
                        <span className='gm-etiqueta'>{rotuloTipo(i.tipo)}</span>
                      </div>
                      <p>{i.descricao}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <span className='gm-item-preco'>{i.preco.toLocaleString('pt-PT')} EPC</span>
                        <button
                          className='gm-btn'
                          style={{ padding: '8px 14px' }}
                          disabled={i.ja_tenho || esgotado || semSaldo || ocupado === i.id}
                          onClick={() => comprar(i)}
                        >
                          {i.ja_tenho ? 'Já tens'
                            : esgotado ? 'Esgotado'
                            : semSaldo ? 'Sem saldo'
                            : ocupado === i.id ? '…' : 'Trocar'}
                        </button>
                      </div>
                      {i.requer_vip && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          Exclusivo VIP
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Convites ────────────────────────────────────── */}
        {/* ─── Jackpot ─────────────────────────────────────── */}
        {aba === 'jackpot' && <PainelJackpot />}

        {carregado && aba === 'convites' && (
          <div className='gm-card'>
            <h2>Convida a malta</h2>
            <p className='gm-sub'>
              Quem entrar com o teu código ganha EPCoins, e tu também.
            </p>

            {!convites ? (
              <div className='gm-vazio'>Convites indisponíveis de momento.</div>
            ) : (
              <>
                <div className='gm-codigo'>
                  <code>{convites.codigo}</code>
                  <button className='gm-btn gm-btn-fantasma' onClick={copiarConvite}>
                    {copiado ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar link</>}
                  </button>
                </div>

                <p style={{ marginTop: 18, marginBottom: 0, color: 'var(--text-gray)', fontSize: '0.9rem' }}>
                  Já trouxeste <strong style={{ color: 'var(--gold-light)' }}>
                    {convites.convidados}
                  </strong>{' '}
                  {convites.convidados === 1 ? 'pessoa' : 'pessoas'} para o Hub.
                </p>

                <div className='gm-aviso' style={{ marginTop: 20 }}>
                  O convite é interno ao Hub e a recompensa são EPCoins. Não está
                  associado a registos nem a depósitos em casas de apostas.
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Extrato ─────────────────────────────────────── */}
        {carregado && aba === 'extrato' && (
          <div className='gm-card'>
            <h2>Extrato</h2>
            <p className='gm-sub'>Cada movimento de EPCoins, do mais recente para trás.</p>

            {extrato.length === 0 ? (
              <div className='gm-vazio'>Ainda não há movimentos.</div>
            ) : (
              <div>
                {extrato.map((m) => (
                  <div key={m.id} className='gm-mov'>
                    <div>
                      <div>{m.descricao ?? m.motivo}</div>
                      <div className='gm-mov-data'>
                        {new Date(m.created_at).toLocaleString('pt-PT', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className={`gm-mov-valor ${m.valor > 0 ? 'pos' : 'neg'}`}>
                      {m.valor > 0 ? '+' : ''}{m.valor} EPC
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function rotuloPeriodo(p: Missao['periodo']): string {
  return p === 'diaria' ? 'Hoje' : p === 'semanal' ? 'Esta semana' : p === 'mensal' ? 'Este mês' : 'Sempre';
}

function rotuloTipo(t: ItemLoja['tipo']): string {
  const mapa: Record<ItemLoja['tipo'], string> = {
    badge: 'Badge',
    avatar: 'Avatar',
    moldura: 'Moldura',
    merch: 'Merch',
    desconto: 'Desconto',
    experiencia: 'Experiência',
    conteudo: 'Conteúdo',
  };
  return mapa[t];
}
