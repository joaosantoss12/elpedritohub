import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart,
} from 'recharts';
import {
  Plus, ChevronLeft, ChevronRight,
  X, Target, CheckCircle, XCircle, Clock, Calendar, Pencil, Trash2, Lock as LockIcon,
} from 'lucide-react';
import '../styles/Banca.css';

// ── Types ──────────────────────────────────────────────────────────────

interface Selecao {
  desporto: string;
  equipa_casa: string;
  equipa_fora: string;
  mercado: string;
  odd: string;
}

interface Aposta {
  id: string;
  user_id: string;
  tipo: 'simples' | 'multipla';
  desporto: string;
  equipa_casa: string;
  equipa_fora: string;
  mercado: string;
  odd: number;
  valor_apostado: number;
  estado: 'pendente' | 'ganha' | 'perdida';
  data_aposta: string;
  created_at: string;
  selecoes?: Selecao[] | null;
}

interface DayData {
  pnl: number;
  hasPending: boolean;
}

interface ChartPoint {
  label: string;
  cumProfit: number;
  aposta?: Aposta;
}

interface MonthChartPoint {
  day: string;
  dayNum: number;
  dailyPnl: number;
  cumProfit: number;
  apostas: number;
  totalStake: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const SPORTS = ['Futebol', 'Basquetebol', 'Ténis', 'Hóquei', 'Basebol', 'Rugby', 'MMA / Boxe', 'Outro'];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// ── Helpers ────────────────────────────────────────────────────────────

function calculateProfit(a: Aposta): number {
  if (a.estado === 'ganha') return parseFloat((a.odd * a.valor_apostado - a.valor_apostado).toFixed(2));
  if (a.estado === 'perdida') return -a.valor_apostado;
  return 0;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

function fmtDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fmtMoney(v: number, showSign = false) {
  const s = Math.abs(v).toFixed(2);
  if (showSign) return v >= 0 ? `+€${s}` : `-€${s}`;
  return `€${s}`;
}

// ── Custom Chart Tooltip ───────────────────────────────────────────────

function BetTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  if (!point.aposta) {
    return (
      <div className="banca-tooltip">
        <div className="banca-tooltip__title">Início</div>
        <div className="banca-tooltip__value neutral">€0.00</div>
      </div>
    );
  }

  const a = point.aposta;
  const profit = calculateProfit(a);
  const potencial = a.odd * a.valor_apostado;

  return (
    <div className="banca-tooltip">
      <div className="banca-tooltip__sport">{a.desporto}</div>
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
        {a.estado === 'ganha' && <><CheckCircle size={12}/> +€{profit.toFixed(2)}</>}
        {a.estado === 'perdida' && <><XCircle size={12}/> -€{Math.abs(profit).toFixed(2)}</>}
        {a.estado === 'pendente' && <><Clock size={12}/> Pendente</>}
      </div>
      <div className={`banca-tooltip__cumulative ${point.cumProfit >= 0 ? 'pos' : 'neg'}`}>
        Saldo acumulado: {fmtMoney(point.cumProfit, true)}
      </div>
    </div>
  );
}

// ── Custom Chart Dot ───────────────────────────────────────────────────

function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.aposta || cx === undefined || cy === undefined) return null;
  const color =
    payload.aposta.estado === 'ganha' ? '#4ade80' :
    payload.aposta.estado === 'perdida' ? '#f87171' :
    '#94a3b8';
  return <circle cx={cx} cy={cy} r={6} fill={color} stroke="rgba(255,255,255,0.25)" strokeWidth={2} style={{ cursor: 'pointer' }} />;
}

function CustomActiveDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const color = !payload?.aposta ? '#e6b95c' :
    payload.aposta.estado === 'ganha' ? '#4ade80' :
    payload.aposta.estado === 'perdida' ? '#f87171' :
    '#94a3b8';
  return <circle cx={cx} cy={cy} r={9} fill={color} stroke="rgba(255,255,255,0.6)" strokeWidth={2} />;
}

// ── Main Component ─────────────────────────────────────────────────────

