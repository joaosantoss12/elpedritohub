import { supabase } from './supabase';

// ─── TIPOS ────────────────────────────────────────────────────

export type Vertical = 'futebol' | 'tenis' | 'escadinha' | 'footmillion';
export type Canal = 'publico' | 'vip';
export type Resultado = 'pendente' | 'green' | 'red' | 'void';

export interface RaioxTip {
  id: string;
  vertical: Vertical;
  canal: Canal;
  publicado_em: string;
  evento: string;
  competicao: string | null;
  pick: string;
  odd: number;
  stake: number;
  resultado: Resultado;
  resolvido_em: string | null;
}

export const VERTICAL_LABELS: Record<Vertical, string> = {
  futebol: 'Futebol',
  tenis: 'Ténis',
  escadinha: 'Escadinha',
  footmillion: 'Footmillion VIP',
};

export const VERTICAL_COLORS: Record<Vertical, string> = {
  futebol: '#22c55e',
  tenis: '#38bdf8',
  escadinha: '#e6b95c',
  footmillion: '#8b5cf6',
};

export const RESULTADO_LABELS: Record<Resultado, string> = {
  pendente: 'Pendente',
  green: 'Green',
  red: 'Red',
  void: 'Anulada',
};

// ─── AGREGAÇÕES ───────────────────────────────────────────────

export interface RaioxStats {
  /** Tips já resolvidas (exclui pendentes e anuladas) */
  resolvidas: number;
  greens: number;
  reds: number;
  pendentes: number;
  /** 0–100 */
  taxaAcerto: number;
  /** Unidades apostadas nas tips resolvidas */
  unidadesApostadas: number;
  /** Lucro em unidades: green → stake*(odd-1), red → -stake */
  lucroUnidades: number;
  /** Retorno sobre investimento, em % */
  roi: number;
  /** Odd média das tips resolvidas */
  oddMedia: number;
  /** Maior sequência de greens consecutivos */
  melhorStreak: number;
  /** Sequência atual (positiva = greens, negativa = reds) */
  streakAtual: number;
}

const ZERO_STATS: RaioxStats = {
  resolvidas: 0, greens: 0, reds: 0, pendentes: 0,
  taxaAcerto: 0, unidadesApostadas: 0, lucroUnidades: 0,
  roi: 0, oddMedia: 0, melhorStreak: 0, streakAtual: 0,
};

/** Lucro de uma tip, em unidades. Void e pendente valem 0. */
export function lucroDaTip(tip: RaioxTip): number {
  if (tip.resultado === 'green') return tip.stake * (tip.odd - 1);
  if (tip.resultado === 'red') return -tip.stake;
  return 0;
}

export function calcularStats(tips: RaioxTip[]): RaioxStats {
  const resolvidas = tips.filter(t => t.resultado === 'green' || t.resultado === 'red');
  const pendentes = tips.filter(t => t.resultado === 'pendente').length;

  if (resolvidas.length === 0) return { ...ZERO_STATS, pendentes };

  const greens = resolvidas.filter(t => t.resultado === 'green').length;
  const reds = resolvidas.length - greens;

  const unidadesApostadas = resolvidas.reduce((sum, t) => sum + t.stake, 0);
  const lucroUnidades = resolvidas.reduce((sum, t) => sum + lucroDaTip(t), 0);
  const oddMedia = resolvidas.reduce((sum, t) => sum + t.odd, 0) / resolvidas.length;

  // Streaks — do mais antigo para o mais recente
  const cronologicas = [...resolvidas].sort(
    (a, b) => new Date(a.publicado_em).getTime() - new Date(b.publicado_em).getTime()
  );

  let melhorStreak = 0;
  let corrente = 0;
  for (const t of cronologicas) {
    corrente = t.resultado === 'green' ? Math.max(corrente, 0) + 1 : Math.min(corrente, 0) - 1;
    if (corrente > melhorStreak) melhorStreak = corrente;
  }

  return {
    resolvidas: resolvidas.length,
    greens,
    reds,
    pendentes,
    taxaAcerto: (greens / resolvidas.length) * 100,
    unidadesApostadas,
    lucroUnidades,
    roi: unidadesApostadas > 0 ? (lucroUnidades / unidadesApostadas) * 100 : 0,
    oddMedia,
    melhorStreak,
    streakAtual: corrente,
  };
}

export interface VerticalStats extends RaioxStats {
  vertical: Vertical;
}

export function statsPorVertical(tips: RaioxTip[]): VerticalStats[] {
  const verticais = [...new Set(tips.map(t => t.vertical))];
  return verticais
    .map(v => ({ vertical: v, ...calcularStats(tips.filter(t => t.vertical === v)) }))
    .sort((a, b) => b.lucroUnidades - a.lucroUnidades);
}

export interface PontoCurva {
  label: string;
  data: string;
  lucro: number;
  acumulado: number;
}

/** Curva de lucro acumulado, um ponto por tip resolvida. */
export function curvaAcumulada(tips: RaioxTip[]): PontoCurva[] {
  const resolvidas = tips
    .filter(t => t.resultado === 'green' || t.resultado === 'red')
    .sort((a, b) => new Date(a.publicado_em).getTime() - new Date(b.publicado_em).getTime());

  let acumulado = 0;
  return resolvidas.map(t => {
    const lucro = lucroDaTip(t);
    acumulado += lucro;
    return {
      label: new Date(t.publicado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }),
      data: t.publicado_em,
      lucro: Number(lucro.toFixed(2)),
      acumulado: Number(acumulado.toFixed(2)),
    };
  });
}

/** Agrupa o lucro por dia — usado no heat-strip dos últimos N dias. */
export function lucroPorDia(tips: RaioxTip[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of tips) {
    if (t.resultado !== 'green' && t.resultado !== 'red') continue;
    const dia = t.publicado_em.slice(0, 10);
    mapa.set(dia, (mapa.get(dia) ?? 0) + lucroDaTip(t));
  }
  return mapa;
}

// ─── ACESSO A DADOS ───────────────────────────────────────────

/**
 * Carrega o histórico auditado. Devolve [] em silêncio se a tabela ainda não
 * existir — a Home tem de continuar a renderizar antes da migração correr.
 */
export async function carregarTips(opts?: {
  desdeDias?: number;
  canal?: Canal;
  vertical?: Vertical;
  limite?: number;
}): Promise<RaioxTip[]> {
  let query = supabase
    .from('raiox_tips')
    .select('id, vertical, canal, publicado_em, evento, competicao, pick, odd, stake, resultado, resolvido_em')
    .order('publicado_em', { ascending: false })
    .limit(opts?.limite ?? 500);

  if (opts?.canal) query = query.eq('canal', opts.canal);
  if (opts?.vertical) query = query.eq('vertical', opts.vertical);
  if (opts?.desdeDias) {
    const desde = new Date(Date.now() - opts.desdeDias * 86400_000).toISOString();
    query = query.gte('publicado_em', desde);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Raio-X indisponível:', error.message);
    return [];
  }
  return (data ?? []) as RaioxTip[];
}

// ─── FORMATAÇÃO ───────────────────────────────────────────────

export function fmtUnidades(v: number): string {
  const sinal = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sinal}${Math.abs(v).toFixed(2)}u`;
}

export function fmtPercent(v: number, casas = 1): string {
  return `${v.toFixed(casas)}%`;
}

export function fmtRoi(v: number): string {
  const sinal = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sinal}${Math.abs(v).toFixed(1)}%`;
}
