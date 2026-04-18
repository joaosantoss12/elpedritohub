import { useState, useRef, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { MessageCircle, X, Minus, Send, Radio, Maximize2 } from 'lucide-react';
import '../styles/Livestream.css';

// ─── TYPES ────────────────────────────────────────────────────

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

export default function Livestream() {
  const { user } = useAuth();

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
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dragging, setDragging] = useState(false);

  // ── Refs ──
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const namesCache = useRef<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      .select('id, username')
      .in('id', unknown);
    if (data) {
      data.forEach((m) => { namesCache.current[m.id] = m.username; });
      setDisplayNames({ ...namesCache.current });
    }
  }, []);

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
    const content = input.trim().slice(0, 300);
    setInput('');
    setSending(true);
    try {
      await supabase.from('livestream_messages').insert({ user_id: user.id, content });
    } catch { /* ignore */ }
    finally { setSending(false); }
    inputRef.current?.focus();
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
      <Navbar />

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
                  const username = displayNames[msg.user_id] ?? '…';
                  return (
                    <div key={msg.id} className="live-msg">
                      <span className={`live-msg__user${isMe ? ' me' : ''}`}>{username}:</span>
                      {' '}
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
