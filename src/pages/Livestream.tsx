import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MessageCircle, X, Minus, Send, Radio, Maximize2, Award, ShieldBan, Clock, Trash2 } from 'lucide-react';
import '../styles/Livestream.css';

// ─── HELPERS ──────────────────────────────────────────────────

const getAvatarUrl = (userId: string): string => {
  const { data: { publicUrl } } = supabase.storage
    .from('profile_images')
    .getPublicUrl(userId);
  return `${publicUrl}?t=${Date.now()}`;
};

const BADGE_LABELS: Record<string, string> = {
  membro_fundador: '👑 Fundador',
  top_apostador: '🏆 Top Apostador',
  streak_7: '🔥 7 dias seguidos',
  streak_30: '⚡ 30 dias seguidos',
  primeiro_acerto: '🎯 Primeiro Acerto',
  membro_vip: '💎 VIP',
};

// ─── TYPES ────────────────────────────────────────────────────

interface LiveMemberInfo {
  nome: string;
  username: string;
  avatar_url?: string | null;
  epcoins?: number;
  streak_login?: number;
  chat_messages?: number;
  badges?: string[];
}

interface LiveMsg {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

type ChatState = 'open' | 'minimized' | 'closed';

// ─── CONSTANTS ────────────────────────────────────────────────

const CHAT_W = 320;
const CHAT_H_OPEN = 440;
const CHAT_H_MIN = 44;

// ─── COMPONENT ────────────────────────────────────────────────

/**
 * `embedded` — dentro da Sala de Comando a Navbar é da página anfitriã.
 */
export default function Livestream({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, membro, loading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = membro?.badges?.some(b => b.toLowerCase() === 'administrador') ?? false;

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  // ── Stream config ──
  const [channel, setChannel] = useState('elpedrito');
  const [isOnline, setIsOnline] = useState(false);
  const [streamTitle, setStreamTitle] = useState('Live El Pedrito');
  const hostname = window.location.hostname;

  // ── Chat state ──
  const [chatState, setChatState] = useState<ChatState>('open');
  const chatStateRef = useRef<ChatState>('open');
  useEffect(() => { chatStateRef.current = chatState; }, [chatState]);

  const [chatPos, setChatPos] = useState({ x: 0, y: 0 });
  const chatPosRef = useRef({ x: 0, y: 0 });
  useEffect(() => { chatPosRef.current = chatPos; }, [chatPos]);

  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, LiveMemberInfo>>({});
  const [profileModal, setProfileModal] = useState<LiveMemberInfo & { id: string } | null>(null);
  const [avatarErrors, setAvatarErrors] = useState<Set<string>>(new Set());
  const [timeoutModal, setTimeoutModal] = useState<{ userId: string; nome: string } | null>(null);
  const [myBanned, setMyBanned] = useState(false);
  const [myTimeout, setMyTimeout] = useState<Date | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dragging, setDragging] = useState(false);

  // ── Refs ──
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const namesCache = useRef<Record<string, LiveMemberInfo>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Check own ban/timeout + realtime ──
  useEffect(() => {
    if (!user) return;
    supabase
      .from('membros')
      .select('is_banned, chat_timeout_until')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setMyBanned(data.is_banned ?? false);
          setMyTimeout(data.chat_timeout_until ? new Date(data.chat_timeout_until) : null);
        }
      });
    const sub = supabase
      .channel(`live_status_${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'membros', filter: `id=eq.${user.id}` }, (payload) => {
        const row = payload.new as { is_banned?: boolean; chat_timeout_until?: string | null };
        setMyBanned(row.is_banned ?? false);
        setMyTimeout(row.chat_timeout_until ? new Date(row.chat_timeout_until) : null);
      })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [user]);

  // ── Admin actions ──
  const handleBanUser = async (userId: string, nome: string) => {
    if (!confirm(`Banir ${nome}? Perderá acesso ao chat.`)) return;
    await supabase.from('membros').update({ is_banned: true }).eq('id', userId);
    setProfileModal(null);
  };

  const handleTimeoutUser = async (userId: string, seconds: number) => {
    const until = new Date(Date.now() + seconds * 1000);
    await supabase.from('membros').update({ chat_timeout_until: until.toISOString() }).eq('id', userId);
    setTimeoutModal(null);
    setProfileModal(null);
  };

  // ── Set initial chat position (bottom-right) ──
  useEffect(() => {
    const x = window.innerWidth - CHAT_W - 24;
    const y = window.innerHeight - CHAT_H_OPEN - 70;
    setChatPos({ x, y });
    chatPosRef.current = { x, y };
  }, []);

  // ── Fetch config ──
  useEffect(() => {
    supabase
      .from('livestream_config')
      .select('twitch_channel, titulo, online')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.twitch_channel) setChannel(data.twitch_channel);
        if (data?.titulo) setStreamTitle(data.titulo);
        if (typeof data?.online === 'boolean') setIsOnline(data.online);
      });
  }, []);

  // ── Fetch usernames (stable via namesCache ref) ──
  const fetchUsernames = useCallback(async (userIds: string[]) => {
    const unknown = userIds.filter((id) => !namesCache.current[id]);
    if (!unknown.length) return;
    const { data } = await supabase
      .from('membros')
      .select('id, nome, username, epcoins, streak_login, chat_messages, badges')
      .in('id', unknown);
    if (data) {
      data.forEach((m) => {
        namesCache.current[m.id] = {
          nome: m.nome || m.username,
          username: m.username,
          epcoins: m.epcoins,
          streak_login: m.streak_login,
          chat_messages: m.chat_messages,
          badges: m.badges ?? [],
        };
      });
      setDisplayNames({ ...namesCache.current });
    }
  }, []);

  const openProfile = async (userId: string) => {
    const cached = namesCache.current[userId];
    if (cached) setProfileModal({ id: userId, ...cached });
    const { data } = await supabase
      .from('membros')
      .select('id, nome, username, epcoins, streak_login, chat_messages, badges')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const info: LiveMemberInfo = {
        nome: data.nome || data.username,
        username: data.username,
        avatar_url: getAvatarUrl(userId),
        epcoins: data.epcoins,
        streak_login: data.streak_login,
        chat_messages: data.chat_messages,
        badges: data.badges ?? [],
      };
      namesCache.current[userId] = info;
      setDisplayNames(prev => ({ ...prev, [userId]: info }));
      setProfileModal({ id: userId, ...info });
    }
  };

  // ── Load messages + realtime subscription ──
  useEffect(() => {
    supabase
      .from('livestream_messages')
      .select('id, user_id, content, created_at')
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) {
          setMessages(data);
          fetchUsernames([...new Set(data.map((m) => m.user_id))]);
        }
      });

    const sub = supabase
      .channel('livestream_chat_rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'livestream_messages' },
        (payload) => {
          const msg = payload.new as LiveMsg;
          fetchUsernames([msg.user_id]);
          setMessages((prev) => [...prev, msg]);
          if (chatStateRef.current !== 'open') {
            setUnread((n) => n + 1);
          }
        }
      )
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [fetchUsernames]);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    if (chatState === 'open') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatState]);

  // ── Reset unread when opened ──
  useEffect(() => {
    if (chatState === 'open') setUnread(0);
  }, [chatState]);

  // ── Auto-resize textarea ──
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 80)}px`;
    }
  }, [input]);

  // ── Global drag move/up listeners ──
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const chatH = chatStateRef.current === 'minimized' ? CHAT_H_MIN : CHAT_H_OPEN;
      const newX = Math.max(0, Math.min(window.innerWidth - CHAT_W, clientX - dragOffset.current.x));
      const newY = Math.max(60, Math.min(window.innerHeight - chatH, clientY - dragOffset.current.y));
      chatPosRef.current = { x: newX, y: newY };
      setChatPos({ x: newX, y: newY });
    };

    const handleUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setDragging(false);
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, []);

  // ── Drag start handler ──
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('.live-chat__controls')) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    isDragging.current = true;
    setDragging(true);
    dragOffset.current = {
      x: clientX - chatPosRef.current.x,
      y: clientY - chatPosRef.current.y,
    };
    e.preventDefault();
  };

  // ── Send message ──
  const sendMessage = async () => {
    if (!user || !input.trim() || sending) return;
    if (myBanned) { alert('A tua conta está suspensa.'); return; }
    if (myTimeout && myTimeout > new Date()) {
      const remaining = Math.ceil((myTimeout.getTime() - Date.now()) / 1000);
      const mins = Math.floor(remaining / 60); const secs = remaining % 60;
      alert(`Estás em silêncio por mais ${mins > 0 ? `${mins}m ` : ''}${secs}s.`);
      return;
    }
    const content = input.trim().slice(0, 300);
    setInput('');
    setSending(true);
    try {
      await supabase.from('livestream_messages').insert({ user_id: user.id, content });
    } catch { /* ignore */ }
    finally { setSending(false); }
    inputRef.current?.focus();
  };

  const handleClearLiveChat = async () => {
    if (!confirm('Tens a certeza que queres apagar TODAS as mensagens do chat da live? Esta ação é irreversível!')) return;
    await supabase.from('livestream_messages').delete().not('id', 'is', null);
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────

  const twitchSrc = `https://player.twitch.tv/?channel=${channel}&parent=${hostname}&autoplay=false`;

  return (
    <div className="live-page">
      {!embedded && <Navbar />}

      <div className="live-wrapper">

        {/* ── OFFLINE BANNER ── */}
        {!isOnline && (
          <div className="live-offline-banner">
            <div className="live-offline-banner__inner">
              <span className="live-offline-banner__dot" />
              <div>
                <p className="live-offline-banner__title">Live Offline</p>
                <p className="live-offline-banner__sub">A live não está ativa de momento. Volta mais tarde!</p>
              </div>
            </div>
          </div>
        )}

        {/* ── TWITCH EMBED ── */}
        <div className="live-embed-container">
          <div className="live-embed-ratio">
            <iframe
              src={twitchSrc}
              title={streamTitle}
              allowFullScreen
              allow="autoplay; fullscreen"
              className="live-embed-iframe"
            />
          </div>
        </div>

        {/* ── INFO BAR ── */}
        <div className="live-info-bar">
          <div className="live-info-bar__left">
            <span className={`live-dot ${isOnline ? 'online' : 'offline'}`} />
            <span className={`live-status-label${isOnline ? ' online' : ''}`}>
              {isOnline ? 'AO VIVO' : 'OFFLINE'}
            </span>
            <span className="live-channel-name">/{channel}</span>
            <span className="live-stream-title">{streamTitle}</span>
          </div>
          <div className="live-info-bar__right">
            {chatState === 'closed' && (
              <button className="live-open-chat-btn" onClick={() => setChatState('open')}>
                <MessageCircle size={15} />
                Abrir Chat
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ── FLOATING CHAT ── */}
      {chatState !== 'closed' && (
        <div
          className={`live-chat${chatState === 'minimized' ? ' minimized' : ''}${dragging ? ' dragging' : ''}`}
          style={{ left: chatPos.x, top: chatPos.y, width: CHAT_W }}
        >
          {/* Drag handle / header */}
          <div
            className="live-chat__header"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
          >
            <div className="live-chat__title">
              <MessageCircle size={14} />
              Chat da Live
              {chatState === 'minimized' && unread > 0 && (
                <span className="live-chat__unread">{unread}</span>
              )}
            </div>
            <div className="live-chat__controls">
              {isAdmin && chatState === 'open' && (
                <button
                  className="live-chat__ctrl-btn"
                  title="Limpar chat"
                  onClick={handleClearLiveChat}
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                className="live-chat__ctrl-btn"
                title={chatState === 'minimized' ? 'Expandir' : 'Minimizar'}
                onClick={() => setChatState((s) => s === 'minimized' ? 'open' : 'minimized')}
              >
                {chatState === 'minimized' ? <Maximize2 size={13} /> : <Minus size={13} />}
              </button>
              <button
                className="live-chat__ctrl-btn close"
                title="Fechar"
                onClick={() => setChatState('closed')}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Body — hidden when minimized */}
          {chatState === 'open' && (
            <>
              <div className="live-chat__messages">
                {messages.length === 0 && (
                  <div className="live-chat__empty">Sê o primeiro a comentar!</div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.user_id === user?.id;
                  const info = displayNames[msg.user_id];
                  const nome = info?.nome ?? '…';
                  const username = info?.username;
                  const time = new Date(msg.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={msg.id} className="live-msg">
                      <span className="live-msg__time">{time}</span>
                      {' '}
                      <span
                        className={`live-msg__user${isMe ? ' me' : ''}`}
                        onClick={() => openProfile(msg.user_id)}
                        style={{ cursor: 'pointer' }}
                        title="Ver perfil"
                      >
                        {nome}
                        {username && (
                          <span className="live-msg__username"> ({username})</span>
                        )}
                      </span>
                      {': '}
                      <span className="live-msg__text">{msg.content}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="live-chat__input-area">
                {user ? (
                  <div className="live-chat__input-row">
                    <textarea
                      ref={inputRef}
                      className="live-chat__input"
                      placeholder="Escreve uma mensagem..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={300}
                      rows={1}
                    />
                    <button
                      className="live-chat__send"
                      onClick={sendMessage}
                      disabled={!input.trim() || sending}
                    >
                      <Send size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="live-chat__login-prompt">
                    <Radio size={14} />
                    Inicia sessão para participar
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PROFILE MODAL ── */}
      {profileModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setProfileModal(null)}
        >
          <div
            className="chat-profile-modal"
            onClick={e => e.stopPropagation()}
          >
            <button className="chat-profile-close" onClick={() => setProfileModal(null)}>
              <X size={18} />
            </button>
            <div className="chat-profile-avatar">
              {profileModal.avatar_url && !avatarErrors.has(profileModal.id)
                ? <img src={profileModal.avatar_url} alt="avatar" onError={() => setAvatarErrors(prev => new Set(prev).add(profileModal.id))} />
                : <span>{profileModal.nome?.[0]?.toUpperCase() ?? '?'}</span>
              }
            </div>
            <h3 className="chat-profile-name">{profileModal.nome}</h3>
            {profileModal.username && (
              <p className="chat-profile-username">@{profileModal.username}</p>
            )}
            {(profileModal.badges?.length ?? 0) > 0 && (
              <div className="chat-profile-badges">
                {profileModal.badges!.map(b => (
                  <span key={b} className="chat-profile-badge" style={{ display: 'flex', alignItems: 'center' }}>
                    <Award size={16} />{BADGE_LABELS[b] ?? b}
                  </span>
                ))}
              </div>
            )}
            <div className="chat-profile-stats">
              <div className="chat-profile-stat">
                <span className="chat-profile-stat__val">{profileModal.epcoins ?? 0}</span>
                <span className="chat-profile-stat__lbl">EP Coins</span>
              </div>
              <div className="chat-profile-stat">
                <span className="chat-profile-stat__val">{profileModal.streak_login ?? 0}</span>
                <span className="chat-profile-stat__lbl">Streak</span>
              </div>
              <div className="chat-profile-stat">
                <span className="chat-profile-stat__val">{profileModal.chat_messages ?? 0}</span>
                <span className="chat-profile-stat__lbl">Mensagens</span>
              </div>
            </div>
            {isAdmin && profileModal.id !== user?.id && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => { setTimeoutModal({ userId: profileModal.id, nome: profileModal.nome }); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24', padding: '0.45rem 0.9rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  <Clock size={13} /> Silenciar
                </button>
                <button
                  onClick={() => handleBanUser(profileModal.id, profileModal.nome)}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', padding: '0.45rem 0.9rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  <ShieldBan size={13} /> Banir
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TIMEOUT MODAL ── */}
      {timeoutModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setTimeoutModal(null)}>
          <div className="admin-timeout-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.2rem' }}>
              <Clock size={20} color="var(--gold-primary)" />
              <h4 style={{ margin: 0, fontSize: '1rem' }}>Silenciar: <span style={{ color: 'var(--gold-primary)' }}>{timeoutModal.nome}</span></h4>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { label: '30 segundos', seconds: 30 },
                { label: '5 minutos', seconds: 300 },
                { label: '30 minutos', seconds: 1800 },
                { label: '1 hora', seconds: 3600 },
                { label: '24 horas', seconds: 86400 },
              ].map(opt => (
                <button key={opt.seconds} className="admin-timeout-btn" onClick={() => handleTimeoutUser(timeoutModal.userId, opt.seconds)}>
                  <Clock size={14} /> {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setTimeoutModal(null)} style={{ marginTop: '1rem', width: '100%', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-gray)', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── REOPEN BUTTON (chat closed) ── */}
      {chatState === 'closed' && (
        <button className="live-chat-reopen" onClick={() => setChatState('open')}>
          <MessageCircle size={20} />
          {unread > 0 && <span className="live-chat-reopen__badge">{unread}</span>}
        </button>
      )}
    </div>
  );
}
