/**
 * Placar ao vivo — roadmap 11.
 *
 * Fonte: endpoints públicos de scoreboard da ESPN. São gratuitos e não pedem
 * chave, o que é a razão de estarem aqui — mas também não são documentados
 * nem contratualizados. Por isso tudo o que é ESPN está fechado neste ficheiro
 * e o resto da aplicação só conhece `JogoAoVivo`: trocar de fonte é reescrever
 * `mapearEvento` e mais nada.
 */

// ─── TIPOS ────────────────────────────────────────────────────

import { LIGAS_NUCLEO } from './ligas.js';

export type EstadoJogo = 'agendado' | 'ao_vivo' | 'intervalo' | 'terminado' | 'adiado';

export interface JogoAoVivo {
  /** ID na fonte. É a chave da sala de chat. */
  id: string;
  fonte: 'espn';
  liga: string;
  ligaSlug: string;
  casa: string;
  fora: string;
  logoCasa: string | null;
  logoFora: string | null;
  golosCasa: number | null;
  golosFora: number | null;
  estado: EstadoJogo;
  /** '67'' ', 'Intervalo', '18:45' — o que faz sentido mostrar naquele estado. */
  relogio: string;
  inicio: string;
  /** Expulsões por lado, lidas do `details` do scoreboard. 0/ausente = nenhuma. */
  vermelhosCasa?: number;
  vermelhosFora?: number;
  /** Só preenchido enquanto o jogo decorre: o cron anexa a partir do summary
   *  da ESPN e a sala volta a calcular por cima, mais depressa que o cron. */
  stats?: EstatisticaJogo[];
  momento?: MomentoJogo;
}

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// O catálogo vive em `ligas.ts` porque também é preciso do lado do servidor,
// onde nada disto — fetch a 140 competições — pode acontecer no browser.
export { ORDEM_CONTINENTES, continenteDaLiga, nomeDaLiga, bandeiraDaLiga, LIGAS_TODAS, LIGAS_NUCLEO } from './ligas.js';

/** Sempre com dois jogos: o rótulo que fica congelado na sala. */
export function labelJogo(j: JogoAoVivo): string {
  return `${j.casa} x ${j.fora}`;
}

export function estaAoVivo(j: JogoAoVivo): boolean {
  return j.estado === 'ao_vivo' || j.estado === 'intervalo';
}

// ─── MAPEAMENTO ───────────────────────────────────────────────

/* A resposta da ESPN não é tipada em lado nenhum e pode mudar sem aviso. Em
   vez de a declarar como `any`, entra como `unknown` e passa por estes três
   acessos, que devolvem sempre um valor utilizável. Um campo em falta vale
   null; nunca rebenta. */
type Bruto = Record<string, unknown>;

function obj(v: unknown): Bruto {
  return v !== null && typeof v === 'object' ? (v as Bruto) : {};
}

