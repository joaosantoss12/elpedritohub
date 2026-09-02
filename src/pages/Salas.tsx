import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio, MessageSquare, Loader2, ArrowLeft, Send,
  Trash2, RefreshCw, Target, Square, ArrowLeftRight,
  Globe, Trophy, Clock, Calendar, Search, X,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarDetalhesJogo, estaAoVivo, labelJogo, continenteDaLiga, diaLocal,
  bandeiraDaLiga, ORDEM_CONTINENTES, type JogoAoVivo, type DetalhesJogo, type MomentoJogo,
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

/** Dentro de uma sala aberta o ritmo é apertado: marcador, estatísticas e
 *  mini-campo têm de parecer ao vivo, e é só um jogo a ser lido. */
const INTERVALO_LIVE = 3_000;

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
  const [busca, setBusca] = useState('');
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
    setBusca('');
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

  // Pesquisa livre por equipa ou liga, aplicada por cima dos selectores.
  const jogosVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return jogosDaLiga;
    return jogosDaLiga.filter(j => `${j.casa} ${j.fora} ${j.liga}`.toLowerCase().includes(q));
  }, [jogosDaLiga, busca]);

  // Os dois grupos derivam da liga escolhida e não do interruptor: assim as
  // contagens nos botões continuam a dizer a verdade sobre o grupo que está
  // escondido, que é a única razão para as mostrar ali.
  const aoVivo = useMemo(() => jogosVisiveis.filter(estaAoVivo), [jogosVisiveis]);

  const porComecar = useMemo(
    () => jogosVisiveis
      .filter(j => !estaAoVivo(j) && j.estado === 'agendado')
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [jogosVisiveis],
  );

  const terminados = useMemo(
    () => jogosVisiveis
      .filter(j => j.estado === 'terminado')
      .sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [jogosVisiveis],
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

  const temFiltro = continente !== 'todos' || ligaFiltro !== 'todas'
    || estadoFiltro !== 'todos' || busca.trim() !== '';

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

            <div className="bt-busca salas-busca">
              <Search size={15} />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Procurar equipa ou liga"
              />
              {busca && (
                <button
                  className="salas-busca__x"
                  onClick={() => setBusca('')}
                  aria-label="Limpar pesquisa"
                >
                  <X size={14} />
                </button>
              )}
            </div>

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
                <span>
                  {busca.trim()
                    ? 'Nada bate com essa pesquisa — tenta outro nome ou limpa os filtros.'
                    : 'Experimenta outro estado, continente ou liga.'}
                </span>
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

/** Agrupa os jogos por competição, mantendo a ordem por que já vêm (o
 *  `ordenarJogos` do placar já põe primeiro o que mais interessa). */
function agruparPorLiga(jogos: JogoAoVivo[]) {
  const ordem: string[] = [];
  const mapa = new Map<string, JogoAoVivo[]>();
  for (const j of jogos) {
    if (!mapa.has(j.ligaSlug)) { mapa.set(j.ligaSlug, []); ordem.push(j.ligaSlug); }
    mapa.get(j.ligaSlug)!.push(j);
  }
  return ordem.map(slug => ({ slug, nome: mapa.get(slug)![0].liga, jogos: mapa.get(slug)! }));
}

function JogoCard({ jogo: j, contagens, onAbrir }: {
  jogo: JogoAoVivo;
  contagens: Record<string, number>;
  onAbrir: (j: JogoAoVivo) => void;
}) {
  return (
    <button className="jogo-card" onClick={() => onAbrir(j)}>
      <div className="jogo-card__topo">
        <span className={estaAoVivo(j) ? 'jogo-card__relogio vivo' : 'jogo-card__relogio'}>
          {estaAoVivo(j) && <span className="salas-dot" />}
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
  );
}

function GrupoJogos({
  titulo, jogos, contagens, onAbrir, aoVivo = false,
}: {
  titulo: string;
  jogos: JogoAoVivo[];
  contagens: Record<string, number>;
  onAbrir: (j: JogoAoVivo) => void;
  aoVivo?: boolean;
}) {
  const ligas = agruparPorLiga(jogos);
  return (
    <section className="salas-grupo">
      <h2 className={aoVivo ? 'salas-grupo__t salas-grupo__t--vivo' : 'salas-grupo__t'}>
        {aoVivo && <span className="salas-dot" />}
        {titulo}
      </h2>
      {/* Colunas estilo mosaico: cada competição é um bloco que quebra onde
          calhar — uma competição curta deixa a seguinte subir logo por baixo. */}
      <div className="salas-ligas">
        {ligas.map(g => (
          <div key={g.slug} className="salas-liga">
            <div className="salas-liga__cab">
              {bandeiraDaLiga(g.slug) && (
                <img className="liga-bandeira" src={bandeiraDaLiga(g.slug)!} alt="" loading="lazy" />
              )}
              <span>{g.nome}</span>
            </div>
            <div className="salas-liga__jogos">
              {g.jogos.map(j => (
                <JogoCard key={j.id} jogo={j} contagens={contagens} onAbrir={onAbrir} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CAMPO AO VIVO ────────────────────────────────────────────

/**
 * Mini-campo estilo AiScore, sem bola. Sombreia o meio-campo da equipa com
 * posse (com escudo + nome) e mostra ao centro o último evento marcante —
 * golo, cartão, canto, fora de jogo, tempo de compensação…
 */
// Antes do jogo (ou enquanto a ESPN ainda não abre o boxscore) mostramos as
// estatísticas de sempre, todas a zero, em vez de um vazio.
const ESTATISTICAS_ZERO = [
  'Posse de bola', 'Remates totais', 'Remates à baliza', 'Defesas',
  'Cantos', 'Faltas', 'Fora de jogo', 'Cartões amarelos', 'Cartões vermelhos',
].map(nome => ({ nome, casa: '0', fora: '0' }));

const MOMENTO_VAZIO: MomentoJogo = {
  casa: 50, fora: 50, posse: null, fase: '', destaque: null, lance: '', minuto: '',
  bolaX: null, bolaY: null,
};

function CampoAoVivo(
  { jogo, momento, terminado = false, prejogo = false }:
  { jogo: JogoAoVivo; momento?: MomentoJogo | null; terminado?: boolean; prejogo?: boolean },
) {
  const { casa, fora, lance, minuto, posse, fase, bolaX, bolaY } = momento ?? MOMENTO_VAZIO;

  // Nem todos os jogos têm feed ao vivo da ESPN (ligas fora da cobertura, ou
  // dados que ainda não abriram). Mostramos o campo na mesma, só que "vazio".
  const semFeed = !terminado && !prejogo
    && (!momento || (!momento.lance && !momento.fase && !momento.posse));

  const equipaDe = (lado: 'casa' | 'fora' | null) =>
    lado === 'casa'
      ? { nome: jogo.casa, logo: jogo.logoCasa }
      : lado === 'fora'
        ? { nome: jogo.fora, logo: jogo.logoFora }
        : null;

  // O evento ao centro: tempo de compensação (lido do relógio) tem prioridade,
  // depois o destaque fresco do feed (com a equipa do lance por cima do texto),
  // senão a fase corrente — que também mostra o escudo + nome de quem tem a
  // posse, como se fosse um evento ("Melgar · Ataque").
  const time = terminado || prejogo ? null : equipaDe(posse);
  // `destaque` pode vir como string de uma versão antiga da cache — normaliza.
  const destaque = typeof momento?.destaque === 'object' ? momento.destaque : null;
  const compensacao = jogo.relogio?.match(/\+\s*\d+/)?.[0].replace(/\s/g, '');
  const evento = terminado
    ? { texto: 'Fim do jogo', nota: '', time: null }
    : prejogo
    ? { texto: 'Ainda não começou', nota: jogo.relogio, time: null }
    : compensacao
      ? { texto: 'Tempo de compensação', nota: compensacao, time: null }
      : destaque
        ? { texto: destaque.texto, nota: minuto, time: equipaDe(destaque.equipa) }
        : { texto: fase || 'Bola em jogo', nota: '', time };

  const legenda = [minuto, lance].filter(Boolean).join('  ·  ');

  return (
    <div className="campo-live">
      <div className="campo-live__topo">
        <span className="campo-live__eq">{jogo.casa}</span>
        <span className="campo-live__min">
          {!terminado && !prejogo && <span className="salas-dot" />} {jogo.relogio}
        </span>
        <span className="campo-live__eq campo-live__eq--dir">{jogo.fora}</span>
      </div>

      <div className="campo-live__relva">
        <span className="campo-live__meio" aria-hidden="true" />
        <span className="campo-live__circulo" aria-hidden="true" />
        <span className="campo-live__area campo-live__area--esq" aria-hidden="true" />
        <span className="campo-live__area campo-live__area--dir" aria-hidden="true" />

        {/* Sombreia o lado para onde a equipa com posse carrega (casa → direita). */}
        {time && (
          <span
            className={`campo-live__posse-lado campo-live__posse-lado--${posse}`}
            aria-hidden="true"
          />
        )}

        {/* Marca a posição da última jogada (a ESPN só dá coordenada por
            evento — salta pelo campo, não é bola em tempo real). */}
        {!terminado && !prejogo && bolaX != null && bolaY != null && (
          <span
            className="campo-live__bola"
            style={{ left: `${bolaX}%`, top: `${bolaY}%` }}
            aria-hidden="true"
          />
        )}

        <div className="campo-live__evento-wrap">
          {evento.time && (
            <span className="campo-live__evento-eq">
              {evento.time.logo && <img src={evento.time.logo} alt="" />}
              <span>{evento.time.nome}</span>
            </span>
          )}
          <div className="campo-live__evento">
            <strong>{evento.texto}</strong>
            {evento.nota && <em>{evento.nota}</em>}
          </div>
        </div>
      </div>

      {terminado ? (
        <div className="campo-live__final">
          <span className="campo-live__final-eq">
            {jogo.logoCasa && <img src={jogo.logoCasa} alt="" />}
            {jogo.casa}
          </span>
          <span className="campo-live__final-placar">
            {jogo.golosCasa ?? 0} <em>:</em> {jogo.golosFora ?? 0}
          </span>
          <span className="campo-live__final-eq campo-live__final-eq--dir">
            {jogo.fora}
            {jogo.logoFora && <img src={jogo.logoFora} alt="" />}
          </span>
        </div>
      ) : prejogo ? (
        <p className="campo-live__lance">Pontapé de saída às {jogo.relogio}</p>
      ) : (
        <>
          <div className="campo-live__momentum" role="img" aria-label={`Pressão: ${casa}% casa, ${fora}% fora`}>
            <span className="campo-live__pres campo-live__pres--casa" style={{ width: `${casa}%` }} />
            <span className="campo-live__pres campo-live__pres--fora" style={{ width: `${fora}%` }} />
          </div>

          <p className="campo-live__lance">
            {semFeed ? 'Sem cobertura ao vivo para este jogo — o campo fica sem lances.' : (legenda || 'Bola em jogo')}
          </p>
        </>
      )}
    </div>
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
  const [detalhes, setDetalhes] = useState<DetalhesJogo>({
    estatisticas: [], eventos: [], comentario: [], momento: null, vivo: null,
  });
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);

  // O jogo tal como se mostra: o que veio da lista, com o placar, o relógio e
  // o estado do próprio summary por cima — a mesma fonte do mini-campo, para
  // não haver dois minutos a discordar.
  const jogoExibido = useMemo<JogoAoVivo>(() => {
    const v = detalhes.vivo;
    return v
      ? {
          ...jogo,
          golosCasa: v.golosCasa ?? jogo.golosCasa,
          golosFora: v.golosFora ?? jogo.golosFora,
          estado: v.estado,
          relogio: v.relogio || jogo.relogio,
          momento: detalhes.momento ?? jogo.momento,
        }
      : { ...jogo, momento: detalhes.momento ?? jogo.momento };
  }, [jogo, detalhes.vivo, detalhes.momento]);
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
    // Um único pedido (o summary da ESPN) alimenta tudo o que tem de parecer
    // ao vivo: marcador, relógio, estatísticas, eventos e o mini-campo.
    const puxar = () => {
      carregarDetalhesJogo(jogo.ligaSlug, jogo.id).then(d => { if (vivo) setDetalhes(d); });
    };
    puxar();
    const t = window.setInterval(puxar, INTERVALO_LIVE);
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

  const jx = jogoExibido;
  const estatisticas = detalhes.estatisticas.length > 0 ? detalhes.estatisticas : ESTATISTICAS_ZERO;
  const semDadosReais = detalhes.estatisticas.length === 0;

  return (
    <div className="sala-jogo">
      <button className="sala-jogo__voltar" onClick={onVoltar}>
        <ArrowLeft size={15} /> Todos os jogos
      </button>

      <div className="sala-jogo__grid">
        {/* ── Coluna esquerda: estatísticas + eventos ── */}
        <div className="sala-jogo__lado sala-jogo__lado--stats">
            <div className="jogo-detalhes">
              <div className="jogo-detalhes__bloco">
                  <h3>Estatísticas</h3>
                  {semDadosReais && (
                    <p className="jogo-detalhes__nota">Atualizam quando o jogo começar.</p>
                  )}
                  {estatisticas.map(s => {
                    const nc = parseFloat(String(s.casa).replace(',', '.'));
                    const nf = parseFloat(String(s.fora).replace(',', '.'));
                    const tot = (nc || 0) + (nf || 0);
                    const pc = tot > 0 ? Math.round((nc / tot) * 100) : 50;
                    return (
                      <div key={s.nome} className="jogo-stat">
                        <span className="jogo-stat__valor">{s.casa}</span>
                        <span className="jogo-stat__nome">{s.nome}</span>
                        <span className="jogo-stat__valor">{s.fora}</span>
                        <span
                          className="jogo-stat__barra"
                          role="img"
                          aria-label={`${s.nome}: ${s.casa} contra ${s.fora}`}
                        >
                          <span className="jogo-stat__barra-casa" style={{ width: `${pc}%` }} />
                          <span className="jogo-stat__barra-fora" style={{ width: `${100 - pc}%` }} />
                        </span>
                      </div>
                    );
                  })}
              </div>

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

              {detalhes.comentario.length > 0 && (
                <div className="jogo-detalhes__bloco">
                  <h3>Histórico do jogo</h3>
                  <ul className="jogo-relato">
                    {detalhes.comentario.map((c, i) => (
                      <li
                        key={i}
                        className={`jogo-relato__linha${c.chave ? ' jogo-relato__linha--chave' : ''} jogo-relato__linha--${c.equipa ?? 'neutro'}`}
                      >
                        <span className="jogo-relato__minuto">{c.minuto || '·'}</span>
                        <span className="jogo-relato__texto">{c.texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
        </div>

        {/* ── Coluna do meio: marcador + mini-campo + previsões ── */}
        <div className="sala-jogo__lado sala-jogo__lado--jogo">
          <div className={estaAoVivo(jx) ? 'placar placar--vivo' : 'placar'}>
            <div className="placar__liga">
              {bandeiraDaLiga(jogo.ligaSlug) && (
                <img className="liga-bandeira" src={bandeiraDaLiga(jogo.ligaSlug)!} alt="" />
              )}
              <span>{jx.liga}</span>
              <span className={estaAoVivo(jx) ? 'placar__relogio vivo' : 'placar__relogio'}>
                {estaAoVivo(jx) && <span className="salas-dot" />}
                {jx.relogio}
              </span>
            </div>

            <div className="placar__corpo">
              <div className="placar__equipa">
                {jx.logoCasa && <img src={jx.logoCasa} alt="" />}
                <strong>{jx.casa}</strong>
              </div>
              <div className="placar__resultado">
                <span>{jx.golosCasa ?? '–'}</span>
                <em>:</em>
                <span>{jx.golosFora ?? '–'}</span>
              </div>
              <div className="placar__equipa">
                {jx.logoFora && <img src={jx.logoFora} alt="" />}
                <strong>{jx.fora}</strong>
              </div>
            </div>

            {detalhes.vivo?.htCasa != null && detalhes.vivo?.htFora != null && (
              <p className="placar__ht">
                Intervalo <span>{detalhes.vivo.htCasa} : {detalhes.vivo.htFora}</span>
              </p>
            )}
          </div>

          {estaAoVivo(jx) && (
            <CampoAoVivo jogo={jx} momento={jx.momento} />
          )}
          {jx.estado === 'terminado' && (
            <CampoAoVivo jogo={jx} momento={jx.momento} terminado />
          )}
          {jx.estado === 'agendado' && (
            <CampoAoVivo jogo={jx} momento={null} prejogo />
          )}

          {perguntas.length > 0 && (
            <div className="gm-card" style={{ margin: 0 }}>
              <h2>Prevê o jogo</h2>
              <p className="gm-sub">
                Grátis. Acertas, ganhas EPCoins — não há dinheiro envolvido.
              </p>
              <PainelPrevisoes perguntas={perguntas} />
            </div>
          )}

          {/* Drops filtrados por este jogo, além dos gerais do Hub. */}
          <DropWidget eventoId={jogo.id} />
        </div>

        {/* ── Coluna direita: chat ── */}
        <div className="sala-jogo__lado sala-jogo__lado--social">
          <div className="sala-jogo__chat">
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
        </div>
      </div>
    </div>
  );
}
