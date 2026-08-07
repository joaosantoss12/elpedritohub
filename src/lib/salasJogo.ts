import { supabase } from './supabase';
import { LIGAS_PADRAO } from './placar';

// ─── TIPOS ────────────────────────────────────────────────────

export type CanalSala = 'geral' | 'vip';

export interface MensagemSala {
  id: string;
  evento_id: string;
  canal: CanalSala;
  user_id: string;
  username: string;
  texto: string;
  created_at: string;
}

export interface SalasConfig {
  ativo: boolean;
  ligas: string[];
  janela_horas: number;
}

export const SALAS_CONFIG_PADRAO: SalasConfig = {
  ativo: true,
  ligas: [...LIGAS_PADRAO],
  janela_horas: 6,
};

// Literais de uma linha: o supabase-js infere o tipo do resultado a partir da
// string do select, e uma concatenação faz essa inferência cair.
const COLUNAS_MSG =
  'id, evento_id, canal, user_id, username, texto, created_at' as const;

// ─── LEITURA ──────────────────────────────────────────────────

/** Falha em silêncio se a migração 005 ainda não correu. */
export async function carregarSalasConfig(): Promise<SalasConfig> {
  const { data, error } = await supabase
    .from('salas_config')
    .select('ativo, ligas, janela_horas')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('Config das salas indisponível:', error.message);
    return SALAS_CONFIG_PADRAO;
  }
  return data as SalasConfig;
}

/**
 * O canal VIP é filtrado pela RLS, não por este pedido: pedir 'vip' sem ser
 * subscritor devolve zero linhas do lado do servidor.
 */
export async function carregarMensagens(
  eventoId: string,
  canal: CanalSala,
  limite = 200,
): Promise<MensagemSala[]> {
  const { data, error } = await supabase
    .from('sala_jogo_mensagens')
    .select(COLUNAS_MSG)
    .eq('evento_id', eventoId)
    .eq('canal', canal)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) {
    console.warn('Mensagens da sala indisponíveis:', error.message);
    return [];
  }
  // Vem do fim para o princípio por causa do limit; mostra-se ao contrário.
  return ((data ?? []) as MensagemSala[]).reverse();
}

/** Quantas mensagens tem cada sala, para dar sinal de vida na lista de jogos. */
export async function contarPorEvento(eventoIds: string[]): Promise<Record<string, number>> {
  if (!eventoIds.length) return {};
  const { data, error } = await supabase
    .from('sala_jogo_mensagens')
    .select('evento_id')
    .in('evento_id', eventoIds);
  if (error) return {};

  const contagem: Record<string, number> = {};
  for (const linha of (data ?? []) as { evento_id: string }[]) {
    contagem[linha.evento_id] = (contagem[linha.evento_id] ?? 0) + 1;
  }
  return contagem;
}

// ─── ESCRITA ──────────────────────────────────────────────────

export async function enviarMensagem(args: {
  eventoId: string;
  canal: CanalSala;
  userId: string;
  username: string;
  texto: string;
  jogoLabel: string;
}): Promise<void> {
  const texto = args.texto.trim();
  if (!texto) return;

  const { error } = await supabase.from('sala_jogo_mensagens').insert({
    evento_id: args.eventoId,
    canal: args.canal,
    user_id: args.userId,
    username: args.username,
    texto: texto.slice(0, 500),
    jogo_label: args.jogoLabel,
  });
  if (error) throw new Error(error.message);
}

export async function apagarMensagem(id: string): Promise<void> {
  const { error } = await supabase.from('sala_jogo_mensagens').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── REALTIME ─────────────────────────────────────────────────

/**
 * Subscreve as mensagens novas de uma sala. Devolve a função de limpeza —
 * quem chama é responsável por a correr ao desmontar.
 */
export function subscreverSala(
  eventoId: string,
  canal: CanalSala,
  onNova: (m: MensagemSala) => void,
): () => void {
  const ch = supabase
    .channel(`sala_jogo_${eventoId}_${canal}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sala_jogo_mensagens',
        filter: `evento_id=eq.${eventoId}`,
      },
      payload => {
        const m = payload.new as MensagemSala;
        // O filtro do realtime só aceita uma condição; o canal separa-se aqui.
        if (m.canal === canal) onNova(m);
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}
