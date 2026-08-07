import { supabase } from './supabase';

// ─── TIPOS ────────────────────────────────────────────────────

export interface LinhaRanking {
  posicao: number;
  user_id: string;
  username: string;
  roi: number | null;
  lucro_unidades: number | null;
  apostas: number;
  ganhas: number;
  taxa_acerto: number | null;
}

export interface RankingConfig {
  ativo: boolean;
  premio_titulo: string | null;
  premio_descricao: string | null;
  min_apostas: number;
  lugares: number;
  regras: string | null;
}

export interface Vencedor {
  id: string;
  mes: string;
  posicao: number;
  user_id: string | null;
  username: string;
  roi: number | null;
  lucro_unidades: number | null;
  apostas: number | null;
  premio: string | null;
  entregue: boolean;
  nota: string | null;
}

export const CONFIG_PADRAO: RankingConfig = {
  ativo: true,
  premio_titulo: null,
  premio_descricao: null,
  min_apostas: 10,
  lugares: 20,
  regras: null,
};

// Literais de uma linha: o supabase-js infere o tipo do resultado a partir da
// string do select, e uma concatenação faz essa inferência cair.
const COLUNAS_CONFIG =
  'ativo, premio_titulo, premio_descricao, min_apostas, lugares, regras' as const;
const COLUNAS_VENCEDOR =
  'id, mes, posicao, user_id, username, roi, lucro_unidades, apostas, premio, entregue, nota' as const;

// ─── LEITURA ──────────────────────────────────────────────────

/** Primeiro dia do mês, no formato que o Postgres espera. */
export function primeiroDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Todas estas funções falham em silêncio se a migração 003 ainda não correu.
 * Nenhuma página pode ficar em branco por causa de uma migração em atraso.
 */
export async function carregarRanking(mes: Date): Promise<LinhaRanking[]> {
  const { data, error } = await supabase.rpc('ranking_banca_mensal', {
    p_mes: primeiroDia(mes),
  });
  if (error) {
    console.warn('Ranking indisponível:', error.message);
    return [];
  }
  return (data ?? []) as LinhaRanking[];
}

export async function carregarConfig(): Promise<RankingConfig> {
  const { data, error } = await supabase
    .from('ranking_config')
    .select(COLUNAS_CONFIG)
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('Config do ranking indisponível:', error.message);
    return CONFIG_PADRAO;
  }
  return data as RankingConfig;
}

export async function carregarVencedores(limite = 12): Promise<Vencedor[]> {
  const { data, error } = await supabase
    .from('ranking_vencedores')
    .select(COLUNAS_VENCEDOR)
    .order('mes', { ascending: false })
    .order('posicao')
    .limit(limite);
  if (error) {
    console.warn('Quadro de honra indisponível:', error.message);
    return [];
  }
  return (data ?? []) as Vencedor[];
}

// ─── FORMATAÇÃO ───────────────────────────────────────────────

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function nomeMes(d: Date): string {
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Aceita tanto um Date como o 'YYYY-MM-DD' que vem da base de dados. */
export function nomeMesISO(iso: string): string {
  const [ano, mes] = iso.split('-');
  return `${MESES[Number(mes) - 1]} de ${ano}`;
}

export function fmtRoi(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function fmtUnidades(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}u`;
}

/** Medalha para o pódio; o resto fica com o número. */
export function medalha(posicao: number): string | null {
  return posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : null;
}
