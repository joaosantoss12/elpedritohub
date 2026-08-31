import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Plus, ChevronLeft, ChevronRight, X, Target, CheckCircle, XCircle, Clock,
  Calendar, Pencil, Trash2, Lock as LockIcon, ShieldCheck, Download,
  Wallet, TrendingUp, Flame,
} from 'lucide-react';
import {
  carregarTips, calcularStats, fmtPercent, fmtRoi, VERTICAL_LABELS, type RaioxTip,
} from '../lib/raiox';
import {
  type Aposta, type Selecao, apostaProfit, sortApostas,
  fetchApostas, createAposta, updateAposta, deleteAposta,
  fetchBancaSettings, updateStartingBankroll,
} from '../lib/banca';
import {
  computeBancaStats, bucketsByYear, bucketsByMonth, bucketsByDay, apostaSeries, type Bucket,
} from '../lib/bancaStats';
import { money, signedMoney, pct, signedPct, num, monthName, fmtDay } from '../lib/bancaFormat';
import { downloadBancaExcel } from '../lib/bancaExcel';
import '../styles/Banca.css';

// ── Constants ──────────────────────────────────────────────────────────

const SPORTS = ['Futebol', 'Basquetebol', 'Ténis', 'Hóquei', 'Basebol', 'Rugby', 'MMA / Boxe', 'Outro'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

type Level = 'all' | 'year' | 'month' | 'day';

// ── Helpers ────────────────────────────────────────────────────────────

const calculateProfit = apostaProfit;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}
function fmtDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Chart tooltips ─────────────────────────────────────────────────────

interface DayPoint { label: string; cum: number; aposta: Aposta | null }

function BetTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DayPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point.aposta) {
    return (
      <div className="banca-tooltip">
        <div className="banca-tooltip__title">Início do dia</div>
        <div className="banca-tooltip__value neutral">€0.00</div>
      </div>
    );
  }
  const a = point.aposta;
  const profit = calculateProfit(a);
  const potencial = a.odd * a.valor_apostado;
  return (
    <div className="banca-tooltip">
      <div className="banca-tooltip__sport">{a.tipo === 'multipla' ? 'Múltipla' : a.desporto}</div>
      <div className="banca-tooltip__match">
        {a.equipa_casa} <span>vs</span> {a.equipa_fora}
      </div>
      {a.mercado && <div className="banca-tooltip__mercado">{a.mercado}</div>}
      <div className="banca-tooltip__grid">
        <span>Odd</span><strong>@{a.odd.toFixed(2)}</strong>
        <span>Apostado</span><strong>€{a.valor_apostado.toFixed(2)}</strong>
        <span>Potencial</span><strong>€{potencial.toFixed(2)}</strong>
      </div>
      <div className={`banca-tooltip__result banca-tooltip__result--${a.estado}`}>
        {a.estado === 'ganha' && <><CheckCircle size={12} /> +€{profit.toFixed(2)}</>}
        {a.estado === 'perdida' && <><XCircle size={12} /> -€{Math.abs(profit).toFixed(2)}</>}
        {a.estado === 'pendente' && <><Clock size={12} /> Pendente</>}
      </div>
      <div className={`banca-tooltip__cumulative ${point.cum >= 0 ? 'pos' : 'neg'}`}>
        Saldo acumulado: {signedMoney(point.cum)}
      </div>
    </div>
  );
}

function BucketTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Bucket }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="banca-tooltip" style={{ minWidth: 170 }}>
      <div className="banca-tooltip__sport" style={{ marginBottom: 6 }}>{p.unit}</div>
      <div className="banca-tooltip__grid">
        <span>P/L do período</span>
        <strong className={p.bucketPnl >= 0 ? 'pos' : 'neg'}>{signedMoney(p.bucketPnl)}</strong>
        <span>Acumulado</span>
        <strong className={p.cum >= 0 ? 'pos' : 'neg'}>{signedMoney(p.cum)}</strong>
        <span>Apostas</span><strong>{p.count}</strong>
        <span>Investido</span><strong>{money(p.staked)}</strong>
      </div>
    </div>
  );
}

interface DotProps { cx?: number; cy?: number; payload?: DayPoint }

function CustomDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (!payload?.aposta || cx === undefined || cy === undefined) return null;
  const color =
    payload.aposta.estado === 'ganha' ? '#4ade80' :
    payload.aposta.estado === 'perdida' ? '#f87171' : '#6f6047';
  return <circle cx={cx} cy={cy} r={6} fill={color} stroke="rgba(44, 34, 22,0.25)" strokeWidth={2} />;
}
function CustomActiveDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const color = !payload?.aposta ? '#9a6238' :
    payload.aposta.estado === 'ganha' ? '#4ade80' :
    payload.aposta.estado === 'perdida' ? '#f87171' : '#6f6047';
  return <circle cx={cx} cy={cy} r={9} fill={color} stroke="rgba(44, 34, 22,0.6)" strokeWidth={2} />;
}

// ── Stat card ──────────────────────────────────────────────────────────

