import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Crown, Loader2, LogOut, MessagesSquare, Shield, Trophy, Users, X,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { CanaisComunidade } from '../components/CanaisComunidade';
import { useAuth } from '../contexts/AuthContext';
import {
  cancelarPedidoCla, carregarCla, carregarMeuPedidoCla, carregarPedidosCla,
  carregarRankingClas, criarCla, editarCla, listarClas, pedirParaEntrar,
  responderPedidoCla, sairDoCla,
  type Cla, type ClaListado, type LinhaRankingClas, type MeuPedidoCla, type PedidoCla,
} from '../lib/comunidade';
import '../styles/Gamificacao.css';

type Aba = 'clas' | 'meu' | 'ranking' | 'geral';

/**
 * Clãs — grupos de 5 a 20.
 *
 * Quatro separadores: a lista de todos os clãs (onde se pede para entrar), o
 * "meu clã" (membros, chat privado e pedidos, só aparece a quem tem um), o
 * ranking (e o formulário de criar, para quem não tem) e o chat geral do Hub.
 */
export default function Clas() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [aba, setAba] = useState<Aba>('clas');
  const [meuCla, setMeuCla] = useState<Cla | null>(null);
  const [lista, setLista] = useState<ClaListado[]>([]);
  const [meuPedido, setMeuPedido] = useState<MeuPedidoCla | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCla[]>([]);
  const [ranking, setRanking] = useState<LinhaRankingClas[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const [nome, setNome] = useState('');
  const [tag, setTag] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cor, setCor] = useState('#8b5cf6');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const carregar = useCallback(async () => {
    const [c, l, p, r] = await Promise.all([
      carregarCla(), listarClas(), carregarMeuPedidoCla(), carregarRankingClas(30),
    ]);
    setMeuCla(c);
    setLista(l);
    setMeuPedido(p);
    setRanking(r);
    setPedidos(c?.sou_dono ? await carregarPedidosCla() : []);
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (user) void carregar();
  }, [user, carregar]);

  async function correr(fn: () => Promise<void>) {
    setErro('');
    setOcupado(true);
    try {
      await fn();
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Algo correu mal.');
    } finally {
      setOcupado(false);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    await correr(async () => {
      await criarCla(nome, tag, descricao, cor);
      setNome(''); setTag(''); setDescricao('');
      setAba('meu');
    });
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
            <div className='gm-eyebrow'><Shield size={14} /> COMUNIDADE</div>
            <h1>O lado <span>social</span></h1>
            <p>
              Junta 5 a 20 amigos num clã e somem EPCoins juntos — com chat
              privado e um lugar no ranking. Ou fala com o Hub inteiro no chat
              geral.
            </p>
          </div>
        </div>

        <div className='gm-tabs'>
          <button className={`gm-tab ${aba === 'clas' ? 'ativo' : ''}`} onClick={() => setAba('clas')}>
            <Shield size={15} /> Clãs
          </button>
          {meuCla && (
            <button className={`gm-tab ${aba === 'meu' ? 'ativo' : ''}`} onClick={() => setAba('meu')}>
              <Users size={15} /> {meuCla.nome}
              {meuCla.sou_dono && pedidos.length > 0 && (
                <span className='gm-badge'>{pedidos.length}</span>
              )}
            </button>
          )}
          <button className={`gm-tab ${aba === 'ranking' ? 'ativo' : ''}`} onClick={() => setAba('ranking')}>
            <Trophy size={15} /> Ranking
          </button>
          <button className={`gm-tab ${aba === 'geral' ? 'ativo' : ''}`} onClick={() => setAba('geral')}>
            <MessagesSquare size={15} /> Chat Geral
          </button>
        </div>

        {erro && <div className='gm-erro'>{erro}</div>}
        {!carregado && <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>}

        {carregado && aba === 'clas' && (
          <ListaClas
            lista={lista}
            meuCla={meuCla}
            meuPedido={meuPedido}
            ocupado={ocupado}
            onPedir={(id) => correr(() => pedirParaEntrar(id))}
            onCancelar={() => correr(() => cancelarPedidoCla())}
            onCriar={() => setAba('ranking')}
          />
        )}

        {carregado && aba === 'meu' && meuCla && (
          <MeuCla
            cla={meuCla}
            pedidos={pedidos}
            ocupado={ocupado}
            onResponder={(uid, ok) => correr(() => responderPedidoCla(uid, ok))}
            onEditar={(campos) => correr(() => editarCla(campos))}
            onSair={() => correr(async () => { await sairDoCla(); setAba('clas'); })}
          />
        )}

        {carregado && aba === 'ranking' && (
          <>
            {!meuCla && !meuPedido && (
              <div className='gm-card'>
                <h2>Cria o teu clã</h2>
                <p className='gm-sub'>Ou pede para entrar num, no separador Clãs.</p>
                <form onSubmit={criar} style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
                  <input value={nome} onChange={(e) => setNome(e.target.value)}
                    placeholder='Nome do clã' required minLength={3} maxLength={32} style={campo} />
                  <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder='TAG (2 a 5 letras ou números)' required
                    pattern='[A-Za-z0-9]{2,5}' style={campo} />
                  <input value={descricao} onChange={(e) => setDescricao(e.target.value)}
                    placeholder='Descrição (opcional)' maxLength={240} style={campo} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Cor do nome
                    <input type='color' value={cor} onChange={(e) => setCor(e.target.value)}
                      style={{ width: 44, height: 30, padding: 0, border: 'none', background: 'none' }} />
                    <strong style={{ color: cor }}>{nome || 'Exemplo'}</strong>
                  </label>
                  <button className='gm-btn' type='submit' disabled={ocupado}>
                    <Users size={15} /> Criar clã
                  </button>
                </form>
              </div>
            )}
            <RankingClas ranking={ranking} />
          </>
        )}

        {carregado && aba === 'geral' && <CanaisComunidade filtro='geral' />}
      </div>
    </div>
  );
}

