import { supabase } from './supabase';

// ─── TIPOS ────────────────────────────────────────────────────

export interface VipVideo {
  id: string;
  titulo: string;
  descricao: string | null;
  embed_url: string;
  thumb_url: string | null;
  duracao: string | null;
  ordem: number;
  ativo: boolean;
}

export type EstadoReuniao =
  | 'pendente' | 'agendada' | 'realizada' | 'cancelada' | 'convertida';

export interface Reuniao {
  id: string;
  user_id: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  preferencia: string | null;
  mensagem: string | null;
  estado: EstadoReuniao;
  agendada_para: string | null;
  nota_interna: string | null;
  created_at: string;
}

export interface PedidoReuniao {
  nome: string;
  email: string;
  telefone?: string;
  preferencia?: string;
  mensagem?: string;
}

// Literais de uma linha: o supabase-js infere o tipo do resultado a partir da
// string do select, e uma concatenação faz essa inferência cair.
const COLUNAS_VIDEO =
  'id, titulo, descricao, embed_url, thumb_url, duracao, ordem, ativo' as const;
const COLUNAS_REUNIAO =
  'id, user_id, nome, email, telefone, preferencia, mensagem, estado, agendada_para, nota_interna, created_at' as const;

export const ESTADO_REUNIAO_LABELS: Record<EstadoReuniao, string> = {
  pendente: 'Por contactar',
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  convertida: 'Converteu em VIP',
};

// ─── LEITURA ──────────────────────────────────────────────────

/** Falha em silêncio se a migração 004 ainda não correu. */
export async function carregarVideos(apenasAtivos = true): Promise<VipVideo[]> {
  let query = supabase.from('vip_videos').select(COLUNAS_VIDEO).order('ordem');
  if (apenasAtivos) query = query.eq('ativo', true);

  const { data, error } = await query;
  if (error) {
    console.warn('Vídeos do VIP indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as VipVideo[];
}

export async function carregarReunioes(): Promise<Reuniao[]> {
  const { data, error } = await supabase
    .from('vip_reunioes')
    .select(COLUNAS_REUNIAO)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Pedidos de reunião indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as Reuniao[];
}

/** O membro tem sempre no máximo um pedido por tratar. */
export async function pedidoPendente(userId: string): Promise<Reuniao | null> {
  const { data, error } = await supabase
    .from('vip_reunioes')
    .select(COLUNAS_REUNIAO)
    .eq('user_id', userId)
    .in('estado', ['pendente', 'agendada'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as Reuniao;
}

// ─── ESCRITA ──────────────────────────────────────────────────

export async function pedirReuniao(userId: string, p: PedidoReuniao): Promise<void> {
  const { error } = await supabase.from('vip_reunioes').insert({
    user_id: userId,
    nome: p.nome.trim(),
    email: p.email.trim(),
    telefone: p.telefone?.trim() || null,
    preferencia: p.preferencia?.trim() || null,
    mensagem: p.mensagem?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
