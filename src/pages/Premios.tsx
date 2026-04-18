import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Trophy, Gift, Crown, Zap, Medal, Lock, Star,
  CheckCircle, Clock, Flame, Users, Coins, LogIn, MessageCircle, Spade, X,
} from 'lucide-react';
import '../styles/Premios.css';

interface Giveaway {
  id: string;
  titulo: string;
  descricao: string | null;
  premio_descricao: string;
  imagem_url: string | null;
  custo_epcoins: number;
  is_vip_only: boolean;
  data_fim: string | null;
  vencedor_id: string | null;
  ativo: boolean;
}

interface Lider {
  id: string;
  username: string;
  epcoins: number;
  avatar_url: string;
}

const COMO_GANHAR = [
  { icon: <LogIn size={20} />, titulo: 'Login Diário', descricao: 'Faz login todos os dias', pontos: '+10 EPC/dia (+50 VIP)' },
  { icon: <MessageCircle size={20} />, titulo: 'Chat Ativo', descricao: 'A cada 10 mensagens no Chat (mín. 3 caracteres)', pontos: '+1 EPC (+5 VIP)' },
  { icon: <Spade size={20} />, titulo: 'Casino', descricao: 'Joga no Casino El Pedrito', pontos: '+x EPC/jogo' },
];

function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface WinnerProfileInfo {
  userId: string;
  username: string;
}

interface WinnerProfile {
  nome: string;
  epcoins: number;
  badges: string[];
  streak_login: number;
}