// ─── LISTA DE TODOS OS CLÃS ──────────────────────────────────────

function ListaClas({
  lista, meuCla, meuPedido, ocupado, onPedir, onCancelar, onCriar,
}: {
  lista: ClaListado[];
  meuCla: Cla | null;
  meuPedido: MeuPedidoCla | null;
  ocupado: boolean;
  onPedir: (claId: string) => void;
  onCancelar: () => void;
  onCriar: () => void;
}) {
  return (
    <div className='gm-card'>
      <h2>Clãs</h2>
      <p className='gm-sub'>
        {meuCla
          ? 'Já estás num clã. Sai do teu para poderes entrar noutro.'
          : meuPedido
            ? `Pedido enviado a [${meuPedido.tag}] ${meuPedido.nome} — à espera que o líder aceite.`
            : 'Pede para entrar num. O líder decide quem entra.'}
      </p>

      {lista.length === 0 ? (
        <div className='gm-vazio'>
          Ainda não há clãs. <button className='gm-link' onClick={onCriar}>Cria o primeiro.</button>
        </div>
      ) : (
        <div className='cla-lista'>
          {lista.map((c) => {
            const cheio = c.membros >= c.max_membros;
            const pedido = meuPedido?.cla_id === c.cla_id;
            return (
              <div key={c.cla_id} className='cla-item'>
                <div className='cla-item__info'>
                  <div className='cla-item__nome'>
                    <Shield size={15} style={{ color: c.cor ?? 'var(--text-muted)' }} />
                    <strong style={{ color: c.cor ?? undefined }}>{c.nome}</strong>
                    <span className='cla-item__tag'>[{c.tag}]</span>
                  </div>
                  <div className='cla-item__meta'>
                    <span><Crown size={12} /> {c.lider}</span>
                    <span><Users size={12} /> {c.membros}/{c.max_membros}</span>
                  </div>
                  {c.descricao && <p className='cla-item__desc'>{c.descricao}</p>}
                </div>
                <div className='cla-item__acao'>
                  {!meuCla && (pedido ? (
                    <button className='gm-btn gm-btn-fantasma' disabled={ocupado} onClick={onCancelar}>
                      Cancelar pedido
                    </button>
                  ) : meuPedido ? null : (
                    <button className='gm-btn' disabled={ocupado || cheio}
                      onClick={() => onPedir(c.cla_id)}>
                      {cheio ? 'Cheio' : 'Pedir para entrar'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── O MEU CLÃ ───────────────────────────────────────────────────

function MeuCla({
  cla, pedidos, ocupado, onResponder, onEditar, onSair,
}: {
  cla: Cla;
  pedidos: PedidoCla[];
  ocupado: boolean;
  onResponder: (userId: string, aceitar: boolean) => void;
  onEditar: (campos: { descricao?: string; aberto?: boolean; cor?: string | null }) => void;
  onSair: () => void;
}) {
  const [cor, setCor] = useState(cla.cor ?? '#8b5cf6');

  return (
    <>
      <div className='gm-card'>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ color: cla.cor ?? undefined }}>
              <Shield size={17} style={{ verticalAlign: '-3px', marginRight: 7, color: cla.cor ?? undefined }} />
              {cla.nome} <span style={{ color: 'var(--text-muted)' }}>[{cla.tag}]</span>
            </h2>
            <p className='gm-sub' style={{ marginBottom: 0 }}>{cla.descricao ?? 'Sem descrição.'}</p>
          </div>
          <button className='gm-btn gm-btn-fantasma' onClick={onSair} disabled={ocupado}>
            <LogOut size={15} /> {cla.sou_dono ? 'Dissolver clã' : 'Sair'}
          </button>
        </div>

        <table className='gm-tabela' style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>Membro ({cla.membros.length}/{cla.max_membros})</th>
              <th className='num'>EPCoins</th>
            </tr>
          </thead>
          <tbody>
            {cla.membros.map((m) => (
              <tr key={m.username}>
                <td>
                  {m.papel === 'dono' && (
                    <Crown size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--gold-light)' }} />
                  )}
                  <a href={`/u/${encodeURIComponent(m.username)}`}
                    style={{ color: 'var(--text-white)', textDecoration: 'none' }}>{m.username}</a>
                </td>
                <td className='num'>{m.epcoins.toLocaleString('pt-PT')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {cla.sou_dono && (
          <div className='cla-editar'>
            <label>
              Cor do nome
              <input type='color' value={cor} onChange={(e) => setCor(e.target.value)} />
            </label>
            <button className='gm-btn gm-btn-fantasma' disabled={ocupado}
              onClick={() => onEditar({ cor })}>Guardar cor</button>
            <button className='gm-btn gm-btn-fantasma' disabled={ocupado}
              onClick={() => onEditar({ aberto: !cla.aberto })}>
              {cla.aberto ? 'Fechar a pedidos' : 'Abrir a pedidos'}
            </button>
          </div>
        )}
      </div>

      {cla.sou_dono && (
        <div className='gm-card'>
          <h2>Pedidos para entrar</h2>
          {pedidos.length === 0 ? (
            <div className='gm-vazio'>Nenhum pedido de momento.</div>
          ) : (
            <div className='cla-lista'>
              {pedidos.map((p) => (
                <div key={p.user_id} className='cla-item'>
                  <div className='cla-item__info'>
                    <div className='cla-item__nome'>
                      <strong>{p.username}</strong>
                    </div>
                    <div className='cla-item__meta'>
                      <span>{p.epcoins.toLocaleString('pt-PT')} EPC</span>
                    </div>
                  </div>
                  <div className='cla-item__acao'>
                    <button className='gm-btn' disabled={ocupado}
                      onClick={() => onResponder(p.user_id, true)}>
                      <Check size={15} /> Aceitar
                    </button>
                    <button className='gm-btn gm-btn-fantasma' disabled={ocupado}
                      onClick={() => onResponder(p.user_id, false)}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CanaisComunidade filtro='cla' />
    </>
  );
}

// ─── RANKING ─────────────────────────────────────────────────────

function RankingClas({ ranking }: { ranking: LinhaRankingClas[] }) {
  return (
    <div className='gm-card'>
      <h2>Ranking de clãs · este mês</h2>
      <p className='gm-sub'>EPCoins ganhas pelos membros desde o dia 1.</p>
      {ranking.length === 0 ? (
        <div className='gm-vazio'>Ainda não há clãs. Sê o primeiro.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className='gm-tabela'>
            <thead>
              <tr><th>#</th><th>Clã</th><th className='num'>Membros</th><th className='num'>EPC no mês</th></tr>
            </thead>
            <tbody>
              {ranking.map((c, i) => (
                <tr key={c.cla_id}>
                  <td className='gm-pos'>{i + 1}</td>
                  <td>
                    <strong style={{ color: c.cor ?? undefined }}>{c.nome}</strong>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>[{c.tag}]</span>
                  </td>
                  <td className='num'>{c.membros}</td>
                  <td className='num'>{c.pontos.toLocaleString('pt-PT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const campo: React.CSSProperties = {
  background: 'var(--surface-sunken)',
  border: '1px solid var(--border-color)',
  borderRadius: 10,
  padding: '11px 14px',
  color: 'var(--text-white)',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
};
