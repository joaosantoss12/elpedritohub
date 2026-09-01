import { supabase } from './supabase';
import { traduzErro } from './epcoins';
import { type JogoAoVivo } from './placar';
import { carregarPlacar } from './placarCache';

// Batalha de Prognósticos.
//
// Cada membro faz o *seu* boletim: escolhe até cinco jogos do dia que ainda
// não começaram e diz o que acha que vai acontecer em cada um. Não há nada
// configurado pelo admin — os jogos vêm da mesma API que dá o placar.
//
// Nada aqui decide se um palpite estava certo. Isso é do servidor, a partir
// do resultado final, e é por isso que este ficheiro só sabe ler e guardar.

// ─── TIPOS ────────────────────────────────────────────────────

export interface OpcaoMercado {
  chave: string;
  label: string;
}

export interface Mercado {
  chave: string;
  nome: string;
  opcoes: OpcaoMercado[];
  ordem: number;
}

export interface Escolha {
  evento_id: string;
  jogo_label: string;
  liga: string | null;
  inicio: string;
  mercado: string;
  escolha: string;
  escolha_label: string;
}

export interface EscolhaGuardada extends Escolha {
  id: string;
  correta: boolean | null;
}

export interface MeuBoletim {
  id: string | null;
  dia: string;
  acertos: number;
  resolvidas: number;
  pontos: number;
  escolhas: EscolhaGuardada[];
}

export interface LinhaRankingBatalha {
  posicao: number;
  username: string;
  pontos: number;
  acertos: number;
  boletins: number;
}

/** Quantos jogos entram num boletim. O servidor impõe o mesmo número. */
export const MAX_JOGOS = 5;

// ─── JOGOS ELEGÍVEIS ──────────────────────────────────────────

/**
 * Os jogos que ainda dá para escolher: agendados, com hora conhecida, e com
 * folga suficiente para o palpite não ser feito com o jogo a arrancar.
 *
 * A margem existe porque o `inicio` da ESPN é a hora marcada, não a hora do
 * apito. Um minuto de diferença chegaria para alguém escolher já com a bola
 * a rolar, e o servidor recusaria — mais vale nem oferecer o jogo.
 */
const MARGEM_MS = 3 * 60 * 1000;

export async function carregarJogosElegiveis(): Promise<JogoAoVivo[]> {
  const { jogos } = await carregarPlacar();
  const limite = Date.now() + MARGEM_MS;
  return jogos
    .filter((j) => j.estado === 'agendado' && j.inicio)
    .filter((j) => {
      const t = new Date(j.inicio).getTime();
      return Number.isFinite(t) && t > limite;
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/**
 * O rótulo de uma opção com o nome das equipas no lugar de "Casa" e "Fora".
 *
 * A tabela de mercados guarda o papel (`casa`/`fora`) e não o nome, porque a
 * linha é a mesma para todos os jogos. É aqui que volta a ser legível.
 */
export function rotularOpcao(o: OpcaoMercado, jogo: JogoAoVivo): string {
  return o.label
    .replace(/^Casa\b/, jogo.casa)
    .replace(/^Fora\b/, jogo.fora)
    .replace(/\bCasa vence$/, `${jogo.casa} vence`)
    .replace(/\bFora vence$/, `${jogo.fora} vence`);
}

// ─── LEITURA ──────────────────────────────────────────────────

export async function carregarMercados(): Promise<Mercado[]> {
  const { data, error } = await supabase
    .from('batalha_mercados')
    .select('chave, nome, opcoes, ordem')
    .eq('ativo', true)
    .order('ordem');

  if (error) {
    console.warn('Mercados indisponíveis:', error.message);
    return [];
  }
  return (data ?? []) as Mercado[];
}

/**
 * O boletim de hoje. A RPC devolve uma linha por escolha (e uma linha com a
 * escolha a nulo quando o boletim existe mas está vazio); aqui volta a ser um
 * objecto com uma lista.
 */
export async function carregarMeuBoletim(): Promise<MeuBoletim | null> {
  const { data, error } = await supabase.rpc('batalha_meu_boletim', { p_dia: null });
  if (error) {
    console.warn('Boletim indisponível:', error.message);
    return null;
  }

  const linhas = (data ?? []) as Record<string, unknown>[];
  if (linhas.length === 0) return null;

  const l0 = linhas[0];
  return {
    id: (l0.boletim_id as string) ?? null,
    dia: l0.dia as string,
    acertos: Number(l0.acertos ?? 0),
    resolvidas: Number(l0.resolvidas ?? 0),
    pontos: Number(l0.pontos ?? 0),
    escolhas: linhas
      .filter((l) => l.escolha_id)
      .map((l) => ({
        id: l.escolha_id as string,
        evento_id: l.evento_id as string,
        jogo_label: l.jogo_label as string,
        liga: (l.liga as string) ?? null,
        inicio: l.inicio as string,
        mercado: l.mercado as string,
        escolha: l.escolha as string,
        escolha_label: l.escolha_label as string,
        correta: (l.correta as boolean | null) ?? null,
      })),
  };
}

export async function carregarRankingBatalha(limite = 50): Promise<LinhaRankingBatalha[]> {
  const { data, error } = await supabase.rpc('batalha_ranking', { p_limite: limite });
  if (error) {
    console.warn('Ranking indisponível:', error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    posicao: Number(l.posicao),
    username: l.username as string,
    pontos: Number(l.pontos ?? 0),
    acertos: Number(l.acertos ?? 0),
    boletins: Number(l.boletins ?? 0),
  }));
}

// ─── ESCRITA ──────────────────────────────────────────────────

/**
 * Guarda o boletim inteiro. Manda-se sempre o estado completo do que ainda
 * dá para mudar — o servidor é que substitui, e as escolhas de jogos já
 * começados ficam trancadas do lado de lá.
 */
export async function guardarBoletim(escolhas: Escolha[]): Promise<string> {
  const { data, error } = await supabase.rpc('batalha_guardar', { p_escolhas: escolhas });
  if (error) throw new Error(traduzErro(error.message));
  return data as string;
}

/** Já começou — logo, já não se muda. */
export function estaTrancada(e: { inicio: string }): boolean {
  return new Date(e.inicio).getTime() <= Date.now();
}
