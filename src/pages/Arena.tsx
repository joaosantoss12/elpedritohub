import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Loader2, Swords, Trophy, Users } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { PainelPrevisoes } from '../components/PainelPrevisoes';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarBoletimDeHoje, carregarPedritoVsComunidade, carregarRankingPrevisoes,
  type Boletim, type LinhaRankingPrevisoes, type PedritoVsComunidade, type Pergunta,
} from '../lib/previsoes';
import '../styles/Gamificacao.css';

type Aba = 'batalha' | 'duelo' | 'ranking';

/**
 * A Arena — previsões gratuitas.
 *
 * Três leituras da mesma coisa: a Batalha de Prognósticos (as perguntas do
 * dia), o Pedrito vs Comunidade (o resultado agregado dessas perguntas) e o
 * ranking de quem acerta mais.
 *
 * Aqui não se aposta nada. Responder é grátis, o que se ganha são EPCoins, e
 * as EPCoins não se convertem em dinheiro.
 */
export default function Arena() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading, refreshMembro } = useAuth();

  const [aba, setAba] = useState<Aba>('batalha');
  const [boletim, setBoletim] = useState<Boletim | null>(null);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [duelo, setDuelo] = useState<PedritoVsComunidade | null>(null);
  const [ranking, setRanking] = useState<LinhaRankingPrevisoes[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const carregar = useCallback(async () => {
    const [b, d, r] = await Promise.all([
      carregarBoletimDeHoje(),
      carregarPedritoVsComunidade(),
      carregarRankingPrevisoes(inicioDoMes(), 50),
    ]);
    setBoletim(b.boletim);
    setPerguntas(b.perguntas);
    setDuelo(d);
    setRanking(r);
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (user) void carregar();
  }, [user, carregar]);

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
            <div className='gm-eyebrow'><Swords size={14} /> BATALHA DE PROGNÓSTICOS</div>
            <h1>A <span>arena</span></h1>
            <p>
              Previsões grátis, sem dinheiro envolvido. Acertas, ganhas EPCoins —
              e um lugar no ranking.
            </p>
          </div>
          <div className='gm-saldo'>
            <Coins size={18} />
            {(membro?.epcoins ?? 0).toLocaleString('pt-PT')} EPC
          </div>
        </div>

        <div className='gm-tabs'>
          <button className={`gm-tab ${aba === 'batalha' ? 'ativo' : ''}`} onClick={() => setAba('batalha')}>
            <Swords size={15} /> Batalha do dia
          </button>
          <button className={`gm-tab ${aba === 'duelo' ? 'ativo' : ''}`} onClick={() => setAba('duelo')}>
            <Users size={15} /> Pedrito vs Comunidade
          </button>
          <button className={`gm-tab ${aba === 'ranking' ? 'ativo' : ''}`} onClick={() => setAba('ranking')}>
            <Trophy size={15} /> Ranking
          </button>
        </div>

        {!carregado && <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>}

        {carregado && aba === 'batalha' && (
          <div className='gm-card'>
            <h2>{boletim?.titulo ?? 'Batalha de Prognósticos'}</h2>
            <p className='gm-sub'>
              {boletim?.descricao ??
                'As perguntas do dia. Fecham antes do apito inicial de cada jogo.'}
            </p>
            <PainelPrevisoes
              perguntas={perguntas}
              onResposta={() => { void refreshMembro(); }}
            />
          </div>
        )}

        {carregado && aba === 'duelo' && (
          <div className='gm-card'>
            <h2>Pedrito vs Comunidade</h2>
            <p className='gm-sub'>
              Sobre todas as perguntas já resolvidas em que o Pedrito também deu palpite.
            </p>

            {!duelo || duelo.perguntas === 0 ? (
              <div className='gm-vazio'>
                Ainda não há perguntas resolvidas suficientes para o duelo.
              </div>
            ) : (
              <>
                <div className='gm-duelo'>
                  <div className='gm-duelo-lado'>
                    <strong>
                      {Math.round((duelo.pedrito_acertos / duelo.perguntas) * 100)}%
                    </strong>
                    <span>Pedrito</span>
                  </div>
                  <div className='gm-duelo-vs'>VS</div>
                  <div className='gm-duelo-lado'>
                    <strong>{duelo.comunidade_taxa ?? 0}%</strong>
                    <span>Comunidade</span>
                  </div>
                </div>

                <p style={{
                  textAlign: 'center', marginTop: 22, marginBottom: 0,
                  color: 'var(--text-gray)', fontSize: '0.88rem',
                }}>
                  {duelo.participantes.toLocaleString('pt-PT')}{' '}
                  {duelo.participantes === 1 ? 'pessoa desafiou' : 'pessoas desafiaram'} o
                  Pedrito em {duelo.perguntas}{' '}
                  {duelo.perguntas === 1 ? 'pergunta' : 'perguntas'}.
                </p>
              </>
            )}
          </div>
        )}

        {carregado && aba === 'ranking' && (
          <div className='gm-card'>
            <h2>Ranking de acertos · este mês</h2>
            <p className='gm-sub'>
              Ordenado por acertos; empates desempatam pela taxa. Precisas de pelo
              menos três previsões resolvidas para entrar.
            </p>

            {ranking.length === 0 ? (
              <div className='gm-vazio'>Ainda não há previsões resolvidas este mês.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className='gm-tabela'>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Membro</th>
                      <th className='num'>Respostas</th>
                      <th className='num'>Acertos</th>
                      <th className='num'>Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((l, i) => (
                      <tr key={l.user_id}>
                        <td className='gm-pos'>{i + 1}</td>
                        <td>
                          <a
                            href={`/u/${encodeURIComponent(l.username)}`}
                            style={{ color: 'var(--text-white)', textDecoration: 'none' }}
                          >
                            {l.username}
                          </a>
                        </td>
                        <td className='num'>{l.respondidas}</td>
                        <td className='num'>{l.acertos}</td>
                        <td className='num'>{l.taxa ?? 0}%</td>
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

/** Primeiro dia do mês corrente, em ISO curto — o filtro do ranking mensal. */
function inicioDoMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