function StatCard({ label, value, hint, tone, icon }: {
  label: string; value: string; hint?: string;
  tone?: 'pos' | 'neg' | 'gold'; icon?: React.ReactNode;
}) {
  return (
    <div className="banca-statcard">
      <div className="banca-statcard__top">
        <span className="banca-statcard__label">{label}</span>
        {icon && <span className="banca-statcard__icon">{icon}</span>}
      </div>
      <div className={`banca-statcard__value ${tone ?? ''}`}>{value}</div>
      {hint && <div className="banca-statcard__hint">{hint}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function BancaManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayKey = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  const [level, setLevel] = useState<Level>('month');
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAposta, setEditingAposta] = useState<Aposta | null>(null);
  const [editForm, setEditForm] = useState({
    desporto: 'Futebol', equipa_casa: '', equipa_fora: '', mercado: '',
    odd: '', valor_apostado: '', estado: 'pendente' as Aposta['estado'], data_aposta: todayKey,
  });
  const [editSelecoes, setEditSelecoes] = useState<Selecao[]>([]);

  // Banca inicial (DB-backed)
  const [startingBalance, setStartingBalance] = useState(0);
  const [currency] = useState('EUR');
  const [showBankrollModal, setShowBankrollModal] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);

  const [form, setForm] = useState({
    tipo: 'simples' as 'simples' | 'multipla',
    desporto: 'Futebol', equipa_casa: '', equipa_fora: '', mercado: '',
    odd: '', valor_apostado: '', estado: 'pendente' as Aposta['estado'], data_aposta: todayKey,
  });
  const emptySelecao = (): Selecao => ({ desporto: 'Futebol', equipa_casa: '', equipa_fora: '', mercado: '', odd: '' });
  const [selecoes, setSelecoes] = useState<Selecao[]>([emptySelecao(), emptySelecao()]);

  const [exporting, setExporting] = useState(false);

  // ── Canal auditado ───────────────────────────────────────────────────
  const [tipsAuditadas, setTipsAuditadas] = useState<RaioxTip[]>([]);
  useEffect(() => {
    carregarTips({ canal: 'publico', desdeDias: 90, limite: 400 }).then(setTipsAuditadas);
  }, []);
  const statsCanal = useMemo(() => calcularStats(tipsAuditadas), [tipsAuditadas]);
  const tipsImportaveis = useMemo(() => {
    const registadas = new Set(
      apostas.map(a => `${a.equipa_casa}|${a.equipa_fora}|${a.mercado}`.toLowerCase()),
    );
    return tipsAuditadas
      .filter(t => !registadas.has(`${t.evento}||${t.pick}`.toLowerCase()))
      .slice(0, 6);
  }, [tipsAuditadas, apostas]);
  const importarTip = (tip: RaioxTip) => {
    const [casa, fora] = tip.evento.split(/\s+(?:vs\.?|x|-)\s+/i);
    setForm({
      tipo: 'simples',
      desporto: tip.vertical === 'tenis' ? 'Ténis' : 'Futebol',
      equipa_casa: (casa ?? tip.evento).trim(),
      equipa_fora: (fora ?? '').trim(),
      mercado: tip.pick,
      odd: String(tip.odd),
      valor_apostado: '',
      estado: tip.resultado === 'green' ? 'ganha' : tip.resultado === 'red' ? 'perdida' : 'pendente',
      data_aposta: tip.publicado_em.slice(0, 10),
    });
    setShowModal(true);
  };

  // ── Load data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [rows, settings] = await Promise.all([fetchApostas(), fetchBancaSettings(user.id)]);
        if (!alive) return;
        setApostas(rows);
        setStartingBalance(settings.starting_bankroll);
      } catch { /* noop */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const reload = useCallback(async () => {
    const rows = await fetchApostas();
    setApostas(rows);
  }, []);

  const saveStartingBalance = async () => {
    if (!user) return;
    const val = parseFloat(balanceInput);
    if (isNaN(val) || val < 0) return;
    setSavingBalance(true);
    try {
      await updateStartingBankroll(user.id, val);
      setStartingBalance(val);
      setShowBankrollModal(false);
    } catch { /* noop */ }
    setSavingBalance(false);
  };

  // ── Derived: scope + stats ───────────────────────────────────────────
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const allSorted = useMemo(() => sortApostas(apostas), [apostas]);

  const scopedBets = useMemo(() => {
    if (level === 'all') return allSorted;
    if (level === 'year') return allSorted.filter(a => a.data_aposta.startsWith(`${currentYear}-`));
    if (level === 'day') return allSorted.filter(a => a.data_aposta === selectedDate);
    return allSorted.filter(a => a.data_aposta.startsWith(monthPrefix));
  }, [level, allSorted, currentYear, monthPrefix, selectedDate]);

  const priorBankroll = useMemo(() => {
    if (level === 'all') return startingBalance;
    const start =
      level === 'year' ? `${currentYear}-01-01`
      : level === 'day' && selectedDate ? selectedDate
      : `${monthPrefix}-01`;
    return Number((startingBalance + apostas
      .filter(a => a.data_aposta < start)
      .reduce((s, a) => s + calculateProfit(a), 0)).toFixed(2));
  }, [apostas, level, currentYear, monthPrefix, selectedDate, startingBalance]);

  const stats = useMemo(() => computeBancaStats(scopedBets, priorBankroll), [scopedBets, priorBankroll]);

  const allTimeProfit = useMemo(
    () => Number(apostas.reduce((s, a) => s + calculateProfit(a), 0).toFixed(2)),
    [apostas],
  );
  const currentBalance = Number((startingBalance + allTimeProfit).toFixed(2));

  const periodLabel =
    level === 'all' ? 'Histórico completo'
    : level === 'year' ? `Ano de ${currentYear}`
    : level === 'day' && selectedDate ? fmtDay(selectedDate)
    : `${monthName(currentMonth)} de ${currentYear}`;

  // ── Daily P&L map (calendar) ─────────────────────────────────────────
  const dailyMap = useMemo(() => {
    const map: Record<string, { pnl: number; hasPending: boolean }> = {};
    for (const a of apostas) {
      if (!map[a.data_aposta]) map[a.data_aposta] = { pnl: 0, hasPending: false };
      map[a.data_aposta].pnl += calculateProfit(a);
      if (a.estado === 'pendente') map[a.data_aposta].hasPending = true;
    }
    return map;
  }, [apostas]);

  // ── Evolution chart data ─────────────────────────────────────────────
  const bucketData = useMemo<Bucket[]>(() => {
    if (level === 'all') return bucketsByYear(apostas);
    if (level === 'year') return bucketsByMonth(apostas, currentYear);
    if (level === 'month') return bucketsByDay(apostas, currentYear, currentMonth);
    return [];
  }, [level, apostas, currentYear, currentMonth]);

  const dayData = useMemo<DayPoint[]>(() => {
    if (level !== 'day' || !selectedDate) return [];
    return apostaSeries(apostas.filter(a => a.data_aposta === selectedDate));
  }, [level, selectedDate, apostas]);

  const years = useMemo(() => {
    const set = new Set<number>([today.getFullYear(), currentYear]);
    for (const a of apostas) set.add(Number(a.data_aposta.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [apostas, currentYear, today]);

  const monthDays = useMemo(() => {
    const set = new Set<string>();
    for (const a of apostas) if (a.data_aposta.startsWith(monthPrefix)) set.add(a.data_aposta);
    return [...set].sort();
  }, [apostas, monthPrefix]);

  // ── Calendar helpers ─────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const prevMonth = () => {
    setLevel('month'); setSelectedDate(null);
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    setLevel('month'); setSelectedDate(null);
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };
  const pickDay = (key: string) => {
    if (selectedDate === key && level === 'day') { setSelectedDate(null); setLevel('month'); }
    else { setSelectedDate(key); setLevel('day'); }
  };

  // ── Submit new bet ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const valor = parseFloat(form.valor_apostado);
    if (isNaN(valor) || valor <= 0) return;
    setSaving(true);
    try {
      if (form.tipo === 'multipla') {
        if (selecoes.length < 2 || selecoes.some(s => !s.equipa_casa.trim() || !s.equipa_fora.trim() || isNaN(parseFloat(s.odd)) || parseFloat(s.odd) <= 1)) {
          setSaving(false); return;
        }
        const totalOdd = Math.round(selecoes.reduce((acc, s) => acc * parseFloat(s.odd || '1'), 1) * 100) / 100;
        const first = selecoes[0];
        await createAposta(user.id, {
          tipo: 'multipla', desporto: first.desporto,
          equipa_casa: first.equipa_casa.trim(), equipa_fora: first.equipa_fora.trim(),
          mercado: `Múltipla (${selecoes.length} seleções)`,
          odd: totalOdd, valor_apostado: valor, estado: form.estado,
          data_aposta: form.data_aposta, selecoes,
        });
      } else {
        const odd = parseFloat(form.odd);
        if (isNaN(odd) || odd <= 1) { setSaving(false); return; }
        await createAposta(user.id, {
          tipo: 'simples', desporto: form.desporto,
          equipa_casa: form.equipa_casa.trim(), equipa_fora: form.equipa_fora.trim(),
          mercado: form.mercado.trim(), odd, valor_apostado: valor,
          estado: form.estado, data_aposta: form.data_aposta, selecoes: null,
        });
      }
      await reload();
      setShowModal(false);
      setForm({
        tipo: 'simples', desporto: 'Futebol', equipa_casa: '', equipa_fora: '',
        mercado: '', odd: '', valor_apostado: '', estado: 'pendente', data_aposta: todayKey,
      });
      setSelecoes([emptySelecao(), emptySelecao()]);
      const [y, m] = form.data_aposta.split('-').map(Number);
      setCurrentYear(y); setCurrentMonth(m - 1);
      setSelectedDate(form.data_aposta); setLevel('day');
    } catch { /* noop */ }
    setSaving(false);
  };

  const openEdit = (a: Aposta) => {
    setEditingAposta(a);
    setEditForm({
      desporto: a.desporto, equipa_casa: a.equipa_casa, equipa_fora: a.equipa_fora,
      mercado: a.mercado || '', odd: String(a.odd), valor_apostado: String(a.valor_apostado),
      estado: a.estado, data_aposta: a.data_aposta,
    });
    setEditSelecoes(a.selecoes ? a.selecoes.map(s => ({ ...s })) : []);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAposta) return;
    let patch: Record<string, unknown>;
    if (editingAposta.tipo === 'multipla' && editSelecoes.length > 0) {
      const odds = editSelecoes.map(s => parseFloat(s.odd));
      if (odds.some(o => isNaN(o) || o <= 1)) return;
      const totalOdd = parseFloat(odds.reduce((acc, o) => acc * o, 1).toFixed(2));
      const valor = parseFloat(editForm.valor_apostado);
      if (isNaN(valor) || valor <= 0) return;
      patch = {
        odd: totalOdd, valor_apostado: valor, estado: editForm.estado, data_aposta: editForm.data_aposta,
        selecoes: editSelecoes,
        mercado: `Múltipla (${editSelecoes.length} seleções)`,
      };
    } else {
      const odd = parseFloat(editForm.odd);
      const valor = parseFloat(editForm.valor_apostado);
      if (isNaN(odd) || isNaN(valor) || odd <= 1 || valor <= 0) return;
      patch = {
        desporto: editForm.desporto, equipa_casa: editForm.equipa_casa.trim(),
        equipa_fora: editForm.equipa_fora.trim(), mercado: editForm.mercado.trim(),
        odd, valor_apostado: valor, estado: editForm.estado, data_aposta: editForm.data_aposta,
      };
    }
    setSaving(true);
    try {
      await updateAposta(editingAposta.id, patch);
      await reload();
      setEditingAposta(null);
    } catch { /* noop */ }
    setSaving(false);
  };

  const handleDeleteAposta = async (a: Aposta) => {
    if (!window.confirm('Apagar esta aposta?')) return;
    try {
      await deleteAposta(a.id);
      setApostas(prev => prev.filter(x => x.id !== a.id));
    } catch { /* noop */ }
  };

  const potentialWin = useMemo(() => {
    const valor = parseFloat(form.valor_apostado);
    if (isNaN(valor) || valor <= 0) return null;
    if (form.tipo === 'multipla') {
      const totalOdd = selecoes.reduce((acc, s) => {
        const o = parseFloat(s.odd);
        return isNaN(o) || o <= 0 ? acc : acc * o;
      }, 1);
      if (totalOdd <= 1) return null;
      return (totalOdd * valor).toFixed(2);
    }
    const odd = parseFloat(form.odd);
    if (isNaN(odd) || odd <= 0) return null;
    return (odd * valor).toFixed(2);
  }, [form.odd, form.valor_apostado, form.tipo, selecoes]);

  const scopedSorted = useMemo(() => sortApostas(scopedBets), [scopedBets]);
  const selectedDayBets = useMemo(
    () => selectedDate ? sortApostas(apostas.filter(a => a.data_aposta === selectedDate)) : [],
    [selectedDate, apostas],
  );
  const selectedDayPnL = selectedDate ? (dailyMap[selectedDate]?.pnl ?? 0) : 0;

  const yDomain = useMemo(() => {
    const values = (level === 'day' ? dayData.map(p => p.cum) : bucketData.map(b => b.cum));
    if (!values.length) return [-5, 5];
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const pad = Math.max(Math.abs(max - min) * 0.15, 1);
    return [Number((min - pad).toFixed(2)), Number((max + pad).toFixed(2))];
  }, [level, dayData, bucketData]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const allStats = computeBancaStats(allSorted, startingBalance);
      await downloadBancaExcel(allSorted, allStats, currency);
    } finally {
      setExporting(false);
    }
  };

  const streak =
    stats.currentStreak === 0 ? '—'
    : stats.currentStreak > 0 ? `${stats.currentStreak}G` : `${Math.abs(stats.currentStreak)}R`;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Navbar />

      <div className="banca-container">
        {/* Header */}
        <div className="banca-header">
          <div>
            <h1 className="banca-title">A tua <span>Banca</span></h1>
            <p className="banca-subtitle">{periodLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              className="banca-btn-ghost"
              onClick={exportExcel}
              disabled={exporting || !allSorted.length}
            >
              <Download size={16} />
              {exporting ? 'A gerar…' : 'Descarregar Excel'}
            </button>
            {user ? (
              <>
                <button className="banca-btn-ghost" onClick={() => { setBalanceInput(String(startingBalance)); setShowBankrollModal(true); }}>
                  <Wallet size={15} /> Banca inicial: {money(startingBalance, currency)}
                </button>
                <button className="banca-btn-add" onClick={() => setShowModal(true)}>
                  <Plus size={18} /> Nova Aposta
                </button>
              </>
            ) : (
              <button className="banca-btn-add" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
                <LockIcon size={16} /> Inicia sessão
              </button>
            )}
          </div>
        </div>

        {/* Balance banner */}
        <div className="banca-balance-banner">
          <div className="banca-balance-card banca-balance-card--starting">
            <span className="banca-balance-card__label">Saldo Inicial</span>
            <div className="banca-balance-card__value-row">
              <span className="banca-balance-card__value">{money(startingBalance, currency)}</span>
              {user && (
                <button
                  className="banca-balance-card__edit-btn"
                  onClick={() => { setBalanceInput(String(startingBalance)); setShowBankrollModal(true); }}
                  title="Editar saldo inicial"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="banca-balance-card__arrow">→</div>
          <div className={`banca-balance-card banca-balance-card--current ${currentBalance > startingBalance ? 'banca-balance-card--up' : currentBalance < startingBalance ? 'banca-balance-card--down' : ''}`}>
            <span className="banca-balance-card__label">Saldo Atual</span>
            <div className="banca-balance-card__value-row">
              <span className={`banca-balance-card__value ${allTimeProfit > 0 ? 'pos' : allTimeProfit < 0 ? 'neg' : ''}`}>
                {money(currentBalance, currency)}
              </span>
              {allTimeProfit !== 0 && (
                <span className={`banca-balance-card__delta ${allTimeProfit >= 0 ? 'pos' : 'neg'}`}>
                  {signedMoney(allTimeProfit, currency)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scope toolbar */}
        <div className="banca-scope">
          <button
            className={`banca-scope__btn ${level === 'all' ? 'active' : ''}`}
            onClick={() => { setLevel('all'); setSelectedDate(null); }}
          >
            Desde sempre
          </button>
          <label className={`banca-scope__field ${level === 'year' ? 'active' : ''}`}>
            <span>Ano</span>
            <select
              value={currentYear}
              onChange={e => { setCurrentYear(Number(e.target.value)); setSelectedDate(null); setLevel('year'); }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className={`banca-scope__field ${level === 'month' ? 'active' : ''}`}>
            <span>Mês</span>
            <select
              value={currentMonth}
              onChange={e => { setCurrentMonth(Number(e.target.value)); setSelectedDate(null); setLevel('month'); }}
            >
              {MONTH_NAMES.map((name, m) => <option key={name} value={m}>{name}</option>)}
            </select>
          </label>
          <label className={`banca-scope__field ${level === 'day' ? 'active' : ''} ${monthDays.length ? '' : 'disabled'}`}>
            <span>Dia</span>
            <select
              value={selectedDate ?? ''}
              disabled={!monthDays.length}
              onChange={e => { const v = e.target.value; setSelectedDate(v || null); setLevel(v ? 'day' : 'month'); }}
            >
              <option value="">{monthDays.length ? 'Escolher…' : 'Sem apostas'}</option>
              {monthDays.map(d => <option key={d} value={d}>{fmtDay(d)}</option>)}
            </select>
          </label>
        </div>

        {/* Stats panel */}
        <div className="banca-statgrid">
          <StatCard
            label="Lucro / Prejuízo"
            value={signedMoney(stats.profit, currency)}
            hint={`ROI ${signedPct(stats.roi)}`}
            tone={stats.profit > 0 ? 'pos' : stats.profit < 0 ? 'neg' : undefined}
            icon={<TrendingUp size={15} />}
          />
          <StatCard
            label="Banca"
            value={money(stats.bankrollEnd, currency)}
            hint={`Início ${money(stats.bankrollStart, currency)}`}
            tone="gold"
            icon={<Wallet size={15} />}
          />
          <StatCard
            label="Taxa de vitória"
            value={pct(stats.winRate, 0)}
            hint={`${stats.greens}G · ${stats.reds}R · ${stats.pending} pend.`}
            icon={<Target size={15} />}
          />
          <StatCard
            label="Sequência atual"
            value={streak}
            hint={stats.currentStreak > 0 ? 'greens seguidos' : stats.currentStreak < 0 ? 'reds seguidos' : 'sem resolvidas'}
            tone={stats.currentStreak > 0 ? 'pos' : stats.currentStreak < 0 ? 'neg' : undefined}
            icon={<Flame size={15} />}
          />
        </div>
        <div className="banca-ministats">
          <div><span>Total investido</span><strong>{money(stats.staked, currency)}</strong></div>
          <div><span>Odd média</span><strong>{num(stats.avgOdd)}</strong></div>
          <div><span>Aposta média</span><strong>{money(stats.avgStake, currency)}</strong></div>
          <div><span>Maior green</span><strong className="pos">{signedMoney(stats.bestWin, currency)}</strong></div>
          <div><span>Maior red</span><strong className="neg">{signedMoney(stats.worstLoss, currency)}</strong></div>
          <div><span>Resolvidas</span><strong>{stats.settled}/{stats.count}</strong></div>
        </div>

        {/* Canal auditado */}
        {statsCanal.resolvidas > 0 && (
          <div className="banca-canal">
            <div className="banca-canal__head">
              <h2 className="banca-canal__title">
                <ShieldCheck size={17} color="var(--green-success)" />
                Canal público · últimos 90 dias
              </h2>
              <span className="banca-canal__nota">
                Publicado antes do jogo, resultado registado depois. Serve-te de referência.
              </span>
            </div>
            <div className="banca-canal__stats">
              <div className="banca-canal__stat">
                <span className="banca-canal__stat-lbl">Tips auditadas</span>
                <span className="banca-canal__stat-val">{statsCanal.resolvidas}</span>
              </div>
              <div className="banca-canal__stat">
                <span className="banca-canal__stat-lbl">Taxa de acerto</span>
                <span className="banca-canal__stat-val gold">{fmtPercent(statsCanal.taxaAcerto)}</span>
              </div>
              <div className="banca-canal__stat">
                <span className="banca-canal__stat-lbl">ROI do canal</span>
                <span className={`banca-canal__stat-val ${statsCanal.roi >= 0 ? 'pos' : 'neg'}`}>
                  {fmtRoi(statsCanal.roi)}
                </span>
              </div>
              <div className="banca-canal__stat">
                <span className="banca-canal__stat-lbl">O teu ROI ({periodLabel.toLowerCase()})</span>
                <span className={`banca-canal__stat-val ${stats.roi >= 0 ? 'pos' : 'neg'}`}>
                  {stats.count > 0 ? signedPct(stats.roi) : '—'}
                </span>
              </div>
            </div>
            {user && tipsImportaveis.length > 0 && (
              <>
                <p className="banca-canal__sub">Importar para a minha banca</p>
                <div className="banca-canal__tips">
                  {tipsImportaveis.map(t => (
                    <button key={t.id} className="banca-canal__tip" onClick={() => importarTip(t)}>
                      <span className="banca-canal__tip-vert">{VERTICAL_LABELS[t.vertical] ?? t.vertical}</span>
                      <span className="banca-canal__tip-evento">{t.evento}</span>
                      <span className="banca-canal__tip-pick">{t.pick}</span>
                      <span className="banca-canal__tip-odd">{t.odd.toFixed(2)}</span>
                      <Download size={13} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Calendar + evolution */}
        <div className="banca-content">
          {/* Calendar */}
          <div className="banca-calendar">
            <div className="banca-cal__header">
              <button className="banca-cal__nav" onClick={prevMonth}><ChevronLeft size={18} /></button>
              <span className="banca-cal__month">{MONTH_NAMES[currentMonth]} {currentYear}</span>
              <button className="banca-cal__nav" onClick={nextMonth}><ChevronRight size={18} /></button>
            </div>
            <button
              className="banca-cal__today-btn"
              onClick={() => {
                setCurrentMonth(today.getMonth());
                setCurrentYear(today.getFullYear());
                setSelectedDate(todayKey);
                setLevel('day');
              }}
            >
              Hoje
            </button>
            <div className="banca-cal__weekdays">
              {DAY_NAMES.map(d => <span key={d}>{d}</span>)}
            </div>
            <div className="banca-cal__grid">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e-${i}`} className="banca-cal__day banca-cal__day--empty" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = fmtDate(currentYear, currentMonth, day);
                const dd = dailyMap[key];
                const pnl = dd?.pnl;
                const hasPending = dd?.hasPending;
                const isToday = key === todayKey;
                const isSelected = key === selectedDate;
                let cls = 'banca-cal__day';
                if (isSelected) cls += ' banca-cal__day--selected';
                else if (isToday) cls += ' banca-cal__day--today';
                if (pnl !== undefined && pnl > 0) cls += ' banca-cal__day--profit';
                else if (pnl !== undefined && pnl < 0) cls += ' banca-cal__day--loss';
                else if (hasPending) cls += ' banca-cal__day--pending';
                return (
                  <div key={key} className={cls} onClick={() => pickDay(key)}>
                    <span className="banca-cal__day-num">{day}</span>
                    {pnl !== undefined && (
                      <span className={`banca-cal__day-pnl ${pnl >= 0 ? 'pos' : 'neg'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
                      </span>
                    )}
                    {hasPending && <span className="banca-cal__day-dot" />}
                  </div>
                );
              })}
            </div>
            <div className="banca-cal__legend">
              <span><span className="legend-dot profit" />Lucro</span>
              <span><span className="legend-dot loss" />Perda</span>
              <span><span className="legend-dot pending" />Pendente</span>
            </div>
          </div>

          {/* Evolution / day detail */}
          <div className="banca-detail">
            {level !== 'day' ? (
              <>
                <div className="banca-month-chart__header">
                  <span className="banca-month-chart__title">Evolução — {periodLabel}</span>
                  <span className={`banca-month-chart__total ${stats.profit >= 0 ? 'pos' : 'neg'}`}>
                    {signedMoney(stats.profit, currency)}
                  </span>
                </div>
                {bucketData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={bucketData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bkGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9a6238" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#9a6238" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(44, 34, 22,0.04)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#6f6047', fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        interval={level === 'month' ? Math.max(0, Math.floor(bucketData.length / 8)) : 0}
                      />
                      <YAxis
                        domain={yDomain}
                        tick={{ fill: '#6f6047', fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => `€${v}`} width={52}
                      />
                      <Tooltip content={<BucketTooltip />} />
                      <ReferenceLine y={0} stroke="rgba(44, 34, 22,0.12)" strokeDasharray="4 4" />
                      <Area
                        type="monotone" dataKey="cum" stroke="#9a6238" strokeWidth={2}
                        fill="url(#bkGrad)" dot={false}
                        activeDot={{ r: 5, fill: '#9a6238', stroke: 'rgba(44, 34, 22,0.4)', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="banca-detail__empty">
                    <Target size={44} opacity={0.2} />
                    <p>Sem apostas neste período</p>
                  </div>
                )}
                <p className="banca-detail__caption">
                  {level === 'all'
                    ? 'Lucro/prejuízo acumulado ano a ano. Escolhe um ano para o detalhe.'
                    : level === 'year'
                      ? 'Lucro/prejuízo acumulado mês a mês. Escolhe um mês para o detalhe.'
                      : 'Lucro/prejuízo acumulado dia a dia. Clica num dia do calendário para ver as apostas.'}
                </p>
              </>
            ) : selectedDate ? (
              <>
                <div className="banca-detail__header">
                  <div>
                    <h3 className="banca-detail__date">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-PT', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </h3>
                    <span className="banca-detail__count">
                      {selectedDayBets.length} aposta{selectedDayBets.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className={`banca-detail__pnl ${selectedDayPnL >= 0 ? 'pos' : 'neg'}`}>
                    {signedMoney(selectedDayPnL, currency)}
                  </span>
                </div>
                {selectedDayBets.length === 0 ? (
                  <div className="banca-detail__empty">
                    <Target size={44} opacity={0.2} />
                    <p>Sem apostas neste dia</p>
                    {user && (
                      <button className="banca-btn-add-small" onClick={() => {
                        setForm(f => ({ ...f, data_aposta: selectedDate! }));
                        setShowModal(true);
                      }}>
                        <Plus size={14} /> Adicionar
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="banca-chart">
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={dayData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dayGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#9a6238" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#9a6238" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(44, 34, 22,0.04)" />
                        <XAxis dataKey="label" tick={{ fill: '#6f6047', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis domain={yDomain} tick={{ fill: '#6f6047', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} width={55} />
                        <Tooltip content={<BetTooltip />} />
                        <ReferenceLine y={0} stroke="rgba(44, 34, 22,0.12)" strokeDasharray="4 4" />
                        <Area
                          type="monotone" dataKey="cum" stroke="#9a6238" strokeWidth={2} fill="url(#dayGrad)"
                          dot={(props: DotProps) => <CustomDot {...props} />}
                          activeDot={(props: DotProps) => <CustomActiveDot {...props} />}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <div className="banca-detail__empty">
                <Calendar size={44} opacity={0.2} />
                <p>Clica num dia para ver as apostas</p>
              </div>
            )}
          </div>
        </div>

        {/* Bets table for scope */}
        <div className="banca-table-section">
          <h2 className="banca-table-section__title">Apostas · {periodLabel}</h2>
          {scopedSorted.length === 0 ? (
            <div className="banca-detail__empty"><p>Sem apostas para mostrar.</p></div>
          ) : (
            <div className="banca-table-wrap">
              <table className="banca-table">
                <thead>
                  <tr>
                    {level !== 'day' && <th>Data</th>}
                    <th>Jogo</th>
                    <th>Mercado</th>
                    <th className="r">Odd</th>
                    <th className="r">Valor</th>
                    <th className="r">P/L</th>
                    <th>Estado</th>
                    {user && <th />}
                  </tr>
                </thead>
                <tbody>
                  {scopedSorted.map(a => {
                    const profit = calculateProfit(a);
                    return (
                      <tr key={a.id}>
                        {level !== 'day' && <td className="dim">{fmtDay(a.data_aposta)}</td>}
                        <td className="strong">
                          {a.tipo === 'multipla' ? '🔗 ' : ''}{a.equipa_casa} <em>vs</em> {a.equipa_fora}
                        </td>
                        <td className="dim">{a.mercado}</td>
                        <td className="r gold">@{a.odd.toFixed(2)}</td>
                        <td className="r">{money(a.valor_apostado, currency)}</td>
                        <td className={`r strong ${profit > 0 ? 'pos' : profit < 0 ? 'neg' : 'dim'}`}>
                          {profit > 0 ? '+' : ''}{money(profit, currency)}
                        </td>
                        <td>
                          <span className={`banca-bet-item__estado banca-bet-item__estado--${a.estado}`}>
                            {a.estado === 'ganha' ? <CheckCircle size={12} /> : a.estado === 'perdida' ? <XCircle size={12} /> : <Clock size={12} />}
                            {a.estado}
                          </span>
                        </td>
                        {user && (
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                              <button className="banca-bet-item__edit" onClick={() => openEdit(a)} title="Editar"><Pencil size={13} /></button>
                              <button className="banca-bet-item__edit" onClick={() => handleDeleteAposta(a)} title="Apagar" style={{ color: '#ef4444' }}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.82rem', marginTop: '2rem', paddingBottom: '2rem' }}>
          Tens dificuldade em fazer a gestão de banca? Entra em contacto com o{' '}
          <span onClick={() => navigate('/suporte')} style={{ color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: 'bold' }}>
            suporte
          </span>
        </p>
      </div>

      {/* Bankroll modal */}
      {showBankrollModal && (
        <div className="banca-overlay" onClick={() => setShowBankrollModal(false)}>
          <div className="banca-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="banca-modal__header">
              <h2>Banca inicial</h2>
              <button className="banca-modal__close" onClick={() => setShowBankrollModal(false)}><X size={20} /></button>
            </div>
            <form className="banca-form" onSubmit={e => { e.preventDefault(); saveStartingBalance(); }}>
              <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', margin: 0 }}>
                Valor de partida da tua banca. Serve de base para a evolução nos gráficos.
              </p>
              <div className="banca-form__group">
                <label>Valor inicial (€)</label>
                <input
                  type="number" step="0.01" min="0" autoFocus
                  value={balanceInput}
                  onChange={e => setBalanceInput(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="banca-form__actions">
                <button type="button" className="banca-btn-cancel" onClick={() => setShowBankrollModal(false)}>Cancelar</button>
                <button type="submit" className="banca-btn-submit" disabled={savingBalance}>
                  {savingBalance ? 'A guardar…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Bet Modal */}
      {showModal && (
        <div className="banca-overlay" onClick={() => setShowModal(false)}>
          <div className="banca-modal" onClick={e => e.stopPropagation()}>
            <div className="banca-modal__header">
              <h2>Nova Aposta</h2>
              <button className="banca-modal__close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="banca-form">
              <div className="banca-form__group">
                <label>Tipo de Aposta</label>
                <div className="banca-estado-btns">
                  {(['simples', 'multipla'] as const).map(t => (
                    <button
                      key={t} type="button"
                      className={`banca-estado-btn ${form.tipo === t ? 'active' : ''}`}
                      style={form.tipo === t ? { borderColor: 'var(--gold-primary)', color: 'var(--gold-primary)' } : {}}
                      onClick={() => setForm(f => ({ ...f, tipo: t }))}
                    >
                      {t === 'simples' ? '🎯 Simples' : '🔗 Múltipla'}
                    </button>
                  ))}
                </div>
              </div>

              {form.tipo === 'simples' ? (
                <>
                  <div className="banca-form__group">
                    <label>Desporto</label>
                    <div className="banca-sport-grid">
                      {SPORTS.map(s => (
                        <button key={s} type="button"
                          className={`banca-sport-btn ${form.desporto === s ? 'active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, desporto: s }))}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="banca-form__group">
                    <label>Confronto</label>
                    <div className="banca-teams">
                      <input type="text" placeholder="Equipa Casa" value={form.equipa_casa}
                        onChange={e => setForm(f => ({ ...f, equipa_casa: e.target.value }))} required />
                      <span className="banca-teams__vs">VS</span>
                      <input type="text" placeholder="Equipa Fora" value={form.equipa_fora}
                        onChange={e => setForm(f => ({ ...f, equipa_fora: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="banca-form__group">
                    <label>Mercado</label>
                    <input type="text" placeholder="Ex: Vitória Casa, Over 2.5, Ambas marcam..."
                      value={form.mercado} onChange={e => setForm(f => ({ ...f, mercado: e.target.value }))} />
                  </div>
                  <div className="banca-form__row">
                    <div className="banca-form__group">
                      <label>Odd</label>
                      <input type="number" placeholder="1.85" step="0.01" min="1.01"
                        value={form.odd} onChange={e => setForm(f => ({ ...f, odd: e.target.value }))} required />
                    </div>
                    <div className="banca-form__group">
                      <label>Valor Apostado (€)</label>
                      <input type="number" placeholder="10.00" step="0.01" min="0.01"
                        value={form.valor_apostado} onChange={e => setForm(f => ({ ...f, valor_apostado: e.target.value }))} required />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="banca-form__group">
                    <label>Seleções ({selecoes.length})</label>
                    {selecoes.map((sel, idx) => (
                      <div key={idx} className="banca-selecao-row">
                        <div className="banca-selecao-row__header">
                          <span className="banca-selecao-row__num">#{idx + 1}</span>
                          {selecoes.length > 2 && (
                            <button type="button" className="banca-selecao-row__remove"
                              onClick={() => setSelecoes(prev => prev.filter((_, i) => i !== idx))}>
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <div className="banca-selecao-row__sport">
                          {SPORTS.map(s => (
                            <button key={s} type="button"
                              className={`banca-selecao-sport-btn ${sel.desporto === s ? 'active' : ''}`}
                              onClick={() => setSelecoes(prev => prev.map((sl, i) => i === idx ? { ...sl, desporto: s } : sl))}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <div className="banca-teams" style={{ marginBottom: '0.4rem' }}>
                          <input type="text" placeholder="Equipa Casa" value={sel.equipa_casa}
                            onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_casa: e.target.value } : s))} required />
                          <span className="banca-teams__vs">VS</span>
                          <input type="text" placeholder="Equipa Fora" value={sel.equipa_fora}
                            onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_fora: e.target.value } : s))} required />
                        </div>
                        <div className="banca-form__row">
                          <div className="banca-form__group" style={{ flex: 2 }}>
                            <input type="text" placeholder="Mercado (ex: Vitória Casa)" value={sel.mercado}
                              onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, mercado: e.target.value } : s))} />
                          </div>
                          <div className="banca-form__group" style={{ flex: 1 }}>
                            <input type="number" placeholder="Odd" step="0.01" min="1.01" value={sel.odd}
                              onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, odd: e.target.value } : s))} required />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="banca-btn-add-small" style={{ marginTop: '0.5rem' }}
                      onClick={() => setSelecoes(prev => [...prev, emptySelecao()])}>
                      <Plus size={13} /> Adicionar seleção
                    </button>
                  </div>
                  {selecoes.some(s => parseFloat(s.odd) > 1) && (
                    <div className="banca-potential" style={{ marginBottom: '0.5rem' }}>
                      <span>Odd Total</span>
                      <strong>
                        @{selecoes.reduce((acc, s) => {
                          const o = parseFloat(s.odd);
                          return isNaN(o) || o <= 1 ? acc : acc * o;
                        }, 1).toFixed(2)}
                      </strong>
                    </div>
                  )}
                  <div className="banca-form__group">
                    <label>Valor Apostado (€)</label>
                    <input type="number" placeholder="10.00" step="0.01" min="0.01"
                      value={form.valor_apostado} onChange={e => setForm(f => ({ ...f, valor_apostado: e.target.value }))} required />
                  </div>
                </>
              )}

              {potentialWin && (
                <div className="banca-potential">
                  <span>Ganho Potencial</span>
                  <strong>€{potentialWin}</strong>
                  <span className="banca-potential__profit">
                    (lucro: +€{(parseFloat(potentialWin) - parseFloat(form.valor_apostado)).toFixed(2)})
                  </span>
                </div>
              )}

              <div className="banca-form__group">
                <label>Data</label>
                <input type="date" value={form.data_aposta}
                  onChange={e => setForm(f => ({ ...f, data_aposta: e.target.value }))} required />
              </div>

              <div className="banca-form__group">
                <label>Estado</label>
                <div className="banca-estado-btns">
                  {(['pendente', 'ganha', 'perdida'] as const).map(s => (
                    <button key={s} type="button"
                      className={`banca-estado-btn banca-estado-btn--${s} ${form.estado === s ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, estado: s }))}>
                      {s === 'pendente' ? <Clock size={14} /> : s === 'ganha' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="banca-form__actions">
                <button type="button" className="banca-btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="banca-btn-submit" disabled={saving}>
                  {saving ? 'A guardar...' : 'Adicionar Aposta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Bet Modal */}
      {editingAposta && (
        <div className="banca-overlay" onClick={() => setEditingAposta(null)}>
          <div className="banca-modal" onClick={e => e.stopPropagation()}>
            <div className="banca-modal__header">
              <h2>Editar Aposta</h2>
              <button className="banca-modal__close" onClick={() => setEditingAposta(null)}><X size={20} /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="banca-form">
              {editingAposta.tipo === 'multipla' && editSelecoes.length > 0 ? (
                <>
                  <div className="banca-form__group">
                    <label>Seleções ({editSelecoes.length}) — Múltipla</label>
                    {editSelecoes.map((sel, idx) => (
                      <div key={idx} className="banca-selecao-row">
                        <div className="banca-selecao-row__header">
                          <span className="banca-selecao-row__num">#{idx + 1}</span>
                          {editSelecoes.length > 2 && (
                            <button type="button" className="banca-selecao-row__remove"
                              onClick={() => setEditSelecoes(prev => prev.filter((_, i) => i !== idx))}>
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <div className="banca-selecao-row__sport">
                          {SPORTS.map(s => (
                            <button key={s} type="button"
                              className={`banca-selecao-sport-btn ${sel.desporto === s ? 'active' : ''}`}
                              onClick={() => setEditSelecoes(prev => prev.map((sl, i) => i === idx ? { ...sl, desporto: s } : sl))}>
                              {s}
                            </button>
                          ))}
                        </div>
                        <div className="banca-teams" style={{ marginBottom: '0.4rem' }}>
                          <input type="text" placeholder="Equipa Casa" value={sel.equipa_casa}
                            onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_casa: e.target.value } : s))} required />
                          <span className="banca-teams__vs">VS</span>
                          <input type="text" placeholder="Equipa Fora" value={sel.equipa_fora}
                            onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_fora: e.target.value } : s))} required />
                        </div>
                        <div className="banca-form__row">
                          <div className="banca-form__group" style={{ flex: 2 }}>
                            <input type="text" placeholder="Mercado" value={sel.mercado}
                              onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, mercado: e.target.value } : s))} />
                          </div>
                          <div className="banca-form__group" style={{ flex: 1 }}>
                            <input type="number" placeholder="Odd" step="0.01" min="1.01" value={sel.odd}
                              onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, odd: e.target.value } : s))} required />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="banca-btn-add-small" style={{ marginTop: '0.5rem' }}
                      onClick={() => setEditSelecoes(prev => [...prev, emptySelecao()])}>
                      <Plus size={13} /> Adicionar seleção
                    </button>
                  </div>
                  {editSelecoes.some(s => parseFloat(s.odd) > 1) && (
                    <div className="banca-potential" style={{ marginBottom: '0.5rem' }}>
                      <span>Odd Total</span>
                      <strong>
                        @{editSelecoes.reduce((acc, s) => {
                          const o = parseFloat(s.odd);
                          return isNaN(o) || o <= 1 ? acc : acc * o;
                        }, 1).toFixed(2)}
                      </strong>
                    </div>
                  )}
                  <div className="banca-form__group">
                    <label>Valor Apostado (€)</label>
                    <input type="number" placeholder="10.00" step="0.01" min="0.01"
                      value={editForm.valor_apostado} onChange={e => setEditForm(f => ({ ...f, valor_apostado: e.target.value }))} required />
                  </div>
                </>
              ) : (
                <>
                  <div className="banca-form__group">
                    <label>Desporto</label>
                    <div className="banca-sport-grid">
                      {SPORTS.map(s => (
                        <button key={s} type="button"
                          className={`banca-sport-btn ${editForm.desporto === s ? 'active' : ''}`}
                          onClick={() => setEditForm(f => ({ ...f, desporto: s }))}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="banca-form__group">
                    <label>Confronto</label>
                    <div className="banca-teams">
                      <input type="text" placeholder="Equipa Casa" value={editForm.equipa_casa}
                        onChange={e => setEditForm(f => ({ ...f, equipa_casa: e.target.value }))} required />
                      <span className="banca-teams__vs">VS</span>
                      <input type="text" placeholder="Equipa Fora" value={editForm.equipa_fora}
                        onChange={e => setEditForm(f => ({ ...f, equipa_fora: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="banca-form__group">
                    <label>Mercado</label>
                    <input type="text" placeholder="Ex: Vitória Casa, Over 2.5, Ambas marcam..."
                      value={editForm.mercado} onChange={e => setEditForm(f => ({ ...f, mercado: e.target.value }))} />
                  </div>
                  <div className="banca-form__row">
                    <div className="banca-form__group">
                      <label>Odd</label>
                      <input type="number" placeholder="1.85" step="0.01" min="1.01"
                        value={editForm.odd} onChange={e => setEditForm(f => ({ ...f, odd: e.target.value }))} required />
                    </div>
                    <div className="banca-form__group">
                      <label>Valor Apostado (€)</label>
                      <input type="number" placeholder="10.00" step="0.01" min="0.01"
                        value={editForm.valor_apostado} onChange={e => setEditForm(f => ({ ...f, valor_apostado: e.target.value }))} required />
                    </div>
                  </div>
                </>
              )}

              <div className="banca-form__group">
                <label>Data</label>
                <input type="date" value={editForm.data_aposta}
                  onChange={e => setEditForm(f => ({ ...f, data_aposta: e.target.value }))} required />
              </div>

              <div className="banca-form__group">
                <label>Estado</label>
                <div className="banca-estado-btns">
                  {(['pendente', 'ganha', 'perdida'] as const).map(s => (
                    <button key={s} type="button"
                      className={`banca-estado-btn banca-estado-btn--${s} ${editForm.estado === s ? 'active' : ''}`}
                      onClick={() => setEditForm(f => ({ ...f, estado: s }))}>
                      {s === 'pendente' ? <Clock size={14} /> : s === 'ganha' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="banca-form__actions">
                <button type="button" className="banca-btn-cancel"
                  style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={async () => {
                    if (!window.confirm('Apagar esta aposta?')) return;
                    try {
                      await deleteAposta(editingAposta!.id);
                      setApostas(prev => prev.filter(x => x.id !== editingAposta!.id));
                      setEditingAposta(null);
                    } catch { /* noop */ }
                  }}>
                  <Trash2 size={14} /> Apagar
                </button>
                <button type="button" className="banca-btn-cancel" onClick={() => setEditingAposta(null)}>Cancelar</button>
                <button type="submit" className="banca-btn-submit" disabled={saving}>
                  {saving ? 'A guardar...' : 'Guardar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