function WinnerProfileModal({ info, onClose }: { info: WinnerProfileInfo; onClose: () => void }) {
  const [profile, setProfile] = useState<WinnerProfile | null>(null);
  const avatarUrl = supabase.storage.from('profile_images').getPublicUrl(info.userId).data.publicUrl;

  useEffect(() => {
    supabase.from('membros').select('nome, epcoins, badges, streak_login').eq('id', info.userId).maybeSingle()
      .then(({ data }) => setProfile(data as WinnerProfile | null));
  }, [info.userId]);

  return createPortal(
    <div className="premios-modal-overlay" onClick={onClose}>
      <div className="premios-modal" onClick={e => e.stopPropagation()}>
        <button className="premios-modal-close" onClick={onClose}><X size={16} /></button>
        <div className="premios-winner-profile">
          <div className="premios-winner-profile__avatar">
            <span>{(info.username?.[0] ?? '?').toUpperCase()}</span>
            <img src={avatarUrl} alt={info.username}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div className="premios-winner-profile__username">@{info.username}</div>
          {profile && (
            <>
              <div className="premios-winner-profile__name">{profile.nome}</div>
              <div className="premios-winner-profile__stats">
                <div><Coins size={13} /> {profile.epcoins.toLocaleString('pt-PT')} EPC</div>
                <div><Flame size={13} /> Streak: {profile.streak_login}</div>
              </div>
              {profile.badges?.length > 0 && (
                <div className="premios-winner-profile__badges">
                  {profile.badges.map(b => <span key={b} className="premios-badge-chip">{b}</span>)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Premios() {
  const { user, membro, refreshMembro } = useAuth();
  const epcoins = membro?.epcoins ?? null;
  const isVip = membro?.badges?.includes('VIP') ?? false;
  const isAdmin = membro?.badges?.includes('Administrador') ?? false;

  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [myEntries, setMyEntries] = useState<Set<string>>(new Set());
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [loadingGiveaways, setLoadingGiveaways] = useState(true);
  const [entering, setEntering] = useState<string | null>(null);
  const [lideres, setLideres] = useState<Lider[]>([]);
  const [activeTab, setActiveTab] = useState<'giveaways' | 'ranking'>('giveaways');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [winnerUsernames, setWinnerUsernames] = useState<Record<string, string>>({});
  const [winnerAvatars, setWinnerAvatars] = useState<Record<string, string>>({});
  const [viewingWinner, setViewingWinner] = useState<WinnerProfileInfo | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { fetchGiveaways(); fetchRanking(); }, []);
  useEffect(() => { if (user && giveaways.length > 0) fetchMyEntries(); }, [user, giveaways]);

  const fetchGiveaways = async () => {
    try {
      const { data } = await supabase
        .from('giveaways')
        .select('*')
        .order('ativo', { ascending: false })
        .order('is_vip_only', { ascending: true })
        .order('created_at', { ascending: false });
      setGiveaways(data ?? []);
      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        for (const g of data) {
          const { count } = await supabase
            .from('giveaway_entries')
            .select('id', { count: 'exact', head: true })
            .eq('giveaway_id', g.id);
          counts[g.id] = count ?? 0;
        }
        setEntryCounts(counts);
        // load winner usernames for drawn giveaways
        const wonList = (data as Giveaway[]).filter(g => g.vencedor_id);
        if (wonList.length > 0) {
          const ids = wonList.map(g => g.vencedor_id as string);
          const { data: winners } = await supabase.from('membros').select('id, username').in('id', ids);
          if (winners) {
            const nameMap: Record<string, string> = {};
            (winners as { id: string; username: string }[]).forEach(w => { nameMap[w.id] = w.username; });
            const usernamesByGiveaway: Record<string, string> = {};
            const avatarsByGiveaway: Record<string, string> = {};
            wonList.forEach(g => {
              usernamesByGiveaway[g.id] = nameMap[g.vencedor_id!] ?? 'Vencedor';
              avatarsByGiveaway[g.id] = supabase.storage.from('profile_images').getPublicUrl(g.vencedor_id!).data.publicUrl;
            });
            setWinnerUsernames(usernamesByGiveaway);
            setWinnerAvatars(avatarsByGiveaway);
          }
        }
      }
    } catch {
      setGiveaways([]);
    } finally {
      setLoadingGiveaways(false);
    }
  };

  const fetchMyEntries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('giveaway_entries')
      .select('giveaway_id')
      .eq('user_id', user.id);
    if (data) setMyEntries(new Set(data.map((e: { giveaway_id: string }) => e.giveaway_id)));
  };

  const fetchRanking = async () => {
    const { data } = await supabase
      .from('membros')
      .select('id, username, epcoins')
      .order('epcoins', { ascending: false })
      .limit(10);
    if (data) {
      setLideres((data as Omit<Lider, 'avatar_url'>[]).map(m => ({
        ...m,
        avatar_url: supabase.storage.from('profile_images').getPublicUrl(m.id).data.publicUrl,
      })));
    }
  };

  const handleEnterGiveaway = async (g: Giveaway) => {
    if (!user || !membro || myEntries.has(g.id)) return;
    if (epcoins === null || epcoins < g.custo_epcoins) return;
    if (g.is_vip_only && !isVip && !isAdmin) return;
    setEntering(g.id);
    try {
      const { error: epcError } = await supabase
        .from('membros')
        .update({ epcoins: epcoins - g.custo_epcoins })
        .eq('id', user.id);
      if (epcError) throw epcError;
      const { error: entryError } = await supabase
        .from('giveaway_entries')
        .insert({ giveaway_id: g.id, user_id: user.id });
      if (entryError) {
        await supabase.from('membros').update({ epcoins }).eq('id', user.id);
        throw entryError;
      }
      await refreshMembro();
      setMyEntries(prev => new Set([...prev, g.id]));
      setEntryCounts(prev => ({ ...prev, [g.id]: (prev[g.id] ?? 0) + 1 }));
      showToast(`Inscrito em "${g.titulo}"! Boa sorte!`);
    } catch {
      showToast('Erro ao entrar no giveaway. Tenta novamente.', false);
    } finally {
      setEntering(null);
    }
  };

  return (
    <>
    <div className="premios-page">
      <Navbar />

      {toast && (
        <div
          className="premios-toast"
          style={toast.ok ? {} : {
            background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))',
            borderColor: 'rgba(239,68,68,0.4)',
            color: '#ef4444',
          }}
        >
          {toast.ok ? <CheckCircle size={18} /> : <Lock size={18} />}
          {toast.msg}
        </div>
      )}

      <div className="premios-wrapper">

        {/* HERO */}
        <div className="premios-hero">
          <div className="premios-hero__badge">
            <Gift size={16} />
            GIVEAWAYS EP
          </div>
          <h1 className="premios-hero__title">
            Usa EPCoins.<br />
            <span className="premios-hero__title--gold">Ganha Prémios.</span>
          </h1>
          <p className="premios-hero__subtitle">
            Entra nos giveaways com os teus EPCoins. Só 1 entrada por giveaway.
            Sorteio automático no fim do período.
          </p>
        </div>

        {/* COINS CARD */}
        {user && (
          <div className="premios-points-card">
            <div className="premios-points-card__left">
              <div className="premios-points-card__value">
                {epcoins === null ? '—' : epcoins.toLocaleString('pt-PT')}
                <span>EPC</span>
              </div>
              <div className="premios-points-card__label">Os teus EPCoins</div>
            </div>
            <div className="premios-points-card__divider" />
            <div className="premios-points-card__right">
              {(isVip || isAdmin) && (
                <div
                  className="premios-tier-badge"
                  style={{
                    color: '#e6b95c',
                    borderColor: 'rgba(230,185,92,0.5)',
                    background: 'rgba(230,185,92,0.1)',
                  }}
                >
                  <Crown size={14} />
                  Membro VIP
                </div>
              )}
              <div className="premios-points-card__tip">
                <Flame size={14} style={{ color: '#f97316' }} />
                {myEntries.size > 0
                  ? `${myEntries.size} giveaway${myEntries.size !== 1 ? 's' : ''} com entrada`
                  : 'Entra num giveaway abaixo'}
              </div>
            </div>
          </div>
        )}

        {/* TABS */}
        <div className="premios-tabs">
          {(['giveaways', 'ranking'] as const).map((tab) => (
            <button
              key={tab}
              className={`premios-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'giveaways' ? <Gift size={15} /> : <Trophy size={15} />}
              {tab === 'giveaways' ? 'Giveaways' : 'Ranking'}
            </button>
          ))}
        </div>

        {/* TAB: GIVEAWAYS */}
        {activeTab === 'giveaways' && (
          <>
            {loadingGiveaways ? (
              <div className="premios-empty">
                <div className="premios-loading-spinner" />
                <p>A carregar giveaways...</p>
              </div>
            ) : giveaways.length === 0 ? (
              <div className="premios-empty">
                <Gift size={40} style={{ color: 'var(--text-gray)' }} />
                <p>Nenhum giveaway ativo de momento.</p>
              </div>
            ) : (
              <div className="giveaways-grid">
                {giveaways.map((g) => {
                  const hasEntered = myEntries.has(g.id);
                  const hasWinner = !!g.vencedor_id;
                  const isEnded = hasWinner || !g.ativo || (!!g.data_fim && new Date(g.data_fim) < new Date());
                  const vipLocked = g.is_vip_only && !isVip && !isAdmin;
                  const notEnoughCoins =
                    !hasEntered && !vipLocked && !!user &&
                    (epcoins === null || epcoins < g.custo_epcoins);
                  const canEnter =
                    !!user && !hasEntered && !isEnded && !vipLocked && !notEnoughCoins;

                  return (
                    <div
                      key={g.id}
                      className={`giveaway-card${g.is_vip_only ? ' giveaway-card--vip' : ''}${!g.ativo ? ' giveaway-card--ended' : ''}`}
                    >
                      <div className="giveaway-card__badges">
                        {g.is_vip_only ? (
                          <span className="giveaway-badge giveaway-badge--vip">
                            <Crown size={12} /> VIP Only
                          </span>
                        ) : (
                          <span className="giveaway-badge giveaway-badge--all">
                            <Users size={12} /> Todos os Membros
                          </span>
                        )}
                        {hasEntered && (
                          <span className="giveaway-badge giveaway-badge--entered">
                            <CheckCircle size={12} /> Inscrito
                          </span>
                        )}
                      </div>

                      {g.imagem_url && (
                        <div className="giveaway-card__img">
                          <img src={g.imagem_url} alt={g.titulo} />
                        </div>
                      )}

                      <div className="giveaway-card__info">
                        <h3 className="giveaway-card__title">{g.titulo}</h3>
                        {g.descricao && (
                          <p className="giveaway-card__desc">{g.descricao}</p>
                        )}
                        <div className="giveaway-card__prize">
                          <Gift size={14} />
                          {g.premio_descricao}
                        </div>
                      </div>

                      <div className="giveaway-card__meta">
                        <div className="giveaway-meta-item">
                          <Users size={13} />
                          {entryCounts[g.id] ?? 0}{' '}
                          entr{(entryCounts[g.id] ?? 0) === 1 ? 'ada' : 'adas'}
                        </div>
                        {g.data_fim && (
                          <div className="giveaway-meta-item">
                            <Clock size={13} />
                            Data limite: {formatDeadline(g.data_fim)}
                          </div>
                        )}
                      </div>

                      {!user ? (
                        <button
                          className="giveaway-card__btn giveaway-card__btn--locked"
                          disabled
                        >
                          <Lock size={14} /> Inicia sessão para entrar
                        </button>
                      ) : hasWinner ? (
                        <div className="giveaway-winner-cta">
                          <div className="giveaway-winner-cta__label">
                            <Trophy size={13} /> Encerrado
                          </div>
                          <button
                            className="giveaway-winner-cta__btn"
                            onClick={() => setViewingWinner({ userId: g.vencedor_id!, username: winnerUsernames[g.id] ?? '...' })}
                          >
                            <div className="giveaway-winner-cta__avatar">
                              <span>{(winnerUsernames[g.id]?.[0] ?? '?').toUpperCase()}</span>
                              {winnerAvatars[g.id] && (
                                <img src={winnerAvatars[g.id]} alt=""
                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                              )}
                            </div>
                            @{winnerUsernames[g.id] ?? '...'}
                          </button>
                        </div>
                      ) : isEnded ? (
                        <button
                          className="giveaway-card__btn giveaway-card__btn--locked"
                          disabled
                        >
                          <Clock size={14} /> Encerrado
                        </button>
                      ) : hasEntered ? (
                        <button
                          className="giveaway-card__btn giveaway-card__btn--entered"
                          disabled
                        >
                          <CheckCircle size={14} /> Já estás inscrito
                        </button>
                      ) : vipLocked ? (
                        <button
                          className="giveaway-card__btn giveaway-card__btn--locked"
                          disabled
                        >
                          <Crown size={14} /> Exclusivo VIP
                        </button>
                      ) : notEnoughCoins ? (
                        <button
                          className="giveaway-card__btn giveaway-card__btn--locked"
                          disabled
                        >
                          <Lock size={14} />{' '}
                          Faltam{' '}
                          {(g.custo_epcoins - (epcoins ?? 0)).toLocaleString('pt-PT')} EPC
                        </button>
                      ) : (
                        <button
                          className={`giveaway-card__btn giveaway-card__btn--enter${g.is_vip_only ? ' vip' : ''}`}
                          onClick={() => handleEnterGiveaway(g)}
                          disabled={!canEnter || entering === g.id}
                        >
                          {entering === g.id ? (
                            'A entrar...'
                          ) : (
                            <>
                              <Coins size={14} />
                              Entrar por {g.custo_epcoins.toLocaleString('pt-PT')} EPC
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB: RANKING */}
        {activeTab === 'ranking' && (
          <div className="premios-ranking">
            {lideres.length === 0 ? (
              <div className="premios-empty">
                <Trophy size={40} style={{ color: 'var(--text-gray)' }} />
                <p>Ainda não há dados no ranking.</p>
              </div>
            ) : (
              <div className="ranking-list">
                {lideres.map((lider, idx) => {
                  const pos = idx + 1;
                  const isTop3 = pos <= 3;
                  const podium =
                    pos === 1
                      ? { color: '#e6b95c', icon: <Crown size={16} /> }
                      : pos === 2
                      ? { color: '#c0c0c0', icon: <Medal size={16} /> }
                      : { color: '#cd7f32', icon: <Medal size={16} /> };
                  return (
                    <div
                      key={lider.id}
                      className={`ranking-item${isTop3 ? ' top3' : ''}${lider.id === user?.id ? ' me' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setViewingWinner({ userId: lider.id, username: lider.username })}
                    >
                      <div
                        className="ranking-item__pos"
                        style={isTop3 ? { color: podium.color } : {}}
                      >
                        {isTop3 ? podium.icon : pos}
                      </div>
                      <div className="ranking-item__avatar">
                        <span>{(lider.username?.[0] ?? '?').toUpperCase()}</span>
                        <img
                          src={lider.avatar_url}
                          alt={lider.username}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="ranking-item__name">
                        {lider.username ?? 'Utilizador'}
                        {lider.id === user?.id && (
                          <span className="ranking-item__you">Tu</span>
                        )}
                      </div>
                      <div
                        className="ranking-item__pts"
                        style={isTop3 ? { color: podium.color } : {}}
                      >
                        <Star size={13} />
                        {lider.epcoins.toLocaleString('pt-PT')} EPC
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* COMO GANHAR */}
        <div className="premios-como">
          <div className="premios-como__header">
            <Zap size={20} style={{ color: 'var(--gold-primary)' }} />
            <h2 className="premios-como__title">Como Ganhar EPCoins</h2>
          </div>
          <div className="premios-como__grid">
            {COMO_GANHAR.map((item, i) => (
              <div key={i} className="como-card">
                <div className="como-card__icon">{item.icon}</div>
                <div className="como-card__info">
                  <div className="como-card__titulo">{item.titulo}</div>
                  <div className="como-card__desc">{item.descricao}</div>
                  <div className="como-card__pts">{item.pontos}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>

    {viewingWinner && (
      <WinnerProfileModal info={viewingWinner} onClose={() => setViewingWinner(null)} />
    )}
    </>
  );
}
