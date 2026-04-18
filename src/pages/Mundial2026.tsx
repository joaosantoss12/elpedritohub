import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Trophy, Calendar, TrendingUp, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import '../styles/Mundial2026.css';

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY || '';
const API_BASE = '/api/football'; // Proxy: Vite em dev, Vercel serverless em prod
const WC_ID = 'WC'; // World Cup competition code

// ─── Types ───────────────────────────────────────────────────

interface TeamStanding {
  team: { id: number; name: string; shortName: string; crest: string };
  position: number;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

interface GroupStanding {
  group: string;
  table: TeamStanding[];
}

interface MatchScore {
  fullTime: { home: number | null; away: number | null };
}

interface Match {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: { id: number; name: string; shortName: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string };
  score: MatchScore;
}

interface Bet {
  id: string;
  match_date: string;
  match_label: string;
  pick: string;
  odd: number;
  result: 'pending' | 'won' | 'lost' | 'void';
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday=0
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatGroupName(group: string | null) {
  if (!group) return '';
  return group.replace('GROUP_', 'Grupo ');
}

function formatMatchStatus(status: string) {
  switch (status) {
    case 'FINISHED': return 'Terminado';
    case 'IN_PLAY': return 'A decorrer';
    case 'PAUSED': return 'Intervalo';
    case 'SCHEDULED': return 'Agendado';
    case 'POSTPONED': return 'Adiado';
    case 'CANCELLED': return 'Cancelado';
    default: return status;
  }
}

function formatStageName(stage: string) {
  switch (stage) {
    case 'GROUP_STAGE': return 'Fase de Grupos';
    case 'LAST_32': return 'Oitavos de Final';
    case 'LAST_16': return 'Oitavos de Final';
    case 'QUARTER_FINALS': return 'Quartos de Final';
    case 'SEMI_FINALS': return 'Meias-Finais';
    case 'THIRD_PLACE': return 'Terceiro Lugar';
    case 'FINAL': return 'Final';
    default: return stage;
  }
}

// ─── API fetch helper ────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

async function fetchAPI(endpoint: string) {
  const headers: Record<string, string> = {};
  if (API_KEY) headers['X-Auth-Token'] = API_KEY;

  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

/**
 * Lê dados da tabela api_cache. Se tiverem mais de 15 min,
 * faz fetch à API, atualiza o cache e retorna dados frescos.
 * Se o cache for válido, retorna direto sem chamar a API.
 */
async function getCachedData(cacheKey: string, apiEndpoint: string) {
  // 1. Tentar ler do cache
  const { data: cached } = await supabase
    .from('api_cache')
    .select('data, updated_at')
    .eq('key', cacheKey)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < CACHE_TTL_MS) {
      // Cache válido — retornar sem chamar a API
      return cached.data;
    }
  }

