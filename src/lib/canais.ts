import { supabase } from './supabase';
import type { Vertical } from './raiox';

// ─── TIPOS ────────────────────────────────────────────────────

export type TipoCanal = 'oficial' | 'contacto' | 'falso';
export type AcessoCanal = 'gratuito' | 'vip' | 'contacto';

export interface CanalTelegram {
  id: string;
  nome: string;
  handle: string | null;
  url: string | null;
  tipo: TipoCanal;
  vertical: Vertical | null;
  acesso: AcessoCanal;
  subscritores: number | null;
  engagement_min: number | null;
  engagement_max: number | null;
  cadencia: string | null;
  cadencia_estavel: boolean;
  nota: string | null;
  ordem: number;
  ativo: boolean;
  recolhido_em: string | null;
}

// Literal de uma linha só: o supabase-js infere o tipo do resultado a partir
// da string do select, e uma concatenação faz essa inferência cair.
const COLUNAS =
  'id, nome, handle, url, tipo, vertical, acesso, subscritores, engagement_min, engagement_max, cadencia, cadencia_estavel, nota, ordem, ativo, recolhido_em' as const;

/**
 * Carrega os canais. Falha em silêncio se a migração 002 ainda não correu —
 * nenhuma página pode ficar em branco por causa disso.
 */
export async function carregarCanais(opts?: { tipo?: TipoCanal }): Promise<CanalTelegram[]> {
  let query = supabase
    .from('telegram_canais')
    .select(COLUNAS)
    .eq('ativo', true)
    .order('ordem');

  if (opts?.tipo) query = query.eq('tipo', opts.tipo);

  const { data, error } = await query;
  if (error) {
    console.warn('Canais de Telegram indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as CanalTelegram[];
}

// ─── AGREGAÇÕES ───────────────────────────────────────────────

export interface AlcanceCanais {
  /** Soma de subscritores dos canais oficiais — prova de escala. */
  totalSubscritores: number;
  /** Canal com mais subscritores. */
  maiorCanal: CanalTelegram | null;
  /**
   * Canal pequeno com maior engagement — prova de fidelidade.
   * Volume sozinho não conta a história toda (roadmap 5).
   */
  maisFiel: CanalTelegram | null;
  oficiais: CanalTelegram[];
}

export function alcance(canais: CanalTelegram[]): AlcanceCanais {
  const oficiais = canais.filter(c => c.tipo === 'oficial');
  const comSubs = oficiais.filter(c => c.subscritores != null);
  const comEngagement = oficiais.filter(c => c.engagement_max != null);

  return {
    totalSubscritores: comSubs.reduce((s, c) => s + (c.subscritores ?? 0), 0),
    maiorCanal: comSubs.length
      ? comSubs.reduce((a, b) => ((b.subscritores ?? 0) > (a.subscritores ?? 0) ? b : a))
      : null,
    maisFiel: comEngagement.length
      ? comEngagement.reduce((a, b) => ((b.engagement_max ?? 0) > (a.engagement_max ?? 0) ? b : a))
      : null,
    oficiais,
  };
}

// ─── FORMATAÇÃO ───────────────────────────────────────────────

export function fmtSubscritores(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-PT');
}

/** "17% a 38%", ou "Acima de 100%" quando o máximo bate no teto. */
export function fmtEngagement(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—';
  if (max != null && max >= 100) return 'Acima de 100%';
  if (min == null || max == null) return `${(max ?? min)!.toFixed(0)}%`;
  if (min === max) return `${min.toFixed(0)}%`;
  return `${min.toFixed(0)}% a ${max.toFixed(0)}%`;
}

export const ACESSO_LABELS: Record<AcessoCanal, string> = {
  gratuito: 'Gratuito',
  vip: 'VIP',
  contacto: 'Contacto',
};

/** Handle apresentável, sempre com '@' e sem duplicar o que já lá está. */
export function fmtHandle(handle: string | null): string | null {
  if (!handle) return null;
  return handle.startsWith('@') ? handle : `@${handle}`;
}
