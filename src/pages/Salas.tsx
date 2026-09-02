import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio, MessageSquare, Loader2, ArrowLeft,
  RefreshCw, Square,
  Globe, Trophy, Clock, Calendar, Search, X,
} from 'lucide-react';
import { ChatFlutuante } from '../components/ChatFlutuante';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarDetalhesJogo, estaAoVivo, labelJogo, continenteDaLiga, diaLocal,
  bandeiraDaLiga, ORDEM_CONTINENTES, type JogoAoVivo, type DetalhesJogo, type MomentoJogo,
  type Escalacoes, type LadoEscalacao, type ResultadoForma, type HeadToHead,
  type EventoJogo, type Classificacao, type EstatisticaJogo,
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

/** Emoji para os lances marcantes — pedido do cliente: emojis, não ícones. */
const EMOJI_EVENTO: Record<string, string> = {
  golo: '⚽', cartao_amarelo: '🟨', cartao_vermelho: '🟥', substituicao: '🔁',
};

/** Cabeçalho com escudo + nome das duas equipas, casa à esquerda, fora à
 *  direita — serve de topo às estatísticas e ao histórico dividido por lados. */
function CabecalhoEquipas({ jogo: j }: { jogo: JogoAoVivo }) {
  return (
    <div className="equipas-cab">
      <span className="equipas-cab__eq">
        {j.logoCasa && <img src={j.logoCasa} alt="" />}
        <span>{j.casa}</span>
      </span>
      <span className="equipas-cab__eq equipas-cab__eq--dir">
        <span>{j.fora}</span>
        {j.logoFora && <img src={j.logoFora} alt="" />}
      </span>
    </div>
  );
}

// ─── FICHA DO JOGO (estilo ESPN) ─────────────────────────────

/** Minuto numérico de um rótulo tipo "45+2'" ou "67'". */
function minutoNum(s: string): number {
  const m = s.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
}

/** Barra da linha do tempo com um marcador por lance-chave, no minuto certo,
 *  a casa por cima e o lado de fora por baixo. */
function CronologiaJogo({ eventos }: { eventos: DetalhesJogo['eventos'] }) {
  const marcas = eventos
    .map(e => ({ ...e, min: minutoNum(e.minuto) }))
    .filter(e => e.min > 0 && e.tipo !== 'outro');
  if (marcas.length === 0) return null;
  const fim = Math.max(90, ...marcas.map(m => m.min));

  return (
    <div className="cronologia">
      <div className="cronologia__faixa">
        <span className="cronologia__meio" style={{ left: `${(45 / fim) * 100}%` }} />
        {marcas.map((m, i) => (
          <span
            key={i}
            className={`cronologia__pin cronologia__pin--${m.equipa ?? 'neutro'} cronologia__pin--${m.tipo}`}
            style={{ left: `${Math.min(99, (m.min / fim) * 100)}%` }}
            title={`${m.minuto} · ${m.descricao}`}
          >
            {EMOJI_EVENTO[m.tipo] ?? '•'}
          </span>
        ))}
      </div>
      <div className="cronologia__reguas">
        <span>0'</span><span>45'</span><span>{fim}'</span>
      </div>
    </div>
  );
}

/**
 * Tira de golos e expulsões logo por baixo do placar, como na ESPN: os da
 * casa alinhados à esquerda, os de fora à direita, com um traço a separar.
 */
function ResumoGolos({ eventos }: { eventos: EventoJogo[] }) {
  const relevantes = eventos.filter(
    e => (e.tipo === 'golo' || e.tipo === 'cartao_vermelho') && e.equipa,
  );
  if (relevantes.length === 0) return null;

  const linha = (e: EventoJogo, i: number) => {
    // A descrição vem como "Golo · Fulano"; fica só o nome.
    const nome = e.descricao.includes('·')
      ? e.descricao.split('·').pop()!.trim()
      : e.descricao;
    return (
      <span key={i} className="resumo-golos__item">
        <span className="resumo-golos__ic">{e.tipo === 'golo' ? '⚽' : '🟥'}</span>
        {nome} <em>{e.minuto}</em>
      </span>
    );
  };

  return (
    <div className="resumo-golos">
      <div className="resumo-golos__lado">
        {relevantes.filter(e => e.equipa === 'casa').map(linha)}
      </div>
      <span className="resumo-golos__sep" aria-hidden="true" />
      <div className="resumo-golos__lado resumo-golos__lado--fora">
        {relevantes.filter(e => e.equipa === 'fora').map(linha)}
      </div>
    </div>
  );
}

/** A cor da equipa (hex sem "#") é clara ao ponto de precisar de número
 *  escuro na camisola? */
