/**
 * Ponte para o widget de jogo do SofaScore.
 *
 * O SofaScore tem widgets oficiais e gratuitos para incorporar, mas o iframe
 * precisa do **id do evento** — e a API que mapeia equipas+data → id está
 * atrás da Cloudflare, que barra tudo o que não seja um browser residencial.
 * Do lado do servidor (cron, funções Vercel) dá sempre 403; do browser do
 * visitante costuma passar. Por isso a descoberta do id é feita aqui, no
 * cliente, e se falhar o painel simplesmente não aparece — é um extra.
 */

const BASE_WIDGET = 'https://widgets.sofascore.com/embed/event';
const API = 'https://www.sofascore.com/api/v1';

/** url do iframe para um id já conhecido. */
export function urlWidgetSofa(eventoId: number): string {
  return `${BASE_WIDGET}/${eventoId}?widgetTheme=dark&showCompetitor=true`;
}

// Palavras que não distinguem clubes e só atrapalham o casamento de nomes.
const RUIDO = new Set([
  'fc', 'cf', 'afc', 'sc', 'ac', 'cd', 'ss', 'ssc', 'sv', 'if', 'bk', 'ca',
  'club', 'clube', 'calcio', 'futbol', 'football', 'de', 'do', 'da', 'the',
  'u23', 'u21', 'u20', 'u19', 'ii', 'b', 'w', 'women', 'feminino',
]);

const DIACRITICOS = /[̀-ͯ]/g;

function fichas(nome: string): Set<string> {
  return new Set(
    nome
      .normalize('NFD')
      .replace(DIACRITICOS, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !RUIDO.has(t)),
  );
}

function combina(a: string, b: string): boolean {
  const fa = fichas(a);
  const fb = fichas(b);
  if (fa.size === 0 || fb.size === 0) return false;
  for (const t of fa) if (fb.has(t)) return true;
  return false;
}

interface EventoSofa {
  id: number;
  startTimestamp: number;
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
}

function diasUtc(iso: string): string[] {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return [];
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  const anterior = new Date(d.getTime() - 86_400_000);
  const seguinte = new Date(d.getTime() + 86_400_000);
  // O endpoint é por dia; um jogo perto da meia-noite pode cair no dia ao lado.
  return [...new Set([fmt(anterior), fmt(d), fmt(seguinte)])];
}

async function eventosDoDia(dia: string): Promise<EventoSofa[]> {
  const r = await fetch(`${API}/sport/football/scheduled-events/${dia}`, {
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(String(r.status));
  const j = (await r.json()) as { events?: EventoSofa[] };
  return j.events ?? [];
}

const cache = new Map<string, number | null>();

/**
 * Tenta descobrir o id do jogo no SofaScore a partir dos nomes das equipas e
 * da hora de início. Devolve `null` (e não atira) se não encontrar ou se a
 * Cloudflare barrar o pedido.
 */
export async function idJogoSofa(
  casa: string,
  fora: string,
  inicioIso: string,
): Promise<number | null> {
  const chave = `${casa}|${fora}|${inicioIso}`;
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado;

  let achado: number | null = null;
  try {
    const alvo = new Date(inicioIso).getTime();
    const dias = diasUtc(inicioIso);
    const lotes = await Promise.all(
      dias.map(d => eventosDoDia(d).catch(() => [] as EventoSofa[])),
    );
    const vistos = new Set<number>();
    const candidatos: Array<{ id: number; delta: number }> = [];
    for (const ev of lotes.flat()) {
      if (vistos.has(ev.id)) continue;
      vistos.add(ev.id);
      const h = ev.homeTeam?.name ?? '';
      const a = ev.awayTeam?.name ?? '';
      const certo = combina(h, casa) && combina(a, fora);
      const trocado = combina(h, fora) && combina(a, casa);
      if (!certo && !trocado) continue;
      const delta = Number.isFinite(alvo)
        ? Math.abs(ev.startTimestamp * 1000 - alvo)
        : 0;
      // Mais de 6h de diferença não é o mesmo jogo.
      if (delta > 6 * 3_600_000) continue;
      candidatos.push({ id: ev.id, delta });
    }
    candidatos.sort((x, y) => x.delta - y.delta);
    achado = candidatos[0]?.id ?? null;
  } catch {
    achado = null;
  }

  cache.set(chave, achado);
  return achado;
}
