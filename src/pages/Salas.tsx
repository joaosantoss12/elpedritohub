import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio, MessageSquare, Loader2, ArrowLeft, Send,
  Trash2, RefreshCw, Target, Square, ArrowLeftRight,
  Globe, Trophy, Clock, Calendar,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarDetalhesJogo, estaAoVivo, labelJogo, continenteDaLiga, diaLocal, bandeiraDaLiga,
  ORDEM_CONTINENTES, type JogoAoVivo, type DetalhesJogo,
} from '../lib/placar';
import { carregarPlacar } from '../lib/placarCache';
import {
  carregarSalasConfig, carregarMensagens, contarPorEvento, enviarMensagem,
  apagarMensagem, subscreverSala,
  type CanalSala, type MensagemSala,
} from '../lib/salasJogo';
import { PainelPrevisoes } from '../components/PainelPrevisoes';
import { DropWidget } from '../components/DropWidget';
import { carregarPerguntasDoEvento, type Pergunta } from '../lib/previsoes';
import { registarAtividadeNaSala } from '../lib/drops';
import '../styles/Gamificacao.css';
import '../styles/Salas.css';

/** De quanto em quanto tempo se volta a pedir o placar à ESPN. */
const INTERVALO_PLACAR = 45_000;

/**
 * O interruptor de estado. 'todos' não é um terceiro estado do jogo — é a
 * ausência de filtro, e é o que faz sentido por omissão: quem chega quer ver
 * o dia todo antes de decidir o que procurar.
 */
type EstadoFiltro = 'todos' | 'ao_vivo' | 'pre_live' | 'terminado';

/**
 * Hoje ou amanhã. O placar em cache traz uma janela de três dias (ontem, hoje,
 * amanhã) escrita pelo cron; aqui só se decide que fatia mostrar.
 */
type DiaFiltro = 'hoje' | 'amanha';