function txt(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function mapearEstado(state: string, completed: boolean, detail: string): EstadoJogo {
  if (completed) return 'terminado';
  if (state === 'pre') return 'agendado';
  if (/postponed|adiado|cancel/i.test(detail)) return 'adiado';
  if (/halftime|intervalo|ht/i.test(detail)) return 'intervalo';
  return 'ao_vivo';
}

function mapearEvento(bruto: unknown, ligaSlug: string, ligaNome: string): JogoAoVivo | null {
  const ev = obj(bruto);
  const comp = obj(lista(ev.competitions)[0]);
  const equipas = lista(comp.competitors);
  if (equipas.length < 2) return null;

  const casa = obj(equipas.find(c => obj(c).homeAway === 'home') ?? equipas[0]);
  const fora = obj(equipas.find(c => obj(c).homeAway === 'away') ?? equipas[1]);

  const st = obj(comp.status ?? ev.status);
  const tipo = obj(st.type);
  const detail = txt(tipo.detail) ?? txt(tipo.shortDetail) ?? '';
  const estado = mapearEstado(txt(tipo.state) ?? 'pre', Boolean(tipo.completed), detail);

  const inicio = txt(ev.date) ?? txt(comp.date) ?? '';

  let relogio: string;
  if (estado === 'agendado') {
    relogio = inicio
      ? new Date(inicio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
      : '—';
  } else if (estado === 'intervalo') {
    relogio = 'Intervalo';
  } else if (estado === 'terminado') {
    relogio = 'Final';
  } else if (estado === 'adiado') {
    relogio = 'Adiado';
  } else {
    relogio = txt(st.displayClock) ?? txt(st.clock) ?? '';
  }

  const golo = (c: Bruto) => {
    const s = txt(c.score);
    if (s === null || s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const nome = (c: Bruto) => {
    const t = obj(c.team);
    return txt(t.shortDisplayName) ?? txt(t.displayName) ?? '—';
  };

  const id = txt(ev.id);
  if (!id) return null;

  // Expulsões: o scoreboard traz um `details` com os lances-chave; cada cartão
  // vermelho tem `redCard: true` e a equipa. Serve para o marcador da lista.
  const idCasa = txt(obj(casa.team).id);
  let vermelhosCasa = 0;
  let vermelhosFora = 0;
  for (const d of lista(comp.details).map(obj)) {
    const texto = (txt(obj(d.type).text) ?? '').toLowerCase();
    const eVermelho = d.redCard === true
      || /red[\s-]?card/.test(texto)
      || /sent[\s-]?off/.test(texto)
      || texto.includes('second yellow');
    if (!eVermelho) continue;
    const idEquipa = txt(obj(d.team).id);
    if (idEquipa && idCasa && idEquipa === idCasa) vermelhosCasa++;
    else vermelhosFora++;
  }

  return {
    id,
    fonte: 'espn',
    vermelhosCasa: vermelhosCasa || undefined,
    vermelhosFora: vermelhosFora || undefined,
    liga: ligaNome,
    ligaSlug,
    casa: nome(casa),
    fora: nome(fora),
    logoCasa: txt(obj(casa.team).logo),
    logoFora: txt(obj(fora.team).logo),
    golosCasa: golo(casa),
    golosFora: golo(fora),
    estado,
    relogio,
    inicio,
  };
}

// ─── LEITURA ──────────────────────────────────────────────────

/** Uma janela de dias para pedir à ESPN, em vez de só "hoje". */
export interface IntervaloDias {
  de: Date;
  ate: Date;
}

/** AAAAMMDD em UTC — o formato que o parâmetro `dates` da ESPN aceita. */
function aaaammdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** A data local (Europe/Lisbon) de um jogo, como 'AAAA-MM-DD'. Serve para
 *  separar "hoje" de "amanhã" sem que o fuso do browser dê um dia de erro. */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

async function carregarLiga(slug: string, intervalo?: IntervaloDias): Promise<JogoAoVivo[]> {
  try {
    const janela = intervalo
      ? `?dates=${aaaammdd(intervalo.de)}-${aaaammdd(intervalo.ate)}`
      : '';
    const res = await fetch(`${BASE}/${slug}/scoreboard${janela}`);
    if (!res.ok) return [];
    const json = obj(await res.json());
    const liga = obj(lista(json.leagues)[0]);
    const nome = txt(liga.abbreviation) ?? txt(liga.name) ?? slug;
    return lista(json.events)
      .map(ev => mapearEvento(ev, slug, nome))
      .filter((j): j is JogoAoVivo => j !== null);
  } catch {
    // Uma liga em baixo não pode levar o resto do quadro atrás.
    return [];
  }
}

const ORDEM_ESTADO: Record<EstadoJogo, number> = {
  ao_vivo: 0, intervalo: 1, agendado: 2, terminado: 3, adiado: 4,
};

/**
 * Jogos do dia das ligas pedidas, já ordenados: primeiro o que está a
 * acontecer, depois o que está para vir, e por fim o que já acabou.
 */
export async function carregarJogos(
  ligas: readonly string[] = LIGAS_NUCLEO,
  lote = 12,
  intervalo?: IntervaloDias,
): Promise<JogoAoVivo[]> {
  // Em lotes, e não tudo de uma vez: com o catálogo completo são ~140 pedidos,
  // e disparados em simultâneo esgotam os sockets da função e fazem a ESPN
  // começar a recusar. Doze de cada vez varre tudo em poucos segundos.
  const todos: JogoAoVivo[] = [];
  for (let i = 0; i < ligas.length; i += lote) {
    const parte = await Promise.all(
      ligas.slice(i, i + lote).map(slug => carregarLiga(slug, intervalo)),
    );
    todos.push(...parte.flat());
  }
  return ordenarJogos(todos);
}

/** Primeiro o que está a acontecer, depois o que vem, e por fim o que acabou. */
export function ordenarJogos(jogos: JogoAoVivo[]): JogoAoVivo[] {
  return [...jogos].sort((a, b) => {
    const d = ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado];
    return d !== 0 ? d : a.inicio.localeCompare(b.inicio);
  });
}

// ─── ESTATÍSTICAS + EVENTOS (estilo flashscore) ───────────────

export interface EstatisticaJogo {
  /** Rótulo em PT para mostrar, ex. "Posse de bola". */
  nome: string;
  casa: string;
  fora: string;
}

export type TipoEvento = 'golo' | 'cartao_amarelo' | 'cartao_vermelho' | 'substituicao' | 'outro';

export interface EventoJogo {
  minuto: string;
  tipo: TipoEvento;
  equipa: 'casa' | 'fora' | null;
  descricao: string;
}

/**
 * O "momentum de ataque" — quem está a carregar agora, estilo AiScore.
 * Vem do feed de `commentary` da ESPN: cada lance traz tipo e equipa. Não há
 * bola a mexer; mostra-se antes o lado com posse e o último evento marcante.
 */
export interface MomentoJogo {
  /** 0..100 — quota da pressão nos últimos minutos. casa + fora = 100. */
  casa: number;
  fora: number;
  /** Quem tem a bola agora — casa, fora, ou indefinido (bola parada/neutra). */
  posse: 'casa' | 'fora' | null;
  /** Palavra-estado ao centro do campo, estilo AiScore: "Ataque", "Canto"… */
  fase: string;
  /** Evento recente para mostrar em destaque ao centro (golo, cartão, canto,
   *  fora de jogo, substituição), com a equipa a que pertence. `null` quando
   *  não há nada fresco. */
  destaque: { texto: string; equipa: 'casa' | 'fora' | null } | null;
  /** Texto curto do último lance, ex. "Canto · Coritiba". */
  lance: string;
  minuto: string;
  /** Onde foi a última jogada, em % do campo (a casa ataca para a direita, por
   *  isso x≈100 é a baliza adversária). `null` quando o feed não dá posição.
   *  Não é a bola em tempo real — a ESPN só dá coordenada por evento — mas
   *  salta pelo campo a acompanhar o jogo. */
  bolaX: number | null;
  bolaY: number | null;
  /** `true` = coordenada mesmo publicada pela ESPN; `false` = zona estimada
   *  pelo tipo de lance. Só para debug. */
  bolaReal: boolean;
  /** Coordenadas REAIS dos últimos lances (cronológico), para a bola percorrer
   *  o ataque lance a lance em vez de saltar direto ao último ponto. Vazio
   *  quando a ESPN não publica posições ou o feed secou. */
  bolaPassos: { x: number; y: number }[];
  /** O painel "última jogada" da ESPN: reconhece qualquer tipo de lance do
   *  `commentary` (drible, interceção, lateral, alívio, desarme, cruzamento…),
   *  não só golos e cartões. `null` quando o feed ainda não deu nenhum lance. */
  ultimaJogada: {
    rotulo: string;
    descricao: string;
    jogador: string | null;
    equipa: 'casa' | 'fora' | null;
    minuto: string;
    tipo: TipoEvento;
  } | null;
}

/** Placar/relógio lidos do mesmo summary, para a sala não mostrar dois
 *  minutos diferentes entre o marcador e o mini-campo. */
export interface PatchVivo {
  golosCasa: number | null;
  golosFora: number | null;
  estado: EstadoJogo;
  relogio: string;
  /** Resultado ao intervalo (1.ª parte). `null` até o jogo lá chegar. */
  htCasa: number | null;
  htFora: number | null;
}

/** Uma linha do relato minuto-a-minuto (feed `commentary` da ESPN). */
export interface ComentarioJogo {
  minuto: string;
  texto: string;
  equipa: 'casa' | 'fora' | null;
  /** Lance marcante — golo, penálti, cartão vermelho. Destaca-se na lista. */
  chave: boolean;
  /** Para pôr um ícone à frente da linha. `outro` = sem ícone. */
  tipo: TipoEvento;
}

// ─── FICHA DO JOGO (estilo ESPN) ──────────────────────────────

/** Um jogador colocado no campo, em % (a casa ataca da esquerda para a
 *  direita; o lado de fora entra espelhado). */
export interface JogadorCampo {
  numero: string;
  nome: string;
  x: number;
  y: number;
  /** Foi substituído — mostra-se a seta de saída. */
  saiu: boolean;
  /** É o guarda-redes — camisola de cor distinta e etiqueta "GR". */
  guardaRedes: boolean;
  /** Golos marcados no jogo (para o ícone de bola na camisola). */
  golos: number;
  amarelo: boolean;
  vermelho: boolean;
}

export interface Suplente {
  numero: string;
  nome: string;
  entrou: boolean;
  /** Minuto em que entrou e nome de quem saiu — quando dá para cruzar
   *  com os eventos do jogo. */
  minuto: string | null;
  saiuPor: string | null;
  /** Golos / cartões de quem entrou, no tempo em que jogou. */
  golos: number;
  amarelo: boolean;
  vermelho: boolean;
  /** O mesmo para o jogador que saiu, quando dá para o identificar. */
  saiuGolos: number;
  saiuAmarelo: boolean;
  saiuVermelho: boolean;
}

export interface LadoEscalacao {
  formacao: string;
  titulares: JogadorCampo[];
  suplentes: Suplente[];
}

export interface Escalacoes {
  casa: LadoEscalacao;
  fora: LadoEscalacao;
  /** Cor principal de cada equipa (hex sem "#"), da ESPN. */
  corCasa: string | null;
  corFora: string | null;
}

/** Uma linha do "Líderes do jogo": o melhor de cada lado numa métrica. */
export interface LiderJogo {
  rotulo: string;
  casa: { nome: string; valor: string } | null;
  fora: { nome: string; valor: string } | null;
}

/** Um dos últimos cinco jogos de uma equipa. */
export interface ResultadoForma {
  resultado: 'V' | 'E' | 'D';
  /** Resultado "2-1" do jogo. */
  placar: string;
  /** Jogou em casa (vs) ou fora (@). */
  emCasa: boolean;
  /** Nome e emblema do adversário, para mostrar em vez das iniciais. */
  adversario: string;
  logoAdversario: string | null;
  data: string;
}

/** Um confronto direto anterior entre as duas equipas. */
export interface ConfrontoH2H {
  data: string;
  casa: string;
  fora: string;
  logoCasa: string | null;
  logoFora: string | null;
  golosCasa: number | null;
  golosFora: number | null;
}

export interface HeadToHead {
  /** "FOR lidera 3-2" traduzido. */
  resumo: string;
  jogos: ConfrontoH2H[];
}

/** Uma linha da tabela classificativa da competição. */
export interface LinhaClassificacao {
  posicao: number;
  equipa: string;
  logo: string | null;
  jogos: string;
  vitorias: string;
  empates: string;
  derrotas: string;
  diferenca: string;
  pontos: string;
  /** É uma das duas equipas deste jogo — destaca-se a linha. */
  destaque: boolean;
}

export interface Classificacao {
  titulo: string;
  linhas: LinhaClassificacao[];
}

export interface DetalhesJogo {
  estatisticas: EstatisticaJogo[];
  eventos: EventoJogo[];
  comentario: ComentarioJogo[];
  momento: MomentoJogo | null;
  vivo: PatchVivo | null;
  escalacoes: Escalacoes | null;
  lideres: LiderJogo[];
  formaCasa: ResultadoForma[];
  formaFora: ResultadoForma[];
  h2h: HeadToHead | null;
  classificacao: Classificacao | null;
}

const DETALHES_VAZIO: DetalhesJogo = {
  estatisticas: [], eventos: [], comentario: [], momento: null, vivo: null,
  escalacoes: null, lideres: [], formaCasa: [], formaFora: [], h2h: null,
  classificacao: null,
};

/** Quanto vale cada tipo de lance para o cálculo da pressão. */
const PESO_LANCE: Record<string, number> = {
  'goal': 10, 'own-goal': 10, 'penalty---scored': 10,
  'penalty---saved': 6, 'penalty---missed': 6, 'penalty-won': 5,
  'shot-on-target': 5, 'shot-hit-woodwork': 4,
  'shot-blocked': 3, 'shot-off-target': 3,
  'corner-awarded': 2.5, 'offside': 1, 'free-kick-won': 1,
};

/** Palavra-estado ao centro do campo (estilo AiScore: "Ataque", "Canto"…). */
const FASE_LANCE: Record<string, string> = {
  'goal': 'Golo', 'own-goal': 'Golo',
  'penalty---scored': 'Penálti', 'penalty---saved': 'Penálti',
  'penalty---missed': 'Penálti', 'penalty-won': 'Penálti',
  'shot-on-target': 'Remate à baliza', 'shot-hit-woodwork': 'Na trave',
  'shot-off-target': 'Remate para fora', 'shot-blocked': 'Remate bloqueado',
  'corner-awarded': 'Canto', 'free-kick-won': 'Livre',
  'offside': 'Fora de jogo', 'foul': 'Falta',
  'yellow-card': 'Cartão amarelo', 'red-card': 'Cartão vermelho',
  'substitution': 'Substituição',
};

/** Lances que valem um destaque ao centro do campo — tudo o que não seja
 *  falta de rotina ou fim de posse sem nada de jeito. */
const EVENTO_NOTAVEL = new Set([
  'goal', 'own-goal', 'penalty---scored', 'penalty---saved', 'penalty---missed',
  'shot-on-target', 'shot-off-target', 'shot-blocked', 'shot-hit-woodwork',
  'corner-awarded', 'offside', 'yellow-card', 'red-card', 'substitution',
]);

/**
 * Rótulo em PT para QUALQUER tipo de lance do `commentary` da ESPN — não só os
 * de `ROTULO_LANCE`. A ESPN publica dezenas de tipos (drible, interceção,
 * lateral, alívio "sai", desarme, cruzamento, defesa…); aqui há um mapa dos
 * conhecidos e, para o resto, palavras-chave no slug e por fim o próprio slug
 * capitalizado. Usa-se no painel "última jogada" e na legenda por baixo do campo.
 */
const ROTULO_LANCE_COMPLETO: Record<string, string> = {
  'goal': 'Golo', 'own-goal': 'Autogolo', 'penalty-goal': 'Golo de penálti',
  'penalty---scored': 'Penálti marcado', 'penalty---saved': 'Penálti defendido',
  'penalty---missed': 'Penálti falhado', 'penalty-won': 'Penálti', 'penalty-conceded': 'Penálti sofrido',
  'yellow-card': 'Amarelo', 'red-card': 'Vermelho', 'second-yellow-card': 'Segundo amarelo',
  'substitution': 'Substituição',
  'shot-on-target': 'Remate à baliza', 'shot-off-target': 'Remate para fora',
  'shot-blocked': 'Remate bloqueado', 'blocked-shot': 'Remate bloqueado',
  'shot-hit-woodwork': 'Bola ao poste', 'shot-saved': 'Remate defendido',
  'attempt-saved': 'Remate defendido', 'attempt-missed': 'Remate para fora',
  'attempt-blocked': 'Remate bloqueado',
  'corner-awarded': 'Canto', 'corner-kick': 'Canto', 'corner': 'Canto',
  'offside': 'Fora de jogo', 'offside-call': 'Fora de jogo',
  'foul': 'Falta', 'free-kick-won': 'Livre', 'free-kick-lost': 'Falta', 'free-kick': 'Livre',
  'throw-in': 'Lateral', 'goal-kick': 'Pontapé de baliza',
  'clearance': 'Alívio', 'interception': 'Interceção', 'interception-won': 'Interceção',
  'dribble': 'Drible', 'take-on': 'Drible', 'successful-dribble': 'Drible',
  'tackle': 'Desarme', 'tackle-won': 'Desarme', 'challenge': 'Disputa de bola',
  'cross': 'Cruzamento', 'pass': 'Passe', 'key-pass': 'Passe de rutura',
  'blocked-pass': 'Passe bloqueado', 'long-ball': 'Passe longo',
  'save': 'Defesa', 'keeper-save': 'Defesa', 'penalty-save': 'Penálti defendido',
  'keeper-pick-up': 'Bola para o guarda-redes', 'catch': 'Defesa',
  'punch': 'Soco do guarda-redes', 'smother': 'Antecipação do guarda-redes',
  'block': 'Bloqueio', 'header': 'Cabeceamento',
  'aerial': 'Duelo aéreo', 'aerial-duel': 'Duelo aéreo', 'duel': 'Duelo', 'ground-duel': 'Duelo',
  'hand-ball': 'Mão na bola', 'handball': 'Mão na bola',
  'dispossessed': 'Perda de bola', 'ball-recovery': 'Recuperação de bola',
  'miscontrol': 'Falha de controlo', 'error': 'Erro',
  'dangerous-play': 'Jogo perigoso', 'delay': 'Jogo interrompido',
  'delay-in-match': 'Jogo interrompido', 'game-restart': 'Recomeço do jogo',
  'injury': 'Lesão', 'player-injured': 'Jogador lesionado', 'treatment': 'Assistência médica',
  'var': 'VAR', 'var-decision': 'Decisão do VAR', 'video-review': 'Revisão de vídeo',
  'kick-off': 'Pontapé de saída', 'half-time': 'Intervalo',
  'end-of-half': 'Fim da parte', 'first-half-ends': 'Fim da 1.ª parte',
  'second-half-ends': 'Fim da 2.ª parte', 'full-time': 'Fim do jogo',
  'match-ends': 'Fim do jogo', 'game-ends': 'Fim do jogo',
  'big-chance-missed': 'Ocasião falhada', 'big-chance-scored': 'Ocasião de golo',
  'shot': 'Remate', 'attempt': 'Remate', 'penalty': 'Penálti', 'card': 'Cartão',
};

function rotularLance(slug: string): string {
  const s = (slug || '').toLowerCase().trim();
  if (!s) return 'Lance';
  if (ROTULO_LANCE_COMPLETO[s]) return ROTULO_LANCE_COMPLETO[s];
  if (/own[\s-]?goal/.test(s)) return 'Autogolo';
  if (/goal/.test(s)) return 'Golo';
  if (/red[\s-]?card|sent[\s-]?off/.test(s)) return 'Vermelho';
  if (/yellow/.test(s)) return 'Amarelo';
  if (/sub/.test(s)) return 'Substituição';
  if (/penalt/.test(s)) return 'Penálti';
  if (/corner/.test(s)) return 'Canto';
  if (/offside/.test(s)) return 'Fora de jogo';
  if (/free[\s-]?kick/.test(s)) return 'Livre';
  if (/throw/.test(s)) return 'Lateral';
  if (/clear/.test(s)) return 'Alívio';
  if (/intercept/.test(s)) return 'Interceção';
  if (/dribbl|take[\s-]?on/.test(s)) return 'Drible';
  if (/tackl/.test(s)) return 'Desarme';
  if (/cross/.test(s)) return 'Cruzamento';
  if (/save|keeper|goalkeeper/.test(s)) return 'Defesa';
  if (/block/.test(s)) return 'Bloqueio';
  if (/head/.test(s)) return 'Cabeceamento';
  if (/aerial|duel/.test(s)) return 'Duelo';
  if (/hand[\s-]?ball/.test(s)) return 'Mão na bola';
  if (/foul/.test(s)) return 'Falta';
  if (/shot|attempt/.test(s)) return 'Remate';
  if (/pass|ball/.test(s)) return 'Passe';
  if (/injur/.test(s)) return 'Lesão';
  if (/var|review/.test(s)) return 'VAR';
  if (/whistle|start|kick[\s-]?off/.test(s)) return 'Pontapé de saída';
  if (/end|full[\s-]?time/.test(s)) return 'Fim da parte';
  return s.replace(/-+/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

/** A ESPN só publica o relato em PT do Brasil. Passa a frase (e os rótulos) para
 *  PT de Portugal — vocabulário de futebol, que é onde a diferença se nota. */
const PT_BR_PARA_PT: [RegExp, string][] = [
  [/\bgol\b/gi, 'golo'],
  [/\bgols\b/gi, 'golos'],
  [/\bgoleiros?\b/gi, 'guarda-redes'],
  [/\bzagueiros?\b/gi, 'defesa central'],
  [/\bvolante(s)?\b/gi, 'trinco'],
  [/\bmeia(s)?\b/gi, 'médio'],
  [/\bmeio-campista(s)?\b/gi, 'médio'],
  [/\batacante(s)?\b/gi, 'avançado'],
  [/\bescanteio(s)?\b/gi, 'canto'],
  [/\btiro de meta\b/gi, 'pontapé de baliza'],
  [/\bp[êe]nalti(s)?\b/gi, 'penálti'],
  [/\bimpedimento(s)?\b/gi, 'fora de jogo'],
  [/\bchute(s)?\b/gi, 'remate'],
  [/\bchutou\b/gi, 'rematou'],
  [/\bchuta\b/gi, 'remata'],
  [/\bcobran[çc]a\b/gi, 'marcação'],
  [/\btorcida\b/gi, 'adeptos'],
  [/\btorcedores\b/gi, 'adeptos'],
  [/\bgramado\b/gi, 'relvado'],
  [/\bbandeirinha\b/gi, 'fiscal de linha'],
  [/\btravess[ãa]o\b/gi, 'barra'],
  [/\brebote\b/gi, 'ressalto'],
  [/\bprimeiro tempo\b/gi, 'primeira parte'],
  [/\bsegundo tempo\b/gi, 'segunda parte'],
  [/\bacr[ée]scimos\b/gi, 'compensação'],
  [/\b(o |a )?time\b/gi, 'equipa'],
  [/\barremesso lateral\b/gi, 'lançamento lateral'],
];
function paraPortugalPT(texto: string): string {
  let s = texto;
  for (const [re, alvo] of PT_BR_PARA_PT) {
    s = s.replace(re, (match: string) =>
      // mantém a maiúscula inicial do original
      /^[A-ZÀ-Þ]/.test(match) ? alvo.charAt(0).toUpperCase() + alvo.slice(1) : alvo);
  }
  return s;
}

/** Rótulo curto a partir da frase do relato (quando a linha não traz tipo). A
 *  ESPN escreve em PT do Brasil ("Tentativa de carrinho…", "Escanteio…"). */
function rotularDoTexto(texto: string): string | null {
  const s = texto.toLowerCase();
  if (/\bgol!|\bgolo!|marca[ .]/.test(s) || /\bgol\b/.test(s)) return 'Golo';
  if (/p[êe]n[aá]lti|penalty/.test(s)) return 'Penálti';
  if (/cart[ãa]o amarelo|yellow card/.test(s)) return 'Amarelo';
  if (/cart[ãa]o vermelho|red card|expuls/.test(s)) return 'Vermelho';
  if (/substitui[çc]|substitution|entra na vaga|\bsai\b[^.]*\bentra\b|\bentra\b[^.]*\bsai\b/.test(s)) return 'Substituição';
  if (/escanteio|c[óo]rner|corner/.test(s)) return 'Canto';
  if (/impedimento|offside|fora de jogo|está impedido/.test(s)) return 'Fora de jogo';
  if (/arremesso lateral|lateral cobrad|arremesso|throw.?in|linha lateral/.test(s)) return 'Lateral';
  if (/tiro de meta|goal ?kick|pontap[ée] de baliza|recuo para o goleiro|bola com o goleiro/.test(s)) return 'Pontapé de baliza';
  if (/carrinho|desarme|tackle|dividida/.test(s)) return 'Desarme';
  if (/intercep/.test(s)) return 'Interceção';
  if (/cruzamento|cruza(?:r|do|ndo)?\b|levantou na [aá]rea/.test(s)) return 'Cruzamento';
  if (/drible|dribl/.test(s)) return 'Drible';
  if (/defesa|defende|defendida|defendeu|save\b|espalma|encaixa/.test(s)) return 'Defesa';
  if (/bloqueio|bloquead|block|travad/.test(s)) return 'Bloqueio';
  if (/livre|cobran[çc]a de falta|falta perigosa|tiro livre|free.?kick/.test(s)) return 'Livre';
  if (/falta|foul/.test(s)) return 'Falta';
  if (/m[ãa]o na bola|hand ?ball|tocou com o bra[çc]o/.test(s)) return 'Mão na bola';
  if (/na trave|no poste|no travess[ãa]o|woodwork/.test(s)) return 'Bola ao poste';
  if (/grande chance|grande oportunidade|cara a cara/.test(s)) return 'Ocasião de golo';
  if (/finaliza|chute|remate|cabec|shot|attempt|header|pra fora|para fora|tentativa/.test(s)) return 'Remate';
  if (/cart[ãa]o/.test(s)) return 'Cartão';
  if (/var\b|[áa]rbitro de v[íi]deo|revis[ãa]o de v[íi]deo/.test(s)) return 'VAR';
  if (/les[ãa]o|injury|atendimento|maca|departamento m[ée]dico|contus/.test(s)) return 'Lesão';
  if (/in[íi]cio|kick.?off|apito inicial|bola rolando|come[çc]a a (?:partida|etapa)|rolar a bola/.test(s)) return 'Início';
  if (/fim d[oa]|intervalo|half.?time|full.?time|end of|acr[ée]scimos|tempo adicional/.test(s)) return 'Fim da parte';
  if (/recupera(?:ção| a bola)|roubada|roubou a bola/.test(s)) return 'Recuperação de bola';
  if (/perde a bola|perdeu a bola|desarmado/.test(s)) return 'Perda de bola';
  if (/passe|pass\b|troca de passes|toca para|lan[çc]a/.test(s)) return 'Passe';
  return null;
}

/** Rótulos que passam pelo `destaque` central (golo, cartão…) e não pela `fase`. */
const ROTULOS_NOTAVEIS = new Set([
  'Golo', 'Autogolo', 'Amarelo', 'Vermelho', 'Segundo amarelo', 'Substituição',
  'Penálti marcado', 'Penálti falhado', 'Penálti defendido', 'Golo de penálti',
]);

/** Do slug para o tipo de evento (ícone). Cobre mais casos que `tipoDoComentario`. */
function tipoDoLance(slug: string): TipoEvento {
  const s = (slug || '').toLowerCase();
  if (/own[\s-]?goal/.test(s)) return 'golo';
  if (s === 'goal' || /scored/.test(s) || s === 'penalty-goal') return 'golo';
  if (/red[\s-]?card|second[\s-]?yellow|sent[\s-]?off/.test(s)) return 'cartao_vermelho';
  if (/yellow/.test(s)) return 'cartao_amarelo';
  if (/sub/.test(s)) return 'substituicao';
  return 'outro';
}

const LABELS_ESTATISTICA: Record<string, string> = {
  possessionPct: 'Posse de bola',
  totalShots: 'Remates totais',
  shotsOnTarget: 'Remates à baliza',
  saves: 'Defesas',
  cornerKicks: 'Cantos',
  foulsCommitted: 'Faltas',
  offsides: 'Fora de jogo',
  yellowCards: 'Cartões amarelos',
  redCards: 'Cartões vermelhos',
  wonCorners: 'Cantos',
  passPct: 'Precisão de passe',
};

function classificarTipoEvento(texto: string): TipoEvento {
  const s = texto.toLowerCase();
  if (s.includes('goal') || s.includes('penalty') && s.includes('scored')) return 'golo';
  if (/red[\s-]?card/.test(s) || /sent[\s-]?off/.test(s)) return 'cartao_vermelho';
  if (s.includes('yellow')) return 'cartao_amarelo';
  if (s.includes('substitution')) return 'substituicao';
  return 'outro';
}

/** Do slug do `commentary` (ex. 'red-card', 'penalty---scored') para o tipo. */
function tipoDoComentario(slug: string): TipoEvento {
  if (slug === 'goal' || slug === 'own-goal' || slug.includes('scored')) return 'golo';
  if (/red[\s-]*card/.test(slug) || slug.includes('second-yellow') || /sent[\s-]*off/.test(slug))
    return 'cartao_vermelho';
  if (slug.includes('yellow')) return 'cartao_amarelo';
  if (slug === 'substitution') return 'substituicao';
  return 'outro';
}

function mapearEstatisticas(json: Bruto): EstatisticaJogo[] {
  const equipas = lista(obj(json.boxscore).teams).map(obj);
  if (equipas.length < 2) return [];

  const casa = equipas.find(t => t.homeAway === 'home') ?? equipas[0];
  const fora = equipas.find(t => t.homeAway === 'away') ?? equipas[1];

  const paraMapa = (equipa: Bruto) => {
    const m = new Map<string, string>();
    for (const item of lista(equipa.statistics).map(obj)) {
      const nome = txt(item.name) ?? txt(item.displayName) ?? txt(item.label);
      const valor = txt(item.displayValue) ?? txt(item.value);
      if (nome && valor !== null) m.set(nome, valor);
    }
    return m;
  };

  const mapaCasa = paraMapa(casa);
  const mapaFora = paraMapa(fora);
  const nomes = new Set([...mapaCasa.keys(), ...mapaFora.keys()]);

  // Ordem fixa pela relevância para acompanhar o jogo; o que não estiver
  // listado vem a seguir, pela ordem em que a ESPN devolve.
  const ORDEM = [
    'possessionPct', 'totalShots', 'shotsOnTarget', 'saves',
    'cornerKicks', 'wonCorners', 'yellowCards', 'redCards',
  ];
  const pos = (nome: string) => {
    const i = ORDEM.indexOf(nome);
    return i === -1 ? ORDEM.length : i;
  };

  return [...nomes]
    .filter(nome => nome in LABELS_ESTATISTICA)
    .sort((a, b) => pos(a) - pos(b))
    .map(nome => ({
      nome: LABELS_ESTATISTICA[nome],
      casa: mapaCasa.get(nome) ?? '—',
      fora: mapaFora.get(nome) ?? '—',
    }));
}

function mapearEventos(json: Bruto): EventoJogo[] {
  const comp = obj(lista(obj(json.header).competitions)[0]);
  const equipas = lista(comp.competitors).map(obj);
  const idCasa = txt(obj(equipas.find(c => c.homeAway === 'home')?.team ?? {}).id);

  return lista(comp.details).map(obj).map((d): EventoJogo => {
    const textoTipo = txt(obj(d.type).text) ?? '';
    const idEquipa = txt(obj(d.team).id);
    const jogador = txt(obj(lista(d.athletesInvolved).map(obj)[0] ?? {}).displayName);
    return {
      minuto: txt(obj(d.clock).displayValue) ?? '',
      tipo: classificarTipoEvento(textoTipo),
      equipa: idEquipa ? (idEquipa === idCasa ? 'casa' : 'fora') : null,
      descricao: jogador ? `${textoTipo} · ${jogador}` : textoTipo,
    };
  }).filter(e => e.descricao !== '');
}

/**
 * Relato minuto-a-minuto completo, do lance mais recente para o mais antigo.
 * O `commentary` da ESPN vem por ordem cronológica (o último elemento é o
 * evento mais recente), por isso invertemos para a lista abrir no "agora".
 */
function mapearComentario(json: Bruto, casaNome: string, foraNome: string): ComentarioJogo[] {
  const coment = lista(json.commentary).map(obj);
  if (coment.length === 0) return [];

  const casaBaixo = casaNome.toLowerCase();
  const foraBaixo = foraNome.toLowerCase();
  const ladoDe = (nome: string | null): 'casa' | 'fora' | null => {
    if (!nome) return null;
    const n = nome.toLowerCase();
    const eCasa = n.includes(casaBaixo) || casaBaixo.includes(n);
    const eFora = n.includes(foraBaixo) || foraBaixo.includes(n);
    if (eCasa && !eFora) return 'casa';
    if (eFora && !eCasa) return 'fora';
    return null;
  };

  const linhas: ComentarioJogo[] = [];
  for (const c of coment) {
    const texto = (txt(c.text) ?? '').trim();
    if (!texto) continue;
    const play = obj(c.play);
    const slug = txt(obj(play.type).type) ?? '';
    linhas.push({
      minuto: txt(obj(c.time).displayValue) ?? '',
      texto: paraPortugalPT(texto),
      equipa: ladoDe(txt(obj(play.team).displayName)),
      chave: EVENTO_NOTAVEL.has(slug),
      tipo: tipoDoComentario(slug),
    });
  }
  return linhas.reverse();
}

/** Nomes canónicos das duas equipas, tal como aparecem no `commentary`. */
function nomesDoSummary(json: Bruto): { casa: string; fora: string } {
  const comp = obj(lista(obj(json.header).competitions)[0]);
  const cs = lista(comp.competitors).map(obj);
  const casa = obj((cs.find(c => c.homeAway === 'home') ?? cs[0] ?? {}).team);
  const fora = obj((cs.find(c => c.homeAway === 'away') ?? cs[1] ?? {}).team);
  return {
    casa: txt(casa.displayName) ?? txt(casa.shortDisplayName) ?? '',
    fora: txt(fora.displayName) ?? txt(fora.shortDisplayName) ?? '',
  };
}

/**
 * Lê o `commentary` e devolve o momentum: quem pressiona (janela de ~6 min de
 * relógio, com decaimento), quem tem a posse e o último evento marcante.
 */
function mapearMomento(json: Bruto, casaNome: string, foraNome: string): MomentoJogo | null {
  const coment = lista(json.commentary).map(obj);
  if (coment.length === 0 || !casaNome || !foraNome) return null;

  const casaBaixo = casaNome.toLowerCase();
  const foraBaixo = foraNome.toLowerCase();
  const ladoDe = (nome: string | null): 'casa' | 'fora' | null => {
    if (!nome) return null;
    const n = nome.toLowerCase();
    const eCasa = n.includes(casaBaixo) || casaBaixo.includes(n);
    const eFora = n.includes(foraBaixo) || foraBaixo.includes(n);
    if (eCasa && !eFora) return 'casa';
    if (eFora && !eCasa) return 'fora';
    return null;
  };

  interface Lance {
    t: number; slug: string; equipa: 'casa' | 'fora' | null; minuto: string;
    x: number | null; y: number | null; wall: number; jogador: string | null;
  }

  const lances: Lance[] = [];
  for (const c of coment) {
    const play = obj(c.play);
    const t = Number(txt(obj(play.clock).value) ?? txt(obj(c.time).value));
    if (!Number.isFinite(t)) continue;
    const x = Number(txt(play.fieldPositionX) ?? txt(obj(play.fieldPosition).x));
    const y = Number(txt(play.fieldPositionY) ?? txt(obj(play.fieldPosition).y));
    const wall = Date.parse(txt(play.wallclock) ?? '');
    const atleta = obj(lista(play.athletesInvolved)[0]);
    lances.push({
      t,
      slug: txt(obj(play.type).type) ?? '',
      equipa: ladoDe(txt(obj(play.team).displayName)),
      minuto: txt(obj(c.time).displayValue) ?? '',
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
      wall: Number.isFinite(wall) ? wall : 0,
      jogador: txt(atleta.displayName) ?? txt(atleta.shortName) ?? null,
    });
  }
  if (lances.length === 0) return null;

  // Todas as linhas do relato — incluindo as que não trazem `play` estruturado.
  // A ESPN só marca tipo/coordenada nos lances "chave", mas o texto avança
  // linha a linha; é isto que mantém o painel "última jogada" a par da ESPN
  // (com a frase inteira dela, ex. "Gol! Sassuolo 1, Frosinone 1. Aleksa
  // Terzic…") em vez de preso no último evento com tipo.
  interface Linha {
    texto: string; slug: string; rotuloEspn: string;
    equipa: 'casa' | 'fora' | null; minuto: string; jogador: string | null;
  }
  const minParaSeg = (m: string) => {
    const base = Number((m.match(/(\d+)/) ?? [])[1]);
    const extra = Number((m.match(/\+\s*(\d+)/) ?? [])[1]) || 0;
    return Number.isFinite(base) ? (base + extra) * 60 : 0;
  };
  const linhas: Linha[] = [];
  for (const c of coment) {
    const texto = (txt(c.text) ?? '').trim();
    const play = obj(c.play);
    const slug = txt(obj(play.type).type) ?? '';
    if (!texto && !slug) continue;
    let equipa = ladoDe(txt(obj(play.team).displayName));
    if (!equipa && texto) {
      const t = texto.toLowerCase();
      const ec = t.includes(casaBaixo);
      const ef = t.includes(foraBaixo);
      equipa = ec && !ef ? 'casa' : ef && !ec ? 'fora' : null;
    }
    const atleta = obj(lista(play.athletesInvolved)[0]);
    linhas.push({
      texto,
      slug,
      rotuloEspn: txt(obj(play.type).text) ?? '',
      equipa,
      minuto: txt(obj(c.time).displayValue) ?? '',
      jogador: txt(atleta.displayName) ?? txt(atleta.shortName) ?? null,
    });
  }

  // "Agora" = o mais recente entre os lances com relógio e o minuto da última
  // linha de texto. Sem isto, um jogo cujo feed estruturado parou mas o texto
  // continua a andar ficava marcado como "parado".
  const agora = Math.max(
    ...lances.map(l => l.t),
    ...linhas.map(l => minParaSeg(l.minuto)),
  );
  const JANELA = 6 * 60;

  // O relógio a sério vem do header (continua a andar mesmo quando o feed de
  // comentário congela). Sem ele, um jogo com comentário parado ficava preso
  // no último evento — "Substituição 45'" enquanto o cronómetro já ia nos 56'.
  // O `clock` numérico costuma vir a zero em jogos de divisões menores, por
  // isso também se lê o `displayClock` ("56'") e converte-se a segundos.
  const stStatus = obj(obj(lista(obj(json.header).competitions)[0]).status);
  const stClock = Number(txt(stStatus.clock));
  const stDisplay = Number((txt(stStatus.displayClock) ?? '').match(/\d+/)?.[0]) * 60;
  const relogioAgora = Math.max(
    agora,
    Number.isFinite(stClock) ? stClock : 0,
    Number.isFinite(stDisplay) ? stDisplay : 0,
  );

  let presCasa = 0;
  let presFora = 0;
  for (const l of lances) {
    const idade = agora - l.t;
    if (idade > JANELA || !l.equipa) continue;
    const recencia = 1 - idade / JANELA;
    if (l.slug === 'foul') {
      // A falta tira balanço a quem a cometeu.
      if (l.equipa === 'casa') presCasa -= 0.5 * recencia;
      else presFora -= 0.5 * recencia;
      continue;
    }
    const peso = (PESO_LANCE[l.slug] ?? 0.8) * recencia;
    if (l.equipa === 'casa') presCasa += peso;
    else presFora += peso;
  }
  presCasa = Math.max(0, presCasa);
  presFora = Math.max(0, presFora);
  const total = presCasa + presFora;
  const casa = total > 0 ? Math.round((presCasa / total) * 100) : 50;
  const fora = 100 - casa;

  // Comentário congelado: o cronómetro já foi bem para a frente e o último
  // lance é história. Não repetimos o evento antigo, mas continuamos a marcar
  // o lado dominante pela pressão recente — é o que dá a sensação de a bola
  // andar de um lado para o outro entre atualizações. O `wallclock` de cada
  // lance é a hora real e é o sinal mais fiável de que o feed secou.
  const wallRecente = Math.max(0, ...lances.map(l => l.wall));
  const feedParado = relogioAgora - agora > 150
    || (wallRecente > 0 && Date.now() - wallRecente > 150_000);

  const nome = (lado: 'casa' | 'fora' | null) =>
    lado === 'casa' ? casaNome : lado === 'fora' ? foraNome : '';
  const rotuloDe = (l: { slug: string; rotuloEspn: string; texto: string }) =>
    l.rotuloEspn || (l.slug ? rotularLance(l.slug) : rotularDoTexto(l.texto) ?? '');

  // Quem tem a bola: com feed vivo é a equipa da última linha do relato com
  // equipa identificada (segue os passes e os roubos de bola linha a linha);
  // com feed parado, o lado com mais pressão na janela.
  let posse: 'casa' | 'fora' | null;
  if (feedParado) {
    posse = presCasa > presFora ? 'casa' : presFora > presCasa ? 'fora' : null;
  } else {
    posse = [...linhas].reverse().find(l => l.equipa)?.equipa
      ?? [...lances].reverse().find(l => l.equipa)?.equipa ?? null;
  }

  // A `fase` ao centro segue a última linha do relato (não fica presa no último
  // evento com tipo). Golo, cartão e penálti passam pelo `destaque`, não por
  // aqui, senão ficava "Golo" sem contexto depois de a cápsula fechar.
  const linhaFase = feedParado
    ? undefined
    : [...linhas].reverse().find(l => {
        const r = rotuloDe(l);
        return r && !ROTULOS_NOTAVEIS.has(r);
      });
  // Nunca inventamos "Ataque" — ou é o rótulo real da última linha do relato,
  // ou fica "Bola em jogo" (a bola no campo é que conta a história).
  const fase = linhaFase ? rotuloDe(linhaFase) : 'Bola em jogo';

  // Destaque ao centro: um evento marcante acabado de acontecer, com a equipa
  // do lance. Golos, penáltis e vermelhos ficam bem mais tempo do que um
  // canto ou um remate.
  const DESTAQUE_LONGO = new Set([
    'goal', 'own-goal', 'penalty---scored', 'penalty---saved', 'penalty---missed', 'red-card',
  ]);
  const notavel = [...lances].reverse().find(l => EVENTO_NOTAVEL.has(l.slug));
  const janelaDestaque = notavel && DESTAQUE_LONGO.has(notavel.slug) ? 240 : 110;
  const destaque = notavel && relogioAgora - notavel.t <= janelaDestaque && FASE_LANCE[notavel.slug]
    ? { texto: FASE_LANCE[notavel.slug], equipa: notavel.equipa }
    : null;

  // Painel "última jogada": a linha mais recente do relato, com a FRASE inteira
  // da ESPN (ex. "Gol! Sassuolo 1, Frosinone 1. Aleksa Terzic (Frosinone)
  // finalização com o pé esquerdo… Assistência de Luis Hasa."), o rótulo dela
  // ("Gol", "Falta", "Tentativa de carrinho"…) e o escudo da equipa.
  const ultimaLinha = linhas[linhas.length - 1] ?? null;
  const lance = ultimaLinha
    ? (() => {
        const r = rotuloDe(ultimaLinha);
        return `${r}${ultimaLinha.equipa ? ` · ${nome(ultimaLinha.equipa)}` : ''}`;
      })()
    : '';
  const ultimaJogada = ultimaLinha
    ? (() => {
        const rot = rotuloDe(ultimaLinha) || 'Lance';
        const eq = nome(ultimaLinha.equipa);
        const descricao = (ultimaLinha.texto && paraPortugalPT(ultimaLinha.texto))
          || (ultimaLinha.jogador
            ? `${ultimaLinha.jogador}${eq ? ` (${eq})` : ''} ${rot}${ultimaLinha.minuto ? ` aos ${ultimaLinha.minuto}` : ''}`
            : `${rot}${eq ? ` · ${eq}` : ''}${ultimaLinha.minuto ? ` · ${ultimaLinha.minuto}` : ''}`);
        return {
          rotulo: rot,
          descricao,
          jogador: ultimaLinha.jogador,
          equipa: ultimaLinha.equipa,
          minuto: ultimaLinha.minuto,
          tipo: ultimaLinha.slug
            ? tipoDoLance(ultimaLinha.slug)
            : classificarTipoEvento(ultimaLinha.texto),
        };
      })()
    : null;

  // Onde foi a última jogada, em % do campo. A casa ataca para a direita, por
  // isso o X da ESPN (0 = baliza da casa, 100 = baliza adversária) serve tal
  // e qual. Sem feed fresco não se finge posição.
  const comCoord = feedParado ? undefined : [...lances].reverse().find(l => l.x != null);

  // A maioria dos jogos não traz `fieldPositionX/Y` da ESPN. Com feed vivo
  // aproxima-se a zona da bola pelo tipo de lance e por quem o fez: a casa
  // ataca para a direita (x→100), por isso um remate/canto da casa cai no
  // terço ofensivo direito, uma falta fica mais atrás, etc. Não é a posição
  // exacta — é o suficiente para a bola saltar pelo campo a acompanhar o jogo.
  const zonaAprox = (l: Lance): { x: number; y: number } | null => {
    if (!l.equipa) return null;
    const casaLado = l.equipa === 'casa';
    const dir = (n: number) => (casaLado ? n : 100 - n);
    let bx: number;
    if (/goal|shot|penalty|corner|header|save/.test(l.slug)) bx = dir(82);
    else if (/free-?kick|offside/.test(l.slug)) bx = dir(62);
    else if (l.slug === 'foul') bx = dir(44);
    else bx = dir(60);
    return { x: bx, y: 28 + (Math.abs(Math.round(l.t / 20)) % 7) * 7.3 };
  };

  const ultimaZona = feedParado
    ? null
    : [...lances].reverse().map(zonaAprox).find((p): p is { x: number; y: number } => p != null) ?? null;
  // Com o feed congelado a bola não desaparece — fica pousada na última
  // coordenada real que a ESPN publicou (como no LastPlays da ESPN), em vez de
  // sumir do campo.
  const ultimoReal = [...lances].reverse().find(l => l.x != null && l.y != null);
  const bolaX = comCoord?.x ?? ultimaZona?.x ?? ultimoReal?.x ?? null;
  const bolaY = comCoord?.y ?? ultimaZona?.y ?? ultimoReal?.y ?? null;
  const bolaReal = comCoord?.x != null || (ultimaZona?.x == null && ultimoReal?.x != null);

  // Passos reais: as coordenadas publicadas pela ESPN nos últimos lances. A
  // bola percorre-as em sequência (o "ataque a formar-se"); sem elas fica
  // parada na última posição — a ESPN não dá feed posicional contínuo público.
  const bolaPassos: { x: number; y: number }[] = [];
  if (!feedParado) {
    const reais = lances
      .filter(l => l.x != null && l.y != null)
      .slice(-6)
      .map(l => ({ x: l.x as number, y: l.y as number }));
    for (const p of reais) {
      const u = bolaPassos[bolaPassos.length - 1];
      if (!u || Math.hypot(u.x - p.x, u.y - p.y) > 0.8) bolaPassos.push(p);
    }
  }

  return {
    casa, fora, posse, fase, destaque, lance, bolaX, bolaY, bolaReal, bolaPassos, ultimaJogada,
    minuto: ultimaLinha?.minuto || lances[lances.length - 1].minuto,
  };
}

/** Placar + relógio + estado, lidos do header do summary. É a mesma fonte do
 *  `commentary`, por isso o minuto casa com o do mini-campo. */
function patchVivoDoSummary(json: Bruto): PatchVivo | null {
  const comp = obj(lista(obj(json.header).competitions)[0]);
  const cs = lista(comp.competitors).map(obj);
  if (cs.length < 2) return null;
  const casa = obj(cs.find(c => c.homeAway === 'home') ?? cs[0]);
  const fora = obj(cs.find(c => c.homeAway === 'away') ?? cs[1]);

  const st = obj(comp.status ?? obj(json.header).status);
  const tipo = obj(st.type);
  const detail = txt(tipo.detail) ?? txt(tipo.shortDetail) ?? '';
  const estado = mapearEstado(txt(tipo.state) ?? 'pre', Boolean(tipo.completed), detail);

  const golo = (c: Bruto) => {
    const n = Number(txt(c.score));
    return Number.isFinite(n) ? n : null;
  };

  let relogio: string;
  if (estado === 'intervalo') relogio = 'Intervalo';
  else if (estado === 'terminado') relogio = 'Final';
  else if (estado === 'ao_vivo') relogio = txt(st.displayClock) ?? txt(st.clock) ?? detail;
  else relogio = detail;

  // Resultado ao intervalo: o 1.º valor dos linescores de cada equipa. Só se
  // mostra depois de o jogo passar o intervalo — antes disso ainda muda.
  const primeiroLinescore = (c: Bruto) => {
    const ls = lista(c.linescores).map(obj);
    const n = Number(txt(ls[0]?.value ?? ls[0]?.displayValue));
    return Number.isFinite(n) ? n : null;
  };
  const periodo = Number(txt(st.period));
  const passouIntervalo = estado === 'intervalo' || estado === 'terminado'
    || (Number.isFinite(periodo) && periodo >= 2);
  const htCasa = passouIntervalo ? primeiroLinescore(casa) : null;
  const htFora = passouIntervalo ? primeiroLinescore(fora) : null;

  return {
    golosCasa: golo(casa), golosFora: golo(fora), estado, relogio, htCasa, htFora,
  };
}

/** IDs das duas equipas, lidos do header — a chave para casar `rosters`,
 *  `leaders` e `lastFiveGames` (que vêm por `team.id`) com casa/fora. */
function idsDoJogo(json: Bruto): { idCasa: string | null; idFora: string | null } {
  const comp = obj(lista(obj(json.header).competitions)[0]);
  const cs = lista(comp.competitors).map(obj);
  const casa = obj((cs.find(c => c.homeAway === 'home') ?? cs[0] ?? {}).team);
  const fora = obj((cs.find(c => c.homeAway === 'away') ?? cs[1] ?? {}).team);
  return { idCasa: txt(casa.id), idFora: txt(fora.id) };
}

/** Coordenadas em % de cada lugar de uma formação ("4-2-3-1"), pela ordem do
 *  `formationPlace` da ESPN (1 = guarda-redes). A casa ocupa a metade
 *  esquerda; o campo do lado de fora é o espelho. */
/** Ponto no campo (x = profundidade 5..47, y = largura 0..100) a partir do
 *  nome/abreviatura da posição da ESPN ("Center Left Defender", "CD-L", …).
 *  Assim um DM fica mais recuado que um AM, os alas ficam abertos, etc. */
function pontoPorPosicao(nome: string, abbr: string): { x: number; y: number } {
  const n = `${nome} ${abbr}`.toLowerCase();
  let x = 27;
  if (/goalkeeper|\bg\b|\bgk\b/.test(n)) x = 6;
  else if (/sweeper|\bsw\b/.test(n)) x = 13;
  else if (/wing.?back|\bwb\b/.test(n)) x = 22;
  else if (/back|defender|\bcd\b|\blb\b|\brb\b|\bcb\b|\bd\b/.test(n)) x = 17;
  else if (/defensive mid|\bdm\b/.test(n)) x = 25;
  else if (/attacking mid|\bam\b/.test(n)) x = 37;
  else if (/midfield|\bcm\b|\blm\b|\brm\b|\bm\b/.test(n)) x = 31;
  else if (/forward|striker|wing|\bcf\b|\bst\b|\blw\b|\brw\b|\bw\b|\bf\b/.test(n)) x = 45;
  let y = 50;
  if (/center left|left center|-l\b/.test(n)) y = 37;
  else if (/center right|right center|-r\b/.test(n)) y = 63;
  else if (/\bleft\b|\blb\b|\blm\b|\blw\b|\blwb\b/.test(n)) y = 14;
  else if (/\bright\b|\brb\b|\brm\b|\brw\b|\brwb\b/.test(n)) y = 86;
  return { x, y };
}

/** Nivela a profundidade de cada linha e distribui os jogadores pela largura
 *  de forma uniforme, mantendo a ordem esquerda→direita dada pela posição.
 *  Linhas maiores abrem mais (alas); linhas de 2-3 ficam mais ao centro. */
function espalharLinhas(pts: { x: number; y: number }[]): void {
  const linhas = new Map<number, number[]>();
  pts.forEach((p, i) => {
    const k = Math.round(p.x / 5);
    const arr = linhas.get(k) ?? [];
    arr.push(i);
    linhas.set(k, arr);
  });
  // Distribui as linhas uniformemente em profundidade (GR atrás → avançados
  // à frente), para que nenhuma formação fique com bandas apertadas ou vazias.
  const chaves = [...linhas.keys()].sort((a, b) => a - b);
  chaves.forEach((chave, r) => {
    const idxs = linhas.get(chave)!;
    const x = chaves.length > 1 ? 6 + (r / (chaves.length - 1)) * 40 : 26;
    idxs.forEach(i => { pts[i].x = x; });
    const n = idxs.length;
    if (n < 2) { if (n === 1) pts[idxs[0]].y = 50; return; }
    idxs.sort((a, b) => pts[a].y - pts[b].y);
    const margem = n >= 4 ? 10 : n === 3 ? 22 : 34;
    idxs.forEach((idx, j) => {
      pts[idx].y = margem + (j / (n - 1)) * (100 - 2 * margem);
    });
  });
}

function coordsFormacao(formacao: string): { x: number; y: number }[] {
  const linhas = [1, ...formacao.split('-').map(n => parseInt(n, 10)).filter(Boolean)];
  const pts: { x: number; y: number }[] = [];
  linhas.forEach((qtd, li) => {
    const x = linhas.length > 1 ? 5 + (li / (linhas.length - 1)) * 42 : 25;
    for (let k = 0; k < qtd; k++) {
      pts.push({ x, y: ((k + 1) / (qtd + 1)) * 100 });
    }
  });
  return pts;
}

/** Evento em bruto para cruzar com a escalação (golos, cartões, trocas).
 *  `principal` é o protagonista (o marcador, o substituído a entrar, o
 *  jogador advertido); `nomes` inclui também os secundários (assistente,
 *  jogador a sair). */
interface EventoCru {
  slug: string;
  equipa: 'casa' | 'fora' | null;
  minuto: string;
  principal: string;
  nomes: string[];
}

/**
 * Os golos, cartões e substituições de um jogo. A ESPN publica isto de
 * duas formas: `header.competitions[0].details` (só golos, no fim do jogo)
 * e `commentary[].play` (relato ao minuto, com cartões e trocas). A
 * commentary é a fonte completa; os details servem de recurso.
 */
function eventosCrus(json: Bruto): EventoCru[] {
  const comp = obj(lista(obj(json.header).competitions)[0]);
  const equipas = lista(comp.competitors).map(obj);
  const casaComp = obj(equipas.find(c => c.homeAway === 'home')?.team ?? {});
  const foraComp = obj(equipas.find(c => c.homeAway === 'away')?.team ?? {});
  const idCasa = txt(casaComp.id);
  const idFora = txt(foraComp.id);
  const nomesLado = (t: Bruto): string[] =>
    [txt(t.displayName), txt(t.name), txt(t.shortDisplayName), txt(t.abbreviation)]
      .map(x => (x ?? '').toLowerCase()).filter(Boolean);
  const nomesCasa = nomesLado(casaComp);
  const nomesFora = nomesLado(foraComp);

  // O lado por id (details) ou, quando só há o nome (commentary), pelo nome.
  // Nunca "adivinha": se não bate com nenhuma equipa, devolve null.
  const lado = (t: Bruto): 'casa' | 'fora' | null => {
    const id = txt(t.id);
    if (id && idCasa && id === idCasa) return 'casa';
    if (id && idFora && id === idFora) return 'fora';
    const nomes = nomesLado(t);
    if (nomes.some(n => nomesCasa.includes(n))) return 'casa';
    if (nomes.some(n => nomesFora.includes(n))) return 'fora';
    return null;
  };

  const norm = (d: Bruto): EventoCru => {
    const tipo = obj(d.type);
    const atletas = [
      ...lista(d.athletesInvolved).map(obj),
      ...lista(d.participants).map(p => obj(obj(p).athlete)),
    ].map(a => txt(a.displayName) ?? txt(a.shortName) ?? '').filter(Boolean);
    return {
      slug: (txt(tipo.type) ?? txt(tipo.text) ?? txt(tipo.id) ?? '').toLowerCase(),
      equipa: lado(obj(d.team)),
      minuto: txt(obj(d.clock).displayValue) ?? '',
      principal: atletas[0] ?? '',
      nomes: atletas,
    };
  };

  const daCommentary = lista(json.commentary).map(obj)
    .map(c => obj(c.play))
    .filter(p => Object.keys(p).length > 0)
    .map(norm);
  if (daCommentary.length > 0) return daCommentary;
  return lista(comp.details).map(obj).map(norm);
}

/** O evento é um golo a contar para o marcador (inclui grande penalidade
 *  convertida, exclui autogolos)? */
function eventoGolo(slug: string): boolean {
  if (/own|disallow|cancel|missed|saved|no-?goal|var|ruled-out/.test(slug)) return false;
  if (slug.includes('goal')) return true;
  return slug.includes('penalty') && slug.includes('scored');
}

/** Cartão vermelho — direto ou segundo amarelo. Casa "red card", "red-card",
 *  "yellow red card" e "sent off", mas nunca "scored" (que acaba em "red"). */
function eventoVermelho(slug: string): boolean {
  return /red[\s-]?card/.test(slug) || /sent[\s-]?off/.test(slug) || slug.includes('sending-off');
}
/** Amarelo simples: o segundo amarelo conta como vermelho, não aqui. */
function eventoAmarelo(slug: string): boolean {
  return /yellow[\s-]?card/.test(slug) && !slug.includes('red');
}

/** Um nome de evento (displayName) refere-se a este atleta? Aguenta
 *  "J. Solis" vs "Jhon Solis" sem confundir jogadores que só partilham o
 *  apelido ("Jota Silva" vs "Thiago Silva"). */
function palavrasNome(s: string): string[] {
  return s.toLowerCase().split(/[\s.\-]+/).filter(w => w.length > 1);
}
function nomesBatem(pe: string[], pa: string[]): boolean {
  if (!pe.length || !pa.length) return false;
  const [curto, longo] = pe.length <= pa.length ? [pe, pa] : [pa, pe];
  // Nome com uma só palavra: só casa se for o apelido do outro ("Solis").
  if (curto.length === 1) return curto[0] === longo[longo.length - 1];
  // Caso contrário, todas as palavras do mais curto têm de estar no mais longo.
  return curto.every(w => longo.includes(w));
}
function mesmoJogador(nomeEvento: string, at: Bruto): boolean {
  const e = nomeEvento.toLowerCase().trim();
  if (!e) return false;
  const pe = palavrasNome(e);
  for (const bruto of [txt(at.displayName), txt(at.shortName)]) {
    const alvo = (bruto ?? '').toLowerCase().trim();
    if (!alvo) continue;
    if (alvo === e) return true;
    if (nomesBatem(pe, palavrasNome(alvo))) return true;
  }
  return false;
}

function mapearLadoEscalacao(roster: Bruto, casa: boolean, evs: EventoCru[]): LadoEscalacao {
  const formacao = txt(roster.formation) ?? '';
  const fallback = coordsFormacao(formacao || '4-4-2');
  const jogadores = lista(roster.roster).map(obj);
  const lado: 'casa' | 'fora' = casa ? 'casa' : 'fora';
  const meus = evs.filter(e => e.equipa === lado);

  // "T. Wilke" → "Wilke": tira as iniciais abreviadas do início do nome.
  const semInicial = (n: string): string =>
    n.replace(/^(?:\p{L}\.[\s ]*)+/u, '').trim() || n;

  const titularesRaw = jogadores.filter(p => p.starter === true);
  const pts = titularesRaw.map((p, i) => {
    const pos = obj(p.position);
    const nome = txt(pos.name);
    const abbr = txt(pos.abbreviation);
    if (nome || abbr) return pontoPorPosicao(nome ?? '', abbr ?? '');
    const lugar = Number(txt(p.formationPlace));
    return fallback[(Number.isFinite(lugar) && lugar > 0 ? lugar : i + 1) - 1] ?? { x: 25, y: 50 };
  });
  espalharLinhas(pts);

  const titulares: JogadorCampo[] = titularesRaw
    .map((p, i) => {
      const at = obj(p.athlete);
      const lugar = Number(txt(p.formationPlace));
      const c = pts[i];
      // Golos e cartões contam só quando o jogador é o protagonista do lance
      // (não quando aparece como assistente).
      const meusLances = meus.filter(e => mesmoJogador(e.principal, at));
      const pos = txt(obj(p.position).abbreviation);
      return {
        numero: txt(p.jersey) ?? '',
        nome: semInicial(txt(at.shortName) ?? txt(at.displayName) ?? ''),
        x: casa ? c.x : 100 - c.x,
        y: c.y,
        saiu: p.subbedOut === true,
        guardaRedes: lugar === 1 || pos === 'G' || pos === 'GK',
        golos: meusLances.filter(e => eventoGolo(e.slug)).length,
        amarelo: meusLances.some(e => eventoAmarelo(e.slug)),
        vermelho: meusLances.some(e => eventoVermelho(e.slug)),
      };
    });

  // "Jefferson Castillo" → tenta casar com um titular e devolve-o (para usar o
  // apelido curto e aproveitar os golos/cartões já calculados).
  const titularPorNome = (nome: string): JogadorCampo | undefined =>
    titulares.find(tt => {
      const ap = nome.toLowerCase().split(' ').pop() ?? '';
      return ap.length > 2 && tt.nome.toLowerCase().includes(ap);
    });

  const suplentes: Suplente[] = jogadores
    .filter(p => p.starter !== true)
    .map(p => {
      const at = obj(p.athlete);
      const entrou = p.subbedIn === true;
      const troca = entrou
        ? meus.find(e => e.slug.includes('substitution')
            && e.nomes.some(n => mesmoJogador(n, at)))
        : undefined;
      // Na commentary o protagonista da troca é quem entra; o outro nome é
      // quem sai. Nos details antigos vinham os dois sem ordem garantida.
      const saiuPorCru = troca
        ? (mesmoJogador(troca.principal, at)
            ? troca.nomes[1]
            : troca.nomes.find(n => !mesmoJogador(n, at)))
          ?? null
        : null;
      const saiuTit = saiuPorCru ? titularPorNome(saiuPorCru) : undefined;
      const meusLances = meus.filter(e => mesmoJogador(e.principal, at));
      return {
        numero: txt(p.jersey) ?? '',
        nome: semInicial(txt(at.shortName) ?? txt(at.displayName) ?? ''),
        entrou,
        minuto: troca?.minuto ?? null,
        saiuPor: saiuPorCru ? (saiuTit?.nome ?? saiuPorCru) : null,
        golos: meusLances.filter(e => eventoGolo(e.slug)).length,
        amarelo: meusLances.some(e => eventoAmarelo(e.slug)),
        vermelho: meusLances.some(e => eventoVermelho(e.slug)),
        saiuGolos: saiuTit?.golos ?? 0,
        saiuAmarelo: saiuTit?.amarelo ?? false,
        saiuVermelho: saiuTit?.vermelho ?? false,
      };
    });

  return { formacao, titulares, suplentes };
}

function mapearEscalacoes(json: Bruto): Escalacoes | null {
  const rosters = lista(json.rosters).map(obj);
  if (rosters.length < 2) return null;
  const casa = rosters.find(r => r.homeAway === 'home') ?? rosters[0];
  const fora = rosters.find(r => r.homeAway === 'away') ?? rosters[1];
  const evs = eventosCrus(json);
  const e: Escalacoes = {
    casa: mapearLadoEscalacao(casa, true, evs),
    fora: mapearLadoEscalacao(fora, false, evs),
    corCasa: txt(obj(casa.team).color) ?? null,
    corFora: txt(obj(fora.team).color) ?? null,
  };
  // Sem titulares dos dois lados não vale a pena desenhar o campo.
  return e.casa.titulares.length && e.fora.titulares.length ? e : null;
}

/** Rótulo em PT para as métricas de "Líderes do jogo". */
const ROTULO_LIDER: Record<string, string> = {
  totalShots: 'Remates',
  accuratePasses: 'Passes certos',
  defensiveInterventions: 'Ações defensivas',
  saves: 'Defesas',
  goals: 'Golos',
  assists: 'Assistências',
};

function mapearLideres(json: Bruto, idCasa: string | null, idFora: string | null): LiderJogo[] {
  const blocos = lista(json.leaders).map(obj);
  if (blocos.length < 2) return [];

  const doLado = (id: string | null) =>
    obj(blocos.find(b => txt(obj(b.team).id) === id) ?? {});
  const casa = doLado(idCasa);
  const fora = doLado(idFora);

  const extrair = (bloco: Bruto, chave: string): { nome: string; valor: string } | null => {
    const grupo = obj(lista(bloco.leaders).find(g => txt(obj(g).name) === chave) ?? {});
    const primeiro = obj(lista(grupo.leaders)[0]);
    const nome = txt(obj(primeiro.athlete).shortName) ?? txt(obj(primeiro.athlete).displayName);
    const valor = txt(primeiro.displayValue);
    return nome && valor !== null ? { nome, valor } : null;
  };

  const chaves = new Set<string>();
  for (const b of [casa, fora]) {
    for (const g of lista(b.leaders).map(obj)) {
      const n = txt(g.name);
      if (n) chaves.add(n);
    }
  }

  return [...chaves]
    .filter(c => c in ROTULO_LIDER)
    .map(c => ({ rotulo: ROTULO_LIDER[c], casa: extrair(casa, c), fora: extrair(fora, c) }))
    .filter(l => l.casa || l.fora);
}

/** Emblema de uma equipa, tolerando `logo` string ou `logos[].href`. */
function logoEquipa(t: Bruto): string | null {
  return txt(obj(t).logo) ?? txt(obj(lista(obj(t).logos)[0]).href) ?? null;
}

function mapearForma(json: Bruto, id: string | null): ResultadoForma[] {
  const bloco = obj(lista(json.lastFiveGames).find(b => txt(obj(obj(b).team).id) === id) ?? {});
  return lista(bloco.events).map(obj).map((e): ResultadoForma => {
    const r = (txt(e.gameResult) ?? '').toUpperCase();
    const resultado = r === 'W' ? 'V' : r === 'L' ? 'D' : 'E';
    const adv = obj(e.opponent);
    return {
      resultado,
      placar: txt(e.score) ?? '',
      emCasa: txt(e.atVs) === 'vs',
      adversario: txt(adv.displayName) ?? txt(adv.abbreviation) ?? '',
      logoAdversario: logoEquipa(adv),
      data: txt(e.gameDate) ?? '',
    };
  }).filter(f => f.placar);
}

function mapearH2H(json: Bruto): HeadToHead | null {
  const serie = obj(lista(json.seasonseries).find(s => txt(obj(s).type) === 'head-to-head')
    ?? lista(json.seasonseries)[0] ?? {});
  const eventos = lista(serie.events).map(obj);
  if (eventos.length === 0) return null;

  const jogos: ConfrontoH2H[] = eventos
    .filter(e => obj(obj(e.statusType)).completed === true || txt(e.status) === 'post')
    .map((e): ConfrontoH2H => {
      const cs = lista(e.competitors).map(obj);
      const casa = obj(cs.find(c => c.homeAway === 'home') ?? cs[0] ?? {});
      const fora = obj(cs.find(c => c.homeAway === 'away') ?? cs[1] ?? {});
      const golo = (c: Bruto) => {
        const n = Number(txt(c.score));
        return Number.isFinite(n) ? n : null;
      };
      return {
        data: txt(e.date) ?? '',
        casa: txt(obj(casa.team).displayName) ?? txt(obj(casa.team).abbreviation) ?? '',
        fora: txt(obj(fora.team).displayName) ?? txt(obj(fora.team).abbreviation) ?? '',
        logoCasa: logoEquipa(obj(casa.team)),
        logoFora: logoEquipa(obj(fora.team)),
        golosCasa: golo(casa),
        golosFora: golo(fora),
      };
    });

  // "FOR leads series 3-2" / "Series tied 2-2" → PT.
  const bruto = txt(serie.summary) ?? '';
  const placar = bruto.match(/(\d+)-(\d+)/);
  const abrev = bruto.match(/^([A-Z]{2,4})\b/);
  let resumo = bruto;
  if (/tied/i.test(bruto) && placar) resumo = `Empatado ${placar[1]}-${placar[2]}`;
  else if (abrev && placar) resumo = `${abrev[1]} lidera ${placar[1]}-${placar[2]}`;

  return jogos.length ? { resumo, jogos } : null;
}

/** Valor de uma métrica na lista `stats` de uma entrada da classificação. */
function valorStat(stats: unknown[], nome: string): string {
  const s = stats.map(obj).find(x => txt(x.name) === nome);
  if (!s) return '';
  return txt(s.displayValue) ?? String(txt(s.value) ?? '');
}

/** Tabela classificativa da competição, quando a ESPN a inclui no summary.
 *  Tolera as várias formas em que o bloco `standings` aparece. */
function mapearClassificacao(
  json: Bruto, idCasa: string | null, idFora: string | null,
): Classificacao | null {
  const raiz = obj(json.standings);
  let entradas = lista(raiz.entries).map(obj);
  let titulo = (txt(raiz.header) ?? txt(raiz.displayName) ?? txt(raiz.name) ?? '')
    .replace(/\s*standings\s*$/i, '');
  if (entradas.length === 0) {
    for (const g of lista(raiz.groups).map(obj)) {
      const es = lista(obj(g.standings).entries).map(obj);
      if (es.length) {
        entradas = es;
        titulo = (txt(g.header) ?? txt(g.name) ?? titulo).replace(/\s*standings\s*$/i, '');
        break;
      }
    }
  }
  if (entradas.length === 0) return null;

  const linhas: LinhaClassificacao[] = entradas.map((e, i) => {
    const stats = lista(e.stats);
    // Na classificação do summary, `team` é só o nome (string) e o emblema
    // vem numa lista `logo`/`logos`; o id fica à parte, em `e.id`.
    const time = obj(e.team);
    const id = txt(e.id) ?? txt(time.id);
    const rank = Number(valorStat(stats, 'rank'));
    return {
      posicao: Number.isFinite(rank) && rank > 0 ? rank : i + 1,
      equipa: txt(e.team) ?? txt(time.shortDisplayName) ?? txt(time.displayName)
        ?? txt(time.abbreviation) ?? '',
      logo: txt(obj(lista(e.logo)[0]).href) ?? logoEquipa(time)
        ?? (id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : null),
      jogos: valorStat(stats, 'gamesPlayed'),
      vitorias: valorStat(stats, 'wins'),
      empates: valorStat(stats, 'ties'),
      derrotas: valorStat(stats, 'losses'),
      diferenca: valorStat(stats, 'pointDifferential'),
      pontos: valorStat(stats, 'points'),
      destaque: !!id && (id === idCasa || id === idFora),
    };
  }).sort((a, b) => a.posicao - b.posicao);

  return { titulo: titulo || 'Classificação', linhas };
}

/** Estatísticas + eventos + momentum de um jogo. Falha em silêncio (devolve
 *  vazio) — a ESPN nem sempre publica isto, sobretudo antes de começar. */
export async function carregarDetalhesJogo(ligaSlug: string, eventoId: string): Promise<DetalhesJogo> {
  try {
    // `_` corta a cache do CDN da ESPN — sem isto o relato podia chegar
    // atrasado alguns pedidos (parecia "delay" nos eventos).
    const res = await fetch(
      `${BASE}/${ligaSlug}/summary?event=${eventoId}&lang=pt&region=pt&_=${Date.now()}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return DETALHES_VAZIO;
    const json = obj(await res.json());
    const { casa, fora } = nomesDoSummary(json);
    const { idCasa, idFora } = idsDoJogo(json);
    return {
      estatisticas: mapearEstatisticas(json),
      eventos: mapearEventos(json),
      comentario: mapearComentario(json, casa, fora),
      momento: mapearMomento(json, casa, fora),
      vivo: patchVivoDoSummary(json),
      escalacoes: mapearEscalacoes(json),
      lideres: mapearLideres(json, idCasa, idFora),
      formaCasa: mapearForma(json, idCasa),
      formaFora: mapearForma(json, idFora),
      h2h: mapearH2H(json),
      classificacao: mapearClassificacao(json, idCasa, idFora),
    };
  } catch {
    return DETALHES_VAZIO;
  }
}
