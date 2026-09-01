import type { VercelRequest, VercelResponse } from '@vercel/node';
import { LIGAS_TODAS } from '../../src/lib/ligas';
import { carregarJogos } from '../../src/lib/placar';
import { supabaseUpdate } from '../_lib/supabaseAdmin';

/**
 * Varre todas as competições e guarda o resultado em `placar_cache`.
 *
 * É o único sítio do projecto que fala com a ESPN em lote. O browser lê a
 * linha que isto escreve — daí poder haver ~140 competições sem que o custo
 * cresça com o número de visitantes.
 *
 * Corre de 2 em 2 minutos. Não é gratuito em tempo de execução, por isso as
 * ligas vão em lotes: 140 pedidos em paralelo estouram os limites de sockets
 * da função e a ESPN começa a devolver erros.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const dado = req.headers.authorization?.replace(/^Bearer /, '')
      ?? (req.headers['x-cron-secret'] as string | undefined);
    if (dado !== segredo) return res.status(401).json({ error: 'nao autorizado' });
  }

  try {
    const jogos = await carregarJogos(LIGAS_TODAS, 12);

    // Só se escreve se houve resposta. Um apagão momentâneo da ESPN não pode
    // apagar a cache: mais vale o placar ficar dois minutos velho do que a
    // página ficar vazia.
    if (jogos.length === 0) {
      return res.status(200).json({ ok: true, jogos: 0, escrito: false });
    }

    await supabaseUpdate('placar_cache', { id: 'eq.1' }, {
      jogos,
      ligas: new Set(jogos.map(j => j.ligaSlug)).size,
      atualizado_em: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, jogos: jogos.length, escrito: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'erro' });
  }
}
