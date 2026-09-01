import { supabase } from './supabase';
import { traduzErro } from './epcoins';

// Previsões gratuitas.
//
// Uma só mecânica — pergunta com opções fixas, uma resposta por membro, uma
// resolução — serve a Batalha de Prognósticos (perguntas agrupadas num
// boletim diário), o Pedrito vs Comunidade (a escolha dele guardada e só
// revelada no fecho), as perguntas dentro da Sala de Jogo (presas a um
// evento) e o MVP da Comunidade (uma pergunta que fecha aos 30 minutos).
//
// Não há dinheiro em lado nenhum: responder é grátis e o que se ganha são
// EPCoins. É isso que mantém isto fora do perímetro de jogo.

// ─── TIPOS ────────────────────────────────────────────────────

export interface OpcaoPergunta {
  chave: string;
  label: string;
}

export interface Pergunta {
  id: string;
  boletim_id: string | null;
  evento_id: string | null;
  jogo_label: string | null;
  texto: string;
  mercado: string;
  opcoes: OpcaoPergunta[];
  pedrito_escolha: string | null;
  revelar_pedrito: boolean;
  abre_em: string;
  fecha_em: string;
  peso: number;
  resposta_correta: string | null;
  resolvida_em: string | null;
}

export interface Boletim {
  id: string;
  data: string;
  titulo: string;
  descricao: string | null;
  estado: 'rascunho' | 'aberto' | 'fechado' | 'resolvido';
}

export interface MinhaPrevisao {
  pergunta_id: string;
  escolha: string;
  correta: boolean | null;
}

export interface Distribuicao {
  chave: string | null;
  votos: number;
  aberta: boolean;
}

export interface LinhaRankingPrevisoes {
  user_id: string;
  username: string;
  respondidas: number;
  acertos: number;
  taxa: number | null;
}

export interface PedritoVsComunidade {
  perguntas: number;
  pedrito_acertos: number;
  comunidade_taxa: number | null;
  participantes: number;
}

const COLUNAS_PERGUNTA =
  'id, boletim_id, evento_id, jogo_label, texto, mercado, opcoes, pedrito_escolha, revelar_pedrito, abre_em, fecha_em, peso, resposta_correta, resolvida_em' as const;

/** Uma pergunta só aceita respostas entre abrir e fechar. */
export function estaAberta(p: Pergunta): boolean {
  const agora = Date.now();
  return agora >= new Date(p.abre_em).getTime() && agora < new Date(p.fecha_em).getTime();
}

/** Segundos até fechar; zero quando já fechou. Serve o contador do ecrã. */
export function segundosParaFechar(p: Pergunta): number {
  return Math.max(0, Math.floor((new Date(p.fecha_em).getTime() - Date.now()) / 1000));
}

// ─── LEITURA ──────────────────────────────────────────────────

/** Falha em silêncio se a migração 008 ainda não correu. */
export async function carregarBoletimDeHoje(): Promise<{
  boletim: Boletim | null;
  perguntas: Pergunta[];
}> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: b, error: erroB } = await supabase
    .from('previsao_boletins')
    .select('id, data, titulo, descricao, estado')
    .eq('data', hoje)
    .neq('estado', 'rascunho')
    .maybeSingle();

  if (erroB || !b) {
    if (erroB) console.warn('Boletim indisponível:', erroB.message);
    return { boletim: null, perguntas: [] };
  }

  const { data: qs, error: erroQ } = await supabase
    .from('previsao_perguntas')
    .select(COLUNAS_PERGUNTA)
    .eq('boletim_id', b.id)
    .order('fecha_em');

  if (erroQ) {
    console.warn('Perguntas indisponíveis:', erroQ.message);
    return { boletim: b as Boletim, perguntas: [] };
  }
  return { boletim: b as Boletim, perguntas: (qs ?? []) as unknown as Pergunta[] };
}

