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

import { LIGAS_NUCLEO } from './ligas';

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
}

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// O catálogo vive em `ligas.ts` porque também é preciso do lado do servidor,
// onde nada disto — fetch a 140 competições — pode acontecer no browser.
export { ORDEM_CONTINENTES, continenteDaLiga, nomeDaLiga, LIGAS_TODAS, LIGAS_NUCLEO } from './ligas';

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

export interface DetalhesJogo {
  estatisticas: EstatisticaJogo[];
  eventos: EventoJogo[];
}

const DETALHES_VAZIO: DetalhesJogo = { estatisticas: [], eventos: [] };

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

  return [...nomes]
    .filter(nome => nome in LABELS_ESTATISTICA)
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

/** Estatísticas + eventos de um jogo específico. Falha em silêncio (devolve vazio) —
 *  a ESPN nem sempre publica isto, sobretudo antes do jogo começar. */
export async function carregarDetalhesJogo(ligaSlug: string, eventoId: string): Promise<DetalhesJogo> {
  try {
    const res = await fetch(`${BASE}/${ligaSlug}/summary?event=${eventoId}`);
    if (!res.ok) return DETALHES_VAZIO;
    const json = obj(await res.json());
    return {
      estatisticas: mapearEstatisticas(json),
      eventos: mapearEventos(json),
    };
  } catch {
    return DETALHES_VAZIO;
  }
}
