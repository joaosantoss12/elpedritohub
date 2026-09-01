import type { VercelRequest, VercelResponse } from '@vercel/node';
import { LIGAS_TODAS } from '../../src/lib/ligas';
import { carregarJogos, ordenarJogos, type JogoAoVivo } from '../../src/lib/placar';
import { supabaseSelect, supabaseUpdate } from '../_lib/supabaseAdmin';

/**
 * Mantém `placar_cache` fresco. É o único sítio do projecto que fala com a
 * ESPN em lote — o browser lê a linha que isto escreve.
 *
 * Corre de 2 em 2 minutos (pg_cron), mas não faz o mesmo de cada vez:
 *
 *   • de 30 em 30 min faz a **varredura completa** das ~140 competições, que
 *     é a única forma de descobrir jogos que ainda não estavam na cache;
 *   • nas outras corridas toca só nas ligas **quentes** — as que têm jogo a
 *     decorrer, a começar nas próximas 2h, ou acabado há pouco — e funde o
 *     resultado com o que já lá estava.
 *
 * À noite, sem nada quente, uma corrida não gasta praticamente nada.
 */

const INTERVALO_FULL_MS = 30 * 60 * 1000;

/** Quanto para trás/frente conta como "a acontecer agora" para efeitos de poll. */
const JANELA_ANTES_MS = 2 * 60 * 60 * 1000;
const JANELA_DEPOIS_MS = 20 * 60 * 1000;

/** Um jogo que acabou há muito não precisa de continuar na cache do dia. */
const VALIDADE_TERMINADO_MS = 30 * 60 * 60 * 1000;

interface LinhaCache {
  jogos: JogoAoVivo[] | null;
  full_em: string | null;
}

function estaQuente(j: JogoAoVivo, agora: number): boolean {
  if (j.estado === 'ao_vivo' || j.estado === 'intervalo') return true;
  const t = new Date(j.inicio).getTime();
  if (!Number.isFinite(t)) return false;
  if (j.estado === 'agendado') return t - agora < JANELA_ANTES_MS && t > agora - JANELA_DEPOIS_MS;
  // Terminado há pouco: uma última passagem para fixar o resultado final.
  if (j.estado === 'terminado') return agora - t < JANELA_ANTES_MS + JANELA_DEPOIS_MS;
  return false;
}

function autenticado(req: VercelRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return true;
  const dado = req.headers.authorization?.replace(/^Bearer /, '')
    ?? (req.headers['x-cron-secret'] as string | undefined);
  return dado === segredo;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!autenticado(req)) return res.status(401).json({ error: 'nao autorizado' });

  const agora = Date.now();
  const forcarFull = 'full' in req.query;

  try {
    const [linha] = await supabaseSelect<LinhaCache>('placar_cache', {
      id: 'eq.1', select: 'jogos,full_em', limit: '1',
    });
    const anteriores = linha?.jogos ?? [];
    const ultimoFull = linha?.full_em ? new Date(linha.full_em).getTime() : 0;

    const full = forcarFull
      || anteriores.length === 0
      || agora - ultimoFull > INTERVALO_FULL_MS;

    if (full) {
      // Janela de tres dias: ontem (resultados que ainda interessam), hoje e
      // amanha (o filtro "amanha" da Sala de Jogo le desta mesma linha).
      const DIA_MS = 24 * 60 * 60 * 1000;
      const janela = { de: new Date(agora - DIA_MS), ate: new Date(agora + DIA_MS) };
      const jogos = await carregarJogos(LIGAS_TODAS, 12, janela);
      // Um apagão momentâneo da ESPN não pode apagar a cache: mais vale o
      // placar ficar meia hora velho do que a página ficar vazia.
      if (jogos.length === 0) {
        return res.status(200).json({ ok: true, escopo: 'completo', jogos: 0, escrito: false });
      }
      await supabaseUpdate('placar_cache', { id: 'eq.1' }, {
        jogos,
        ligas: new Set(jogos.map(j => j.ligaSlug)).size,
        atualizado_em: new Date().toISOString(),
        full_em: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, escopo: 'completo', jogos: jogos.length });
    }

    // Corrida leve: só as ligas que têm algo a acontecer.
    const quentes = [...new Set(
      anteriores.filter(j => estaQuente(j, agora)).map(j => j.ligaSlug),
    )];

    if (quentes.length === 0) {
      return res.status(200).json({ ok: true, escopo: 'leve', ligas: 0, escrito: false });
    }

    const frescos = await carregarJogos(quentes, 12);
    const quentesSet = new Set(quentes);

    // Funde: os jogos das ligas quentes vêm todos da passagem nova; os
    // restantes ficam como estavam, menos os que já acabaram há horas.
    const mantidos = anteriores.filter(j =>
      !quentesSet.has(j.ligaSlug)
      && !(j.estado === 'terminado'
        && agora - new Date(j.inicio).getTime() > VALIDADE_TERMINADO_MS),
    );
    const jogos = ordenarJogos([...mantidos, ...frescos]);

    await supabaseUpdate('placar_cache', { id: 'eq.1' }, {
      jogos,
      ligas: new Set(jogos.map(j => j.ligaSlug)).size,
      atualizado_em: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, escopo: 'leve', ligas: quentes.length, jogos: jogos.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'erro' });
  }
}
