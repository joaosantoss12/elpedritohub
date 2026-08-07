import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio, MessageSquare, Loader2, ArrowLeft, Send, Lock,
  Crown, Users, Trash2, RefreshCw, Target, Square, ArrowLeftRight,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarJogos, carregarDetalhesJogo, estaAoVivo, labelJogo, continenteDaLiga,
  ORDEM_CONTINENTES, type JogoAoVivo, type DetalhesJogo,
} from '../lib/placar';
import {
  carregarSalasConfig, carregarMensagens, contarPorEvento, enviarMensagem,
  apagarMensagem, subscreverSala,
  type CanalSala, type MensagemSala,
} from '../lib/salasJogo';
import '../styles/Salas.css';

/** De quanto em quanto tempo se volta a pedir o placar à ESPN. */
const INTERVALO_PLACAR = 45_000;

/**
 * Salas por jogo — roadmap 11.
 *
 * Uma sala por jogo, com o placar ao vivo em cima e o chat de comentários por
 * baixo. Dois canais: geral, aberto a todos os membros, e VIP, fechado aos
 * subscritores — e fechado a sério, pela RLS, não por esconder o separador.
 *
 * Não substitui o chat principal do Telegram: aqui a conversa tem um jogo
 * concreto como assunto e acaba quando o jogo acaba.
 */
