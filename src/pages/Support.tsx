import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, ChevronLeft, ChevronRight, Send, Paperclip, X, Loader2,
  MessageSquare, AlertTriangle, CheckCircle, XCircle, ShieldAlert,
  Star, TrendingUp, Gift, Calendar,
} from 'lucide-react';
import type { MembroData } from '../contexts/AuthContext';
import '../styles/Support.css';

// ─── TYPES ───────────────────────────────────────────────────────

interface Ticket {
  id: string;
  user_id: string;
  assunto: string;
  descricao: string;
  estado: 'aberto' | 'em_analise' | 'resolvido' | 'fechado';
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  conteudo: string;
  is_admin: boolean;
  imagem_url: string | null;
  created_at: string;
}

// ─── CONSTANTS ───────────────────────────────────────────────────

const ESTADO_MAP = {
  aberto:     { label: 'Aberto',      cls: 'sp-s-open' },
  em_analise: { label: 'Em Análise',  cls: 'sp-s-progress' },
  resolvido:  { label: 'Resolvido',   cls: 'sp-s-resolved' },
  fechado:    { label: 'Fechado',     cls: 'sp-s-closed' },
} as const;

const PRIORIDADE_MAP = {
  baixa:   { label: 'Baixa',   cls: 'sp-p-low' },
  normal:  { label: 'Normal',  cls: 'sp-p-normal' },
  alta:    { label: 'Alta',    cls: 'sp-p-high' },
  urgente: { label: 'Urgente', cls: 'sp-p-urgent' },
} as const;

// ─── HELPERS ─────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

// ─── CREATE TICKET MODAL ─────────────────────────────────────────

interface CreateModalProps {
  userId: string;
  onClose: () => void;
  onCreate: (t: Ticket) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

function CreateModal({ userId, onClose, onCreate, showToast }: CreateModalProps) {
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<Ticket['prioridade']>('normal');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!assunto.trim()) { showToast('Preenche o assunto', 'error'); return; }
    if (!descricao.trim()) { showToast('Preenche a descrição', 'error'); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('tickets')
      .insert({ user_id: userId, assunto: assunto.trim(), descricao: descricao.trim(), prioridade })
      .select()
      .single();
    setSaving(false);
    if (error) { showToast('Erro ao criar ticket: ' + error.message, 'error'); return; }
    showToast('Ticket criado!');
    onCreate(data as Ticket);
    onClose();
  };

