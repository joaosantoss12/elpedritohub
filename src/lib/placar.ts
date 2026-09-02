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
      || (texto.includes('red') && !texto.includes('yellow'))
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
  /** As últimas jogadas com coordenada (antiga → recente), em % do campo. Serve
   *  para animar a bola a deslizar de lance em lance, no espírito do "LastPlays"
   *  da ESPN, em vez de aparecer só o último ponto. */
  bolaTrilho: { x: number; y: number }[];
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

/** Rótulo em PT para o último lance mostrado por baixo do campo. */
const ROTULO_LANCE: Record<string, string> = {
  'goal': 'Golo', 'own-goal': 'Autogolo',
  'penalty---scored': 'Penálti', 'penalty---saved': 'Penálti defendido',
  'penalty---missed': 'Penálti falhado',
  'shot-on-target': 'Remate à baliza', 'shot-off-target': 'Remate para fora',
  'shot-blocked': 'Remate bloqueado', 'shot-hit-woodwork': 'Bola ao poste',
  'corner-awarded': 'Canto', 'offside': 'Fora de jogo', 'foul': 'Falta',
  'yellow-card': 'Amarelo', 'red-card': 'Vermelho', 'substitution': 'Substituição',
};

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
  if (s.includes('yellow')) return 'cartao_amarelo';
  if (s.includes('red')) return 'cartao_vermelho';
  if (s.includes('substitution')) return 'substituicao';
  return 'outro';
}