export default function BancaManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date();
  const todayKey = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chartView, setChartView] = useState<'day' | 'month'>('day');
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [_loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAposta, setEditingAposta] = useState<Aposta | null>(null);
  const [editForm, setEditForm] = useState({
    desporto: 'Futebol',
    equipa_casa: '',
    equipa_fora: '',
    mercado: '',
    odd: '',
    valor_apostado: '',
    estado: 'pendente' as 'pendente' | 'ganha' | 'perdida',
    data_aposta: todayKey,
  });
  const [editSelecoes, setEditSelecoes] = useState<Selecao[]>([]);

  // Form state
  const [form, setForm] = useState({
    tipo: 'simples' as 'simples' | 'multipla',
    desporto: 'Futebol',
    equipa_casa: '',
    equipa_fora: '',
    mercado: '',
    odd: '',
    valor_apostado: '',
    estado: 'pendente' as 'pendente' | 'ganha' | 'perdida',
    data_aposta: todayKey,
  });
  const emptySelecao = (): Selecao => ({ desporto: 'Futebol', equipa_casa: '', equipa_fora: '', mercado: '', odd: '' });
  const [selecoes, setSelecoes] = useState<Selecao[]>([emptySelecao(), emptySelecao()]);

  // ── Fetch all user bets ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('banca_apostas')
        .select('*')
        .eq('user_id', user.id)
        .order('data_aposta', { ascending: true })
        .order('created_at', { ascending: true });
      if (!error && data) setApostas(data as Aposta[]);
      setLoading(false);
    };
    fetch();
  }, [user]);

  // ── Daily P&L map ────────────────────────────────────────────────────
  const dailyMap = useMemo(() => {
    const map: Record<string, DayData> = {};
    for (const a of apostas) {
      if (!map[a.data_aposta]) map[a.data_aposta] = { pnl: 0, hasPending: false };
      map[a.data_aposta].pnl += calculateProfit(a);
      if (a.estado === 'pendente') map[a.data_aposta].hasPending = true;
    }
    return map;
  }, [apostas]);

  // ── Monthly stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const mb = apostas.filter(a => a.data_aposta.startsWith(prefix));
    const totalApostado = mb.reduce((s, a) => s + a.valor_apostado, 0);
    const totalProfit = mb.reduce((s, a) => s + calculateProfit(a), 0);
    const ganhas = mb.filter(a => a.estado === 'ganha').length;
    const perdidas = mb.filter(a => a.estado === 'perdida').length;
    const roi = totalApostado > 0 ? (totalProfit / totalApostado) * 100 : 0;
    return { totalApostado, totalProfit, ganhas, perdidas, total: mb.length, roi };
  }, [apostas, currentMonth, currentYear]);

  // ── Chart data for selected day ──────────────────────────────────────
  const chartData = useMemo((): ChartPoint[] => {
    if (!selectedDate) return [];
    const dayBets = apostas.filter(a => a.data_aposta === selectedDate);
    const points: ChartPoint[] = [{ label: 'Início', cumProfit: 0 }];
    let cum = 0;
    dayBets.forEach((a, i) => {
      cum = parseFloat((cum + calculateProfit(a)).toFixed(2));
      points.push({ label: `A${i + 1}`, cumProfit: cum, aposta: a });
    });
    return points;
  }, [selectedDate, apostas]);

  // ── Monthly chart data ─────────────────────────────────────────────
  const monthChartData = useMemo((): MonthChartPoint[] => {
    const days = getDaysInMonth(currentYear, currentMonth);
    const points: MonthChartPoint[] = [];
    let cum = 0;
    for (let d = 1; d <= days; d++) {
      const key = fmtDate(currentYear, currentMonth, d);
      const dayData = dailyMap[key];
      const dailyPnl = dayData?.pnl ?? 0;
      const count = apostas.filter(a => a.data_aposta === key).length;
      const totalStake = apostas.filter(a => a.data_aposta === key).reduce((s, a) => s + a.valor_apostado, 0);
      // Only include days up to today (within the current month)
      const keyDate = new Date(key + 'T12:00:00');
      if (keyDate > today && key > todayKey) break;
      cum = parseFloat((cum + dailyPnl).toFixed(2));
      points.push({
        day: key,
        dayNum: d,
        dailyPnl: parseFloat(dailyPnl.toFixed(2)),
        cumProfit: cum,
        apostas: count,
        totalStake: parseFloat(totalStake.toFixed(2)),
      });
    }
    return points;
  }, [dailyMap, apostas, currentMonth, currentYear, today, todayKey]);

  const monthYDomain = useMemo(() => {
    if (!monthChartData.length) return [-5, 5];
    const values = monthChartData.map(p => p.cumProfit);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const pad = Math.max(Math.abs(max - min) * 0.15, 1);
    return [
      parseFloat((min - pad).toFixed(2)),
      parseFloat((max + pad).toFixed(2)),
    ];
  }, [monthChartData]);

  // ── Calendar helpers ─────────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  // ── Submit new bet ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const valor = parseFloat(form.valor_apostado);
    if (isNaN(valor) || valor <= 0) return;

    setSaving(true);

    let insertPayload: Record<string, unknown>;

    if (form.tipo === 'multipla') {
      const totalOdd = selecoes.reduce((acc, s) => acc * parseFloat(s.odd || '1'), 1);
      if (selecoes.length < 2 || selecoes.some(s => !s.equipa_casa.trim() || !s.equipa_fora.trim() || isNaN(parseFloat(s.odd)) || parseFloat(s.odd) <= 1)) {
        setSaving(false);
        return;
      }
      const firstSel = selecoes[0];
      insertPayload = {
        user_id: user.id,
        tipo: 'multipla',
        desporto: firstSel.desporto,
        equipa_casa: firstSel.equipa_casa.trim(),
        equipa_fora: firstSel.equipa_fora.trim(),
        mercado: firstSel.mercado.trim(),
        odd: Math.round(totalOdd * 100) / 100,
        valor_apostado: valor,
        estado: form.estado,
        data_aposta: form.data_aposta,
        selecoes,
      };
    } else {
      const odd = parseFloat(form.odd);
      if (isNaN(odd) || odd <= 1) { setSaving(false); return; }
      insertPayload = {
        user_id: user.id,
        tipo: 'simples',
        desporto: form.desporto,
        equipa_casa: form.equipa_casa.trim(),
        equipa_fora: form.equipa_fora.trim(),
        mercado: form.mercado.trim(),
        odd,
        valor_apostado: valor,
        estado: form.estado,
        data_aposta: form.data_aposta,
      };
    }

    const { data, error } = await supabase
      .from('banca_apostas')
      .insert(insertPayload)
      .select()
      .single();

    if (!error && data) {
      setApostas(prev =>
        [...prev, data as Aposta].sort((a, b) => {
          if (a.data_aposta !== b.data_aposta) return a.data_aposta.localeCompare(b.data_aposta);
          return a.created_at.localeCompare(b.created_at);
        })
      );
      setShowModal(false);
      setForm({
        tipo: 'simples',
        desporto: 'Futebol',
        equipa_casa: '',
        equipa_fora: '',
        mercado: '',
        odd: '',
        valor_apostado: '',
        estado: 'pendente',
        data_aposta: todayKey,
      });
      // Navigate to the month of the added bet
      const [y, m] = form.data_aposta.split('-').map(Number);
      setCurrentYear(y);
      setCurrentMonth(m - 1);
      setSelectedDate(form.data_aposta);
    }
    setSaving(false);
  };

  const openEdit = (a: Aposta) => {
    setEditingAposta(a);
    setEditForm({
      desporto: a.desporto,
      equipa_casa: a.equipa_casa,
      equipa_fora: a.equipa_fora,
      mercado: a.mercado || '',
      odd: String(a.odd),
      valor_apostado: String(a.valor_apostado),
      estado: a.estado,
      data_aposta: a.data_aposta,
    });
    setEditSelecoes(
      a.selecoes ? a.selecoes.map(s => ({ ...s })) : []
    );
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAposta) return;

    let updatePayload: Record<string, unknown>;

    if (editingAposta.tipo === 'multipla' && editSelecoes.length > 0) {
      const parsedSels = editSelecoes.map(s => ({ ...s, oddNum: parseFloat(s.odd) }));
      if (parsedSels.some(s => isNaN(s.oddNum) || s.oddNum <= 1)) return;
      const totalOdd = parseFloat(parsedSels.reduce((acc, s) => acc * s.oddNum, 1).toFixed(2));
      const valor = parseFloat(editForm.valor_apostado);
      if (isNaN(valor) || valor <= 0) return;
      updatePayload = {
        odd: totalOdd,
        valor_apostado: valor,
        estado: editForm.estado,
        data_aposta: editForm.data_aposta,
        selecoes: parsedSels.map(({ oddNum: _n, ...s }) => s),
        mercado: `Múltipla (${parsedSels.length} seleções)`,
      };
    } else {
      const odd = parseFloat(editForm.odd);
      const valor = parseFloat(editForm.valor_apostado);
      if (isNaN(odd) || isNaN(valor) || odd <= 1 || valor <= 0) return;
      updatePayload = {
        desporto: editForm.desporto,
        equipa_casa: editForm.equipa_casa.trim(),
        equipa_fora: editForm.equipa_fora.trim(),
        mercado: editForm.mercado.trim(),
        odd,
        valor_apostado: valor,
        estado: editForm.estado,
        data_aposta: editForm.data_aposta,
      };
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('banca_apostas')
      .update(updatePayload)
      .eq('id', editingAposta.id)
      .select()
      .single();

    if (!error && data) {
      setApostas(prev =>
        prev.map(a => a.id === editingAposta.id ? (data as Aposta) : a)
          .sort((a, b) => {
            if (a.data_aposta !== b.data_aposta) return a.data_aposta.localeCompare(b.data_aposta);
            return a.created_at.localeCompare(b.created_at);
          })
      );
      setEditingAposta(null);
    }
    setSaving(false);
  };

  // ── Delete bet ──────────────────────────────────────────────────────
  const handleDeleteAposta = async (a: Aposta) => {
    if (!window.confirm('Apagar esta aposta?')) return;
    const { error } = await supabase.from('banca_apostas').delete().eq('id', a.id);
    if (!error) {
      setApostas(prev => prev.filter(x => x.id !== a.id));
    }
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

  const selectedDayBets = useMemo(() =>
    selectedDate ? apostas.filter(a => a.data_aposta === selectedDate) : []
  , [selectedDate, apostas]);

  const selectedDayPnL = selectedDate ? (dailyMap[selectedDate]?.pnl ?? 0) : 0;

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-5, 5];
    const values = chartData.map(p => p.cumProfit);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(Math.abs(max - min) * 0.15, 1);
    return [
      parseFloat((Math.min(min, 0) - pad).toFixed(2)),
      parseFloat((Math.max(max, 0) + pad).toFixed(2)),
    ];
  }, [chartData]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Navbar />

      <div className="banca-container">

        {/* ── Header ── */}
        <div className="banca-header">
          <div>
            <h1 className="banca-title">Gestão de <span>Banca</span></h1>
            <p className="banca-subtitle">Regista e acompanha as tuas apostas</p>
          </div>
          {user ? (
            <button className="banca-btn-add" onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Nova Aposta
            </button>
          ) : (
            <button className="banca-btn-add" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>
              <LockIcon size={16} /> Inicia sessão
            </button>
          )}
        </div>

        {/* ── Monthly Stats ── */}
        <div className="banca-stats">
          <div className="banca-stat">
            <span className="banca-stat__label">Apostado</span>
            <span className="banca-stat__value">€{stats.totalApostado.toFixed(2)}</span>
          </div>
          <div className="banca-stat">
            <span className="banca-stat__label">Profit</span>
            <span className={`banca-stat__value ${stats.totalProfit >= 0 ? 'pos' : 'neg'}`}>
              {fmtMoney(stats.totalProfit, true)}
            </span>
          </div>
          <div className="banca-stat">
            <span className="banca-stat__label">ROI</span>
            <span className={`banca-stat__value ${stats.roi >= 0 ? 'pos' : 'neg'}`}>
              {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
            </span>
          </div>
          <div className="banca-stat">
            <span className="banca-stat__label">V / D / Apostas</span>
            <span className="banca-stat__value">
              <span style={{ color: '#4ade80' }}>{stats.ganhas}</span>
              {' / '}
              <span style={{ color: '#f87171' }}>{stats.perdidas}</span>
              {' / '}
              <span style={{ color: 'var(--text-gray)' }}>{stats.total}</span>
            </span>
          </div>
        </div>

        {/* ── Calendar + Day Detail ── */}
        <div className="banca-content">

          {/* Calendar */}
          <div className="banca-calendar">
            <div className="banca-cal__header">
              <button className="banca-cal__nav" onClick={prevMonth}>
                <ChevronLeft size={18} />
              </button>
              <span className="banca-cal__month">{MONTH_NAMES[currentMonth]} {currentYear}</span>
              <button className="banca-cal__nav" onClick={nextMonth}>
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              className="banca-cal__today-btn"
              onClick={() => {
                setCurrentMonth(today.getMonth());
                setCurrentYear(today.getFullYear());
                setSelectedDate(todayKey);
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
                const dayData = dailyMap[key];
                const pnl = dayData?.pnl;
                const hasPending = dayData?.hasPending;
                const isToday = key === todayKey;
                const isSelected = key === selectedDate;

                let cls = 'banca-cal__day';
                if (isSelected) cls += ' banca-cal__day--selected';
                else if (isToday) cls += ' banca-cal__day--today';
                if (pnl !== undefined && pnl > 0) cls += ' banca-cal__day--profit';
                else if (pnl !== undefined && pnl < 0) cls += ' banca-cal__day--loss';
                else if (hasPending) cls += ' banca-cal__day--pending';

                return (
                  <div
                    key={key}
                    className={cls}
                    onClick={() => setSelectedDate(selectedDate === key ? null : key)}
                  >
                    <span className="banca-cal__day-num">{day}</span>
                    {pnl !== undefined && (
                      <span className={`banca-cal__day-pnl ${pnl >= 0 ? 'pos' : 'neg'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
                      </span>
                    )}
                    {hasPending && (
                      <span className="banca-cal__day-dot" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Calendar legend */}
            <div className="banca-cal__legend">
              <span><span className="legend-dot profit" />Lucro</span>
              <span><span className="legend-dot loss" />Perda</span>
              <span><span className="legend-dot pending" />Pendente</span>
            </div>
          </div>

          {/* Day Detail */}
          <div className="banca-detail">
            {/* Chart view toggle */}
            <div className="banca-chart-toggle">
              <button
                className={`banca-chart-toggle__btn ${chartView === 'day' ? 'active' : ''}`}
                onClick={() => setChartView('day')}
              >
                Dia
              </button>
              <button
                className={`banca-chart-toggle__btn ${chartView === 'month' ? 'active' : ''}`}
                onClick={() => setChartView('month')}
              >
                Mês
              </button>
            </div>

            {chartView === 'month' ? (
              /* Monthly chart view */
              <>
                <div className="banca-month-chart__header">
                  <span className="banca-month-chart__title">
                    Evolução — {MONTH_NAMES[currentMonth]} {currentYear}
                  </span>
                  <span className={`banca-month-chart__total ${stats.totalProfit >= 0 ? 'pos' : 'neg'}`}>
                    {fmtMoney(stats.totalProfit, true)}
                  </span>
                </div>
                {monthChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={monthChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#e6b95c" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#e6b95c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="dayNum"
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval={Math.floor(monthChartData.length / 8)}
                      />
                      <YAxis
                        yAxisId="pnl"
                        domain={monthYDomain}
                        tick={{ fill: '#6b7280', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => `€${v}`}
                        width={52}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as MonthChartPoint;
                          const date = new Date(p.day + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
                          return (
                            <div className="banca-tooltip" style={{ minWidth: 160 }}>
                              <div className="banca-tooltip__sport" style={{ marginBottom: 6 }}>
                                {date}
                              </div>
                              <div className="banca-tooltip__grid">
                                <span>Apostado</span>
                                <strong style={{ color: '#e5e7eb' }}>€{p.totalStake.toFixed(2)}</strong>
                                <span>P&L dia</span>
                                <strong className={p.dailyPnl >= 0 ? 'pos' : 'neg'}>
                                  {p.dailyPnl >= 0 ? '+' : ''}€{p.dailyPnl.toFixed(2)}
                                </strong>
                                <span>Acumulado</span>
                                <strong className={p.cumProfit >= 0 ? 'pos' : 'neg'}>
                                  {p.cumProfit >= 0 ? '+' : ''}€{p.cumProfit.toFixed(2)}
                                </strong>
                                <span>Apostas</span>
                                <strong style={{ color: '#e5e7eb' }}>{p.apostas}</strong>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine yAxisId="pnl" y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                      <Area
                        yAxisId="pnl"
                        type="monotone"
                        dataKey="cumProfit"
                        stroke="#e6b95c"
                        strokeWidth={2}
                        fill="url(#monthGrad)"
                        dot={false}
                        activeDot={{ r: 5, fill: '#e6b95c', stroke: 'rgba(255,255,255,0.4)', strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="banca-detail__empty">
                    <Target size={44} opacity={0.2} />
                    <p>Sem apostas este mês</p>
                  </div>
                )}
              </>
            ) : selectedDate ? (
              /* Day view — day selected */
              <>
                <div className="banca-detail__header">
                  <div>
                    <h3 className="banca-detail__date">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-PT', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </h3>
                    <span className="banca-detail__count">{selectedDayBets.length} aposta{selectedDayBets.length !== 1 ? 's' : ''}</span>
                  </div>
                  <span className={`banca-detail__pnl ${selectedDayPnL >= 0 ? 'pos' : 'neg'}`}>
                    {fmtMoney(selectedDayPnL, true)}
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
                  <>
                    {/* Chart */}
                    <div className="banca-chart">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="bancaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#e6b95c" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#e6b95c" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            domain={yDomain}
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={v => `€${v}`}
                            width={55}
                          />
                          <Tooltip content={<BetTooltip />} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                          <Area
                            type="monotone"
                            dataKey="cumProfit"
                            stroke="#e6b95c"
                            strokeWidth={2}
                            fill="url(#bancaGrad)"
                            dot={(props: any) => <CustomDot {...props} />}
                            activeDot={(props: any) => <CustomActiveDot {...props} />}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Bet list */}
                    <div className="banca-bet-list">
                      {selectedDayBets.map((a, i) => {
                        const profit = calculateProfit(a);
                        return (
                          <div key={a.id} className="banca-bet-item">
                            <div className="banca-bet-item__num">{i + 1}</div>
                            <div className="banca-bet-item__info">
                              <span className="banca-bet-item__sport">
                                {a.tipo === 'multipla' ? '🔗 Múltipla' : a.desporto}
                              </span>
                              {a.tipo === 'multipla' && a.selecoes ? (
                                <span className="banca-bet-item__match" style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                                  {a.selecoes.map((s, si) => (
                                    <span key={si} style={{ display: 'block' }}>
                                      {s.equipa_casa} vs {s.equipa_fora}{s.mercado ? ` · ${s.mercado}` : ''} <em>@{parseFloat(s.odd).toFixed(2)}</em>
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="banca-bet-item__match">
                                  {a.equipa_casa} <em>vs</em> {a.equipa_fora}
                                </span>
                              )}
                            </div>
                            <div className="banca-bet-item__odd">@{a.odd.toFixed(2)}</div>
                            <div className="banca-bet-item__stake">€{a.valor_apostado.toFixed(2)}</div>
                            <div className={`banca-bet-item__estado banca-bet-item__estado--${a.estado}`}>
                              {a.estado === 'ganha' ? <CheckCircle size={13} /> :
                               a.estado === 'perdida' ? <XCircle size={13} /> :
                               <Clock size={13} />}
                              {a.estado}
                            </div>
                            <div className={`banca-bet-item__profit ${profit > 0 ? 'pos' : profit < 0 ? 'neg' : 'neutral'}`}>
                              {profit > 0 ? '+' : ''}€{profit.toFixed(2)}
                            </div>
                            {user && (
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button
                                  className="banca-bet-item__edit"
                                  onClick={() => openEdit(a)}
                                  title="Editar aposta"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="banca-bet-item__edit"
                                  onClick={() => handleDeleteAposta(a)}
                                  title="Apagar aposta"
                                  style={{ color: '#ef4444' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              /* Day view — no day selected */
              <div className="banca-detail__empty">
                <Calendar size={44} opacity={0.2} />
                <p>Clica num dia para ver as apostas</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer help text ── */}
        <p style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.82rem', marginTop: '2rem', paddingBottom: '2rem' }}>
          Tens dificuldade em fazer a gestão de banca? Entra em contacto com o{' '}
          <span
            onClick={() => navigate('/suporte')}
            style={{ color: 'var(--gold-primary)', cursor: 'pointer', fontWeight: 'bold' }}
          >
            suporte
          </span>
        </p>

      </div>

      {/* ── Add Bet Modal ── */}
      {showModal && (
        <div className="banca-overlay" onClick={() => setShowModal(false)}>
          <div className="banca-modal" onClick={e => e.stopPropagation()}>
            <div className="banca-modal__header">
              <h2>Nova Aposta</h2>
              <button className="banca-modal__close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="banca-form">
              {/* Tipo toggle */}
              <div className="banca-form__group">
                <label>Tipo de Aposta</label>
                <div className="banca-estado-btns">
                  {(['simples', 'multipla'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
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
                  {/* Sport */}
                  <div className="banca-form__group">
                    <label>Desporto</label>
                    <div className="banca-sport-grid">
                      {SPORTS.map(s => (
                        <button
                          key={s}
                          type="button"
                          className={`banca-sport-btn ${form.desporto === s ? 'active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, desporto: s }))}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="banca-form__group">
                    <label>Confronto</label>
                    <div className="banca-teams">
                      <input
                        type="text"
                        placeholder="Equipa Casa"
                        value={form.equipa_casa}
                        onChange={e => setForm(f => ({ ...f, equipa_casa: e.target.value }))}
                        required
                      />
                      <span className="banca-teams__vs">VS</span>
                      <input
                        type="text"
                        placeholder="Equipa Fora"
                        value={form.equipa_fora}
                        onChange={e => setForm(f => ({ ...f, equipa_fora: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  {/* Market */}
                  <div className="banca-form__group">
                    <label>Mercado</label>
                    <input
                      type="text"
                      placeholder="Ex: Vitória Casa, Over 2.5, Ambas marcam..."
                      value={form.mercado}
                      onChange={e => setForm(f => ({ ...f, mercado: e.target.value }))}
                    />
                  </div>

                  {/* Odd */}
                  <div className="banca-form__row">
                    <div className="banca-form__group">
                      <label>Odd</label>
                      <input
                        type="number"
                        placeholder="1.85"
                        step="0.01"
                        min="1.01"
                        value={form.odd}
                        onChange={e => setForm(f => ({ ...f, odd: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="banca-form__group">
                      <label>Valor Apostado (€)</label>
                      <input
                        type="number"
                        placeholder="10.00"
                        step="0.01"
                        min="0.01"
                        value={form.valor_apostado}
                        onChange={e => setForm(f => ({ ...f, valor_apostado: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Multiple selections */}
                  <div className="banca-form__group">
                    <label>Seleções ({selecoes.length})</label>
                    {selecoes.map((sel, idx) => (
                      <div key={idx} className="banca-selecao-row">
                        <div className="banca-selecao-row__header">
                          <span className="banca-selecao-row__num">#{idx + 1}</span>
                          {selecoes.length > 2 && (
                            <button
                              type="button"
                              className="banca-selecao-row__remove"
                              onClick={() => setSelecoes(prev => prev.filter((_, i) => i !== idx))}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <div className="banca-selecao-row__sport">
                          {SPORTS.map(s => (
                            <button
                              key={s}
                              type="button"
                              className={`banca-selecao-sport-btn ${sel.desporto === s ? 'active' : ''}`}
                              onClick={() => setSelecoes(prev => prev.map((sl, i) => i === idx ? { ...sl, desporto: s } : sl))}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <div className="banca-teams" style={{ marginBottom: '0.4rem' }}>
                          <input
                            type="text"
                            placeholder="Equipa Casa"
                            value={sel.equipa_casa}
                            onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_casa: e.target.value } : s))}
                            required
                          />
                          <span className="banca-teams__vs">VS</span>
                          <input
                            type="text"
                            placeholder="Equipa Fora"
                            value={sel.equipa_fora}
                            onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_fora: e.target.value } : s))}
                            required
                          />
                        </div>
                        <div className="banca-form__row">
                          <div className="banca-form__group" style={{ flex: 2 }}>
                            <input
                              type="text"
                              placeholder="Mercado (ex: Vitória Casa)"
                              value={sel.mercado}
                              onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, mercado: e.target.value } : s))}
                            />
                          </div>
                          <div className="banca-form__group" style={{ flex: 1 }}>
                            <input
                              type="number"
                              placeholder="Odd"
                              step="0.01"
                              min="1.01"
                              value={sel.odd}
                              onChange={e => setSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, odd: e.target.value } : s))}
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="banca-btn-add-small"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => setSelecoes(prev => [...prev, emptySelecao()])}
                    >
                      <Plus size={13} /> Adicionar seleção
                    </button>
                  </div>

                  {/* Odds summary */}
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

                  {/* Stake */}
                  <div className="banca-form__group">
                    <label>Valor Apostado (€)</label>
                    <input
                      type="number"
                      placeholder="10.00"
                      step="0.01"
                      min="0.01"
                      value={form.valor_apostado}
                      onChange={e => setForm(f => ({ ...f, valor_apostado: e.target.value }))}
                      required
                    />
                  </div>
                </>
              )}

              {/* Potential winnings */}
              {potentialWin && (
                <div className="banca-potential">
                  <span>Ganho Potencial</span>
                  <strong>€{potentialWin}</strong>
                  <span className="banca-potential__profit">
                    (lucro: +€{(parseFloat(potentialWin) - parseFloat(form.valor_apostado)).toFixed(2)})
                  </span>
                </div>
              )}

              {/* Date */}
              <div className="banca-form__group">
                <label>Data</label>
                <input
                  type="date"
                  value={form.data_aposta}
                  onChange={e => setForm(f => ({ ...f, data_aposta: e.target.value }))}
                  required
                />
              </div>

              {/* Status */}
              <div className="banca-form__group">
                <label>Estado</label>
                <div className="banca-estado-btns">
                  {(['pendente', 'ganha', 'perdida'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`banca-estado-btn banca-estado-btn--${s} ${form.estado === s ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, estado: s }))}
                    >
                      {s === 'pendente' ? <Clock size={14} /> :
                       s === 'ganha' ? <CheckCircle size={14} /> :
                       <XCircle size={14} />}
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="banca-form__actions">
                <button type="button" className="banca-btn-cancel" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="banca-btn-submit" disabled={saving}>
                  {saving ? 'A guardar...' : 'Adicionar Aposta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Bet Modal ── */}
      {editingAposta && (
        <div className="banca-overlay" onClick={() => setEditingAposta(null)}>
          <div className="banca-modal" onClick={e => e.stopPropagation()}>
            <div className="banca-modal__header">
              <h2>Editar Aposta</h2>
              <button className="banca-modal__close" onClick={() => setEditingAposta(null)}>
                <X size={20} />
              </button>
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
                            <button
                              type="button"
                              className="banca-selecao-row__remove"
                              onClick={() => setEditSelecoes(prev => prev.filter((_, i) => i !== idx))}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <div className="banca-selecao-row__sport">
                          {SPORTS.map(s => (
                            <button
                              key={s}
                              type="button"
                              className={`banca-selecao-sport-btn ${sel.desporto === s ? 'active' : ''}`}
                              onClick={() => setEditSelecoes(prev => prev.map((sl, i) => i === idx ? { ...sl, desporto: s } : sl))}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <div className="banca-teams" style={{ marginBottom: '0.4rem' }}>
                          <input
                            type="text"
                            placeholder="Equipa Casa"
                            value={sel.equipa_casa}
                            onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_casa: e.target.value } : s))}
                            required
                          />
                          <span className="banca-teams__vs">VS</span>
                          <input
                            type="text"
                            placeholder="Equipa Fora"
                            value={sel.equipa_fora}
                            onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, equipa_fora: e.target.value } : s))}
                            required
                          />
                        </div>
                        <div className="banca-form__row">
                          <div className="banca-form__group" style={{ flex: 2 }}>
                            <input
                              type="text"
                              placeholder="Mercado"
                              value={sel.mercado}
                              onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, mercado: e.target.value } : s))}
                            />
                          </div>
                          <div className="banca-form__group" style={{ flex: 1 }}>
                            <input
                              type="number"
                              placeholder="Odd"
                              step="0.01"
                              min="1.01"
                              value={sel.odd}
                              onChange={e => setEditSelecoes(prev => prev.map((s, i) => i === idx ? { ...s, odd: e.target.value } : s))}
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="banca-btn-add-small"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => setEditSelecoes(prev => [...prev, emptySelecao()])}
                    >
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
                    <input
                      type="number"
                      placeholder="10.00"
                      step="0.01"
                      min="0.01"
                      value={editForm.valor_apostado}
                      onChange={e => setEditForm(f => ({ ...f, valor_apostado: e.target.value }))}
                      required
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Sport */}
                  <div className="banca-form__group">
                    <label>Desporto</label>
                    <div className="banca-sport-grid">
                      {SPORTS.map(s => (
                        <button
                          key={s}
                          type="button"
                          className={`banca-sport-btn ${editForm.desporto === s ? 'active' : ''}`}
                          onClick={() => setEditForm(f => ({ ...f, desporto: s }))}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="banca-form__group">
                    <label>Confronto</label>
                    <div className="banca-teams">
                      <input
                        type="text"
                        placeholder="Equipa Casa"
                        value={editForm.equipa_casa}
                        onChange={e => setEditForm(f => ({ ...f, equipa_casa: e.target.value }))}
                        required
                      />
                      <span className="banca-teams__vs">VS</span>
                      <input
                        type="text"
                        placeholder="Equipa Fora"
                        value={editForm.equipa_fora}
                        onChange={e => setEditForm(f => ({ ...f, equipa_fora: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  {/* Market */}
                  <div className="banca-form__group">
                    <label>Mercado</label>
                    <input
                      type="text"
                      placeholder="Ex: Vitória Casa, Over 2.5, Ambas marcam..."
                      value={editForm.mercado}
                      onChange={e => setEditForm(f => ({ ...f, mercado: e.target.value }))}
                    />
                  </div>

                  {/* Odd + Value */}
                  <div className="banca-form__row">
                    <div className="banca-form__group">
                      <label>Odd</label>
                      <input
                        type="number"
                        placeholder="1.85"
                        step="0.01"
                        min="1.01"
                        value={editForm.odd}
                        onChange={e => setEditForm(f => ({ ...f, odd: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="banca-form__group">
                      <label>Valor Apostado (€)</label>
                      <input
                        type="number"
                        placeholder="10.00"
                        step="0.01"
                        min="0.01"
                        value={editForm.valor_apostado}
                        onChange={e => setEditForm(f => ({ ...f, valor_apostado: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Date */}
              <div className="banca-form__group">
                <label>Data</label>
                <input
                  type="date"
                  value={editForm.data_aposta}
                  onChange={e => setEditForm(f => ({ ...f, data_aposta: e.target.value }))}
                  required
                />
              </div>

              {/* Status */}
              <div className="banca-form__group">
                <label>Estado</label>
                <div className="banca-estado-btns">
                  {(['pendente', 'ganha', 'perdida'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`banca-estado-btn banca-estado-btn--${s} ${editForm.estado === s ? 'active' : ''}`}
                      onClick={() => setEditForm(f => ({ ...f, estado: s }))}
                    >
                      {s === 'pendente' ? <Clock size={14} /> :
                       s === 'ganha' ? <CheckCircle size={14} /> :
                       <XCircle size={14} />}
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="banca-form__actions">
                <button
                  type="button"
                  className="banca-btn-cancel"
                  style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={async () => {
                    if (!window.confirm('Apagar esta aposta?')) return;
                    const { error } = await supabase.from('banca_apostas').delete().eq('id', editingAposta!.id);
                    if (!error) {
                      setApostas(prev => prev.filter(x => x.id !== editingAposta!.id));
                      setEditingAposta(null);
                    }
                  }}
                >
                  <Trash2 size={14} /> Apagar
                </button>
                <button type="button" className="banca-btn-cancel" onClick={() => setEditingAposta(null)}>
                  Cancelar
                </button>
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