/** As perguntas de um jogo — é o que aparece dentro da Sala. */
export async function carregarPerguntasDoEvento(eventoId: string): Promise<Pergunta[]> {
  const { data, error } = await supabase
    .from('previsao_perguntas')
    .select(COLUNAS_PERGUNTA)
    .eq('evento_id', eventoId)
    .order('fecha_em');
  if (error) {
    console.warn('Perguntas da sala indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as unknown as Pergunta[];
}

/** As respostas do próprio, para as perguntas indicadas. */
export async function carregarMinhasPrevisoes(perguntaIds: string[]): Promise<MinhaPrevisao[]> {
  if (perguntaIds.length === 0) return [];
  const { data, error } = await supabase
    .from('previsoes')
    .select('pergunta_id, escolha, correta')
    .in('pergunta_id', perguntaIds);
  if (error) {
    console.warn('Previsões próprias indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as MinhaPrevisao[];
}

/**
 * Enquanto a pergunta está aberta isto devolve só o total, sem abrir por
 * opção — é o servidor que decide, para não enviesar quem ainda não votou.
 */
export async function carregarDistribuicao(perguntaId: string): Promise<Distribuicao[]> {
  const { data, error } = await supabase.rpc('previsao_distribuicao', {
    p_pergunta_id: perguntaId,
  });
  if (error) {
    console.warn('Distribuição indisponível:', error.message);
    return [];
  }
  return ((data ?? []) as Distribuicao[]).map((d) => ({ ...d, votos: Number(d.votos) }));
}

export async function carregarRankingPrevisoes(
  desde?: string,
  limite = 50,
): Promise<LinhaRankingPrevisoes[]> {
  const { data, error } = await supabase.rpc('previsao_ranking', {
    p_desde: desde ?? null,
    p_limite: limite,
  });
  if (error) {
    console.warn('Ranking de previsões indisponível:', error.message);
    return [];
  }
  return ((data ?? []) as LinhaRankingPrevisoes[]).map((l) => ({
    ...l,
    respondidas: Number(l.respondidas),
    acertos: Number(l.acertos),
  }));
}

export async function carregarPedritoVsComunidade(
  desde?: string,
): Promise<PedritoVsComunidade | null> {
  const { data, error } = await supabase.rpc('previsao_pedrito_vs_comunidade', {
    p_desde: desde ?? null,
  });
  if (error) {
    console.warn('Pedrito vs Comunidade indisponível:', error.message);
    return null;
  }
  const l = Array.isArray(data) ? data[0] : data;
  if (!l) return null;
  return {
    perguntas: Number(l.perguntas ?? 0),
    pedrito_acertos: Number(l.pedrito_acertos ?? 0),
    comunidade_taxa: l.comunidade_taxa === null ? null : Number(l.comunidade_taxa),
    participantes: Number(l.participantes ?? 0),
  };
}

// ─── ESCRITA ──────────────────────────────────────────────────

/** Deixa mudar de ideias enquanto estiver aberta; só credita à primeira. */
export async function responder(perguntaId: string, escolha: string): Promise<void> {
  const { error } = await supabase.rpc('previsao_responder', {
    p_pergunta_id: perguntaId,
    p_escolha: escolha,
  });
  if (error) throw new Error(traduzErro(error.message));
}

// ─── ADMIN ────────────────────────────────────────────────────

/** Devolve quantos acertaram. Só o Admin passa a verificação do servidor. */
export async function resolverPergunta(perguntaId: string, resposta: string): Promise<number> {
  const { data, error } = await supabase.rpc('previsao_resolver', {
    p_pergunta_id: perguntaId,
    p_resposta: resposta,
  });
  if (error) throw new Error(traduzErro(error.message));
  return Number(data ?? 0);
}

/** Bónus de boletim perfeito. Corre-se com todas as perguntas resolvidas. */
export async function fecharBoletim(boletimId: string): Promise<number> {
  const { data, error } = await supabase.rpc('previsao_fechar_boletim', {
    p_boletim_id: boletimId,
  });
  if (error) throw new Error(traduzErro(error.message));
  return Number(data ?? 0);
}
