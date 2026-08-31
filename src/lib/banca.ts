import { supabase } from './supabase';

// ── Tipos ──────────────────────────────────────────────────────────────

export interface Selecao {
  desporto: string;
  equipa_casa: string;
  equipa_fora: string;
  mercado: string;
  odd: string;
}

export type EstadoAposta = 'pendente' | 'ganha' | 'perdida';

export interface Aposta {
  id: string;
  user_id: string;
  tipo: 'simples' | 'multipla';
  desporto: string;
  equipa_casa: string;
  equipa_fora: string;
  mercado: string;
  odd: number;
  valor_apostado: number;
  estado: EstadoAposta;
  data_aposta: string; // YYYY-MM-DD
  created_at: string;
  selecoes?: Selecao[] | null;
}

export type ApostaInsert = Omit<Aposta, 'id' | 'user_id' | 'created_at'>;
export type ApostaPatch = Partial<Omit<Aposta, 'id' | 'user_id' | 'created_at'>>;

export interface BancaSettings {
  user_id: string;
  starting_bankroll: number;
  currency: string;
}

// ── Lucro de uma aposta ────────────────────────────────────────────────
// A banca_apostas não guarda o lucro — deriva-se do estado, da odd e do
// valor apostado (uma múltipla já traz a odd combinada em `odd`).

export function apostaProfit(a: Pick<Aposta, 'estado' | 'odd' | 'valor_apostado'>): number {
  if (a.estado === 'ganha') {
    return Number((a.odd * a.valor_apostado - a.valor_apostado).toFixed(2));
  }
  if (a.estado === 'perdida') return -a.valor_apostado;
  return 0;
}

export function apostaRetorno(a: Pick<Aposta, 'estado' | 'odd' | 'valor_apostado'>): number {
  if (a.estado === 'ganha') return Number((a.odd * a.valor_apostado).toFixed(2));
  return 0;
}

export function sortApostas(list: Aposta[]): Aposta[] {
  return [...list].sort(
    (a, b) =>
      a.data_aposta.localeCompare(b.data_aposta) ||
      a.created_at.localeCompare(b.created_at),
  );
}

// ── Data layer (user-scoped via RLS) ───────────────────────────────────

export async function fetchApostas(): Promise<Aposta[]> {
  const { data, error } = await supabase
    .from('banca_apostas')
    .select('*')
    .order('data_aposta', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Aposta[];
}

export async function createAposta(userId: string, draft: ApostaInsert): Promise<Aposta> {
  const { data, error } = await supabase
    .from('banca_apostas')
    .insert({ ...draft, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Aposta;
}

export async function updateAposta(id: string, patch: ApostaPatch): Promise<Aposta> {
  const { data, error } = await supabase
    .from('banca_apostas')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Aposta;
}

export async function deleteAposta(id: string): Promise<void> {
  const { error } = await supabase.from('banca_apostas').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchBancaSettings(userId: string): Promise<BancaSettings> {
  const { data, error } = await supabase
    .from('banca_settings')
    .select('user_id, starting_bankroll, currency')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    return {
      user_id: data.user_id,
      starting_bankroll: Number(data.starting_bankroll) || 0,
      currency: data.currency || 'EUR',
    };
  }
  return { user_id: userId, starting_bankroll: 0, currency: 'EUR' };
}

export async function updateStartingBankroll(userId: string, value: number): Promise<void> {
  const { error } = await supabase
    .from('banca_settings')
    .upsert(
      { user_id: userId, starting_bankroll: value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}
