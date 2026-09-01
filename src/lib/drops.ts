import { supabase } from './supabase';
import { traduzErro } from './epcoins';

// EPC DROPs: uma janela de segundos, durante um jogo, em que quem estiver
// mesmo lá reclama moedas.
//
// A janela é verificada com o relógio do servidor. O contador que aparece no
// ecrã é só uma leitura local — chegar ao fim dele não é o que fecha o drop.

export interface DropAtivo {
  id: string;
  titulo: string;
  valor: number;
  fecha_em: string;
  jogo_label: string | null;
  reclamado: boolean;
}

/**
 * O drop aberto agora, ou nulo. `eventoId` limita aos drops daquele jogo;
 * sem ele vêm só os do Hub inteiro mais os que não estão presos a um jogo.
 */
export async function carregarDropAtivo(eventoId?: string): Promise<DropAtivo | null> {
  const { data, error } = await supabase.rpc('drop_ativo', {
    p_evento_id: eventoId ?? null,
  });
  if (error) {
    console.warn('Drops indisponíveis:', error.message);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as DropAtivo | null;
}

/** Devolve o saldo depois de reclamar. */
export async function reclamarDrop(dropId: string): Promise<number> {
  const { data, error } = await supabase.rpc('drop_reclamar', { p_drop_id: dropId });
  if (error) throw new Error(traduzErro(error.message));
  return Number(data ?? 0);
}

/** Segundos até o drop fechar. Zero quando já passou. */
export function segundosRestantes(drop: DropAtivo): number {
  return Math.max(0, Math.floor((new Date(drop.fecha_em).getTime() - Date.now()) / 1000));
}

/**
 * Marca presença numa sala e, se escreveu, a primeira mensagem do dia.
 *
 * É chamada depois de a mensagem já ter sido enviada, e de propósito: o pior
 * que pode acontecer se isto falhar é uma missão não avançar. O caminho da
 * mensagem em si fica intocado.
 */
export async function registarAtividadeNaSala(
  eventoId: string,
  escreveu: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('sala_registar_atividade', {
    p_evento_id: eventoId,
    p_escreveu: escreveu,
  });
  if (error) console.warn('Atividade na sala não registada:', error.message);
}

// ─── ADMIN ────────────────────────────────────────────────────

/**
 * Lança um drop. `duracaoSegundos` é curta de propósito — um drop de dez
 * minutos deixa de ser um motivo para ficar a ver o jogo.
 */
export async function lancarDrop(opcoes: {
  titulo?: string;
  valor: number;
  duracaoSegundos: number;
  eventoId?: string | null;
  jogoLabel?: string | null;
}): Promise<void> {
  const agora = new Date();
  const fecha = new Date(agora.getTime() + opcoes.duracaoSegundos * 1000);
  const { error } = await supabase.from('drops').insert({
    titulo: opcoes.titulo?.trim() || 'EPC DROP',
    valor: opcoes.valor,
    abre_em: agora.toISOString(),
    fecha_em: fecha.toISOString(),
    evento_id: opcoes.eventoId ?? null,
    jogo_label: opcoes.jogoLabel ?? null,
  });
  if (error) throw new Error(error.message);
}
