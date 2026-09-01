import { supabase } from './supabase';
import { traduzErro } from './epcoins';

// Convites, clãs e perfil público.
//
// Sobre os convites: são internos. Recompensam quem traz alguém para o Hub
// com EPCoins, e nada mais. Não conhecem casas de apostas nem registos
// externos — associar recompensas a registos ou primeiros depósitos numa
// casa parceira cai nas regras de afiliados, publicidade e jogo responsável
// aplicáveis em Portugal, e teria de ser desenhado à parte.

// ─── TIPOS ────────────────────────────────────────────────────

export interface ResumoConvites {
  codigo: string;
  convidados: number;
}

export interface LinhaRankingClas {
  cla_id: string;
  nome: string;
  tag: string;
  membros: number;
  pontos: number;
}

export interface MembroCla {
  username: string;
  papel: 'dono' | 'membro';
  epcoins: number;
}

export interface Cla {
  id: string;
  nome: string;
  tag: string;
  descricao: string | null;
  aberto: boolean;
  max_membros: number;
  sou_dono: boolean;
  membros: MembroCla[];
}

export interface PerfilPublico {
  username: string;
  badges: string[];
  membro_desde: string | null;
  previsoes: number;
  certas: number;
  taxa: number;
  streak: number;
  cla_nome: string | null;
  cla_tag: string | null;
}

// ─── CONVITES ─────────────────────────────────────────────────

/** O código do próprio, criado na primeira chamada. */
export async function carregarResumoConvites(): Promise<ResumoConvites | null> {
  const { data, error } = await supabase.rpc('referral_resumo');
  if (error) {
    console.warn('Convites indisponíveis:', error.message);
    return null;
  }
  const l = Array.isArray(data) ? data[0] : data;
  if (!l?.codigo) return null;
  return { codigo: l.codigo as string, convidados: Number(l.convidados ?? 0) };
}

/** Usado uma vez, pelo convidado, na primeira semana depois do registo. */
export async function usarConvite(codigo: string): Promise<void> {
  const { error } = await supabase.rpc('referral_usar', { p_codigo: codigo });
  if (error) throw new Error(traduzErro(error.message));
}

export function linkDeConvite(codigo: string): string {
  return `${window.location.origin}/register?convite=${encodeURIComponent(codigo)}`;
}

const CHAVE_CONVITE = 'epc_convite_pendente';

/**
 * O código fica guardado no registo e só se resgata na primeira sessão.
 *
 * Não se pode resgatar logo: com confirmação de email ligada, o `signUp` não
 * devolve sessão nenhuma, e a RPC precisa de um `auth.uid()`. Guardar e
 * resgatar depois é o que faz o convite sobreviver a esse intervalo.
 */
export function guardarConvitePendente(codigo: string): void {
  try {
    localStorage.setItem(CHAVE_CONVITE, codigo.trim().toUpperCase());
  } catch {
    // Sessão privada ou storage cheio: perde-se o convite, não o registo.
  }
}

/** Resgata o convite guardado, se houver. Nunca lança. */
export async function resgatarConvitePendente(): Promise<void> {
  let codigo: string | null = null;
  try {
    codigo = localStorage.getItem(CHAVE_CONVITE);
  } catch {
    return;
  }
  if (!codigo) return;

  try {
    await usarConvite(codigo);
  } catch (e) {
    console.warn('Convite não aplicado:', e instanceof Error ? e.message : e);
  } finally {
    // Sai da gaveta em qualquer dos casos: um código inválido ou fora de
    // prazo não melhora com tentativas, e ficaria a tentar em cada arranque.
    try { localStorage.removeItem(CHAVE_CONVITE); } catch { /* ignorado */ }
  }
}

// ─── CLÃS ─────────────────────────────────────────────────────

export async function carregarRankingClas(limite = 30): Promise<LinhaRankingClas[]> {
  const { data, error } = await supabase.rpc('cla_ranking', { p_limite: limite });
  if (error) {
    console.warn('Ranking de clãs indisponível:', error.message);
    return [];
  }
  return ((data ?? []) as LinhaRankingClas[]).map((l) => ({
    ...l,
    membros: Number(l.membros),
    pontos: Number(l.pontos),
  }));
}

/**
 * O detalhe vem do servidor como uma linha por membro; aqui volta a ser um
 * clã com uma lista, que é a forma como o ecrã o quer.
 */
export async function carregarCla(claId?: string): Promise<Cla | null> {
  const { data, error } = await supabase.rpc('cla_detalhe', { p_cla_id: claId ?? null });
  if (error) {
    console.warn('Clã indisponível:', error.message);
    return null;
  }
  const linhas = (data ?? []) as Record<string, unknown>[];
  if (linhas.length === 0) return null;
  const c = linhas[0];
  return {
    id: c.cla_id as string,
    nome: c.nome as string,
    tag: c.tag as string,
    descricao: (c.descricao as string) ?? null,
    aberto: Boolean(c.aberto),
    max_membros: Number(c.max_membros),
    sou_dono: Boolean(c.sou_dono),
    membros: linhas.map((l) => ({
      username: (l.username as string) ?? 'membro',
      papel: (l.papel as 'dono' | 'membro') ?? 'membro',
      epcoins: Number(l.epcoins ?? 0),
    })),
  };
}

export async function criarCla(
  nome: string,
  tag: string,
  descricao?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('cla_criar', {
    p_nome: nome,
    p_tag: tag.toUpperCase(),
    p_descricao: descricao ?? null,
  });
  if (error) throw new Error(traduzErro(error.message));
  return data as string;
}

export async function entrarNoCla(claId: string): Promise<void> {
  const { error } = await supabase.rpc('cla_entrar', { p_cla_id: claId });
  if (error) throw new Error(traduzErro(error.message));
}

/** Sair. Se for o dono, o clã dissolve-se — não há passagem de posse. */
export async function sairDoCla(): Promise<void> {
  const { error } = await supabase.rpc('cla_sair');
  if (error) throw new Error(traduzErro(error.message));
}

// ─── PERFIL PÚBLICO ───────────────────────────────────────────

/**
 * Devolve nulo para quem tiver o ranking oculto — a opção que já existe no
 * perfil vale também aqui, senão não valia nada.
 */
export async function carregarPerfilPublico(username: string): Promise<PerfilPublico | null> {
  const { data, error } = await supabase.rpc('perfil_publico', { p_username: username });
  if (error) {
    console.warn('Perfil público indisponível:', error.message);
    return null;
  }
  const l = Array.isArray(data) ? data[0] : data;
  if (!l) return null;
  return {
    username: l.username as string,
    badges: (l.badges as string[]) ?? [],
    membro_desde: (l.membro_desde as string) ?? null,
    previsoes: Number(l.previsoes ?? 0),
    certas: Number(l.certas ?? 0),
    taxa: Number(l.taxa ?? 0),
    streak: Number(l.streak ?? 0),
    cla_nome: (l.cla_nome as string) ?? null,
    cla_tag: (l.cla_tag as string) ?? null,
  };
}
