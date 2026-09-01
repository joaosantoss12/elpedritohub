import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseRpc } from '../_lib/supabaseAdmin';

/**
 * Resolvedor da Batalha de Prognósticos.
 *
 * Corre no servidor, e só no servidor, porque `batalha_registar_resultado`
 * recusa qualquer chamada com `auth.uid()` que não seja de um admin. Um
 * membro nunca pode declarar o resultado do jogo em que apostou — essa é a
 * única garantia que faz o ranking valer alguma coisa.
 *
 * O trabalho é: perguntar à base que jogos ainda têm palpites por resolver,
 * ir buscar o resultado final desses jogos à ESPN, e entregá-lo. Nada aqui
 * decide quem acertou; isso é a `batalha_acertou`, em SQL, para a regra
 * viver num sítio só.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// As mesmas ligas que o Hub mostra. Manter em sincronia com LIGAS_PADRAO em
// src/lib/placar.ts — um jogo de uma liga que não esteja aqui nunca chega a
// poder ser escolhido, por isso também nunca precisa de ser resolvido.
const LIGAS = [
  'por.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
  'uefa.champions', 'uefa.champions_qual',
  'uefa.europa', 'uefa.europa_qual',
  'uefa.europa.conf', 'uefa.europa.conf_qual',
  'ned.1', 'bel.1', 'sco.1', 'den.1', 'swe.1', 'nor.1', 'tur.1', 'sui.1', 'aut.1',
  'bra.1', 'arg.1', 'conmebol.libertadores', 'conmebol.sudamericana',
  'usa.1', 'ksa.1', 'jpn.1', 'kor.1',
  'fifa.world', 'uefa.euro', 'conmebol.america',
];

interface Pendente { evento_id: string; inicio: string; escolhas: number }

interface Achado {
  liga: string;
  terminado: boolean;
  casa: number;
  fora: number;
  idCasa: string;
  idFora: string;
}

/** YYYYMMDD, o formato que o parâmetro `dates` da ESPN aceita. */
function diaEspn(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Varre os scoreboards à procura dos jogos pendentes.
 *
 * A ESPN indexa os jogos por liga, e o `evento_id` guardado no boletim não
 * diz a que liga pertence. Em vez de guardar mais uma coluna só para isto,
 * descobre-se a liga varrendo os dias em que os pendentes começaram — que
 * são poucos, porque um pendente tem no máximo umas horas.
 */
async function localizar(pendentes: Pendente[]): Promise<Map<string, Achado>> {
  const dias = new Set(pendentes.map((p) => diaEspn(new Date(p.inicio))));
  const querer = new Set(pendentes.map((p) => p.evento_id));
  const achados = new Map<string, Achado>();

  for (const liga of LIGAS) {
    if (achados.size === querer.size) break;

    for (const dia of dias) {
      let json: Record<string, unknown> | null = null;
      try {
        const res = await fetch(`${BASE}/${liga}/scoreboard?dates=${dia}`);
        if (!res.ok) continue;
        json = await res.json();
      } catch {
        continue;
      }

      const eventos = (json?.events ?? []) as Record<string, unknown>[];
      for (const ev of eventos) {
        const id = String(ev?.id ?? '');
        if (!querer.has(id) || achados.has(id)) continue;

        const comp = (ev?.competitions as Record<string, unknown>[] | undefined)?.[0];
        const equipas = (comp?.competitors ?? []) as Record<string, unknown>[];
        const casa = equipas.find((c) => c?.homeAway === 'home');
        const fora = equipas.find((c) => c?.homeAway === 'away');
        if (!casa || !fora) continue;

        const estado = comp?.status as { type?: { completed?: boolean } } | undefined;

        achados.set(id, {
          liga,
          terminado: estado?.type?.completed === true,
          casa: Number(casa.score ?? 0),
          fora: Number(fora.score ?? 0),
          idCasa: idDaEquipa(casa),
          idFora: idDaEquipa(fora),
        });
      }
    }
  }

  return achados;
}

function idDaEquipa(c: Record<string, unknown>): string {
  const t = c?.team as { id?: string | number } | undefined;
  return String(t?.id ?? c?.id ?? '');
}

/**
 * Quem marcou primeiro: 'casa', 'fora' ou 'nenhum'.
 *
 * O sumário traz os lances por ordem; o primeiro golo é o primeiro lance
 * marcado como golo. Um autogolo conta para a equipa adversária, e é por
 * isso que se olha para `ownGoal` antes de aceitar o `team.id` do lance.
 * Sem sumário fica 'nenhum', que é o que a base assume por omissão.
 */
async function primeiroGolo(a: Achado, eventoId: string): Promise<'casa' | 'fora' | 'nenhum'> {
  if (a.casa + a.fora === 0) return 'nenhum';

  let json: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${BASE}/${a.liga}/summary?event=${eventoId}`);
    if (!res.ok) return 'nenhum';
    json = await res.json();
  } catch {
    return 'nenhum';
  }

  const lances = ((json?.plays ?? json?.keyEvents ?? []) as Record<string, unknown>[]);
  for (const l of lances) {
    const tipo = String((l?.type as { text?: string } | undefined)?.text ?? '').toLowerCase();
    const eGolo = l?.scoringPlay === true || tipo.includes('goal');
    // As grandes penalidades do desempate não são golos do jogo.
    if (!eGolo || tipo.includes('shootout')) continue;

    const marcou = String((l?.team as { id?: string | number } | undefined)?.id ?? '');
    const lado = marcou === a.idCasa ? 'casa' : marcou === a.idFora ? 'fora' : null;
    if (!lado) continue;

    const proprio = l?.ownGoal === true || tipo.includes('own goal');
    if (!proprio) return lado;
    return lado === 'casa' ? 'fora' : 'casa';
  }

  return 'nenhum';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Protege contra quem descobrir a rota. O cron da Vercel manda o header de
  // autorização; um pedido de fora não o consegue forjar sem o segredo.
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const auth = req.headers.authorization ?? '';
    const dado = req.headers['x-cron-secret'];
    if (auth !== `Bearer ${segredo}` && dado !== segredo) {
      return res.status(401).json({ error: 'nao autorizado' });
    }
  }

  try {
    const pendentes = await supabaseRpc<Pendente[]>('batalha_eventos_por_resolver');
    if (pendentes.length === 0) {
      return res.status(200).json({ pendentes: 0, resolvidos: 0, por_terminar: 0 });
    }

    const achados = await localizar(pendentes);
    let resolvidos = 0;
    let porTerminar = 0;

    for (const p of pendentes) {
      const a = achados.get(p.evento_id);
      // Um jogo que a ESPN ainda não deu por terminado fica para a próxima
      // passagem. Prolongamentos e interrupções acontecem, e resolver cedo
      // é pior do que resolver tarde: não há como desfazer os créditos.
      if (!a || !a.terminado) { porTerminar += 1; continue; }

      const primeiro = await primeiroGolo(a, p.evento_id);
      await supabaseRpc('batalha_registar_resultado', {
        p_evento_id: p.evento_id,
        p_golos_casa: a.casa,
        p_golos_fora: a.fora,
        p_primeiro: primeiro,
      });
      resolvidos += 1;
    }

    return res.status(200).json({ pendentes: pendentes.length, resolvidos, por_terminar: porTerminar });
  } catch (e) {
    console.error('batalha/resolver:', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'erro' });
  }
}
