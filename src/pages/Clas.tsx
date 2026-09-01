import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2, LogOut, MessagesSquare, Shield, Users } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { CanaisClube } from '../components/CanaisClube';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarCla, carregarRankingClas, criarCla, entrarNoCla, sairDoCla,
  type Cla, type LinhaRankingClas,
} from '../lib/comunidade';
import '../styles/Gamificacao.css';

/**
 * Clãs — grupos de 5 a 20.
 *
 * O limite de 20 não é técnico: acima disso deixa de haver a pressão de grupo
 * que faz um clã funcionar e passa a ser um chat geral com outro nome.
 *
 * O ranking soma as EPCoins *ganhas* pelos membros no mês, não o saldo. Um
 * clã não deve cair no ranking porque os membros andaram a usar as moedas
 * na loja — isso seria castigar exactamente o comportamento que se quer.
 */
export default function Clas() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [aba, setAba] = useState<'clas' | 'canais'>('clas');
  const [meuCla, setMeuCla] = useState<Cla | null>(null);
  const [ranking, setRanking] = useState<LinhaRankingClas[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const [nome, setNome] = useState('');
  const [tag, setTag] = useState('');
  const [descricao, setDescricao] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const carregar = useCallback(async () => {
    const [c, r] = await Promise.all([carregarCla(), carregarRankingClas(30)]);
    setMeuCla(c);
    setRanking(r);
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (user) void carregar();
  }, [user, carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setOcupado(true);
    try {
      await criarCla(nome, tag, descricao);
      setNome(''); setTag(''); setDescricao('');
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar o clã.');
    } finally {
      setOcupado(false);
    }
  }

  async function entrar(claId: string) {
    setErro('');
    setOcupado(true);
    try {
      await entrarNoCla(claId);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setOcupado(false);
    }
  }

  async function sair() {
    setErro('');
    setOcupado(true);
    try {
      await sairDoCla();
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível sair.');
    } finally {
      setOcupado(false);
    }
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
            <h1>Os <span>clãs</span></h1>
            <p>
              Junta 5 a 20 amigos e somem EPCoins juntos. O ranking conta o que o
              clã ganhou este mês.
            </p>
          </div>
        </div>

        <div className='gm-tabs'>
          <button className={`gm-tab ${aba === 'clas' ? 'ativo' : ''}`} onClick={() => setAba('clas')}>
            <Shield size={15} /> Clãs
          </button>
          <button className={`gm-tab ${aba === 'canais' ? 'ativo' : ''}`} onClick={() => setAba('canais')}>
            <MessagesSquare size={15} /> Canais
          </button>
        </div>

        {aba === 'canais' && <CanaisClube />}

        {aba === 'clas' && erro && <div className='gm-erro'>{erro}</div>}
        {aba === 'clas' && !carregado && (
          <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>
        )}

        {aba === 'clas' && carregado && meuCla && (
          <div className='gm-card'>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <h2>
                  <Shield size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} />
                  {meuCla.nome} <span style={{ color: 'var(--text-muted)' }}>[{meuCla.tag}]</span>
                </h2>
                <p className='gm-sub' style={{ marginBottom: 0 }}>
                  {meuCla.descricao ?? 'Sem descrição.'}
                </p>
              </div>
              <button className='gm-btn gm-btn-fantasma' onClick={sair} disabled={ocupado}>
                <LogOut size={15} />
                {meuCla.sou_dono ? 'Dissolver clã' : 'Sair'}
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <table className='gm-tabela'>
                <thead>
                  <tr>
                    <th>Membro ({meuCla.membros.length}/{meuCla.max_membros})</th>
                    <th className='num'>EPCoins</th>
                  </tr>
                </thead>
                <tbody>
                  {meuCla.membros.map((m) => (
                    <tr key={m.username}>
                      <td>
                        {m.papel === 'dono' && (
                          <Crown size={13} style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--gold-light)' }} />
                        )}
                        <a href={`/u/${encodeURIComponent(m.username)}`}
                           style={{ color: 'var(--text-white)', textDecoration: 'none' }}>
                          {m.username}
                        </a>
                      </td>
                      <td className='num'>{m.epcoins.toLocaleString('pt-PT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meuCla.sou_dono && (
              <p style={{ marginTop: 16, marginBottom: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Se saíres, o clã dissolve-se — não há passagem de posse.
              </p>
            )}
          </div>
        )}

        {aba === 'clas' && carregado && !meuCla && (
          <div className='gm-card'>
            <h2>Cria o teu clã</h2>
            <p className='gm-sub'>Ou entra num que esteja aberto, na lista abaixo.</p>

            <form onSubmit={criar} style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder='Nome do clã'
                required minLength={3} maxLength={32}
                style={campo}
              />
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                placeholder='TAG (2 a 5 letras ou números)'
                required pattern='[A-Za-z0-9]{2,5}'
                style={campo}
              />
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder='Descrição (opcional)'
                maxLength={240}
                style={campo}
              />
              <button className='gm-btn' type='submit' disabled={ocupado}>
                <Users size={15} /> Criar clã
              </button>
            </form>
          </div>
        )}

        {aba === 'clas' && carregado && (
          <div className='gm-card'>
            <h2>Ranking de clãs · este mês</h2>
            <p className='gm-sub'>EPCoins ganhas pelos membros desde o dia 1.</p>

            {ranking.length === 0 ? (
              <div className='gm-vazio'>Ainda não há clãs. Sê o primeiro.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className='gm-tabela'>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Clã</th>
                      <th className='num'>Membros</th>
                      <th className='num'>EPC no mês</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((c, i) => (
                      <tr key={c.cla_id}>
                        <td className='gm-pos'>{i + 1}</td>
                        <td>{c.nome} <span style={{ color: 'var(--text-muted)' }}>[{c.tag}]</span></td>
                        <td className='num'>{c.membros}</td>
                        <td className='num'>{c.pontos.toLocaleString('pt-PT')}</td>
                        <td className='num'>
                          {!meuCla && (
                            <button
                              className='gm-btn gm-btn-fantasma'
                              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                              disabled={ocupado}
                              onClick={() => entrar(c.cla_id)}
                            >
                              Entrar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
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