  // 2. Cache inexistente ou expirado — tentar buscar à API
  try {
    const freshData = await fetchAPI(apiEndpoint);

    // 3. Guardar no cache (upsert)
    await supabase
      .from('api_cache')
      .upsert(
        { key: cacheKey, data: freshData, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    return freshData;
  } catch (apiErr) {
    // API falhou — devolver cache expirado se existir, senão fallback vazio
    console.warn('API indisponível, usando cache antigo ou vazio:', apiErr);
    if (cached) return cached.data;
    return { standings: [], matches: [] };
  }
}

// ─── Component ───────────────────────────────────────────────

export default function Mundial2026() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(formatDateKey(today.getFullYear(), today.getMonth(), today.getDate()));

  const [standings, setStandings] = useState<GroupStanding[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingBets, setLoadingBets] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'standings'>('calendar');
  const [apiError, setApiError] = useState<string | null>(null);

  // ─── Fetch standings ──────────────────────────────────
  useEffect(() => {
    const loadStandings = async () => {
      try {
        setLoadingStandings(true);
        setApiError(null);
        const data = await getCachedData(
          'wc_standings_2026',
          `/competitions/${WC_ID}/standings`
        );
        setStandings(data.standings || []);
      } catch (err: any) {
        console.error('Erro ao carregar classificação:', err);
        setApiError('Os dados do Mundial 2026 ainda não estão disponíveis na API. O torneio começa em Junho 2026.');
      } finally {
        setLoadingStandings(false);
      }
    };
    loadStandings();
  }, []);

  // ─── Fetch matches for the selected month ─────────────
  useEffect(() => {
    const loadMatches = async () => {
      try {
        setLoadingMatches(true);
        const dateFrom = formatDateKey(currentYear, currentMonth, 1);
        const dateTo = formatDateKey(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth));
        const cacheKey = `wc_matches_${currentYear}_${String(currentMonth + 1).padStart(2, '0')}`;
        const data = await getCachedData(
          cacheKey,
          `/competitions/${WC_ID}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
        );
        setMatches(data.matches || []);
      } catch (err: any) {
        console.error('Erro ao carregar jogos:', err);
      } finally {
        setLoadingMatches(false);
      }
    };
    loadMatches();
  }, [currentMonth, currentYear]);

  // ─── Fetch bets for selected date ─────────────────────
  const fetchBets = useCallback(async (date: string) => {
    try {
      setLoadingBets(true);
      const { data, error } = await supabase
        .from('mundial_bets')
        .select('*')
        .eq('match_date', date)
        .order('created_at', { ascending: true });

      if (error) {
        // Tabela pode não existir ainda
        console.warn('mundial_bets:', error.message);
        setBets([]);
        return;
      }
      setBets(data || []);
    } catch (err) {
      console.error('Erro ao carregar apostas:', err);
      setBets([]);
    } finally {
      setLoadingBets(false);
    }
  }, []);

  useEffect(() => {
    fetchBets(selectedDate);
  }, [selectedDate, fetchBets]);

  // ─── Calendar navigation ──────────────────────────────
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setSelectedDate(formatDateKey(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  // ─── Calendar data ────────────────────────────────────
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // Dates that have matches
  const matchDates = new Set(matches.map(m => m.utcDate.split('T')[0]));

  // Matches for selected date
  const selectedMatches = matches.filter(m => m.utcDate.startsWith(selectedDate));

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="mundial-container">
      <Navbar />

      {/* Hero Banner */}
      <div className="mundial-hero">
        <div className="mundial-hero-content">
          <div className="mundial-hero-badge">
            <Trophy size={20} />
            <span>FIFA WORLD CUP</span>
          </div>
          <h1 className="mundial-hero-title">
            Mundial <span className="gold">2026</span>
          </h1>
          <p className="mundial-hero-subtitle">
            EUA • México • Canadá
          </p>
        </div>
        <div className="mundial-hero-glow" />
      </div>

      {/* Tab Navigation */}
      <div className="mundial-tabs">
        <button
          className={`mundial-tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <Calendar size={18} />
          Calendário & Apostas
        </button>
        <button
          className={`mundial-tab ${activeTab === 'standings' ? 'active' : ''}`}
          onClick={() => setActiveTab('standings')}
        >
          <Trophy size={18} />
          Grupos & Classificação
        </button>
      </div>

      <div className="mundial-content">
        {/* ═══════════════════════════════════════════════════
            TAB: CALENDAR & BETS
            ═══════════════════════════════════════════════════ */}
        {activeTab === 'calendar' && (
          <div className="mundial-calendar-section">
            <div className="mundial-grid">
              {/* Calendar */}
              <div className="mundial-card">
                <div className="calendar-header">
                  <button className="calendar-nav-btn" onClick={prevMonth}>
                    <ChevronLeft size={20} />
                  </button>
                  <div className="calendar-month-year">
                    <span className="calendar-month">{MONTH_NAMES[currentMonth]}</span>
                    <span className="calendar-year">{currentYear}</span>
                  </div>
                  <button className="calendar-nav-btn" onClick={nextMonth}>
                    <ChevronRight size={20} />
                  </button>
                </div>

                <button className="calendar-today-btn" onClick={goToToday}>
                  Hoje
                </button>

                <div className="calendar-days-header">
                  {DAY_NAMES.map(d => (
                    <div key={d} className="calendar-day-name">{d}</div>
                  ))}
                </div>

                <div className="calendar-grid">
                  {/* Empty cells before first day */}
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="calendar-cell empty" />
                  ))}

                  {/* Day cells */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateKey = formatDateKey(currentYear, currentMonth, day);
                    const isToday = dateKey === todayKey;
                    const isSelected = dateKey === selectedDate;
                    const hasMatch = matchDates.has(dateKey);

                    return (
                      <button
                        key={day}
                        className={`calendar-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasMatch ? 'has-match' : ''}`}
                        onClick={() => setSelectedDate(dateKey)}
                      >
                        <span className="calendar-day-number">{day}</span>
                        {hasMatch && <span className="calendar-match-dot" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day Details */}
              <div className="mundial-day-details">
                {/* Matches on selected day */}
                <div className="mundial-card">
                  <h3 className="mundial-card-title">
                    <Trophy size={18} />
                    Jogos — {selectedDate.split('-').reverse().join('/')}
                  </h3>

                  {loadingMatches ? (
                    <div className="mundial-loading">
                      <Loader2 size={24} className="spin" />
                    </div>
                  ) : selectedMatches.length === 0 ? (
                    <p className="mundial-empty">Sem jogos neste dia</p>
                  ) : (
                    <div className="matches-list">
                      {selectedMatches.map(match => (
                        <div key={match.id} className="match-card">
                          <div className="match-stage">
                            {match.group ? formatGroupName(match.group) : formatStageName(match.stage)}
                          </div>
                          <div className="match-teams">
                            <div className="match-team home">
                              {match.homeTeam.crest && (
                                <img src={match.homeTeam.crest} alt="" className="match-crest" />
                              )}
                              <span>{match.homeTeam.shortName || match.homeTeam.name}</span>
                            </div>
                            <div className={`match-score-box ${match.status === 'FINISHED' ? 'finished' : match.status === 'IN_PLAY' || match.status === 'PAUSED' ? 'live' : ''}`}>
                              {match.score.fullTime.home !== null ? (
                                <span>{match.score.fullTime.home} - {match.score.fullTime.away}</span>
                              ) : (
                                <span className="match-time">
                                  {new Date(match.utcDate).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <div className="match-team away">
                              <span>{match.awayTeam.shortName || match.awayTeam.name}</span>
                              {match.awayTeam.crest && (
                                <img src={match.awayTeam.crest} alt="" className="match-crest" />
                              )}
                            </div>
                          </div>
                          <div className="match-status">
                            {formatMatchStatus(match.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bets on selected day */}
                <div className="mundial-card">
                  <h3 className="mundial-card-title">
                    <TrendingUp size={18} />
                    Apostas do Dia
                  </h3>

                  {loadingBets ? (
                    <div className="mundial-loading">
                      <Loader2 size={24} className="spin" />
                    </div>
                  ) : bets.length === 0 ? (
                    <p className="mundial-empty">Sem apostas para este dia</p>
                  ) : (
                    <div className="bets-list">
                      {bets.map(bet => (
                        <div key={bet.id} className={`bet-card ${bet.result}`}>
                          <div className="bet-header">
                            <span className="bet-match">{bet.match_label}</span>
                            <span className={`bet-result-badge ${bet.result}`}>
                              {bet.result === 'won' && <><CheckCircle size={14} /> Ganhou</>}
                              {bet.result === 'lost' && <><XCircle size={14} /> Perdeu</>}
                              {bet.result === 'pending' && <><Clock size={14} /> Pendente</>}
                              {bet.result === 'void' && <><XCircle size={14} /> Anulada</>}
                            </span>
                          </div>
                          <div className="bet-details">
                            <span className="bet-pick">Pick: <strong>{bet.pick}</strong></span>
                            <span className="bet-odd">Odd: <strong>{bet.odd.toFixed(2)}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            TAB: STANDINGS
            ═══════════════════════════════════════════════════ */}
        {activeTab === 'standings' && (
          <div className="mundial-standings-section">
            {apiError && (
              <div className="mundial-api-error">
                <p>{apiError}</p>
                <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  Adiciona <code>VITE_FOOTBALL_API_KEY</code> ao ficheiro <code>.env</code>
                </p>
              </div>
            )}

            {loadingStandings ? (
              <div className="mundial-loading" style={{ padding: '4rem' }}>
                <Loader2 size={32} className="spin" />
                <p>A carregar classificação...</p>
              </div>
            ) : standings.length === 0 && !apiError ? (
              <div className="mundial-empty" style={{ padding: '4rem', textAlign: 'center' }}>
                <Trophy size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p>A classificação ainda não está disponível.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Os grupos serão exibidos assim que o torneio começar.</p>
              </div>
            ) : (
              <div className="standings-grid">
                {standings
                  .filter(s => s.group)
                  .sort((a, b) => a.group.localeCompare(b.group))
                  .map(group => (
                    <div key={group.group} className="mundial-card group-card">
                      <h3 className="group-title">{formatGroupName(group.group)}</h3>
                      <table className="standings-table">
                        <thead>
                          <tr>
                            <th className="standings-pos">#</th>
                            <th className="standings-team">Equipa</th>
                            <th>J</th>
                            <th>V</th>
                            <th>E</th>
                            <th>D</th>
                            <th>GM</th>
                            <th>GS</th>
                            <th>DG</th>
                            <th className="standings-pts">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.table.map((team, idx) => (
                            <tr key={team.team.id} className={idx < 2 ? 'qualified' : ''}>
                              <td className="standings-pos">{team.position}</td>
                              <td className="standings-team">
                                <img src={team.team.crest} alt="" className="standings-crest" />
                                <span>{team.team.shortName || team.team.name}</span>
                              </td>
                              <td>{team.playedGames}</td>
                              <td>{team.won}</td>
                              <td>{team.draw}</td>
                              <td>{team.lost}</td>
                              <td>{team.goalsFor}</td>
                              <td>{team.goalsAgainst}</td>
                              <td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td>
                              <td className="standings-pts">{team.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