/** A data local (Europe/Lisbon) de hoje e de amanhã, como 'AAAA-MM-DD'. */
function chavesDosDias(): { hoje: string; amanha: string } {
  const agora = Date.now();
  return {
    hoje: diaLocal(new Date(agora).toISOString()),
    amanha: diaLocal(new Date(agora + 24 * 60 * 60 * 1000).toISOString()),
  };
}

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
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('todos');
  const [dia, setDia] = useState<DiaFiltro>('hoje');

  const isAdmin = membro?.badges?.includes('Administrador') ?? false;

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const puxarJogos = useCallback(async () => {
    const cfg = await carregarSalasConfig();
    if (!cfg.ativo) { setJogos([]); setCarregado(true); return; }
    // A varredura já foi feita pelo cron; aqui só se lê e, se o admin tiver
    // restringido as ligas, se corta o que sobra.
    const { jogos: todos } = await carregarPlacar();
    const permitidas = new Set(cfg.ligas);
    const lista = cfg.ligas.length ? todos.filter(j => permitidas.has(j.ligaSlug)) : todos;
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
  const escolherContinente = (c: string) => { setContinente(c); setLigaFiltro('todas'); };
  // Mudar para "Amanhã" não deve arrastar um filtro de estado que ali nem aparece.
  const escolherDia = (d: DiaFiltro) => {
    setDia(d);
    if (d === 'amanha') setEstadoFiltro('todos');
  };
  const limparFiltros = () => {
    setContinente('todos'); setLigaFiltro('todas'); setEstadoFiltro('todos');
  };

  // Que fatia da janela em cache mostrar. "Hoje" traz o que está a decorrer,
  // o que ainda não começou e — desde o pedido do utilizador — o que já
  // acabou hoje. "Amanhã" traz só os jogos agendados para o dia seguinte.
  // Um adiado nem hora tem para mostrar, por isso fica sempre de fora.
  const jogosDoDia = useMemo(() => {
    const { hoje, amanha } = chavesDosDias();
    if (dia === 'amanha') {
      return jogos.filter(j => !estaAoVivo(j) && diaLocal(j.inicio) === amanha);
    }
    return jogos.filter(j =>
      estaAoVivo(j)
      || ((j.estado === 'agendado' || j.estado === 'terminado') && diaLocal(j.inicio) === hoje),
    );
  }, [jogos, dia]);

  const continentesDisponiveis = useMemo(
    () => ORDEM_CONTINENTES.filter(c => jogosDoDia.some(j => continenteDaLiga(j.ligaSlug) === c)),
    [jogosDoDia],
  );

  const jogosDoContinente = useMemo(
    () => (continente === 'todos' ? jogosDoDia : jogosDoDia.filter(j => continenteDaLiga(j.ligaSlug) === continente)),
    [jogosDoDia, continente],
  );

  const ligasDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    jogosDoContinente.forEach(j => mapa.set(j.ligaSlug, j.liga));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [jogosDoContinente]);

  const jogosDaLiga = useMemo(
    () => (ligaFiltro === 'todas' ? jogosDoContinente : jogosDoContinente.filter(j => j.ligaSlug === ligaFiltro)),
    [jogosDoContinente, ligaFiltro],
  );

  // Os dois grupos derivam da liga escolhida e não do interruptor: assim as
  // contagens nos botões continuam a dizer a verdade sobre o grupo que está
  // escondido, que é a única razão para as mostrar ali.
  const aoVivo = useMemo(() => jogosDaLiga.filter(estaAoVivo), [jogosDaLiga]);

  const porComecar = useMemo(
    () => jogosDaLiga
      .filter(j => !estaAoVivo(j) && j.estado === 'agendado')
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [jogosDaLiga],
  );

  const terminados = useMemo(
    () => jogosDaLiga
      .filter(j => j.estado === 'terminado')
      .sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [jogosDaLiga],
  );

  // O separador "Terminados" só faz sentido em "Hoje" — amanhã ainda não
  // acabou nada. Em "Amanhã" o interruptor de estado desaparece de todo.
  const mostraSwitch = dia === 'hoje';
  const mostraVivos = mostraSwitch && (estadoFiltro === 'todos' || estadoFiltro === 'ao_vivo');
  const mostraPreLive = !mostraSwitch || estadoFiltro === 'todos' || estadoFiltro === 'pre_live';
  const mostraTerminados = mostraSwitch && (estadoFiltro === 'todos' || estadoFiltro === 'terminado');
  const visiveis = (mostraVivos ? aoVivo.length : 0)
    + (mostraPreLive ? porComecar.length : 0)
    + (mostraTerminados ? terminados.length : 0);

  const temFiltro = continente !== 'todos' || ligaFiltro !== 'todas' || estadoFiltro !== 'todos';

  if (jogoAberto) {
    return (
      <div className="salas-page">
        <Navbar />
        <SalaJogo
          jogo={jogoAberto}
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
            A decorrer, por começar ou já terminados — e ainda os de amanhã.
            Cada jogo tem a sua sala, com o placar ao vivo e um chat de
            comunidade só sobre aquele jogo.
          </p>
        </header>

        {!carregado ? (
          <div className="salas-loading">
            <Loader2 size={26} className="salas-spin" color="var(--gold-primary)" />
            <span>A carregar os jogos de hoje…</span>
          </div>
        ) : jogosDoDia.length === 0 ? (
          <>
            <SeletorDia dia={dia} onEscolher={escolherDia} />
            <div className="salas-vazio">
              <Radio size={30} color="var(--text-gray)" />
              <strong>{dia === 'amanha' ? 'Sem jogos marcados para amanhã' : 'Sem jogos para hoje'}</strong>
              <span>
                {dia === 'amanha'
                  ? 'O calendário ainda pode encher — volta mais tarde.'
                  : 'Volta quando houver bola em campo — as salas abrem sozinhas.'}
              </span>
              <button onClick={puxarJogos}><RefreshCw size={14} /> Atualizar</button>
            </div>
          </>
        ) : (
          <>
            <SeletorDia dia={dia} onEscolher={escolherDia} />
            {mostraSwitch && (
              <div className="salas-switch" role="group" aria-label="Estado dos jogos">
                <button
                  className={estadoFiltro === 'todos' ? 'ativo' : ''}
                  onClick={() => setEstadoFiltro('todos')}
                >
                  Todos <span>{aoVivo.length + porComecar.length + terminados.length}</span>
                </button>
                <button
                  className={estadoFiltro === 'ao_vivo' ? 'ativo' : ''}
                  onClick={() => setEstadoFiltro('ao_vivo')}
                >
                  <span className="salas-dot" /> Ao vivo <span>{aoVivo.length}</span>
                </button>
                <button
                  className={estadoFiltro === 'pre_live' ? 'ativo' : ''}
                  onClick={() => setEstadoFiltro('pre_live')}
                >
                  <Clock size={13} /> Por começar <span>{porComecar.length}</span>
                </button>
                <button
                  className={estadoFiltro === 'terminado' ? 'ativo' : ''}
                  onClick={() => setEstadoFiltro('terminado')}
                >
                  <Square size={11} /> Terminados <span>{terminados.length}</span>
                </button>
              </div>
            )}

            {(continentesDisponiveis.length > 1 || ligasDisponiveis.length > 1 || temFiltro) && (
              <div className="salas-filtros">
                {continentesDisponiveis.length > 1 && (
                  <label className="salas-filtros__campo">
                    <Globe size={14} />
                    <span className="salas-filtros__campo-lbl">Continente</span>
                    <select value={continente} onChange={e => escolherContinente(e.target.value)}>
                      <option value="todos">Todos</option>
                      {continentesDisponiveis.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}

                {ligasDisponiveis.length > 1 && (
                  <label className="salas-filtros__campo">
                    <Trophy size={14} />
                    <span className="salas-filtros__campo-lbl">Liga</span>
                    <select value={ligaFiltro} onChange={e => setLigaFiltro(e.target.value)}>
                      <option value="todas">Todas</option>
                      {ligasDisponiveis.map(([slug, nome]) => (
                        <option key={slug} value={slug}>{nome}</option>
                      ))}
                    </select>
                  </label>
                )}

                {temFiltro && (
                  <button className="salas-filtros__limpar" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                )}
              </div>
            )}

            {visiveis === 0 ? (
              <div className="salas-vazio">
                <Radio size={30} color="var(--text-gray)" />
                <strong>Sem jogos para este filtro</strong>
                <span>Experimenta outro estado, continente ou liga.</span>
              </div>
            ) : (
              <>
                {mostraVivos && aoVivo.length > 0 && (
                  <GrupoJogos
                    titulo="A decorrer"
                    aoVivo
                    jogos={aoVivo}
                    contagens={contagens}
                    onAbrir={setAberto}
                  />
                )}
                {mostraPreLive && porComecar.length > 0 && (
                  <GrupoJogos
                    titulo={dia === 'amanha' ? 'Amanhã' : 'Por começar'}
                    jogos={porComecar}
                    contagens={contagens}
                    onAbrir={setAberto}
                  />
                )}
                {mostraTerminados && terminados.length > 0 && (
                  <GrupoJogos
                    titulo="Terminados"
                    jogos={terminados}
                    contagens={contagens}
                    onAbrir={setAberto}
                  />
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

// ─── DIA ──────────────────────────────────────────────────────

function SeletorDia({ dia, onEscolher }: {
  dia: DiaFiltro;
  onEscolher: (d: DiaFiltro) => void;
}) {
  return (
    <div className="salas-dias" role="group" aria-label="Dia">
      <button
        className={dia === 'hoje' ? 'ativo' : ''}
        onClick={() => onEscolher('hoje')}
      >
        <Radio size={13} /> Hoje
      </button>
      <button
        className={dia === 'amanha' ? 'ativo' : ''}
        onClick={() => onEscolher('amanha')}
      >
        <Calendar size={13} /> Amanhã
      </button>
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
              {bandeiraDaLiga(j.ligaSlug) && (
                <img className="liga-bandeira" src={bandeiraDaLiga(j.ligaSlug)!} alt="" loading="lazy" />
              )}
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
  jogo, isAdmin, userId, username, onVoltar,
}: {
  jogo: JogoAoVivo;
  isAdmin: boolean;
  userId: string;
  username: string;
  onVoltar: () => void;
}) {
  const canal: CanalSala = 'geral';
  const [mensagens, setMensagens] = useState<MensagemSala[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<DetalhesJogo>({ estatisticas: [], eventos: [] });
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const fundoRef = useRef<HTMLDivElement | null>(null);

  // Perguntas de previsão presas a este jogo. São as mesmas da Arena, com o
  // mesmo painel — o que muda é de onde vêm.
  useEffect(() => {
    let vivo = true;
    void carregarPerguntasDoEvento(jogo.id).then(qs => { if (vivo) setPerguntas(qs); });
    // Entrar na sala já conta para a missão "participa em N salas", mesmo
    // sem escrever nada.
    void registarAtividadeNaSala(jogo.id, false);
    return () => { vivo = false; };
  }, [jogo.id]);

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
  }, [jogo.id]);

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
      // Depois do envio, e de propósito: se isto falhar, o pior que acontece
      // é a missão não avançar — a mensagem já está entregue.
      void registarAtividadeNaSala(jogo.id, true);
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
          {bandeiraDaLiga(jogo.ligaSlug) && (
            <img className="liga-bandeira" src={bandeiraDaLiga(jogo.ligaSlug)!} alt="" />
          )}
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

      {/* ── Previsões do jogo ── */}
      {perguntas.length > 0 && (
        <div className="gm-card" style={{ marginBottom: 18 }}>
          <h2>Prevê o jogo</h2>
          <p className="gm-sub">
            Grátis. Acertas, ganhas EPCoins — não há dinheiro envolvido.
          </p>
          <PainelPrevisoes perguntas={perguntas} />
        </div>
      )}

      {/* Drops filtrados por este jogo, além dos gerais do Hub. */}
      <DropWidget eventoId={jogo.id} />

      {/* ── Chat ── */}
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
              placeholder="Comentar este jogo…"
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
            />
            <button onClick={enviar} disabled={enviando || !texto.trim()}>
              {enviando ? <Loader2 size={15} className="salas-spin" /> : <Send size={15} />}
            </button>
          </div>
    </div>
  );
}
