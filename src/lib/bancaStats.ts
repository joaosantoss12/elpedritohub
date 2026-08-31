import { type Aposta, apostaProfit, sortApostas } from './banca';

export const isResolvida = (a: Aposta) => a.estado === 'ganha' || a.estado === 'perdida';

export interface BancaStats {
  count: number;
  settled: number;
  greens: number;
  reds: number;
  pending: number;
  winRate: number; // 0..100 sobre resolvidas
  staked: number;
  profit: number;
  roi: number; // %
  avgOdd: number;
  avgStake: number;
  bestWin: number;
  worstLoss: number;
  currentStreak: number; // + greens seguidos, - reds seguidos
  bankrollStart: number;
  bankrollEnd: number;
}

export function computeBancaStats(apostas: Aposta[], startingBankroll: number): BancaStats {
  const sorted = sortApostas(apostas);
  const greens = sorted.filter((a) => a.estado === 'ganha');
  const reds = sorted.filter((a) => a.estado === 'perdida');
  const pending = sorted.filter((a) => a.estado === 'pendente');
  const settled = greens.length + reds.length;

  const staked = sorted.reduce((s, a) => s + Number(a.valor_apostado), 0);
  const profit = Number(sorted.reduce((s, a) => s + apostaProfit(a), 0).toFixed(2));
  const settledStake = [...greens, ...reds].reduce((s, a) => s + Number(a.valor_apostado), 0);

  let currentStreak = 0;
  const settledSorted = sorted.filter(isResolvida);
  for (let i = settledSorted.length - 1; i >= 0; i--) {
    const s = settledSorted[i].estado;
    if (i === settledSorted.length - 1) currentStreak = s === 'ganha' ? 1 : -1;
    else if (s === 'ganha' && currentStreak > 0) currentStreak++;
    else if (s === 'perdida' && currentStreak < 0) currentStreak--;
    else break;
  }

  return {
    count: sorted.length,
    settled,
    greens: greens.length,
    reds: reds.length,
    pending: pending.length,
    winRate: settled ? (greens.length / settled) * 100 : 0,
    staked,
    profit,
    roi: settledStake ? (profit / settledStake) * 100 : 0,
    avgOdd: sorted.length ? sorted.reduce((s, a) => s + Number(a.odd), 0) / sorted.length : 0,
    avgStake: sorted.length ? staked / sorted.length : 0,
    bestWin: greens.reduce((m, a) => Math.max(m, apostaProfit(a)), 0),
    worstLoss: reds.reduce((m, a) => Math.min(m, apostaProfit(a)), 0),
    currentStreak,
    bankrollStart: startingBankroll,
    bankrollEnd: Number((startingBankroll + profit).toFixed(2)),
  };
}

// ── Buckets de evolução (ano/mês/dia) ─────────────────────────────────

export interface Bucket {
  key: string;
  label: string;
  unit: string; // rótulo longo para o tooltip
  bucketPnl: number;
  cum: number; // acumulado no fim do bucket (só P/L, sem banca inicial)
  count: number;
  staked: number;
}

function buckets(
  list: Aposta[],
  make: (a: Aposta) => { key: string; label: string; unit: string },
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const a of sortApostas(list)) {
    const base = make(a);
    const cur =
      map.get(base.key) ??
      ({ ...base, bucketPnl: 0, cum: 0, count: 0, staked: 0 } as Bucket);
    cur.bucketPnl += apostaProfit(a);
    cur.staked += Number(a.valor_apostado);
    cur.count += 1;
    map.set(base.key, cur);
  }
  const out = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  let cum = 0;
  for (const b of out) {
    b.bucketPnl = Number(b.bucketPnl.toFixed(2));
    b.staked = Number(b.staked.toFixed(2));
    cum = Number((cum + b.bucketPnl).toFixed(2));
    b.cum = cum;
  }
  return out;
}

const MS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function bucketsByYear(apostas: Aposta[]): Bucket[] {
  return buckets(apostas, (a) => {
    const y = a.data_aposta.slice(0, 4);
    return { key: y, label: y, unit: `Ano de ${y}` };
  });
}

export function bucketsByMonth(apostas: Aposta[], year: number): Bucket[] {
  const filtered = apostas.filter((a) => a.data_aposta.startsWith(`${year}-`));
  return buckets(filtered, (a) => {
    const m = Number(a.data_aposta.slice(5, 7)) - 1;
    return { key: a.data_aposta.slice(0, 7), label: MS[m], unit: `${MONTH_LONG[m]} de ${year}` };
  });
}

export function bucketsByDay(apostas: Aposta[], year: number, month: number): Bucket[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const filtered = apostas.filter((a) => a.data_aposta.startsWith(prefix));
  return buckets(filtered, (a) => {
    const d = Number(a.data_aposta.slice(8, 10));
    return { key: a.data_aposta, label: String(d), unit: `${d} de ${MONTH_LONG[month]}` };
  });
}

/** Série cumulativa aposta-a-aposta para a vista de um dia. */
export function apostaSeries(apostas: Aposta[]) {
  const pts: { label: string; cum: number; aposta: Aposta | null }[] = [
    { label: 'Início', cum: 0, aposta: null },
  ];
  let cum = 0;
  sortApostas(apostas).forEach((a, i) => {
    cum = Number((cum + apostaProfit(a)).toFixed(2));
    pts.push({ label: `A${i + 1}`, cum, aposta: a });
  });
  return pts;
}