  return (
    <div className="sp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-modal">
        <div className="sp-modal__header">
          <span>Novo Ticket de Suporte</span>
          <button className="sp-modal__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="sp-modal__body">
          <div className="sp-field">
            <label>Assunto</label>
            <input
              className="sp-input" maxLength={100}
              placeholder="Descreve o problema em poucas palavras…"
              value={assunto} onChange={e => setAssunto(e.target.value)}
            />
          </div>
          <div className="sp-field">
            <label>Descrição detalhada</label>
            <textarea
              className="sp-input" rows={5}
              placeholder="Explica o problema com o máximo de detalhe…"
              value={descricao} onChange={e => setDescricao(e.target.value)}
            />
          </div>
          <div className="sp-field">
            <label>Prioridade</label>
            <select className="sp-input" value={prioridade} onChange={e => setPrioridade(e.target.value as Ticket['prioridade'])}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
        </div>
        <div className="sp-modal__footer">
          <button className="sp-btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="sp-btn-primary" onClick={submit} disabled={saving}>
            {saving ? <Loader2 size={14} className="sp-spin" /> : <Plus size={14} />}
            Criar Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TICKET THREAD ────────────────────────────────────────────────

interface ThreadProps {
  ticket: Ticket;
  userId: string;
  isAdmin?: boolean;
  onBack: () => void;
  onTicketUpdate: (t: Ticket) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

function TicketThread({ ticket, userId, isAdmin = false, onBack, onTicketUpdate, showToast }: ThreadProps) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [ownerData, setOwnerData] = useState<MembroData | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const namesRef = useRef<Record<string, string>>({});

  const isClosed = ticket.estado === 'fechado' || ticket.estado === 'resolvido';

  const fetchNames = useCallback(async (ids: string[]) => {
    const unknown = ids.filter(id => !namesRef.current[id]);
    if (!unknown.length) return;
    const { data } = await supabase.from('membros').select('id, username').in('id', unknown);
    if (data) {
      data.forEach(m => { namesRef.current[m.id] = m.username; });
      setNames({ ...namesRef.current });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at');
      const msgs = (data ?? []) as TicketMessage[];
      setMessages(msgs);
      await fetchNames(msgs.map(m => m.user_id));
      if (isAdmin) {
        const { data: owner } = await supabase
          .from('membros').select('*').eq('id', ticket.user_id).single();
        if (owner) setOwnerData(owner as MembroData);
      }
      setLoading(false);
    })();
  }, [ticket.id, fetchNames, isAdmin, ticket.user_id]);

  useEffect(() => {
    const sub = supabase
      .channel(`sp_thread_${ticket.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'ticket_messages',
        filter: `ticket_id=eq.${ticket.id}`,
      }, async (payload) => {
        const msg = payload.new as TicketMessage;
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        await fetchNames([msg.user_id]);
      })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [ticket.id, fetchNames]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Apenas imagens são permitidas', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Imagem demasiado grande (máx. 5MB)', 'error'); return; }
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const clearImage = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${ticket.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('ticket-attachments').upload(path, file, { cacheControl: '3600' });
    if (error) { showToast('Erro ao carregar imagem: ' + error.message, 'error'); return null; }
    const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(path);
    return data.publicUrl;
  };

  const sendMessage = async () => {
    if (!text.trim() && !pendingFile) return;
    if (isClosed) return;
    setSending(true);
    let imagem_url: string | null = null;
    if (pendingFile) { imagem_url = await uploadImage(pendingFile); }
    const conteudo = text.trim() || (imagem_url ? '📎 Imagem anexada' : '');
    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id, user_id: userId, conteudo, is_admin: false, imagem_url,
    });
    setSending(false);
    if (error) { showToast('Erro ao enviar mensagem', 'error'); return; }
    setText('');
    clearImage();
    textareaRef.current?.focus();
  };

  const closeTicket = async () => {
    if (!confirm('Fechar este ticket?')) return;
    setClosing(true);
    const { data, error } = await supabase
      .from('tickets').update({ estado: 'fechado' }).eq('id', ticket.id).select().single();
    setClosing(false);
    if (error) { showToast('Erro ao fechar ticket', 'error'); return; }
    showToast('Ticket fechado');
    onTicketUpdate(data as Ticket);
  };

  const refreshMessages = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at');
    const msgs = (data ?? []) as TicketMessage[];
    setMessages(msgs);
    await fetchNames(msgs.map(m => m.user_id));
    setRefreshing(false);
  };

  const estado = ESTADO_MAP[ticket.estado];
  const prio = PRIORIDADE_MAP[ticket.prioridade];

  return (
    <div className="sp-thread">
      <div className="sp-thread__header">
        <button className="sp-back-btn" onClick={onBack}>
          <ChevronLeft size={16} /> Voltar
        </button>
        <div className="sp-thread__info">
          <h2 className="sp-thread__subject">{ticket.assunto}</h2>
          <div className="sp-thread__meta">
            <span className={`sp-status-badge ${estado.cls}`}>{estado.label}</span>
            <span className={`sp-prio-badge ${prio.cls}`}>{prio.label}</span>
            <span className="sp-thread__date">Aberto {fmtDate(ticket.created_at)}</span>
          </div>
        </div>
        {!isClosed && (
          <button className="sp-close-ticket-btn" onClick={closeTicket} disabled={closing}>
            {closing ? <Loader2 size={14} className="sp-spin" /> : <XCircle size={14} />}
            Fechar Ticket
          </button>
        )}
        <button className="sp-refresh-btn" onClick={refreshMessages} disabled={refreshing} title="Atualizar mensagens">
          <Loader2 size={14} className={refreshing ? 'sp-spin' : ''} />
        </button>
      </div>

      <div className={`sp-thread__content${isAdmin ? ' sp-thread__content--admin' : ''}`}>
        <div className="sp-thread__main">
        <div className="sp-thread__desc-box">
        <p className="sp-thread__desc-label">Descrição inicial</p>
        <p className="sp-thread__desc-text">{ticket.descricao}</p>
      </div>

      <div className="sp-thread__messages">
        {loading ? (
          <div className="sp-thread__loading"><Loader2 size={20} className="sp-spin" /></div>
        ) : (
          <>
            {messages.map(msg => {
              const isMe = msg.user_id === userId;
              const name = names[msg.user_id] ?? '…';
              return (
                <div key={msg.id} className={`sp-msg${msg.is_admin ? ' is-admin' : ''}${isMe ? ' is-own' : ''}`}>
                  <div className="sp-msg__avatar">
                    {msg.is_admin ? <ShieldAlert size={13} /> : (name[0]?.toUpperCase() ?? '?')}
                  </div>
                  <div className="sp-msg__bubble">
                    <div className="sp-msg__top">
                      <span className="sp-msg__name">
                        {msg.is_admin ? 'Suporte El Pedrito' : (isMe ? 'Tu' : name)}
                      </span>
                      <span className="sp-msg__time">{fmtTime(msg.created_at)}</span>
                    </div>
                    {msg.conteudo && <p className="sp-msg__text">{msg.conteudo}</p>}
                    {msg.imagem_url && (
                      <a href={msg.imagem_url} target="_blank" rel="noreferrer" className="sp-msg__img-link">
                        <img src={msg.imagem_url} alt="Anexo" className="sp-msg__img" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <div className="sp-thread__empty">Adiciona um comentário abaixo para o suporte responder.</div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {isClosed ? (
        <div className="sp-thread__closed-notice">
          <XCircle size={14} />
          Este ticket está {ticket.estado === 'fechado' ? 'fechado' : 'resolvido'} e não aceita mais mensagens.
        </div>
      ) : (
        <div className="sp-thread__reply">
          {pendingPreview && (
            <div className="sp-img-preview">
              <img src={pendingPreview} alt="Preview" />
              <button className="sp-img-preview__remove" onClick={clearImage}><X size={12} /></button>
            </div>
          )}
          <div className="sp-reply-row">
            <textarea
              ref={textareaRef}
              className="sp-reply-input"
              placeholder="Escreve uma mensagem… (Enter para enviar)"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              rows={1}
              disabled={sending}
            />
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileSelect} />
            <button
              className="sp-reply-attach"
              title="Anexar imagem"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
            >
              <Paperclip size={16} />
            </button>
            <button
              className="sp-reply-send"
              onClick={sendMessage}
              disabled={sending || (!text.trim() && !pendingFile)}
            >
              {sending ? <Loader2 size={16} className="sp-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
        </div>
        {isAdmin && (
          <aside className="sp-user-panel">
            {ownerData
              ? <UserInfoPanel data={ownerData} />
              : <div className="sp-user-panel__loading"><Loader2 size={18} className="sp-spin" /></div>
            }
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── USER INFO PANEL ─────────────────────────────────────────────

function UserInfoPanel({ data }: { data: MembroData }) {
  const fmtLoginDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  const initial = data.username?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="sp-uip">
      <div className="sp-uip__avatar">{initial}</div>
      <div className="sp-uip__name">{data.nome}</div>
      <div className="sp-uip__username">@{data.username}</div>
      <a className="sp-uip__email" href={`mailto:${data.email}`}>{data.email}</a>

      {data.badges?.length > 0 && (
        <div className="sp-uip__section">
          <div className="sp-uip__section-label">Badges</div>
          <div className="sp-uip__badges">
            {data.badges.map(b => <span key={b} className="sp-uip__badge">{b}</span>)}
          </div>
        </div>
      )}

      <div className="sp-uip__section">
        <div className="sp-uip__section-label">Estatísticas</div>
        <div className="sp-uip__stats">
          <div className="sp-uip__stat">
            <Star size={12} />
            <span className="sp-uip__stat-label">EPcoins</span>
            <span className="sp-uip__stat-val">{data.epcoins ?? 0}</span>
          </div>
          <div className="sp-uip__stat">
            <TrendingUp size={12} />
            <span className="sp-uip__stat-label">Streak</span>
            <span className="sp-uip__stat-val">{data.streak_login ?? 0} dias</span>
          </div>
          <div className="sp-uip__stat">
            <MessageSquare size={12} />
            <span className="sp-uip__stat-label">Msgs Chat</span>
            <span className="sp-uip__stat-val">{data.chat_messages ?? 0}</span>
          </div>
          <div className="sp-uip__stat">
            <Gift size={12} />
            <span className="sp-uip__stat-label">Prémios</span>
            <span className="sp-uip__stat-val">{data.prizes_claimed ?? 0}</span>
          </div>
          <div className="sp-uip__stat">
            <Calendar size={12} />
            <span className="sp-uip__stat-label">Último login</span>
            <span className="sp-uip__stat-val">{data.last_login_date ? fmtLoginDate(data.last_login_date) : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────

export default function Support() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading } = useAuth();
  const isAdmin = membro?.badges?.includes('Administrador') ?? false;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketNames, setTicketNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState<'todos' | Ticket['estado']>('todos');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from('tickets')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }
    const { data } = await query;
    const ts = (data ?? []) as Ticket[];
    setTickets(ts);
    if (isAdmin && ts.length > 0) {
      const ids = [...new Set(ts.map(t => t.user_id))];
      const { data: membData } = await supabase.from('membros').select('id, username').in('id', ids);
      if (membData) {
        const map: Record<string, string> = {};
        (membData as { id: string; username: string }[]).forEach(m => { map[m.id] = m.username; });
        setTicketNames(map);
      }
    }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const filtered = filter === 'todos' ? tickets : tickets.filter(t => t.estado === filter);

  const handleTicketUpdate = (updated: Ticket) => {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelected(updated);
  };

  if (authLoading) return null;

  return (
    <div className="sp-page">
      <Navbar />

      {toast && (
        <div className={`sp-toast sp-toast--${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {selected ? (
        <div className="sp-wrapper">
          <TicketThread
            ticket={selected}
            userId={user!.id}
            isAdmin={isAdmin}
            onBack={() => setSelected(null)}
            onTicketUpdate={handleTicketUpdate}
            showToast={showToast}
          />
        </div>
      ) : (
        <div className="sp-wrapper">
          <div className="sp-header">
            <div>
              <h1 className="sp-title">Apoio ao Cliente</h1>
              <p className="sp-subtitle">A nossa equipa responde o mais brevemente possível.</p>
            </div>
            <button className="sp-btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Novo Ticket
            </button>
          </div>

          <div className="sp-filter-tabs">
            {(['todos', 'aberto', 'em_analise', 'resolvido', 'fechado'] as const).map(f => (
              <button
                key={f}
                className={`sp-filter-tab${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'todos' ? 'Todos' : ESTADO_MAP[f].label}
                <span className="sp-filter-count">
                  {f === 'todos' ? tickets.length : tickets.filter(t => t.estado === f).length}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="sp-loading"><Loader2 size={22} className="sp-spin" /> A carregar tickets…</div>
          ) : filtered.length === 0 ? (
            <div className="sp-empty">
              <MessageSquare size={40} />
              <p>
                {filter === 'todos'
                  ? 'Ainda não tens tickets. Cria o primeiro!'
                  : `Nenhum ticket ${ESTADO_MAP[filter as Ticket['estado']]?.label.toLowerCase()}.`}
              </p>
            </div>
          ) : (
            <div className="sp-ticket-list">
              {filtered.map(ticket => {
                const estado = ESTADO_MAP[ticket.estado];
                const prio = PRIORIDADE_MAP[ticket.prioridade];
                return (
                  <div key={ticket.id} className="sp-ticket-card" onClick={() => setSelected(ticket)}>
                    <div className="sp-ticket-card__icon"><MessageSquare size={17} /></div>
                    <div className="sp-ticket-card__body">
                      <div className="sp-ticket-card__top">
                        <span className="sp-ticket-card__subject">{ticket.assunto}</span>
                        <span className={`sp-status-badge ${estado.cls}`}>{estado.label}</span>
                      </div>
                      <div className="sp-ticket-card__meta">
                        {isAdmin && ticketNames[ticket.user_id] && (
                          <span className="sp-ticket-card__owner">@{ticketNames[ticket.user_id]}</span>
                        )}
                        <span className={`sp-prio-badge ${prio.cls}`}>{prio.label}</span>
                        <span className="sp-ticket-card__date">Atualizado: {fmtDate(ticket.updated_at)}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="sp-ticket-card__arrow" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showCreate && user && (
        <CreateModal
          userId={user.id}
          onClose={() => setShowCreate(false)}
          onCreate={(ticket) => {
            setTickets(prev => [ticket, ...prev]);
            setSelected(ticket);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