/** Do slug do `commentary` (ex. 'red-card', 'penalty---scored') para o tipo. */
function tipoDoComentario(slug: string): TipoEvento {
  if (slug === 'goal' || slug === 'own-goal' || slug === 'penalty---scored') return 'golo';
  if (slug.includes('red') || slug.includes('second-yellow')) return 'cartao_vermelho';
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
      texto,
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
    x: number | null; y: number | null; wall: number;
  }

  const lances: Lance[] = [];
  for (const c of coment) {
    const play = obj(c.play);
    const t = Number(txt(obj(play.clock).value) ?? txt(obj(c.time).value));
    if (!Number.isFinite(t)) continue;
    const x = Number(txt(play.fieldPositionX));
    const y = Number(txt(play.fieldPositionY));
    const wall = Date.parse(txt(play.wallclock) ?? '');
    lances.push({
      t,
      slug: txt(obj(play.type).type) ?? '',
      equipa: ladoDe(txt(obj(play.team).displayName)),
      minuto: txt(obj(c.time).displayValue) ?? '',
      x: Number.isFinite(x) ? x : null,
      y: Number.isFinite(y) ? y : null,
      wall: Number.isFinite(wall) ? wall : 0,
    });
  }
  if (lances.length === 0) return null;

  const agora = Math.max(...lances.map(l => l.t));
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

  // Quem tem a bola: com feed vivo é a equipa do último lance; com feed
  // parado, o lado com mais pressão na janela. A falta passa a posse a quem
  // a sofreu.
  let posse: 'casa' | 'fora' | null;
  if (feedParado) {
    posse = presCasa > presFora ? 'casa' : presFora > presCasa ? 'fora' : null;
  } else {
    posse = [...lances].reverse().find(l => l.equipa)?.equipa ?? null;
  }
  // A `fase` é só o estado corrente (Ataque, Canto, Livre, Falta…). Os
  // momentos grandes — golo, cartão, penálti — passam sempre pelo `destaque`,
  // nunca por aqui, senão ficavam a mostrar "Golo" sem equipa depois de a
  // cápsula fechar.
  const ultimoFase = feedParado
    ? undefined
    : [...lances].reverse().find(l => l.slug in FASE_LANCE && !EVENTO_NOTAVEL.has(l.slug));
  if (ultimoFase?.slug === 'foul' && posse) posse = posse === 'casa' ? 'fora' : 'casa';
  const fase = ultimoFase ? FASE_LANCE[ultimoFase.slug] : posse ? 'Ataque' : 'Bola em jogo';

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

  const ultimo = [...lances].reverse().find(l => l.slug in ROTULO_LANCE);
  const nome = (lado: 'casa' | 'fora' | null) =>
    lado === 'casa' ? casaNome : lado === 'fora' ? foraNome : '';
  const lance = ultimo
    ? `${ROTULO_LANCE[ultimo.slug]}${ultimo.equipa ? ` · ${nome(ultimo.equipa)}` : ''}`
    : '';

  // Onde foi a última jogada, em % do campo. A casa ataca para a direita, por
  // isso o X da ESPN (0 = baliza da casa, 100 = baliza adversária) serve tal
  // e qual. Sem feed fresco não se finge posição.
  const comCoord = feedParado ? undefined : [...lances].reverse().find(l => l.x != null);
  const bolaX = comCoord?.x ?? null;
  const bolaY = comCoord?.y ?? null;

  // Rasto das últimas jogadas com coordenada (antiga → recente). Com feed
  // parado não se inventa movimento — fica só o ponto atual, se houver. Com
  // feed vivo puxa-se tudo o que traga coordenada (não só os lances notáveis),
  // para a bola ter pontos que cheguem para andar; pontos praticamente colados
  // são fundidos, senão a bola fica a tremer parada.
  const trilhoCru = feedParado
    ? (bolaX != null && bolaY != null ? [{ x: bolaX, y: bolaY }] : [])
    : lances
        .filter(l => l.x != null && l.y != null)
        .map(l => ({ x: l.x as number, y: l.y as number }));
  const bolaTrilho: { x: number; y: number }[] = [];
  for (const p of trilhoCru.slice(-16)) {
    const ult = bolaTrilho[bolaTrilho.length - 1];
    if (!ult || Math.hypot(ult.x - p.x, ult.y - p.y) > 1.2) bolaTrilho.push(p);
  }

  return {
    casa, fora, posse, fase, destaque, lance, bolaX, bolaY, bolaTrilho,
    minuto: ultimo?.minuto || lances[lances.length - 1].minuto,
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
  for (const idxs of linhas.values()) {
    const mx = idxs.reduce((s, i) => s + pts[i].x, 0) / idxs.length;
    idxs.forEach(i => { pts[i].x = mx; });
    const n = idxs.length;
    if (n < 2) { if (n === 1) pts[idxs[0]].y = 50; continue; }
    idxs.sort((a, b) => pts[a].y - pts[b].y);
    const margem = n >= 4 ? 10 : n === 3 ? 22 : 34;
    idxs.forEach((idx, j) => {
      pts[idx].y = margem + (j / (n - 1)) * (100 - 2 * margem);
    });
  }
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
  const idCasa = txt(casaComp.id);
  const nomeCasa = (txt(casaComp.displayName) ?? txt(casaComp.name) ?? '').toLowerCase();

  // O lado por id (details) ou, quando só há o nome (commentary), pelo nome.
  const lado = (t: Bruto): 'casa' | 'fora' | null => {
    const id = txt(t.id);
    if (id && idCasa) return id === idCasa ? 'casa' : 'fora';
    const nome = (txt(t.displayName) ?? txt(t.name) ?? '').toLowerCase();
    if (nome && nomeCasa) return nome === nomeCasa ? 'casa' : 'fora';
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

/** Um nome de evento (displayName) refere-se a este atleta? Compara pelo
 *  apelido para aguentar "J. Solis" vs "Jhon Solis". */
function mesmoJogador(nomeEvento: string, at: Bruto): boolean {
  const alvo = (txt(at.displayName) ?? '').toLowerCase().trim();
  const e = nomeEvento.toLowerCase().trim();
  if (!e || !alvo) return false;
  if (alvo === e) return true;
  const palavras = (s: string) => s.split(/[\s\-]+/).filter(w => w.length > 1);
  const pe = palavras(e);
  const pa = palavras(alvo);
  if (!pe.length || !pa.length) return false;
  // Todas as palavras de um lado contidas no outro ("Gibbs-White" ⊂ "Morgan Gibbs-White").
  if (pe.every(w => pa.includes(w)) || pa.every(w => pe.includes(w))) return true;
  // Mesmo apelido — mas confirma a inicial do nome próprio quando ambos a têm,
  // para não confundir "M. Gibbs-White" com um jogador chamado "D. White".
  const apA = pa[pa.length - 1];
  const apE = pe[pe.length - 1];
  if (apA.length <= 2 || apA !== apE) return false;
  if (pa.length > 1 && pe.length > 1) return pa[0][0] === pe[0][0];
  return true;
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
        amarelo: meusLances.some(e => e.slug.includes('yellow') && !e.slug.includes('red')),
        vermelho: meusLances.some(e => e.slug.includes('red')),
      };
    });

  const nomeCurto = (nome: string): string => {
    // "Jefferson Castillo" → tenta casar com um titular e usar o apelido curto.
    const t = titulares.find(tt => {
      const ap = nome.toLowerCase().split(' ').pop() ?? '';
      return ap.length > 2 && tt.nome.toLowerCase().includes(ap);
    });
    return t?.nome ?? nome;
  };

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
      const saiuPor = troca
        ? (mesmoJogador(troca.principal, at)
            ? troca.nomes[1]
            : troca.nomes.find(n => !mesmoJogador(n, at)))
          ?? null
        : null;
      return {
        numero: txt(p.jersey) ?? '',
        nome: semInicial(txt(at.shortName) ?? txt(at.displayName) ?? ''),
        entrou,
        minuto: troca?.minuto ?? null,
        saiuPor: saiuPor ? nomeCurto(saiuPor) : null,
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
    const res = await fetch(`${BASE}/${ligaSlug}/summary?event=${eventoId}`);
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
