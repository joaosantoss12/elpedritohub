import { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Lock, Trash2, X, Award, Pin, ShieldBan, Clock, Bell, BellOff } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const getAvatarUrl = (userId: string): string => {
  const { data: { publicUrl } } = supabase.storage
    .from('profile_images')
    .getPublicUrl(userId);
  return `${publicUrl}?t=${Date.now()}`;
};
import '../styles/Chat.css';

interface Message {
  id: string;
  user_id: string;
  content: string;
  image_url?: string;
  created_at: string;
  is_pinned?: boolean;
}

interface MemberInfo {
  nome: string;
  username: string;
  avatar_url?: string | null;
  epcoins?: number;
  streak_login?: number;
  chat_messages?: number;
  badges?: string[];
}

const BADGE_LABELS: Record<string, string> = {
  membro_fundador: '👑 Fundador',
  top_apostador: '🏆 Top Apostador',
  streak_7: '🔥 7 dias seguidos',
  streak_30: '⚡ 30 dias seguidos',
  primeiro_acerto: '🎯 Primeiro Acerto',
  membro_vip: '💎 VIP',
};

export default function Chat() {
  const { user, membro, refreshMembro } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [membersCache, setMembersCache] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);

  const [messageText, setMessageText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const [profileModal, setProfileModal] = useState<MemberInfo & { id: string } | null>(null);
  const [avatarErrors, setAvatarErrors] = useState<Set<string>>(new Set());

  const [allUsernames, setAllUsernames] = useState<Array<{id: string, username: string, nome: string}>>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = membro?.badges?.includes('Administrador') ?? false;
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('chat_notifications') === 'true';
  });
  const notificationsRef = useRef(notificationsEnabled);
  const membersCacheRef = useRef(membersCache);

  useEffect(() => { notificationsRef.current = notificationsEnabled; }, [notificationsEnabled]);
  useEffect(() => { membersCacheRef.current = membersCache; }, [membersCache]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const playNotificationSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch (_) {}
  };

  const triggerNotification = (msg: Message) => {
    playNotificationSound();
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const sender = membersCacheRef.current[msg.user_id]?.nome || 'Alguém';
      new Notification(`${sender} no chat`, {
        body: msg.content || '📎 Imagem',
        icon: '/icon-192.svg',
        tag: 'chat-msg',
      });
    }
  };

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      setNotificationsEnabled(true);
      localStorage.setItem('chat_notifications', 'true');
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('chat_notifications', 'false');
    }
  };
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [timeoutModal, setTimeoutModal] = useState<{ userId: string; nome: string } | null>(null);
  const [myBanned, setMyBanned] = useState(false);
  const [myTimeout, setMyTimeout] = useState<Date | null>(null);

  // Fetch all usernames for @mention dropdown
  useEffect(() => {
    supabase
      .from('membros')
      .select('id, username, nome')
      .not('username', 'is', null)
      .then(({ data }) => {
        if (data) setAllUsernames(data.filter(m => m.username));
      });
  }, []);

  // Check own ban/timeout status + subscribe to realtime changes
  useEffect(() => {
    if (!user) return;

    // Initial fetch
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

    // Realtime subscription so admin-applied timeouts/bans take effect immediately
    const statusSub = supabase
      .channel(`membros_status_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'membros', filter: `id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { is_banned?: boolean; chat_timeout_until?: string | null };
          setMyBanned(row.is_banned ?? false);
          setMyTimeout(row.chat_timeout_until ? new Date(row.chat_timeout_until) : null);
        }
      )
      .subscribe();

    return () => {
      statusSub.unsubscribe();
    };
  }, [user]);

  // Pre-populate cache with own membro info from auth context
  useEffect(() => {
    if (user && membro) {
      setMembersCache(prev => ({
        ...prev,
        [user.id]: {
          nome: membro.nome,
          username: membro.username,
          epcoins: membro.epcoins,
          streak_login: membro.streak_login,
          chat_messages: membro.chat_messages,
          badges: membro.badges ?? [],
        },
      }));
    }
  }, [user, membro]);

  // Load messages from Supabase
  useEffect(() => {
    fetchMessages();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel('chat_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMessage = payload.new as Message;
          fetchMemberInfo([newMessage.user_id]);
          setMessages(prev => {
            const isDuplicate = prev.some(msg =>
              msg.user_id === newMessage.user_id &&
              msg.content === newMessage.content &&
              Math.abs(new Date(msg.created_at).getTime() - new Date(newMessage.created_at).getTime()) < 1000
            );
            if (isDuplicate) return prev;
            return [...prev, newMessage];
          });
          // Notification: all messages from others
          if (newMessage.user_id !== user?.id && notificationsRef.current) {
            triggerNotification(newMessage);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          setPinnedMessage(prev => prev?.id === payload.old.id ? null : prev);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, is_pinned: updated.is_pinned } : m));
          if (updated.is_pinned) {
            setPinnedMessage(updated);
          } else {
            setPinnedMessage(prev => prev?.id === updated.id ? null : prev);
          }
        }
      )
      .subscribe((_status) => {
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchMemberInfo = async (userIds: string[]) => {
    const unknownIds = userIds.filter(id => !membersCache[id]);
    if (unknownIds.length === 0) return;

    const { data } = await supabase
      .from('membros')
      .select('id, nome, username, epcoins, streak_login, chat_messages, badges')
      .in('id', unknownIds);

    if (data) {
      setMembersCache(prev => {
        const updated = { ...prev };
        data.forEach(m => {
          updated[m.id] = {
            nome: m.nome,
            username: m.username,
            epcoins: m.epcoins,
            streak_login: m.streak_login,
            chat_messages: m.chat_messages,
            badges: m.badges ?? [],
          };
        });
        return updated;
      });
    }
  };

  const openProfile = async (userId: string) => {
    // Open modal immediately with cached basic info (no avatar yet)
    const cached = membersCache[userId];
    if (cached) {
      setProfileModal({ id: userId, ...cached });
    }

    // Always fetch full stats (may not be in cache yet)
    const memberRes = await supabase
      .from('membros')
      .select('id, nome, username, epcoins, streak_login, chat_messages, badges')
      .eq('id', userId)
      .maybeSingle();
    const avatarUrl = getAvatarUrl(userId);

    if (memberRes.data) {
      const info: MemberInfo = {
        nome: memberRes.data.nome,
        username: memberRes.data.username,
        avatar_url: avatarUrl,
        epcoins: memberRes.data.epcoins,
        streak_login: memberRes.data.streak_login,
        chat_messages: memberRes.data.chat_messages,
        badges: memberRes.data.badges ?? [],
      };
      setMembersCache(prev => ({ ...prev, [userId]: info }));
      setProfileModal({ id: userId, ...info });
    }
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, user_id, content, image_url, created_at, is_pinned')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      const pinned = (data || []).find(m => m.is_pinned);
      if (pinned) setPinnedMessage(pinned);

      // Fetch member info for all unique user_ids
      const userIds = [...new Set((data || []).map(m => m.user_id))];
      await fetchMemberInfo(userIds);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const isNearBottom = () => {
    const el = chatMessagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  };

  // Save last-read message on unmount and when tab is hidden
  useEffect(() => {
    const saveLastRead = () => {
      const msgs = messagesRef.current;
      if (msgs.length > 0) {
        localStorage.setItem('chat_last_read', msgs[msgs.length - 1].id);
      }
    };
    document.addEventListener('visibilitychange', saveLastRead);
    return () => {
      saveLastRead();
      document.removeEventListener('visibilitychange', saveLastRead);
    };
  }, []);

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    const el = chatMessagesContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (loading || messages.length === 0) return;
    if (!hasInitialScrolled.current) {
      hasInitialScrolled.current = true;
      // Wait for DOM to paint the message elements before scrolling
      requestAnimationFrame(() => {
        const lastReadId = localStorage.getItem('chat_last_read');
        if (lastReadId) {
          const msgEl = document.getElementById(`msg-${lastReadId}`);
          if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'instant', block: 'center' });
            return;
          }
        }
        scrollToBottom('instant');
      });
      return;
    }
    // New messages: only auto-scroll if user is near the bottom
    if (isNearBottom()) {
      scrollToBottom('smooth');
    }
  }, [messages, loading]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validação de tipo de ficheiro
      if (!file.type.startsWith('image/')) {
        alert('Por favor, seleciona apenas imagens!');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewImage(event.target?.result as string);
        setPreviewFile(file);
      };
      reader.readAsDataURL(file);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes} ${day}/${month}/${year}`;
  };

  const handleSendMessage = async () => {
    if (!user) {
      alert('Tens de estar autenticado para enviar mensagens');
      return;
    }

    if (myBanned) {
      alert('A tua conta está suspensa. Não podes enviar mensagens.');
      return;
    }

    if (myTimeout && myTimeout > new Date()) {
      const remaining = Math.ceil((myTimeout.getTime() - Date.now()) / 1000);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      alert(`Estás em silêncio por mais ${mins > 0 ? `${mins}m ` : ''}${secs}s.`);
      return;
    }

    if (!messageText.trim() && !previewFile) return;

    try {
      setUploading(true);
      let imageUrl = null;

      // Upload de imagem se existe
      if (previewFile) {
        const fileExt = previewFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(filePath, previewFile);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('chat-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      // Cache current user's member info for display
      if (membro && !membersCache[user.id]) {
        setMembersCache(prev => ({
          ...prev,
          [user.id]: { nome: membro.nome, username: membro.username },
        }));
      }

      // Clear inputs immediately
      setMessageText('');
      setPreviewImage(null);
      setPreviewFile(null);
      setUploading(false);

      // Insert message into database (realtime subscription will add it to UI)
      const { error: insertError } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          content: messageText,
          image_url: imageUrl,
        });

      if (insertError) throw insertError;

      // Increment chat_messages counter and reward EPC every 10 messages (anti-spam: min 3 chars)
      if (membro && messageText.trim().length >= 3) {
        const newCount = (membro.chat_messages ?? 0) + 1;
        const isVip = (membro.badges ?? []).includes('VIP') || (membro.badges ?? []).includes('Administrador');
        const epcReward = newCount % 10 === 0 ? (isVip ? 5 : 1) : 0;
        await supabase
          .from('membros')
          .update({
            chat_messages: newCount,
            ...(epcReward > 0 ? { epcoins: (membro.epcoins ?? 0) + epcReward } : {}),
          })
          .eq('id', user.id);
        if (epcReward > 0) await refreshMembro();
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar a mensagem. Tenta novamente.');
      setUploading(false);
    }
  };

  const isMobile = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (isMobile()) {
        // Mobile: Enter always inserts a new line
        return;
      }
      if (!e.shiftKey && !e.ctrlKey) {
        // Desktop: plain Enter sends
        e.preventDefault();
        handleSendMessage();
      }
      // Desktop: Shift+Enter or Ctrl+Enter inserts new line (default textarea behaviour)
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    if (pinnedMessage?.id === msgId) setPinnedMessage(null);
    await supabase.from('chat_messages').delete().eq('id', msgId);
  };

  const handlePinMessage = async (msg: Message) => {
    // Unpin current, then toggle
    await supabase.from('chat_messages').update({ is_pinned: false }).eq('is_pinned', true);
    setMessages(prev => prev.map(m => ({ ...m, is_pinned: false })));
    if (pinnedMessage?.id === msg.id) {
      setPinnedMessage(null);
    } else {
      await supabase.from('chat_messages').update({ is_pinned: true }).eq('id', msg.id);
      setPinnedMessage({ ...msg, is_pinned: true });
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: true } : m));
    }
  };

  const handleBanUser = async (userId: string, nome: string) => {
    if (!confirm(`Banir ${nome}? Perderá acesso a todas as páginas exceto o início.`)) return;
    await supabase.from('membros').update({ is_banned: true }).eq('id', userId);
  };

  const handleTimeoutUser = async (userId: string, seconds: number) => {
    const until = new Date(Date.now() + seconds * 1000);
    await supabase.from('membros').update({ chat_timeout_until: until.toISOString() }).eq('id', userId);
    setTimeoutModal(null);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageText(val);
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex !== -1) {
      const afterAt = textBeforeCursor.slice(atIndex + 1);
      if (!/\s/.test(afterAt)) {
        setMentionQuery(afterAt.toLowerCase());
        setMentionStart(atIndex);
        return;
      }
    }
    setMentionQuery(null);
    setMentionStart(-1);
  };

  const selectMention = (username: string) => {
    const queryLen = mentionQuery?.length ?? 0;
    const before = messageText.slice(0, mentionStart);
    const after = messageText.slice(mentionStart + 1 + queryLen);
    setMessageText(`${before}@${username} ${after}`);
    setMentionQuery(null);
    setMentionStart(-1);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const renderContent = (content: string, isUserMsg: boolean) => {
    console.log(isUserMsg)
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (/^@\w+$/.test(part)) {
        const username = part.slice(1);
        const mentioned = allUsernames.find(m => m.username === username);
        return (
          <span
            key={i}
            onClick={() => { if (mentioned) openProfile(mentioned.id); }}
            style={{
              fontWeight: 'bold',
              color: 'var(--gold-primary)',
              background: 'rgba(230,185,92,0.15)',
              borderRadius: '4px',
              padding: '0 3px',
              cursor: mentioned ? 'pointer' : 'default',
            }}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="chat-container">
      <Navbar />
      {/* Notifications toggle bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0.4rem 5%', gap: '0.5rem'}}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-gray)' }}>Notificações</span>
        <button
          onClick={toggleNotifications}
          title={notificationsEnabled ? 'Desligar notificações' : 'Ativar notificações'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: notificationsEnabled ? 'rgba(230,185,92,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${notificationsEnabled ? 'rgba(230,185,92,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: notificationsEnabled ? 'var(--gold-primary)' : 'var(--text-gray)',
            borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {notificationsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
          {notificationsEnabled ? 'Ligado' : 'Desligado'}
        </button>
      </div>

      {/* ── Profile Modal ── */}
      {profileModal && (
        <div className="chat-profile-overlay" onClick={() => setProfileModal(null)}>
          <div className="chat-profile-modal" onClick={e => e.stopPropagation()}>
            <button className="chat-profile-close" onClick={() => setProfileModal(null)}>
              <X size={18} />
            </button>

            {/* Avatar */}
            <div className="chat-profile-avatar">
              {profileModal.avatar_url
                ? <img src={profileModal.avatar_url} alt="avatar" />
                : <span>{profileModal.nome?.[0]?.toUpperCase() ?? '?'}</span>
              }
            </div>

            {/* Name + username */}
            <h3 className="chat-profile-name">{profileModal.nome}</h3>
            {profileModal.username && (
              <p className="chat-profile-username">@{profileModal.username}</p>
            )}

            {/* Badges */}
            {(profileModal.badges?.length ?? 0) > 0 && (
              <div className="chat-profile-badges">
                {profileModal.badges!.map(b => (
                  <span key={b} className="chat-profile-badge" style={{display: 'flex', alignItems: 'center'}}>
                    <Award size={16} />{BADGE_LABELS[b] ?? b}
                  </span>
                ))}
              </div>
            )}

            {/* Stats */}
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
          </div>
        </div>
      )}
      {/* ── Timeout Modal ── */}
      {timeoutModal && (
        <div className="chat-profile-overlay" onClick={() => setTimeoutModal(null)}>
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
                <button
                  key={opt.seconds}
                  className="admin-timeout-btn"
                  onClick={() => handleTimeoutUser(timeoutModal.userId, opt.seconds)}
                >
                  <Clock size={14} /> {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setTimeoutModal(null)}
              style={{ marginTop: '1rem', width: '100%', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-gray)', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="chat-messages" ref={chatMessagesContainerRef}>
        {/* Pinned message banner */}
        {pinnedMessage && (
          <div className="chat-pinned-banner">
            <Pin size={14} style={{ flexShrink: 0, color: 'var(--gold-primary)', alignSelf: 'flex-start', marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--gold-primary)', fontWeight: 700, display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>MENSAGEM AFIXADA</span>
              {/* Author row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                {avatarErrors.has(pinnedMessage.user_id) ? (
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#2a2a2a', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0, color: 'var(--gold-primary)' }}>
                    {membersCache[pinnedMessage.user_id]?.nome?.[0]?.toUpperCase() ?? '?'}
                  </div>
                ) : (
                  <img src={getAvatarUrl(pinnedMessage.user_id)} alt="avatar" onError={() => setAvatarErrors(prev => new Set(prev).add(pinnedMessage.user_id))} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-color)' }} />
                )}
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-white)' }}>
                  {membersCache[pinnedMessage.user_id]?.nome || 'Utilizador'}
                </span>
                {membersCache[pinnedMessage.user_id]?.username && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-gray)' }}>@{membersCache[pinnedMessage.user_id].username}</span>
                )}
              </div>
              {/* Preview */}
              <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: 'rgba(255,255,255,0.75)' }}>
                {pinnedMessage.image_url && !pinnedMessage.content && '📎 Imagem'}
                {pinnedMessage.image_url && pinnedMessage.content && '📎 '}
                {pinnedMessage.content ? pinnedMessage.content.replace(/\n/g, ' ') : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center', alignSelf: 'flex-start' }}>
              {(pinnedMessage.content?.includes('\n') || (pinnedMessage.content?.length ?? 0) > 60 || pinnedMessage.image_url) && (
                <button
                  className="chat-pinned-close"
                  onClick={() => setPinnedExpanded(true)}
                  title="Ver mensagem completa"
                  style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(230,185,92,0.3)', color: 'var(--gold-primary)', background: 'rgba(230,185,92,0.08)' }}
                >
                  Ver mais
                </button>
              )}
              <button
                className="chat-pinned-close"
                onClick={() => {
                  document.getElementById(`msg-${pinnedMessage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                title="Ir para a mensagem"
                style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-white)', background: 'rgba(255,255,255,0.06)' }}
              >
                ↓ Ir
              </button>
              {isAdmin && (
                <button
                  className="chat-pinned-close"
                  onClick={() => handlePinMessage(pinnedMessage)}
                  title="Remover mensagem afixada"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pinned message expanded modal */}
        {pinnedExpanded && pinnedMessage && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={() => setPinnedExpanded(false)}
          >
            <div
              style={{ background: '#141414', border: '1px solid rgba(230,185,92,0.25)', borderRadius: '16px', padding: '1.5rem', maxWidth: '480px', width: '100%', maxHeight: '70vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Pin size={14} style={{ color: 'var(--gold-primary)' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--gold-primary)', fontWeight: 700, flex: 1, letterSpacing: '0.5px' }}>MENSAGEM AFIXADA</span>
                <button onClick={() => setPinnedExpanded(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-gray)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
              </div>
              {/* Author row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                {avatarErrors.has(pinnedMessage.user_id) ? (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2a2a2a', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0, color: 'var(--gold-primary)' }}>
                    {membersCache[pinnedMessage.user_id]?.nome?.[0]?.toUpperCase() ?? '?'}
                  </div>
                ) : (
                  <img src={getAvatarUrl(pinnedMessage.user_id)} alt="avatar" onError={() => setAvatarErrors(prev => new Set(prev).add(pinnedMessage.user_id))} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-color)' }} />
                )}
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-white)' }}>
                    {membersCache[pinnedMessage.user_id]?.nome || 'Utilizador'}
                  </span>
                  {membersCache[pinnedMessage.user_id]?.username && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)', marginLeft: '0.35rem' }}>@{membersCache[pinnedMessage.user_id].username}</span>
                  )}
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-gray)', marginTop: '1px' }}>
                    {new Date(pinnedMessage.created_at).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              {/* Content */}
              {pinnedMessage.image_url && (
                <img src={pinnedMessage.image_url} alt="imagem" style={{ width: '100%', borderRadius: '8px', marginBottom: pinnedMessage.content ? '0.75rem' : 0 }} />
              )}
              {pinnedMessage.content && (
                <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-white)', whiteSpace: 'pre-wrap', lineHeight: 1.6, wordBreak: 'break-word' }}>
                  {pinnedMessage.content}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setPinnedExpanded(false); document.getElementById(`msg-${pinnedMessage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  style={{ background: 'rgba(230,185,92,0.1)', border: '1px solid rgba(230,185,92,0.3)', color: 'var(--gold-primary)', borderRadius: '8px', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  ↓ Ir para a mensagem
                </button>
              </div>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-gray)' }}>
            A carregar mensagens...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-gray)' }}>
            Sem mensagens ainda. Sê o primeiro a enviar! 👋
          </div>
        ) : (
          messages.map((msg) => {
            const isUserMessage = user?.id === msg.user_id;
            const memberInfo = membersCache[msg.user_id];
            const showAdminMenu = isAdmin;
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`message ${isUserMessage ? 'user-message' : 'other-message'}`}
                style={{
                  display: 'flex',
                  justifyContent: isUserMessage ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  marginBottom: '0.8rem',
                  paddingRight: isUserMessage ? '1rem' : '0',
                  paddingLeft: !isUserMessage ? '1rem' : '0',
                  position: 'relative',
                }}
              >
                {!isUserMessage && (
                  avatarErrors.has(msg.user_id) ? (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2a2a2a', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0, color: 'var(--gold-primary)' }}>
                      {memberInfo?.nome?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  ) : (
                    <img
                      src={getAvatarUrl(msg.user_id)}
                      alt="avatar"
                      onError={() => setAvatarErrors(prev => new Set(prev).add(msg.user_id))}
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-color)' }}
                    />
                  )
                )}
                <div
                  style={{
                    maxWidth: '70%',
                    backgroundColor: isUserMessage
                      ? 'rgba(255,255,255,0.07)'
                      : (!!membro?.username && msg.content.includes(`@${membro.username}`)
                          ? 'rgba(230,185,92,0.13)'
                          : 'rgba(230,185,92,0.07)'),
                    color: 'var(--text-white)',
                    borderRadius: '12px',
                    padding: '1rem',
                    position: 'relative',
                    border: isUserMessage
                      ? '1px solid rgba(255,255,255,0.13)'
                      : (!!membro?.username && msg.content.includes(`@${membro.username}`)
                          ? '1px solid rgba(230,185,92,0.45)'
                          : '1px solid rgba(230,185,92,0.18)'),
                  }}
                >
                  {/* Name + username — shown for all messages */}
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.8rem',
                    }}
                  >
                    <span>
                      {memberInfo?.nome || 'Utilizador'}
                      {memberInfo?.username && (
                        <span
                          onClick={() => openProfile(msg.user_id)}
                          style={{ fontWeight: '400', opacity: 0.6, marginLeft: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline dotted' }}
                          title="Ver perfil"
                        >
                          @{memberInfo.username}
                        </span>
                      )}
                    </span>
                    
                  </div>
                  <div className="message-content">
                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        alt="Imagem da mensagem"
                        className="message-image"
                        style={{
                          maxWidth: '100%',
                          borderRadius: '8px',
                          marginBottom: msg.content ? '0.5rem' : '0',
                        }}
                      />
                    )}
                    {msg.content && <p style={{ margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{renderContent(msg.content, isUserMessage)}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                    {isUserMessage ? (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Apagar mensagem"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          color: 'inherit',
                          opacity: 0.7,
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; e.currentTarget.style.borderRadius = '4px'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'inherit'; e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : <span />}
                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                      {formatTime(msg.created_at)}
                    </span>
                  </div>

                  {/* Admin action bar */}
                  {showAdminMenu && (
                    <div className="admin-msg-actions" style={{ justifyContent: isUserMessage ? 'flex-start' : 'flex-end' }}>
                      <button
                        className={`admin-msg-btn ${msg.is_pinned ? 'admin-msg-btn--active' : ''}`}
                        title={msg.is_pinned ? 'Desafixar' : 'Afixar'}
                        onClick={() => handlePinMessage(msg)}
                      >
                        <Pin size={13} />
                      </button>
                      <button
                        className="admin-msg-btn admin-msg-btn--danger"
                        title="Apagar mensagem"
                        onClick={() => handleDeleteMessage(msg.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                      {msg.user_id !== user?.id && (
                        <>
                          <button
                            className="admin-msg-btn admin-msg-btn--warn"
                            title="Timeout"
                            onClick={() => setTimeoutModal({ userId: msg.user_id, nome: memberInfo?.nome ?? 'Utilizador' })}
                          >
                            <Clock size={13} />
                          </button>
                          <button
                            className="admin-msg-btn admin-msg-btn--danger"
                            title="Banir utilizador"
                            onClick={() => handleBanUser(msg.user_id, memberInfo?.nome ?? 'Utilizador')}
                          >
                            <ShieldBan size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {isUserMessage && (
                  avatarErrors.has(msg.user_id) ? (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#2a2a2a', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0, color: 'var(--gold-primary)' }}>
                      {memberInfo?.nome?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  ) : (
                    <img
                      src={getAvatarUrl(msg.user_id)}
                      alt="avatar"
                      onError={() => setAvatarErrors(prev => new Set(prev).add(msg.user_id))}
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--gold-primary)' }}
                    />
                  )
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => scrollToBottom('smooth')}
          style={{
            position: 'absolute',
            bottom: '90px',
            right: '5%',
            zIndex: 200,
            background: 'rgba(230,185,92,0.15)',
            border: '1px solid rgba(230,185,92,0.4)',
            color: 'var(--gold-primary)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            fontSize: '1.1rem',
            transition: 'all 0.2s',
          }}
          title="Ir para o fim"
        >
          ↓
        </button>
      )}

      <div className="chat-input-container">
        {!user ? (
          <div style={{
            padding: '1.5rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            color: '#3b82f6',
            fontSize: '0.9rem',
            fontWeight: '500'
          }}>
            <Lock size={20} />
            <span>Inicia sessão para enviar mensagens no chat!</span>
          </div>
        ) : myBanned ? (
          <div style={{ padding: '1.2rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', color: '#ef4444', fontSize: '0.9rem', fontWeight: '500' }}>
            <ShieldBan size={20} />
            <span>A tua conta está suspensa.</span>
          </div>
        ) : myTimeout && myTimeout > new Date() ? (
          <div style={{ padding: '1.2rem', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '1rem', color: '#eab308', fontSize: '0.9rem', fontWeight: '500' }}>
            <Clock size={20} />
            <span>Estás em silêncio até {myTimeout.toLocaleTimeString('pt-PT')}.</span>
          </div>
        ) : (
          <>
            {previewImage && (
              <div className="image-preview">
                <img src={previewImage} alt="Prévia" />
                <button
                  onClick={() => {
                    setPreviewImage(null);
                    setPreviewFile(null);
                  }}
                  className="remove-preview"
                >
                  ✕
                </button>
              </div>
            )}
            
            <div className="chat-input-wrapper" style={{ position: 'relative' }}>
              {/* @mention dropdown */}
              {mentionQuery !== null && allUsernames.filter(m => m.username.toLowerCase().startsWith(mentionQuery)).length > 0 && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  right: 0,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  overflow: 'hidden',
                  zIndex: 100,
                  boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
                }}>
                  {allUsernames
                    .filter(m => m.username.toLowerCase().startsWith(mentionQuery))
                    .slice(0, 6)
                    .map(m => (
                      <div
                        key={m.id}
                        onMouseDown={(e) => { e.preventDefault(); selectMention(m.username); }}
                        style={{
                          padding: '0.6rem 1rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(230,185,92,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>@{m.username}</span>
                        <span style={{ color: 'var(--text-gray)', fontSize: '0.8rem' }}>{m.nome}</span>
                      </div>
                    ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={messageText}
                onChange={handleTextChange}
                onKeyPress={handleKeyPress}
                placeholder="Escreve uma mensagem... (usa @ para mencionar)"
                className="chat-input"
                rows={2}
                style={{
                  opacity: 1,
                  cursor: 'text'
                }}
              />
              
              <div className="chat-actions">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-image"
                  title="Enviar imagem"
                  disabled={uploading}
                  style={{
                    opacity: !uploading ? 1 : 0.5,
                    cursor: !uploading ? 'pointer' : 'not-allowed'
                  }}
                >
                  <ImageIcon size={20} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                  disabled={uploading}
                />
                
                <button
                  onClick={handleSendMessage}
                  disabled={(!messageText.trim() && !previewFile) || uploading}
                  className="btn-send"
                  title="Enviar mensagem (Enter)"
                  style={{
                    opacity: ((messageText.trim() || previewFile) && !uploading) ? 1 : 0.5,
                    cursor: ((messageText.trim() || previewFile) && !uploading) ? 'pointer' : 'not-allowed'
                  }}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