export default function Salas() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading } = useAuth();

  const [jogos, setJogos] = useState<JogoAoVivo[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [aberto, setAberto] = useState<JogoAoVivo | null>(null);
  const [continente, setContinente] = useState<string>('todos');
  const [ligaFiltro, setLigaFiltro] = useState<string>('todas');
  const [apenasAoVivo, setApenasAoVivo] = useState(false);

  const isVip = membro?.subscription_status === 'active'
    || (membro?.badges?.some(b => ['vip', 'administrador'].includes(b.toLowerCase())) ?? false);
  const isAdmin = membro?.badges?.includes('Administrador') ?? false;

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const puxarJogos = useCallback(async () => {
    const cfg = await carregarSalasConfig();
    if (!cfg.ativo) { setJogos([]); setCarregado(true); return; }
    const lista = await carregarJogos(cfg.ligas);
    setJogos(lista);
    setCarregado(true);
    setContagens(await contarPorEvento(lista.map(j => j.id)));
  }, []);

  useEffect(() => {
    let vivo = true;
    const correr = () => { if (vivo) puxarJogos(); };
    correr();
    // O placar tem de se manter fresco sozinho, senão a sala mente.
    const t = window.setInterval(correr, INTERVALO_PLACAR);
    return () => { vivo = false; window.clearInterval(t); };
  }, [puxarJogos]);

  // A sala aberta segue o placar atualizado, não a cópia de quando abriu.
  const jogoAberto = useMemo(
    () => (aberto ? jogos.find(j => j.id === aberto.id) ?? aberto : null),
    [aberto, jogos],
  );

  // Trocar de continente pode deixar a liga escolhida sem jogos — volta a "todas".
  useEffect(() => { setLigaFiltro('todas'); }, [continente]);

  const continentesDisponiveis = useMemo(
    () => ORDEM_CONTINENTES.filter(c => jogos.some(j => continenteDaLiga(j.ligaSlug) === c)),
    [jogos],
  );

  const jogosDoContinente = useMemo(
    () => (continente === 'todos' ? jogos : jogos.filter(j => continenteDaLiga(j.ligaSlug) === continente)),
    [jogos, continente],
  );

  const ligasDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    jogosDoContinente.forEach(j => mapa.set(j.ligaSlug, j.liga));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [jogosDoContinente]);

  const jogosFiltrados = useMemo(
    () => (ligaFiltro === 'todas' ? jogosDoContinente : jogosDoContinente.filter(j => j.ligaSlug === ligaFiltro)),
    [jogosDoContinente, ligaFiltro],
  );

  const aoVivo = jogosFiltrados.filter(estaAoVivo);
  const proximos = apenasAoVivo ? [] : jogosFiltrados.filter(j => j.estado === 'agendado');
  const acabados = apenasAoVivo ? [] : jogosFiltrados.filter(j => j.estado === 'terminado' || j.estado === 'adiado');

  if (jogoAberto) {
    return (
      <div className="salas-page">
        <Navbar />
        <SalaJogo
          jogo={jogoAberto}
          isVip={isVip}
          isAdmin={isAdmin}
          userId={user?.id ?? ''}
          username={membro?.username || membro?.nome || 'Membro'}
          onVoltar={() => setAberto(null)}
        />
      </div>
    );
  }

  return (
    <div className="salas-page">
      <Navbar />

      <div className="salas-wrapper">
        <header className="salas-header">
          <div className="salas-header__eyebrow"><Radio size={14} /> SALAS POR JOGO</div>
          <h1>Jogo a <span>jogo</span></h1>
          <p>
            Cada jogo tem a sua sala, com o placar ao vivo e um chat só sobre
            aquele jogo. O canal geral é para todos os membros; o VIP é para
            quem tem subscrição.
          </p>
        </header>

        {!carregado ? (
          <div className="salas-loading">
            <Loader2 size={26} className="salas-spin" color="var(--gold-primary)" />
            <span>A carregar os jogos de hoje…</span>
          </div>
        ) : jogos.length === 0 ? (
          <div className="salas-vazio">
            <Radio size={30} color="var(--text-gray)" />
            <strong>Não há jogos hoje nas ligas seguidas</strong>
            <span>As competições acompanhadas configuram-se em Admin › Salas.</span>
            <button onClick={puxarJogos}><RefreshCw size={14} /> Atualizar</button>
          </div>
        ) : (
          <>
            <div className="salas-filtros">
              <div className="salas-filtros__linha">
                <button
                  className={!apenasAoVivo ? 'salas-chip ativo' : 'salas-chip'}
                  onClick={() => setApenasAoVivo(false)}
                >
                  Todos
                </button>
                <button
                  className={apenasAoVivo ? 'salas-chip salas-chip--vivo ativo' : 'salas-chip salas-chip--vivo'}
                  onClick={() => setApenasAoVivo(true)}
                >
                  <span className="salas-dot" /> A decorrer
                </button>
              </div>

              {continentesDisponiveis.length > 1 && (
                <div className="salas-filtros__linha">
                  <button
                    className={continente === 'todos' ? 'salas-chip ativo' : 'salas-chip'}
                    onClick={() => setContinente('todos')}
                  >
                    Todos os continentes
                  </button>
                  {continentesDisponiveis.map(c => (
                    <button
                      key={c}
                      className={continente === c ? 'salas-chip ativo' : 'salas-chip'}
                      onClick={() => setContinente(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {ligasDisponiveis.length > 1 && (
                <div className="salas-filtros__linha">
                  <button
                    className={ligaFiltro === 'todas' ? 'salas-chip salas-chip--liga ativo' : 'salas-chip salas-chip--liga'}
                    onClick={() => setLigaFiltro('todas')}
                  >
                    Todas as ligas
                  </button>
                  {ligasDisponiveis.map(([slug, nome]) => (
                    <button
                      key={slug}
                      className={ligaFiltro === slug ? 'salas-chip salas-chip--liga ativo' : 'salas-chip salas-chip--liga'}
                      onClick={() => setLigaFiltro(slug)}
                    >
                      {nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {aoVivo.length === 0 && proximos.length === 0 && acabados.length === 0 ? (
              <div className="salas-vazio">
                <Radio size={30} color="var(--text-gray)" />
                <strong>Sem jogos para este filtro</strong>
                <span>Experimenta outro continente ou liga.</span>
              </div>
            ) : (
              <>
                {aoVivo.length > 0 && (
                  <GrupoJogos
                    titulo="A decorrer"
                    aoVivo
                    jogos={aoVivo}
                    contagens={contagens}
                    onAbrir={setAberto}
                  />
                )}
                {proximos.length > 0 && (
                  <GrupoJogos titulo="Hoje, mais logo" jogos={proximos} contagens={contagens} onAbrir={setAberto} />
                )}
                {acabados.length > 0 && (
                  <GrupoJogos titulo="Já terminados" jogos={acabados} contagens={contagens} onAbrir={setAberto} />
                )}
              </>
            )}
          </>
        )}

        <p className="salas-fonte">
          Placar de fonte pública, atualizado a cada {INTERVALO_PLACAR / 1000} segundos.
          Serve para acompanhar a conversa, não para resolver apostas.
        </p>
      </div>
    </div>
  );
}

// ─── LISTA ────────────────────────────────────────────────────

function GrupoJogos({
  titulo, jogos, contagens, onAbrir, aoVivo = false,
}: {
  titulo: string;
  jogos: JogoAoVivo[];
  contagens: Record<string, number>;
  onAbrir: (j: JogoAoVivo) => void;
  aoVivo?: boolean;
}) {
  return (
    <section className="salas-grupo">
      <h2 className={aoVivo ? 'salas-grupo__t salas-grupo__t--vivo' : 'salas-grupo__t'}>
        {aoVivo && <span className="salas-dot" />}
        {titulo}
      </h2>
      <div className="salas-grelha">
        {jogos.map(j => (
          <button key={j.id} className="jogo-card" onClick={() => onAbrir(j)}>
            <div className="jogo-card__liga">
              <span>{j.liga}</span>
              <span className={estaAoVivo(j) ? 'jogo-card__relogio vivo' : 'jogo-card__relogio'}>
                {j.relogio}
              </span>
            </div>

            <div className="jogo-card__equipa">
              {j.logoCasa && <img src={j.logoCasa} alt="" loading="lazy" />}
              <span>{j.casa}</span>
              <strong>{j.golosCasa ?? '–'}</strong>
            </div>
            <div className="jogo-card__equipa">
              {j.logoFora && <img src={j.logoFora} alt="" loading="lazy" />}
              <span>{j.fora}</span>
              <strong>{j.golosFora ?? '–'}</strong>
            </div>

            <div className="jogo-card__rodape">
              <MessageSquare size={13} />
              {contagens[j.id]
                ? `${contagens[j.id]} ${contagens[j.id] === 1 ? 'comentário' : 'comentários'}`
                : 'Abrir sala'}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── SALA ─────────────────────────────────────────────────────

function SalaJogo({
  jogo, isVip, isAdmin, userId, username, onVoltar,
}: {
  jogo: JogoAoVivo;
  isVip: boolean;
  isAdmin: boolean;
  userId: string;
  username: string;
  onVoltar: () => void;
}) {
  const navigate = useNavigate();
  const [canal, setCanal] = useState<CanalSala>('geral');
  const [mensagens, setMensagens] = useState<MensagemSala[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<DetalhesJogo>({ estatisticas: [], eventos: [] });
  const fundoRef = useRef<HTMLDivElement | null>(null);

  const podeVer = canal === 'geral' || isVip;

  useEffect(() => {
    let vivo = true;
    const puxarDetalhes = () => {
      carregarDetalhesJogo(jogo.ligaSlug, jogo.id).then(d => { if (vivo) setDetalhes(d); });
    };
    puxarDetalhes();
    // Estatísticas e eventos vêm de um endpoint à parte do placar; a ESPN
    // nem sempre os publica antes do jogo começar, por isso o painel só
    // aparece quando há algo para mostrar (ver render mais abaixo).
    const t = window.setInterval(puxarDetalhes, INTERVALO_PLACAR);
    return () => { vivo = false; window.clearInterval(t); };
  }, [jogo.id, jogo.ligaSlug]);

  useEffect(() => {
    if (!podeVer) { setMensagens([]); setCarregado(true); return; }

    let vivo = true;
    setCarregado(false);
    carregarMensagens(jogo.id, canal).then(ms => {
      if (!vivo) return;
      setMensagens(ms);
      setCarregado(true);
    });

    const limpar = subscreverSala(jogo.id, canal, nova => {
      // Uma mensagem própria já entrou em otimista; não duplicar.
      setMensagens(prev => (prev.some(m => m.id === nova.id) ? prev : [...prev, nova]));
    });

    return () => { vivo = false; limpar(); };
  }, [jogo.id, canal, podeVer]);

  useEffect(() => {
    fundoRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens.length]);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    try {
      setEnviando(true);
      setErro(null);
      await enviarMensagem({
        eventoId: jogo.id, canal, userId, username,
        texto: conteudo, jogoLabel: labelJogo(jogo),
      });
      setTexto('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (id: string) => {
    try {
      await apagarMensagem(id);
      setMensagens(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível apagar.');
    }
  };

  return (
    <div className="sala-jogo">
      <button className="sala-jogo__voltar" onClick={onVoltar}>
        <ArrowLeft size={15} /> Todos os jogos
      </button>

      {/* ── Placar ── */}
      <div className={estaAoVivo(jogo) ? 'placar placar--vivo' : 'placar'}>
        <div className="placar__liga">
          <span>{jogo.liga}</span>
          <span className={estaAoVivo(jogo) ? 'placar__relogio vivo' : 'placar__relogio'}>
            {estaAoVivo(jogo) && <span className="salas-dot" />}
            {jogo.relogio}
          </span>
        </div>

        <div className="placar__corpo">
          <div className="placar__equipa">
            {jogo.logoCasa && <img src={jogo.logoCasa} alt="" />}
            <strong>{jogo.casa}</strong>
          </div>
          <div className="placar__resultado">
            <span>{jogo.golosCasa ?? '–'}</span>
            <em>:</em>
            <span>{jogo.golosFora ?? '–'}</span>
          </div>
          <div className="placar__equipa">
            {jogo.logoFora && <img src={jogo.logoFora} alt="" />}
            <strong>{jogo.fora}</strong>
          </div>
        </div>
      </div>

      {/* ── Estatísticas + eventos ── */}
      {(detalhes.eventos.length > 0 || detalhes.estatisticas.length > 0) && (
        <div className="jogo-detalhes">
          {detalhes.eventos.length > 0 && (
            <div className="jogo-detalhes__bloco">
              <h3>Eventos</h3>
              <ul className="jogo-eventos">
                {detalhes.eventos.map((e, i) => (
                  <li key={i} className={`jogo-evento jogo-evento--${e.equipa ?? 'neutro'}`}>
                    <span className="jogo-evento__minuto">{e.minuto}</span>
                    <span className="jogo-evento__icone">
                      {e.tipo === 'golo' && <Target size={13} />}
                      {e.tipo === 'cartao_amarelo' && <Square size={11} className="cartao-amarelo" fill="currentColor" />}
                      {e.tipo === 'cartao_vermelho' && <Square size={11} className="cartao-vermelho" fill="currentColor" />}
                      {e.tipo === 'substituicao' && <ArrowLeftRight size={13} />}
                    </span>
                    <span className="jogo-evento__desc">{e.descricao}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detalhes.estatisticas.length > 0 && (
            <div className="jogo-detalhes__bloco">
              <h3>Estatísticas</h3>
              {detalhes.estatisticas.map(s => (
                <div key={s.nome} className="jogo-stat">
                  <span className="jogo-stat__valor">{s.casa}</span>
                  <span className="jogo-stat__nome">{s.nome}</span>
                  <span className="jogo-stat__valor">{s.fora}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Canais ── */}
      <nav className="sala-jogo__tabs">
        <button
          className={canal === 'geral' ? 'sala-jogo__tab ativo' : 'sala-jogo__tab'}
          onClick={() => setCanal('geral')}
        >
          <Users size={14} /> Geral
        </button>
        <button
          className={canal === 'vip' ? 'sala-jogo__tab ativo' : 'sala-jogo__tab'}
          onClick={() => setCanal('vip')}
        >
          {isVip ? <Crown size={14} /> : <Lock size={14} />} VIP
        </button>
      </nav>

      {/* ── Chat ── */}
      {!podeVer ? (
        <div className="sala-jogo__bloqueado">
          <Lock size={26} color="var(--gold-primary)" />
          <strong>Sala VIP</strong>
          <span>
            O canal VIP deste jogo é para subscritores. O canal geral fica
            aberto e continua a dar-te o placar e a conversa da comunidade.
          </span>
          <button onClick={() => navigate('/plans')}>Ver planos</button>
        </div>
      ) : (
        <>
          <div className="sala-jogo__mensagens">
            {!carregado ? (
              <div className="salas-loading">
                <Loader2 size={22} className="salas-spin" color="var(--gold-primary)" />
              </div>
            ) : mensagens.length === 0 ? (
              <p className="sala-jogo__vazio">
                Ainda não há comentários neste jogo. Começa tu.
              </p>
            ) : (
              mensagens.map(m => (
                <div
                  key={m.id}
                  className={m.user_id === userId ? 'msg msg--eu' : 'msg'}
                >
                  <div className="msg__topo">
                    <strong>{m.username}</strong>
                    <span>
                      {new Date(m.created_at).toLocaleTimeString('pt-PT', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {(m.user_id === userId || isAdmin) && (
                      <button className="msg__apagar" onClick={() => apagar(m.id)} aria-label="Apagar">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <p>{m.texto}</p>
                </div>
              ))
            )}
            <div ref={fundoRef} />
          </div>

          {erro && <p className="sala-jogo__erro">{erro}</p>}

          <div className="sala-jogo__barra">
            <input
              value={texto}
              maxLength={500}
              placeholder={canal === 'vip' ? 'Comentar no canal VIP…' : 'Comentar este jogo…'}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
            />
            <button onClick={enviar} disabled={enviando || !texto.trim()}>
              {enviando ? <Loader2 size={15} className="salas-spin" /> : <Send size={15} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
