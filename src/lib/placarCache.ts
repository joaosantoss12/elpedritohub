import { supabase } from './supabase';
import { carregarJogos, ordenarJogos, type JogoAoVivo } from './placar';
import { LIGAS_NUCLEO } from './ligas';

/**
 * O que a aplicação usa para saber o que se está a jogar.
 *
 * Lê uma linha — a que o cron `api/placar/refresh` escreve depois de varrer as
 * ~140 competições do catálogo. Um pedido por visitante, em vez de um pedido
 * por competição por visitante, que era o que acontecia antes.
 *
 * Se a cache estiver velha (cron parado, deploy a meio, projecto novo sem a
 * migração 014), cai para a ESPN directa — mas só nas ligas do núcleo, que é
 * o que um browser aguenta pedir sozinho.
 */

/** A partir daqui a cache deixa de ser de confiança para jogos ao vivo. */
const VALIDADE_MS = 4 * 60 * 1000;

interface LinhaCache {
  jogos: JogoAoVivo[] | null;
  atualizado_em: string;
}

export interface Placar {
  jogos: JogoAoVivo[];
  /** De onde veio, para a página poder ser honesta sobre o atraso. */
  fonte: 'cache' | 'directo';
  atualizadoEm: Date | null;
}

export async function carregarPlacar(): Promise<Placar> {
  try {
    const { data, error } = await supabase
      .from('placar_cache')
      .select('jogos, atualizado_em')
      .eq('id', 1)
      .maybeSingle<LinhaCache>();

    if (!error && data?.jogos?.length) {
      const atualizadoEm = new Date(data.atualizado_em);
      const fresca = Date.now() - atualizadoEm.getTime() < VALIDADE_MS;
      if (fresca) {
        return { jogos: ordenarJogos(data.jogos), fonte: 'cache', atualizadoEm };
      }
    }
  } catch {
    // Sem cache não há drama — há o plano B a seguir.
  }

  return {
    jogos: await carregarJogos(LIGAS_NUCLEO),
    fonte: 'directo',
    atualizadoEm: new Date(),
  };
}