function corClara(hex: string | null): boolean {
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

/** Camisola no estilo da ESPN: o mesmo traçado que eles usam no gamecast —
 *  base clara, corpo com a cor da equipa, vincos com sombra e gola escura —
 *  com o número ao centro. */
function Camisola({ cor, numero, escuro }: { cor: string; numero: string; escuro: boolean }) {
  return (
    <svg className="camisola" viewBox="0 0 1440 1440" aria-hidden="true" shapeRendering="geometricPrecision">
      <path
        d="M719.92,1364c-115.3,0-209-7.9-278.6-23.6-23.8-5.4-58.4-14.4-83.5-30.4-10.3-6.6-16.5-18.29-16.5-31.09v-3c0-71.5,4.4-123.99,9.1-179.69v-1.2c4.7-55.29,9.5-112.59,11-195.48.5-26,.3-52.1-.5-77.89-1.6.4-3,.7-4.2.9-11.9,1.9-23.2,2.7-34.3,2.7-58.1,0-116.3-24.1-168.5-69.79-18.8-16.4-36.4-35.2-52.4-55.79-.1-.2-10.4-13.7-18.6-26.1-8.5-12.8-9.2-29.7-1.9-44l15.6-30.6c9.6-19.1,22.6-45.3,36.3-73.59,34.6-71.59,57.8-124.29,65.2-148.49,10.2-33.1,23-68.09,47.8-100.09,25.4-32.8,60.4-57.99,107.2-77.29l8-3.3c48.1-19.8,102.4-42.2,163.7-58.5,3.3-5.5,6.5-10.2,9.7-14.3,7.9-10.2,16.2-17.6,25.4-22.4,32.5-17,83.4-25,160.2-25s127.7,7.9,160.2,24.9c9.2,4.8,17.5,12.2,25.4,22.4,3.2,4.1,6.4,8.9,9.7,14.3,61.2,16.2,115.51,38.6,163.61,58.5l8,3.3c46.7,19.2,81.8,44.5,107.2,77.29,24.8,32,37.6,67,47.8,100.09,7.5,24.2,30.6,76.99,65.2,148.49,13.7,28.2,26.7,54.5,36.3,73.69l15.5,30.5c7.3,14.3,6.5,31.1-1.9,44-8.1,12.2-18.1,25.4-18.5,26-16.2,20.8-33.8,39.6-52.5,55.9-52.2,45.7-110.5,69.79-168.5,69.79-11.1,0-22.4-.9-33.5-2.6-.7-.1-2.5-.5-4.9-1-.8,25.8-1,51.9-.5,77.89,1.4,82.59,6.2,139.79,10.8,195.08v1.7c4.8,55.5,9.2,107.99,9.2,179.49v3c0,12.9-6.2,24.49-16.5,31.09-25,16-59.6,25-83.51,30.4-69.6,15.6-163.4,23.6-278.6,23.6l-.2.2Z"
        fill="#ece7df"
      />
      <path
        d="M1200,390c-20-65-45-115-130-150s-190.86-80-310-80h-80c-119.14,0-225,45-310,80s-110,85-130,150-120,260-120,260c0,0,91.73,151.42,230,130,0,0,20-80,40-120,0,0,17.57,90.67,15,240-2.91,169.51-20,236.73-20,375,0,0,65,45,335,45s335-45,335-45c0-138.27-17.08-205.49-20-375-2.57-149.33,15-240,15-240,20,40,40,120,40,120,138.27,21.42,230-130,230-130,0,0-100-195-120-260Z"
        fill={cor}
      />
      <g fill="#000000" opacity="0.3">
        <path d="M720,1265c-170,0-280-40-280-40,60,50,160,70,280,70s220-20,280-70c0,0-110,40-280,40Z" />
        <path d="M720,200c-68.75,0-144.14,10.21-200,40,0,0,105.17-15,200-15s200,15,200,15c-55.86-29.79-131.25-40-200-40Z" />
        <path d="M1170,700c-5.79-36.48,6.16-101.7,20-150-27.77,22.52-54.25,76.29-70,110-16.91-65.57-14.47-183.63-20-240-22.11,72.06-40.28,150.85-50,240,20,40,40,120,40,120,71.26,11.04,130.16-23.83,170.51-60.22-67.27-1.1-88.41-6.54-90.51-19.78Z" />
        <path d="M860,1200c59.65-10.27,142.73-38.17,188.12-76.4-5.1-62.69-11.44-126.29-13.12-223.6-.77-44.6.26-83.96,2.08-117.24-14.92,48.88-36.92,113.16-57.08,142.24-34.02,49.05-69.02,93.62-150,135,132.17-5.14,169.28-92.43,180-50,10.45,41.37-36.52,109.44-150,190Z" />
        <path d="M391.88,1123.6c45.39,38.23,128.47,66.13,188.12,76.4-113.48-80.56-160.45-148.63-150-190,10.72-42.43,47.83,44.86,180,50-80.98-41.38-115.98-85.95-150-135-20.16-29.08-42.16-93.36-57.08-142.24,1.82,33.28,2.85,72.64,2.08,117.24-1.67,97.31-8.02,160.91-13.12,223.6Z" />
        <path d="M320,660c-15.75-33.71-42.23-87.48-70-110,13.84,48.3,25.79,113.52,20,150-2.1,13.24-23.24,18.68-90.51,19.78,40.35,36.39,99.25,71.26,170.51,60.22,0,0,20-80,40-120-9.72-89.15-27.89-167.94-50-240-5.53,56.37-3.09,174.43-20,240Z" />
      </g>
      <path d="M680,160h80c44.14,0,86.45,6.18,126.55,15.73-8.01-15.06-16.99-30.72-26.55-35.73-21.64-11.34-61.25-20-140-20s-118.36,8.66-140,20c-9.57,5.01-18.54,20.68-26.55,35.73,40.1-9.55,82.42-15.73,126.55-15.73Z" fill="#000000" opacity="0.55" />
      <path d="M139.43,611.54c-11.65,23.29-19.43,38.46-19.43,38.46,0,0,91.73,151.42,230,130,0,0,4.42-17.69,11.19-40.59-82.3-6.5-148.23-39.82-221.75-127.87Z" fill="#000000" opacity="0.35" />
      <path d="M1300.57,611.54c-73.52,88.05-139.46,121.37-221.75,127.87,6.77,22.9,11.19,40.59,11.19,40.59,138.27,21.42,230-130,230-130,0,0-7.78-15.17-19.43-38.46Z" fill="#000000" opacity="0.35" />
      <text
        x="720" y="770" textAnchor="middle" dominantBaseline="central"
        fontSize="470" fontWeight="800"
        fill={escuro ? '#1a1410' : '#fff'}
      >
        {numero}
      </text>
    </svg>
  );
}

/**
 * Formações e escalações no estilo da ESPN: separador por equipa (escudo +
 * formação), campo na vertical com o guarda-redes em baixo e as camisolas
 * com os ícones de golo / cartão / saída, e as substituições por baixo.
 */
/** Emojis de golo / cartão de um jogador (nada se não houver). */
function MarcasEvento(
  { golos, amarelo, vermelho }: { golos: number; amarelo: boolean; vermelho: boolean },
) {
  if (!golos && !amarelo && !vermelho) return null;
  return (
    <span className="escalacoes__sub-marcas" aria-hidden="true">
      {golos > 0 && <span>⚽{golos > 1 ? golos : ''}</span>}
      {amarelo && <span>🟨</span>}
      {vermelho && <span>🟥</span>}
    </span>
  );
}

/** Barras casa-vs-fora de uma lista de estatísticas de jogo. */
function ListaEstatisticas({ estatisticas }: { estatisticas: EstatisticaJogo[] }) {
  return (
    <>
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
    </>
  );
}

function EscalacoesESPN({ esc, jogo }: { esc: Escalacoes; jogo: JogoAoVivo }) {
  const [lado, setLado] = useState<'casa' | 'fora'>('casa');
  const dados: LadoEscalacao = esc[lado];
  const corCru = lado === 'casa' ? esc.corCasa : esc.corFora;
  const cor = corCru && /^[0-9a-fA-F]{6}$/.test(corCru)
    ? `#${corCru}`
    : (lado === 'casa' ? '#a15f3b' : '#5f7183');
  const escuro = corClara(corCru);

  // O campo é vertical: guarda-redes em baixo, avançados em cima. O eixo de
  // ataque (x) vira posição vertical; o eixo transversal (y) vira horizontal.
  const av = (x: number) => lado === 'casa' ? (x - 5) / 42 : (95 - x) / 42;
  const top = (x: number) => 90 - av(x) * 74;
  const left = (y: number) => 3 + (y / 100) * 94;

  const entradas = dados.suplentes.filter(s => s.entrou);

  return (
    <div className="jogo-detalhes__bloco escalacoes">
      <h3>Formações e escalações</h3>

      <div className="escalacoes__abas" role="tablist">
        {(['casa', 'fora'] as const).map(l => {
          const nome = l === 'casa' ? jogo.casa : jogo.fora;
          const logo = l === 'casa' ? jogo.logoCasa : jogo.logoFora;
          const form = (l === 'casa' ? esc.casa : esc.fora).formacao;
          return (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lado === l}
              className={`escalacoes__aba${lado === l ? ' escalacoes__aba--on' : ''}`}
              onClick={() => setLado(l)}
            >
              {logo && <img src={logo} alt="" />}
              <span>{form || nome}</span>
            </button>
          );
        })}
      </div>

      <div className="escalacoes__campo">
        {dados.titulares.map((j, i) => (
          <span
            key={i}
            className={`escala-jog${j.guardaRedes ? ' escala-jog--gr' : ''}`}
            style={{ left: `${left(j.y)}%`, top: `${top(j.x)}%` }}
          >
            <span className="escala-jog__camisa">
              <Camisola
                cor={j.guardaRedes ? '#f4c430' : cor}
                numero={j.numero}
                escuro={j.guardaRedes ? true : escuro}
              />
              <span className="escala-jog__marcas" aria-hidden="true">
                {j.golos > 0 && <span>⚽{j.golos > 1 ? j.golos : ''}</span>}
                {j.amarelo && <span>🟨</span>}
                {j.vermelho && <span>🟥</span>}
                {j.saiu && <span className="escala-jog__marca-saiu">↓</span>}
              </span>
            </span>
            <span className="escala-jog__nome">
              {j.guardaRedes && <span className="escala-jog__gr">GR</span>}
              {j.nome}
            </span>
          </span>
        ))}
      </div>

      <div className="escalacoes__subs-bloco">
        <strong>Substituições</strong>
        {entradas.length === 0 ? (
          <p className="jogo-detalhes__nota">Ainda sem substituições.</p>
        ) : (
          <ul className="escalacoes__subs">
            {entradas.map((s, i) => (
              <li key={i}>
                <div className="escalacoes__sub-in">
                  <span className="escalacoes__sub-num">#{s.numero}</span>
                  <span className="escalacoes__sub-nome">{s.nome}</span>
                  <MarcasEvento golos={s.golos} amarelo={s.amarelo} vermelho={s.vermelho} />
                  <span className="escalacoes__sub-dir">
                    {s.minuto && <span className="escalacoes__sub-min">{s.minuto}</span>}
                    <span className="escalacoes__sub-seta escalacoes__sub-seta--in">▲</span>
                  </span>
                </div>
                {s.saiuPor && (
                  <div className="escalacoes__sub-out">
                    <span className="escalacoes__sub-seta escalacoes__sub-seta--out">▼</span>
                    {s.saiuPor}
                    <MarcasEvento golos={s.saiuGolos} amarelo={s.saiuAmarelo} vermelho={s.saiuVermelho} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FormaRecente(
  { titulo, logo, jogos }: { titulo: string; logo: string | null; jogos: ResultadoForma[] },
) {
  if (jogos.length === 0) return null;
  return (
    <div className="forma">
      <div className="forma__cab">
        {logo && <img className="forma__logo-eq" src={logo} alt="" />}
        <strong>{titulo}</strong>
      </div>
      <ul className="forma__lista">
        {jogos.map((g, i) => (
          <li key={i}>
            <span className={`forma__selo forma__selo--${g.resultado}`}>{g.resultado}</span>
            <span className="forma__via">vs</span>
            {g.logoAdversario && <img className="forma__logo" src={g.logoAdversario} alt="" />}
            <span className="forma__adv">{g.adversario}</span>
            <span className="forma__placar">{g.placar}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfrontosH2H({ h2h }: { h2h: HeadToHead }) {
  return (
    <div className="h2h">
      <ul className="h2h__lista">
        {h2h.jogos.map((g, i) => (
          <li key={i}>
            <span className="h2h__eq">
              {g.logoCasa && <img src={g.logoCasa} alt="" />}
              <span>{g.casa}</span>
            </span>
            <span className="h2h__placar">{g.golosCasa ?? '–'} : {g.golosFora ?? '–'}</span>
            <span className="h2h__eq h2h__eq--dir">
              <span>{g.fora}</span>
              {g.logoFora && <img src={g.logoFora} alt="" />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tabela classificativa da competição, com as duas equipas do jogo em
 *  destaque. Só aparece quando a ESPN publica o bloco `standings`. */
function ClassificacaoTabela({ classificacao }: { classificacao: Classificacao }) {
  return (
    <div className="clsf">
      <table className="clsf__tabela">
        <thead>
          <tr>
            <th className="clsf__pos">#</th>
            <th className="clsf__eq">Equipa</th>
            <th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>P</th>
          </tr>
        </thead>
        <tbody>
          {classificacao.linhas.map(l => (
            <tr key={l.posicao} className={l.destaque ? 'clsf__linha--on' : undefined}>
              <td className="clsf__pos">{l.posicao}</td>
              <td className="clsf__eq">
                {l.logo && <img src={l.logo} alt="" />}
                <span>{l.equipa}</span>
              </td>
              <td>{l.jogos}</td>
              <td>{l.vitorias}</td>
              <td>{l.empates}</td>
              <td>{l.derrotas}</td>
              <td>{l.diferenca}</td>
              <td className="clsf__pts">{l.pontos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
        {(j.vermelhosCasa ?? 0) > 0 && (
          <span className="jogo-card__vermelho" title="Expulsão">
            🟥{(j.vermelhosCasa ?? 0) > 1 ? `×${j.vermelhosCasa}` : ''}
          </span>
        )}
        <strong>{j.golosCasa ?? '–'}</strong>
      </div>
      <div className="jogo-card__equipa">
        {j.logoFora && <img src={j.logoFora} alt="" loading="lazy" />}
        <span>{j.fora}</span>
        {(j.vermelhosFora ?? 0) > 0 && (
          <span className="jogo-card__vermelho" title="Expulsão">
            🟥{(j.vermelhosFora ?? 0) > 1 ? `×${j.vermelhosFora}` : ''}
          </span>
        )}
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
  compensacao: null, penaltis: null,
  bolaX: null, bolaY: null, bolaReal: false, bolaPassos: [], ultimaJogada: null,
};

/** Fila de penáltis de uma equipa no desempate: ✓ marcado, ✗ falhado.
 *  `dir` inverte para o lado direito (equipa fora). Sem nome — a posição
 *  (esquerda = casa, direita = fora) já diz de quem é. */
function SeriePen({ serie, dir = false }: { serie: boolean[] | null; dir?: boolean }) {
  const marcas = serie ?? [];
  const feitos = marcas.filter(Boolean).length;
  return (
    <div className={`placar__pen-linha${dir ? ' placar__pen-linha--dir' : ''}`}>
      <span className="placar__pen-conta">{feitos}/{marcas.length}</span>
      <span className="placar__pen-marcas">
        {marcas.map((ok, i) => (
          <span key={i} className={`placar__pen-marca${ok ? ' is-golo' : ' is-falha'}`}>
            {ok ? '✓' : '✗'}
          </span>
        ))}
      </span>
    </div>
  );
}

/** A bola percorre as coordenadas reais que a ESPN publicou nos últimos lances
 *  (o ataque a formar-se), com a transição CSS a suavizar cada passo. Quando só
 *  há um ponto — ou nenhum — fica parada nele. Não há feed posicional contínuo
 *  público, por isso entre lances a bola não "deriva" como no LastPlays. */
function BolaViva(
  { passos, x, y, estim }:
  { passos: { x: number; y: number }[]; x: number; y: number; estim: boolean },
) {
  const chave = passos.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(';');
  const [idx, setIdx] = useState(() => Math.max(0, passos.length - 1));
  useEffect(() => {
    if (passos.length < 2) { setIdx(Math.max(0, passos.length - 1)); return; }
    let i = Math.max(0, passos.length - 4); // arranca uns lances atrás
    setIdx(i);
    const t = window.setInterval(() => {
      i += 1;
      setIdx(i);
      if (i >= passos.length - 1) window.clearInterval(t);
    }, 750);
    return () => window.clearInterval(t);
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = passos[Math.min(idx, passos.length - 1)] ?? { x, y };
  return (
    <span
      className={`campo-live__bola${estim ? ' campo-live__bola--estim' : ''}`}
      style={{ left: `${p.x}%`, top: `${p.y}%` }}
      aria-hidden="true"
    />
  );
}

function CampoAoVivo(
  { jogo, momento, terminado = false, prejogo = false }:
  { jogo: JogoAoVivo; momento?: MomentoJogo | null; terminado?: boolean; prejogo?: boolean },
) {
  const { casa, fora, lance, minuto, posse, fase, compensacao, penaltis, bolaX, bolaY, bolaReal, ultimaJogada } = momento ?? MOMENTO_VAZIO;

  // O anúncio dos acréscimos aparece ao centro só uns segundos (como na ESPN);
  // depois disso fica só o "(+X)" ao lado do relógio.
  const [compFresca, setCompFresca] = useState<number | null>(null);
  useEffect(() => {
    if (compensacao == null) { setCompFresca(null); return; }
    setCompFresca(compensacao);
    const t = window.setTimeout(() => setCompFresca(null), 6000);
    return () => window.clearTimeout(t);
  }, [compensacao]);

  // Debug: ?debug na URL ou localStorage.ep-debug='1' mostra as coordenadas
  // da bola + o evento por cima do campo, e imprime na consola a cada momento.
  const debug = (() => {
    try {
      return new URLSearchParams(location.search).has('debug')
        || localStorage.getItem('ep-debug') === '1';
    } catch { return false; }
  })();
  useEffect(() => {
    if (debug && momento) {
      // eslint-disable-next-line no-console
      console.log('[campo]', {
        minuto, evento: ultimaJogada?.rotulo ?? fase, descricao: ultimaJogada?.descricao,
        posse, fase, lance, bolaX, bolaY, bolaReal,
      });
    }
  }, [debug, momento, minuto, fase, lance, posse, bolaX, bolaY, bolaReal, ultimaJogada]);

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

  // O evento ao centro segue SEMPRE a última linha do relato da ESPN (é o que
  // estava a ficar atrasado — a cápsula prendia-se no `destaque`/`fase` enquanto
  // o feed já tinha avançado). `destaque`/`fase` só entram como recurso.
  const time = terminado || prejogo ? null : equipaDe(posse);
  // `destaque` pode vir como string de uma versão antiga da cache — normaliza.
  const destaque = typeof momento?.destaque === 'object' ? momento.destaque : null;
  const evento = terminado
    ? { texto: 'Fim do jogo', nota: '', time: null }
    : prejogo
    ? { texto: 'Ainda não começou', nota: jogo.relogio, time: null }
    : compFresca != null
      ? { texto: 'Tempo de compensação', nota: `+${compFresca}`, time: null }
      : ultimaJogada
        ? {
            texto: ultimaJogada.rotulo || fase || 'Bola em jogo',
            nota: ultimaJogada.minuto || minuto,
            time: equipaDe(ultimaJogada.equipa) ?? time,
          }
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
          {!terminado && !prejogo && compensacao != null && /\+/.test(jogo.relogio ?? '') && (
            <span className="campo-live__extra"> (+{compensacao})</span>
          )}
        </span>
        <span className="campo-live__eq campo-live__eq--dir">{jogo.fora}</span>
      </div>

      {penaltis && (
        <div className="campo-live__pen">
          <span>Grandes penalidades</span>
          <strong>{penaltis.casa}<em> — </em>{penaltis.fora}</strong>
        </div>
      )}

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

        {/* Bola da última jogada: a ESPN só dá uma coordenada por lance do
            `commentary`, por isso a bola desliza (transição CSS) de lance em
            lance a acompanhar o jogo — sem rasto nem linhas. */}
        {debug && (
          <div className="campo-live__debug">
            <div>{minuto || '—'} · <b>{ultimaJogada?.rotulo ?? fase ?? '—'}</b></div>
            <div>posse: {posse ?? '—'} · fase: {fase || '—'}</div>
            <div>
              bola: {bolaX != null ? bolaX.toFixed(1) : '—'} , {bolaY != null ? bolaY.toFixed(1) : '—'}
              {' '}({bolaReal ? 'real ESPN' : 'estimada'})
            </div>
            {ultimaJogada?.descricao && <div className="campo-live__debug-desc">{ultimaJogada.descricao}</div>}
          </div>
        )}

        {!terminado && !prejogo && bolaX != null && bolaY != null && (
          <BolaViva
            passos={momento?.bolaPassos ?? []}
            x={bolaX}
            y={bolaY}
            estim={debug && !bolaReal}
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

          {semFeed ? (
            <p className="campo-live__lance">
              Sem cobertura ao vivo para este jogo — o campo fica sem lances.
            </p>
          ) : ultimaJogada ? (
            <div className="campo-live__ultima">
              <div className="campo-live__ultima-cab">
                {(() => {
                  const t = equipaDe(ultimaJogada.equipa);
                  return t?.logo
                    ? <img className="campo-live__ultima-escudo" src={t.logo} alt="" />
                    : <span className="campo-live__ultima-escudo campo-live__ultima-escudo--vazio">{EMOJI_EVENTO[ultimaJogada.tipo] ?? '•'}</span>;
                })()}
                <span className="campo-live__ultima-rotulo">{ultimaJogada.rotulo}</span>
                {ultimaJogada.minuto && <span className="campo-live__ultima-min">{ultimaJogada.minuto}</span>}
                <span className="campo-live__ultima-tag">Última jogada</span>
              </div>
              <p className="campo-live__ultima-txt">{ultimaJogada.descricao}</p>
            </div>
          ) : (
            <p className="campo-live__lance">{legenda || 'Bola em jogo'}</p>
          )}
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
    escalacoes: null, lideres: [], formaCasa: [], formaFora: [], h2h: null,
    classificacao: null,
  });
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [vistaMeio, setVistaMeio] = useState<'campo' | 'stats'>('campo');

  // A lista e a ficha do jogo são a mesma página: ao abrir um jogo, o scroll
  // ficava onde estava na lista. Volta ao topo sempre que se abre um jogo.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [jogo.id]);

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
      carregarDetalhesJogo(jogo.ligaSlug, jogo.id).then(d => {
        if (!vivo) return;
        // (o .catch abaixo engole falhas de rede / extensões que embrulham o fetch)
        // A ESPN às vezes devolve o summary sem o boxscore/relato preenchidos
        // (entre partes, logo após o apito, ou por lentidão do feed). Nesses
        // casos ficava tudo a zero de repente — o Atlético-MG vs Cruzeiro fazia
        // isto de forma consistente. Mantém-se o último valor não-vazio.
        setDetalhes(prev => ({
          ...d,
          estatisticas: d.estatisticas.length ? d.estatisticas : prev.estatisticas,
          eventos: d.eventos.length ? d.eventos : prev.eventos,
          comentario: d.comentario.length ? d.comentario : prev.comentario,
          escalacoes: d.escalacoes ?? prev.escalacoes,
          lideres: d.lideres.length ? d.lideres : prev.lideres,
          formaCasa: d.formaCasa.length ? d.formaCasa : prev.formaCasa,
          formaFora: d.formaFora.length ? d.formaFora : prev.formaFora,
          h2h: d.h2h ?? prev.h2h,
          classificacao: d.classificacao ?? prev.classificacao,
        }));
      }).catch(() => { /* rede / extensão a embrulhar o fetch — mantém o último estado */ });
    };
    puxar();
    const t = window.setInterval(puxar, INTERVALO_LIVE);
    // Os browsers estrangulam (ou param) o setInterval em tabs escondidas —
    // ao voltar à tab os eventos apareciam todos de rajada, com "delay". Puxa
    // já assim que a tab fica visível outra vez.
    const aoVoltar = () => { if (document.visibilityState === 'visible') puxar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
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

  // Expulsões para o marcador: o summary é o mais fiável; se ainda não carregou,
  // fica pelo que a cache do scoreboard trouxe.
  const vermelhosEvento = (lado: 'casa' | 'fora') =>
    detalhes.eventos.filter(e => e.tipo === 'cartao_vermelho' && e.equipa === lado).length;
  const vermelhosCasa = Math.max(vermelhosEvento('casa'), jx.vermelhosCasa ?? 0);
  const vermelhosFora = Math.max(vermelhosEvento('fora'), jx.vermelhosFora ?? 0);

  return (
    <div className="sala-jogo">
      <button className="sala-jogo__voltar" onClick={onVoltar}>
        <ArrowLeft size={15} /> Todos os jogos
      </button>

      <div className="sala-jogo__ficha">
        {/* ── Placar em faixa larga, ao estilo da ESPN ── */}
        <div className={estaAoVivo(jx) ? 'placar placar--faixa placar--vivo' : 'placar placar--faixa'}>
          <div className="placar__liga">
            <span className="placar__liga-nome">
              {bandeiraDaLiga(jogo.ligaSlug) && (
                <img className="liga-bandeira" src={bandeiraDaLiga(jogo.ligaSlug)!} alt="" />
              )}
              <span>{jx.liga}</span>
              {jx.relogio && (
                <span className={estaAoVivo(jx) ? 'placar__relogio vivo' : 'placar__relogio'}>
                  {estaAoVivo(jx) && <span className="salas-dot" />}
                  {jx.relogio}
                </span>
              )}
            </span>
          </div>

          <div className="placar__corpo">
            {jx.logoCasa && <img className="placar__escudo" src={jx.logoCasa} alt="" />}
            <div className="placar__lado placar__lado--casa">
              <strong>
                {jx.casa}
                {vermelhosCasa > 0 && (
                  <span className="placar__vermelho" title="Expulsão">
                    {' '}🟥{vermelhosCasa > 1 ? `×${vermelhosCasa}` : ''}
                  </span>
                )}
              </strong>
              {detalhes.escalacoes?.casa.formacao && (
                <span className="placar__forma">{detalhes.escalacoes.casa.formacao}</span>
              )}
            </div>
            <div className="placar__resultado">
              <span>{jx.golosCasa ?? '–'}</span>
              <em>
                {jx.estado === 'terminado' ? 'F' : estaAoVivo(jx) ? jx.relogio : ':'}
              </em>
              <span>{jx.golosFora ?? '–'}</span>
            </div>
            <div className="placar__lado placar__lado--fora">
              <strong>
                {jx.fora}
                {vermelhosFora > 0 && (
                  <span className="placar__vermelho" title="Expulsão">
                    {' '}🟥{vermelhosFora > 1 ? `×${vermelhosFora}` : ''}
                  </span>
                )}
              </strong>
              {detalhes.escalacoes?.fora.formacao && (
                <span className="placar__forma">{detalhes.escalacoes.fora.formacao}</span>
              )}
            </div>
            {jx.logoFora && <img className="placar__escudo" src={jx.logoFora} alt="" />}
          </div>

          {detalhes.vivo?.htCasa != null && detalhes.vivo?.htFora != null && (
            <p className="placar__ht">
              Intervalo <span>{detalhes.vivo.htCasa} : {detalhes.vivo.htFora}</span>
            </p>
          )}

          {detalhes.vivo?.penCasa != null && detalhes.vivo?.penFora != null && (
            <div className="placar__pen">
              <p className="placar__ht placar__ht--pen">
                Grandes penalidades <span>{detalhes.vivo.penCasa} : {detalhes.vivo.penFora}</span>
              </p>
              {(detalhes.vivo.penSerieCasa || detalhes.vivo.penSerieFora) && (
                <div className="placar__pen-series">
                  <SeriePen serie={detalhes.vivo.penSerieCasa} />
                  <SeriePen serie={detalhes.vivo.penSerieFora} dir />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Tira de golos e expulsões, logo por baixo do placar ── */}
        {jx.estado !== 'agendado' && (
          <ResumoGolos eventos={detalhes.eventos} />
        )}

        {/* ── Corpo em três colunas, ao estilo da ficha da ESPN ── */}
        <div className="ficha-corpo">
        <div className="ficha-corpo__esq">
        {detalhes.escalacoes && <EscalacoesESPN esc={detalhes.escalacoes} jogo={jx} />}
        </div>

        <div className="ficha-corpo__meio">
        {/* ── Linha do tempo do jogo ── */}
        {detalhes.eventos.length > 0 && jx.estado !== 'agendado' && (
          <CronologiaJogo eventos={detalhes.eventos} />
        )}

        {/* ── Mini-campo ao vivo ⇄ estatísticas ── */}
        <div className="jogo-detalhes__bloco">
          <div className="meio-vista__abas" role="tablist">
            <button
              type="button" role="tab" aria-selected={vistaMeio === 'campo'}
              className={`meio-vista__aba${vistaMeio === 'campo' ? ' meio-vista__aba--on' : ''}`}
              onClick={() => setVistaMeio('campo')}
            >
              Campo ao vivo
            </button>
            <button
              type="button" role="tab" aria-selected={vistaMeio === 'stats'}
              className={`meio-vista__aba${vistaMeio === 'stats' ? ' meio-vista__aba--on' : ''}`}
              onClick={() => setVistaMeio('stats')}
            >
              Estatísticas
            </button>
          </div>

          {vistaMeio === 'campo' ? (
            <>
              {estaAoVivo(jx) && <CampoAoVivo jogo={jx} momento={jx.momento} />}
              {jx.estado === 'terminado' && <CampoAoVivo jogo={jx} momento={jx.momento} terminado />}
              {jx.estado === 'agendado' && <CampoAoVivo jogo={jx} momento={null} prejogo />}
            </>
          ) : (
            <>
              <CabecalhoEquipas jogo={jx} />
              {semDadosReais && (
                <p className="jogo-detalhes__nota">Atualizam quando o jogo começar.</p>
              )}
              <ListaEstatisticas estatisticas={estatisticas} />
            </>
          )}
        </div>

        {/* ── Histórico do jogo ── */}
        <div className="jogo-detalhes__bloco">
          <h3>Histórico do jogo</h3>
          <CabecalhoEquipas jogo={jx} />
          {detalhes.comentario.length === 0 ? (
            <p className="jogo-detalhes__nota">Aparece quando o jogo começar.</p>
          ) : (
            <div className="jogo-relato jogo-relato--ficha">
              {detalhes.comentario.map((c, i) => {
                const ic = c.tipo !== 'outro'
                  ? <span className="relato-linha__ic">{EMOJI_EVENTO[c.tipo]}</span>
                  : null;
                if (c.equipa === null) {
                  return (
                    <div key={i} className={`relato-linha relato-linha--neutro${c.chave ? ' relato-linha--chave' : ''}`}>
                      <span className="relato-linha__min">{c.minuto || '·'}</span>
                      {ic}
                      <span className="relato-linha__txt">{c.texto}</span>
                    </div>
                  );
                }
                return (
                  <div key={i} className={`relato-linha relato-linha--${c.equipa}${c.chave ? ' relato-linha--chave' : ''}`}>
                    <span className="relato-linha__lado relato-linha__lado--casa">
                      {c.equipa === 'casa' && <><span className="relato-linha__txt">{c.texto}</span>{ic}</>}
                    </span>
                    <span className="relato-linha__min">{c.minuto || '·'}</span>
                    <span className="relato-linha__lado relato-linha__lado--fora">
                      {c.equipa === 'fora' && <>{ic}<span className="relato-linha__txt">{c.texto}</span></>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>{/* /.ficha-corpo__meio */}

        <div className="ficha-corpo__dir">
        {detalhes.h2h && (
          <div className="jogo-detalhes__bloco">
            <h3>Confronto-direto</h3>
            <ConfrontosH2H h2h={detalhes.h2h} />
          </div>
        )}
        {(detalhes.formaCasa.length > 0 || detalhes.formaFora.length > 0) && (
          <div className="jogo-detalhes__bloco">
            <h3>Forma recente</h3>
            <FormaRecente titulo={jx.casa} logo={jx.logoCasa} jogos={detalhes.formaCasa} />
            <FormaRecente titulo={jx.fora} logo={jx.logoFora} jogos={detalhes.formaFora} />
          </div>
        )}
        {detalhes.classificacao && detalhes.classificacao.linhas.length > 0 && (
          <div className="jogo-detalhes__bloco">
            <h3>{detalhes.classificacao.titulo}</h3>
            <ClassificacaoTabela classificacao={detalhes.classificacao} />
          </div>
        )}
        </div>
        </div>{/* /.ficha-corpo */}

        {/* ── Previsões + drops ── */}
        {perguntas.length > 0 && (
          <div className="gm-card" style={{ margin: 0 }}>
            <h2>Prevê o jogo</h2>
            <p className="gm-sub">
              Grátis. Acertas, ganhas EPCoins — não há dinheiro envolvido.
            </p>
            <PainelPrevisoes perguntas={perguntas} />
          </div>
        )}
        <DropWidget eventoId={jogo.id} />
      </div>

      <ChatFlutuante
        mensagens={mensagens}
        carregado={carregado}
        erro={erro}
        texto={texto}
        onTexto={setTexto}
        onEnviar={enviar}
        enviando={enviando}
        onApagar={apagar}
        userId={userId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
