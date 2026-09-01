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

  return {
    id,
    fonte: 'espn',
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
}

/** Placar/relógio lidos do mesmo summary, para a sala não mostrar dois
 *  minutos diferentes entre o marcador e o mini-campo. */
export interface PatchVivo {
  golosCasa: number | null;
  golosFora: number | null;
  estado: EstadoJogo;
  relogio: string;
}

export interface DetalhesJogo {
  estatisticas: EstatisticaJogo[];
  eventos: EventoJogo[];
  momento: MomentoJogo | null;
  vivo: PatchVivo | null;
}

const DETALHES_VAZIO: DetalhesJogo = {
  estatisticas: [], eventos: [], momento: null, vivo: null,
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

  return {
    casa, fora, posse, fase, destaque, lance, bolaX, bolaY,
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

  return { golosCasa: golo(casa), golosFora: golo(fora), estado, relogio };
}

/** Estatísticas + eventos + momentum de um jogo. Falha em silêncio (devolve
 *  vazio) — a ESPN nem sempre publica isto, sobretudo antes de começar. */
export async function carregarDetalhesJogo(ligaSlug: string, eventoId: string): Promise<DetalhesJogo> {
  try {
    const res = await fetch(`${BASE}/${ligaSlug}/summary?event=${eventoId}`);
    if (!res.ok) return DETALHES_VAZIO;
    const json = obj(await res.json());
    const { casa, fora } = nomesDoSummary(json);
    return {
      estatisticas: mapearEstatisticas(json),
      eventos: mapearEventos(json),
      momento: mapearMomento(json, casa, fora),
      vivo: patchVivoDoSummary(json),
    };
  } catch {
    return DETALHES_VAZIO;
  }
}
