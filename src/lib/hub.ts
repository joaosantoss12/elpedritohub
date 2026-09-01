import { supabase } from './supabase';
import { traduzErro } from './epcoins';

// As três peças da migração 012: notificações, canais por clube e jackpot.
//
// Vivem no mesmo ficheiro porque partilham a mesma forma — funções finas por
// cima de RPCs `security definer` — e nenhuma delas é grande o suficiente
// para justificar um módulo só seu.

// ─── NOTIFICAÇÕES ─────────────────────────────────────────────

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  url: string | null;
  lida: boolean;
  created_at: string;
}

export async function carregarNotificacoes(limite = 30): Promise<Notificacao[]> {
  const { data, error } = await supabase.rpc('notificacoes_minhas', { p_limite: limite });
  if (error) {
    console.warn('Notificações indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as Notificacao[];
}

/** Marca tudo como lido e devolve quantas mudaram. */
export async function marcarNotificacoesLidas(): Promise<number> {
  const { data, error } = await supabase.rpc('notificacoes_marcar_lidas');
  if (error) return 0;
  return Number(data ?? 0);
}

/**
 * Subscreve as notificações novas do próprio.
 *
 * O filtro por `user_id` é indispensável: sem ele o realtime entregava as
 * inserções de toda a gente ao cliente, e era a RLS a tapar o que já tinha
 * saído do servidor. Melhor não pedir o que não é nosso.
 */
export function subscreverNotificacoes(
  userId: string,
  onNova: (n: Notificacao) => void,
): () => void {
  const ch = supabase
    .channel(`notificacoes_${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `user_id=eq.${userId}` },
      (payload) => onNova(payload.new as Notificacao),
    )
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

/** Aviso para todos os membros. Só admins. */
export async function difundirNotificacao(args: {
  tipo: string;
  titulo: string;
  corpo?: string | null;
  url?: string | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc('notificacao_broadcast', {
    p_tipo: args.tipo,
    p_titulo: args.titulo,
    p_corpo: args.corpo ?? null,
    p_url: args.url ?? null,
  });
  if (error) throw new Error(traduzErro(error.message));
  return Number(data ?? 0);
}

// ─── CANAIS POR CLUBE ─────────────────────────────────────────

export interface CanalComunidade {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  cor: string | null;
  ordem: number;
  requer_vip: boolean;
  /** Preenchido só nos canais privados de clã. Null é o chat aberto a todos. */
  cla_id: string | null;
}

export interface MensagemCanal {
  id: string;
  canal_id: string;
  user_id: string;
  username: string;
  texto: string;
  created_at: string;
}

export async function carregarCanaisComunidade(): Promise<CanalComunidade[]> {
  const { data, error } = await supabase
    .from('comunidade_canais')
    .select('id, slug, nome, descricao, icone, cor, ordem, requer_vip, cla_id')
    .eq('ativo', true)
    .order('ordem');
  if (error) {
    console.warn('Canais da comunidade indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as CanalComunidade[];
}

export async function carregarMensagensCanal(
  canalId: string,
  limite = 200,
): Promise<MensagemCanal[]> {
  const { data, error } = await supabase
    .from('comunidade_mensagens')
    .select('id, canal_id, user_id, username, texto, created_at')
    .eq('canal_id', canalId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) {
    console.warn('Mensagens indisponíveis:', error.message);
    return [];
  }
  // Vêm do fim para o princípio por causa do limit; mostram-se ao contrário.
  return ((data ?? []) as MensagemCanal[]).reverse();
}

export async function enviarMensagemCanal(args: {
  canalId: string;
  userId: string;
  username: string;
  texto: string;
}): Promise<void> {
  const texto = args.texto.trim();
  if (!texto) return;

  const { error } = await supabase.from('comunidade_mensagens').insert({
    canal_id: args.canalId,
    user_id: args.userId,
    username: args.username,
    texto: texto.slice(0, 1000),
  });
  if (error) throw new Error(traduzErro(error.message));

  // A missão é do dia, não da mensagem. Falhar aqui não é motivo para dizer
  // que a mensagem falhou — ela já está entregue.
  const { error: erroMissao } = await supabase.rpc('comunidade_registar_mensagem', {
    p_canal_id: args.canalId,
  });
  if (erroMissao) console.warn('Missão de mensagem não registada:', erroMissao.message);
}

export async function apagarMensagemCanal(id: string): Promise<void> {
  const { error } = await supabase.from('comunidade_mensagens').delete().eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

export function subscreverCanal(
  canalId: string,
  onNova: (m: MensagemCanal) => void,
): () => void {
  const ch = supabase
    .channel(`comunidade_${canalId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comunidade_mensagens', filter: `canal_id=eq.${canalId}` },
      (payload) => onNova(payload.new as MensagemCanal),
    )
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── JACKPOT ──────────────────────────────────────────────────

// Nota de conformidade, a mesma que está no cabeçalho da migração: os
// bilhetes **não se compram**. Ganham-se ao participar, e a participação é
// gratuita. Sem contrapartida financeira não há aposta — é um sorteio
// promocional interno, e os prémios saem em EPCoins.

export interface JackpotAtual {
  id: string;
  titulo: string;
  pote: number;
  sorteia_em: string | null;
  meus_bilhetes: number;
  total_bilhetes: number;
  participantes: number;
}

export interface JackpotVencedor {
  id: string;
  titulo: string;
  pote: number;
  sorteado_em: string;
  vencedor: string;
}

export async function carregarJackpot(): Promise<JackpotAtual | null> {
  const { data, error } = await supabase.rpc('jackpot_atual');
  if (error) {
    console.warn('Jackpot indisponível:', error.message);
    return null;
  }
  const linhas = (data ?? []) as JackpotAtual[];
  return linhas[0] ?? null;
}

export async function carregarVencedoresJackpot(limite = 10): Promise<JackpotVencedor[]> {
  const { data, error } = await supabase.rpc('jackpot_vencedores', { p_limite: limite });
  if (error) return [];
  return (data ?? []) as JackpotVencedor[];
}

/** Abre o jackpot seguinte. Só admins; só pode haver um aberto de cada vez. */
export async function abrirJackpot(args: {
  titulo: string;
  sorteiaEm: string;
  pote?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc('jackpot_abrir', {
    p_titulo: args.titulo,
    p_sorteia_em: new Date(args.sorteiaEm).toISOString(),
    p_pote: args.pote ?? 0,
  });
  if (error) throw new Error(traduzErro(error.message));
  return data as string;
}

/** Sorteia e credita. Só admins. Devolve o id de quem ganhou. */
export async function sortearJackpot(jackpotId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('jackpot_sortear', { p_jackpot_id: jackpotId });
  if (error) throw new Error(traduzErro(error.message));
  return (data as string) ?? null;
}

/** A tua fatia do pote, em percentagem. Zero bilhetes é zero, não NaN. */
export function chance(j: JackpotAtual): number {
  if (j.total_bilhetes <= 0) return 0;
  return Math.round((j.meus_bilhetes / j.total_bilhetes) * 1000) / 10;
}
