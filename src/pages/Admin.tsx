import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Radio, Gift, CreditCard, Calendar, TrendingUp, Star, Globe,
  Plus, Pencil, Trash2, Save, X, Search, ShieldAlert, ShieldOff, Trophy,
  CheckCircle, AlertCircle, ChevronRight, Loader2, ToggleLeft, ToggleRight,
  MessageSquare, Send, Paperclip, ChevronLeft,
} from 'lucide-react';
import '../styles/Admin.css';

// ─── TYPES ──────────────────────────────────────────────────────

type Section = 'membros' | 'live' | 'premios' | 'planos' | 'palpites' | 'bilhete' | 'lucro' | 'lucro-semana' | 'top-aposta' | 'mundial-bets' | 'suporte';

interface SupportTicket {
  id: string;
  user_id: string;
  assunto: string;
  descricao: string;
  estado: 'aberto' | 'em_analise' | 'resolvido' | 'fechado';
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  conteudo: string;
  is_admin: boolean;
  imagem_url: string | null;
  created_at: string;
}

interface AdminMembro {
  id: string;
  nome: string;
  username: string;
  epcoins: number;
  streak_login: number;
  last_login_date: string;
  chat_messages: number;
  prizes_claimed: number;
  badges: string[];
}

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
  created_at?: string;
}

interface Plano {
  id: string;
  nome: string;
  preco: string;
  periodo: string;
  destaque: boolean;
  badge: string | null;
  poupanca: string | null;
  funcionalidades: string[];
  ordem: number;
}

interface BilheteDia {
  data: string;
  acertos: number;
  possiveis: number;
  odd: number;
  ganhos: number;
}


interface TopAposta {
  data: string;
  mercado: string;
  jogo: string;
  odd: number;
  valor_apostado: number;
  valor_ganho: number;
  imagem_url: string | null;
}

interface PalpiteDia {
  id: string;
  data: string;
  team: string;
  league: string;
  odd: string;
  time: string;
  color: string;
  ordem: number;
}

interface MundialBet {
  id: string;
  match_date: string;
  match_label: string;
  pick: string;
  odd: number;
  result: 'pending' | 'won' | 'lost' | 'void';
  created_at: string;
}

interface LiveConfig {
  twitch_channel: string;
  titulo: string;
  online: boolean;
}

// ─── NAV ────────────────────────────────────────────────────────

const NAV_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: 'membros',       label: 'Membros',        icon: <Users size={15} /> },
  { key: 'live',          label: 'Live',           icon: <Radio size={15} /> },
  { key: 'premios',       label: 'Giveaways',      icon: <Gift size={15} /> },
  { key: 'planos',        label: 'Planos',         icon: <CreditCard size={15} /> },
  { key: 'palpites',      label: 'Palpites do Dia', icon: <TrendingUp size={15} /> },
  { key: 'bilhete',       label: 'Bilhete do Dia', icon: <Calendar size={15} /> },
  { key: 'lucro',         label: 'Lucro do Mês',   icon: <TrendingUp size={15} /> },
  { key: 'lucro-semana',  label: 'Lucro da Semana', icon: <TrendingUp size={15} /> },
  { key: 'top-aposta',    label: 'Top Aposta',     icon: <Star size={15} /> },
  { key: 'mundial-bets',  label: 'Mundial Bets',   icon: <Globe size={15} /> },
  { key: 'suporte',        label: 'Suporte',         icon: <MessageSquare size={15} /> },
];

// ─── TOAST ──────────────────────────────────────────────────────

function AdminToast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={`admin-toast admin-toast--${type}`}>
      {type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
      {msg}
    </div>
  );
}

// ─── MODAL WRAPPER ──────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="admin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="admin-modal">
        <div className="admin-modal__header">
          <span>{title}</span>
          <button className="admin-modal__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="admin-modal__body">{children}</div>
      </div>
    </div>
  );
}

// ─── FIELD ROW ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="admin-field">
      <label className="admin-field__label">{label}</label>
      {children}
    </div>
  );
}

// ─── NUMERIC INPUT ───────────────────────────────────────────────

function NumericInput({
  value, onChange, className, step, placeholder,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string; step?: number; placeholder?: string;
}) {
  const [str, setStr] = useState(value != null ? String(value) : '');
  const [focused, setFocused] = useState(false);
  const display = focused ? str : (value != null ? String(value) : '');
  const isDecimal = step != null && step < 1;
  return (
    <input
      className={className}
      type="text"
      inputMode={isDecimal ? 'decimal' : 'numeric'}
      value={display}
      placeholder={placeholder ?? '0'}
      onFocus={e => { setFocused(true); setStr(value != null ? String(value) : ''); e.target.select(); }}
      onChange={e => {
        const v = e.target.value;
        const valid = isDecimal ? /^-?\d*[.,]?\d*$/ : /^-?\d*$/;
        if (v === '' || valid.test(v)) {
          setStr(v);
          if (v !== '' && v !== '-') onChange(Number(v.replace(',', '.')));
        }
      }}
      onBlur={() => { setFocused(false); if (str === '' || str === '-') onChange(0); }}
    />
  );
}

// ─── DATE INPUT ──────────────────────────────────────────────────

function DateInput({
  value, onChange, withTime,
}: {
  value: string;
  onChange: (v: string) => void;
  withTime?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="admin-date-wrap">
      <input
        ref={ref}
        className="admin-input"
        type={withTime ? 'datetime-local' : 'date'}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <button type="button" className="admin-date-btn" title="Abrir calendário"
        onClick={() => { ref.current?.showPicker?.(); }}>
        <Calendar size={14} />
      </button>
    </div>
  );
}

// ─── SECTION: MEMBROS ────────────────────────────────────────────

function SectionMembros({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [membros, setMembros] = useState<AdminMembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminMembro | null>(null);
  const [saving, setSaving] = useState(false);
  const [newBadge, setNewBadge] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('membros')
      .select('id, nome, username, epcoins, streak_login, last_login_date, chat_messages, prizes_claimed, badges')
      .order('username');
    if (error) showToast('Erro ao carregar membros', 'error');
    else setMembros((data ?? []) as AdminMembro[]);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = membros.filter(m =>
    m.username?.toLowerCase().includes(search.toLowerCase()) ||
    m.nome?.toLowerCase().includes(search.toLowerCase())
  );

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from('membros')
      .update({
        nome: editing.nome,
        username: editing.username,
        epcoins: editing.epcoins,
        streak_login: editing.streak_login,
        chat_messages: editing.chat_messages,
        prizes_claimed: editing.prizes_claimed,
        badges: editing.badges,
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) { showToast('Erro ao guardar: ' + error.message, 'error'); return; }
    showToast('Membro atualizado');
    setEditing(null);
    load();
  };

  const removeBadge = (b: string) => {
    if (!editing) return;
    setEditing({ ...editing, badges: editing.badges.filter(x => x !== b) });
  };

  const addBadge = () => {
    if (!editing || !newBadge.trim()) return;
    const trimmed = newBadge.trim();
    if (!editing.badges.includes(trimmed)) {
      setEditing({ ...editing, badges: [...editing.badges, trimmed] });
    }
    setNewBadge('');
  };

  const removeVip = async (m: AdminMembro) => {
    if (!confirm(`Remover VIP de ${m.username}? As colunas VIP ficarão a NULL.`)) return;
    const updatedBadges = m.badges.filter(b => b.toLowerCase() !== 'vip');
    const { error } = await supabase
      .from('membros')
      .update({
        subscription_status: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        subscription_cancel_at: null,
        vip_telegram_link: null,
        badges: updatedBadges,
      })
      .eq('id', m.id);
    if (error) { showToast('Erro ao remover VIP: ' + error.message, 'error'); return; }
    showToast('VIP removido com sucesso');
    load();
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={14} />
          <input placeholder="Pesquisar por username ou nome…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Nome</th>
                <th>EPCoins</th>
                <th>Streak</th>
                <th>Mensagens</th>
                <th>Prémios</th>
                <th>Badges</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id}>
                  <td><strong>{m.username}</strong></td>
                  <td>{m.nome}</td>
                  <td>{m.epcoins ?? 0}</td>
                  <td>{m.streak_login ?? 0}</td>
                  <td>{m.chat_messages ?? 0}</td>
                  <td>{m.prizes_claimed ?? 0}</td>
                  <td>
                    <div className="admin-badges-preview">
                      {(m.badges ?? []).map(b => <span key={b} className="admin-badge-chip">{b}</span>)}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <button className="admin-btn-icon" onClick={() => setEditing({ ...m })}>
                        <Pencil size={14} />
                      </button>
                      {m.badges?.some(b => b.toLowerCase() === 'vip') && (
                        <button
                          className="admin-btn-icon"
                          title="Remover VIP"
                          style={{ color: '#ef4444' }}
                          onClick={() => removeVip(m)}
                        >
                          <ShieldOff size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="admin-empty-row">Nenhum membro encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={`Editar: ${editing.username}`} onClose={() => setEditing(null)}>
          <Field label="Nome">
            <input className="admin-input" value={editing.nome} onChange={e => setEditing({ ...editing, nome: e.target.value })} />
          </Field>
          <Field label="Username">
            <input className="admin-input" value={editing.username} onChange={e => setEditing({ ...editing, username: e.target.value })} />
          </Field>
          <Field label="EPCoins">
            <NumericInput className="admin-input" value={editing.epcoins} onChange={n => setEditing({ ...editing, epcoins: n })} />
          </Field>
          <Field label="Streak Login">
            <NumericInput className="admin-input" value={editing.streak_login} onChange={n => setEditing({ ...editing, streak_login: n })} />
          </Field>
          <Field label="Mensagens Chat">
            <NumericInput className="admin-input" value={editing.chat_messages} onChange={n => setEditing({ ...editing, chat_messages: n })} />
          </Field>
          <Field label="Prémios Resgatados">
            <NumericInput className="admin-input" value={editing.prizes_claimed} onChange={n => setEditing({ ...editing, prizes_claimed: n })} />
          </Field>
          <Field label="Badges">
            <div className="admin-badges-edit">
              {editing.badges.map(b => (
                <span key={b} className="admin-badge-chip editable">
                  {b}
                  <button onClick={() => removeBadge(b)}><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="admin-badge-add">
              <input className="admin-input" placeholder="Novo badge…" value={newBadge} onChange={e => setNewBadge(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBadge(); } }} />
              <button className="admin-btn-secondary" onClick={addBadge}><Plus size={14} /></button>
            </div>
          </Field>
          <div className="admin-modal__actions">
            <button className="admin-btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SECTION: LIVE ───────────────────────────────────────────────

function SectionLive({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [config, setConfig] = useState<LiveConfig>({ twitch_channel: '', titulo: '', online: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('livestream_config').select('twitch_channel, titulo, online').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) setConfig(data as LiveConfig);
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('livestream_config').upsert({ id: 1, ...config });
    setSaving(false);
    if (error) showToast('Erro ao guardar: ' + error.message, 'error');
    else showToast('Configuração da live atualizada');
  };

  if (loading) return <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>;

  return (
    <div className="admin-section-content admin-form-section">
      <div className={`admin-live-status ${config.online ? 'online' : 'offline'}`}>
        <span className="admin-live-dot" />
        Estado atual: <strong>{config.online ? 'AO VIVO' : 'OFFLINE'}</strong>
      </div>

      <div className="admin-toggle-row">
        <span>Estado da Live</span>
        <button
          className={`admin-toggle ${config.online ? 'on' : 'off'}`}
          onClick={() => setConfig(c => ({ ...c, online: !c.online }))}
        >
          {config.online ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
          {config.online ? 'Online' : 'Offline'}
        </button>
      </div>

      <Field label="Canal Twitch">
        <input className="admin-input" value={config.twitch_channel} onChange={e => setConfig(c => ({ ...c, twitch_channel: e.target.value }))} />
      </Field>
      <Field label="Título da Live">
        <input className="admin-input" value={config.titulo} onChange={e => setConfig(c => ({ ...c, titulo: e.target.value }))} />
      </Field>

      <button className="admin-btn-primary" style={{ marginTop: 8 }} onClick={save} disabled={saving}>
        {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
        Guardar Alterações
      </button>
    </div>
  );
}

// ─── SECTION: PRÉMIOS ────────────────────────────────────────────

function isoToLocalDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToLocalTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface WinnerInfo {
  userId: string;
  username: string;
  titulo: string;
}

const EMPTY_GIVEAWAY: Omit<Giveaway, 'id' | 'created_at'> = {
  titulo: '',
  descricao: null,
  premio_descricao: '',
  imagem_url: null,
  custo_epcoins: 100,
  is_vip_only: false,
  data_fim: null,
  vencedor_id: null,
  ativo: true,
};

interface GiveawayEntry {
  entry_id: string;
  user_id: string;
  username: string;
}

function SelectWinnerModal({ giveaway, onClose, onWinnerSet, showToast }: {
  giveaway: Giveaway;
  onClose: () => void;
  onWinnerSet: (userId: string, username: string) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [entries, setEntries] = useState<GiveawayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('giveaway_entries')
        .select('id, user_id')
        .eq('giveaway_id', giveaway.id);
      if (!data) { setLoading(false); return; }
      const userIds = data.map((e: { id: string; user_id: string }) => e.user_id);
      let usernameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: membros } = await supabase.from('membros').select('id, username').in('id', userIds);
        if (membros) membros.forEach((m: { id: string; username: string }) => { usernameMap[m.id] = m.username; });
      }
      setEntries(data.map((e: { id: string; user_id: string }) => ({
        entry_id: e.id,
        user_id: e.user_id,
        username: usernameMap[e.user_id] ?? e.user_id.slice(0, 8),
      })));
      setLoading(false);
    })();
  }, [giveaway.id]);

  const pickWinner = async (entry: GiveawayEntry) => {
    if (!confirm(`Definir @${entry.username} como vencedor de "${giveaway.titulo}"?`)) return;
    setPicking(entry.user_id);
    const { error } = await supabase
      .from('giveaways')
      .update({ vencedor_id: entry.user_id, ativo: false })
      .eq('id', giveaway.id);
    if (error) {
      showToast('Erro ao definir vencedor: ' + error.message, 'error');
      setPicking(null);
      return;
    }
    onWinnerSet(entry.user_id, entry.username);
    onClose();
  };

  return (
    <Modal title={`Escolher Vencedor — ${giveaway.titulo}`} onClose={onClose}>
      <div className="admin-entries-modal">
        {loading ? (
          <div className="admin-loading"><Loader2 size={18} className="spin" /> A carregar…</div>
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem' }}>Nenhum participante inscrito.</p>
        ) : (
          <div className="admin-entries-list">
            {entries.map(e => (
              <div key={e.entry_id} className="admin-entries-row">
                <div className="admin-entries-avatar">
                  <span>{(e.username?.[0] ?? '?').toUpperCase()}</span>
                  <img
                    src={supabase.storage.from('profile_images').getPublicUrl(e.user_id).data.publicUrl}
                    alt={e.username}
                    onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <span className="admin-entries-name">@{e.username}</span>
                <button
                  className="admin-btn-primary admin-btn-sm"
                  disabled={picking === e.user_id}
                  onClick={() => pickWinner(e)}
                  style={{ marginLeft: 'auto' }}
                >
                  {picking === e.user_id ? <Loader2 size={12} className="spin" /> : <Trophy size={12} />}
                  Escolher
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EntriesModal({ giveaway, onClose, showToast }: {
  giveaway: Giveaway;
  onClose: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [entries, setEntries] = useState<GiveawayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('giveaway_entries')
      .select('id, user_id')
      .eq('giveaway_id', giveaway.id);
    if (!data) { setLoading(false); return; }
    const userIds = data.map((e: { id: string; user_id: string }) => e.user_id);
    let usernameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: membros } = await supabase.from('membros').select('id, username').in('id', userIds);
      if (membros) membros.forEach((m: { id: string; username: string }) => { usernameMap[m.id] = m.username; });
    }
    setEntries(data.map((e: { id: string; user_id: string }) => ({
      entry_id: e.id,
      user_id: e.user_id,
      username: usernameMap[e.user_id] ?? e.user_id.slice(0, 8),
    })));
    setLoading(false);
  }, [giveaway.id]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const existingIds = new Set(entries.map(e => e.user_id));

  const doSearch = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from('membros').select('id, username').ilike('username', `%${q}%`).limit(8);
    setSearchResults((data ?? []).filter((m: { id: string }) => !existingIds.has(m.id)) as { id: string; username: string }[]);
    setSearching(false);
  };

  const addEntry = async (userId: string, username: string) => {
    setAdding(userId);
    const { error } = await supabase.from('giveaway_entries').insert({ giveaway_id: giveaway.id, user_id: userId });
    if (error) {
      showToast('Erro ao adicionar: ' + error.message, 'error');
    } else {
      showToast(`${username} adicionado`);
      setSearch('');
      setSearchResults([]);
      await loadEntries();
    }
    setAdding(null);
  };

  const removeEntry = async (entryId: string, username: string) => {
    setRemoving(entryId);
    const { error } = await supabase.from('giveaway_entries').delete().eq('id', entryId);
    if (error) {
      showToast('Erro ao remover: ' + error.message, 'error');
    } else {
      showToast(`${username} removido`);
      await loadEntries();
    }
    setRemoving(null);
  };

  return (
    <Modal title={`Participantes — ${giveaway.titulo}`} onClose={onClose}>
      <div className="admin-entries-modal">
        <div className="admin-entries-search">
          <div className="admin-search" style={{ flex: 1 }}>
            <Search size={14} />
            <input
              placeholder="Pesquisar membro para adicionar…"
              value={search}
              onChange={e => doSearch(e.target.value)}
            />
            {searching && <Loader2 size={13} className="spin" style={{ flexShrink: 0 }} />}
          </div>
        </div>
        {searchResults.length > 0 && (
          <div className="admin-entries-suggestions">
            {searchResults.map(m => (
              <div key={m.id} className="admin-entries-suggestion-row">
                <span>@{m.username}</span>
                <button
                  className="admin-btn-primary admin-btn-sm"
                  disabled={adding === m.id}
                  onClick={() => addEntry(m.id, m.username)}
                >
                  {adding === m.id ? <Loader2 size={12} className="spin" /> : <Plus size={12} />}
                  Adicionar
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="admin-entries-list">
          {loading ? (
            <div className="admin-loading"><Loader2 size={18} className="spin" /> A carregar…</div>
          ) : entries.length === 0 ? (
            <div className="admin-empty-row" style={{ padding: '1rem', textAlign: 'center' }}>Nenhum participante</div>
          ) : entries.map(e => (
            <div key={e.entry_id} className="admin-entries-row">
              <div className="admin-entries-avatar">
                <span>{(e.username?.[0] ?? '?').toUpperCase()}</span>
                <img
                  src={supabase.storage.from('profile_images').getPublicUrl(e.user_id).data.publicUrl}
                  alt={e.username}
                  onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <span className="admin-entries-name">@{e.username}</span>
              <button
                className="admin-btn-icon danger"
                title="Remover"
                disabled={removing === e.entry_id}
                onClick={() => removeEntry(e.entry_id, e.username)}
              >
                {removing === e.entry_id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          ))}
        </div>
        <div className="admin-entries-count">{entries.length} participante{entries.length !== 1 ? 's' : ''}</div>
      </div>
    </Modal>
  );
}

function SectionGiveaways({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [entries, setEntries] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Giveaway> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);
  const [managingEntries, setManagingEntries] = useState<Giveaway | null>(null);
  const [selectingWinner, setSelectingWinner] = useState<Giveaway | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('giveaways').select('*').order('created_at', { ascending: false });
    const list = (data ?? []) as Giveaway[];
    setGiveaways(list);
    // load entry counts
    const counts: Record<string, number> = {};
    for (const g of list) {
      const { count } = await supabase.from('giveaway_entries').select('id', { count: 'exact', head: true }).eq('giveaway_id', g.id);
      counts[g.id] = count ?? 0;
    }
    setEntries(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing({ ...EMPTY_GIVEAWAY }); setIsNew(true); };
  const openEdit = (g: Giveaway) => { setEditing({ ...g }); setIsNew(false); };
  const closeModal = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...fields } = editing as Giveaway;
    let error;
    if (isNew) {
      ({ error } = await supabase.from('giveaways').insert(fields));
    } else {
      ({ error } = await supabase.from('giveaways').update(fields).eq('id', id));
    }
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Giveaway criado' : 'Giveaway atualizado');
    closeModal();
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Eliminar este giveaway? Todas as entradas serão apagadas.')) return;
    const { error } = await supabase.from('giveaways').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Giveaway eliminado'); load(); }
  };

  const drawWinner = async (g: Giveaway) => {
    if (!confirm(`Sortear vencedor para "${g.titulo}"? Esta ação é irreversível.`)) return;
    const { data } = await supabase.from('giveaway_entries').select('user_id').eq('giveaway_id', g.id);
    if (!data || data.length === 0) { showToast('Sem entradas para sortear', 'error'); return; }
    const winner = data[Math.floor(Math.random() * data.length)];
    const { error } = await supabase.from('giveaways').update({ vencedor_id: winner.user_id, ativo: false }).eq('id', g.id);
    if (error) { showToast('Erro no sorteio', 'error'); return; }
    const { data: membroData } = await supabase.from('membros').select('username').eq('id', winner.user_id).maybeSingle();
    setWinnerInfo({ userId: winner.user_id, username: membroData?.username ?? 'Utilizador', titulo: g.titulo });
    load();
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <button className="admin-btn-primary" onClick={openNew}><Plus size={14} /> Novo Giveaway</button>
      </div>
      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Título</th><th>Prémio</th><th>Custo</th><th>VIP</th><th>Entradas</th><th>Fim</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
              {giveaways.map(g => (
                <tr key={g.id}>
                  <td><strong>{g.titulo}</strong></td>
                  <td>{g.premio_descricao}</td>
                  <td>{g.custo_epcoins} EPC</td>
                  <td>{g.is_vip_only ? '👑' : '—'}</td>
                  <td>{entries[g.id] ?? 0}</td>
                  <td>{g.data_fim ? new Date(g.data_fim).toLocaleDateString('pt-PT') : '—'}</td>
                  <td><span className={`admin-status-dot ${g.ativo ? 'active' : 'inactive'}`} /></td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" title="Gerir participantes" onClick={() => setManagingEntries(g)}><Users size={14} /></button>
                    <button className="admin-btn-icon" title="Escolher vencedor" onClick={() => setSelectingWinner(g)}><Trophy size={14} /></button>
                    <button className="admin-btn-icon" title="Sortear vencedor aleatório" onClick={() => drawWinner(g)}>🎲</button>
                    <button className="admin-btn-icon" onClick={() => openEdit(g)}><Pencil size={14} /></button>
                    <button className="admin-btn-icon danger" onClick={() => del(g.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {giveaways.length === 0 && (
                <tr><td colSpan={8} className="admin-empty-row">Nenhum giveaway encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {managingEntries && (
        <EntriesModal
          giveaway={managingEntries}
          onClose={() => { setManagingEntries(null); load(); }}
          showToast={showToast}
        />
      )}
      {selectingWinner && (
        <SelectWinnerModal
          giveaway={selectingWinner}
          onClose={() => setSelectingWinner(null)}
          showToast={showToast}
          onWinnerSet={(userId, username) => {
            setWinnerInfo({ userId, username, titulo: selectingWinner!.titulo });
            setSelectingWinner(null);
            load();
          }}
        />
      )}
      {winnerInfo && (
        <Modal title="🎲 Vencedor Sorteado!" onClose={() => setWinnerInfo(null)}>
          <div className="admin-winner-modal">
            <div className="admin-winner-avatar">
              <span>{(winnerInfo.username?.[0] ?? '?').toUpperCase()}</span>
              <img
                src={supabase.storage.from('profile_images').getPublicUrl(winnerInfo.userId).data.publicUrl}
                alt={winnerInfo.username}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="admin-winner-name">@{winnerInfo.username}</div>
            <div className="admin-winner-prize">🎁 {winnerInfo.titulo}</div>
          </div>
          <div className="admin-modal__actions">
            <button className="admin-btn-primary" onClick={() => setWinnerInfo(null)}>Fechar</button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title={isNew ? 'Novo Giveaway' : 'Editar Giveaway'} onClose={closeModal}>
          <Field label="Título">
            <input className="admin-input" value={editing.titulo ?? ''} onChange={e => setEditing(p => ({ ...p!, titulo: e.target.value }))} />
          </Field>
          <Field label="Descrição">
            <textarea className="admin-input" rows={2} value={editing.descricao ?? ''} onChange={e => setEditing(p => ({ ...p!, descricao: e.target.value || null }))} />
          </Field>
          <Field label="Prémio (descrição do que é sorteado)">
            <input className="admin-input" value={editing.premio_descricao ?? ''} onChange={e => setEditing(p => ({ ...p!, premio_descricao: e.target.value }))} />
          </Field>
          <Field label="Custo em EPCoins">
            <NumericInput className="admin-input" value={editing.custo_epcoins ?? 100} onChange={n => setEditing(p => ({ ...p!, custo_epcoins: n }))} />
          </Field>
          <Field label="Data de fim (opcional)">
            <div style={{ display: 'flex', gap: 8 }}>
              <DateInput
                value={isoToLocalDate(editing.data_fim ?? null)}
                onChange={v => {
                  const t = isoToLocalTime(editing.data_fim ?? null) || '00:00';
                  setEditing(p => ({ ...p!, data_fim: v ? new Date(`${v}T${t}`).toISOString() : null }));
                }}
              />
              <input
                className="admin-input"
                type="time"
                style={{ maxWidth: 110, flexShrink: 0 }}
                value={isoToLocalTime(editing.data_fim ?? null)}
                disabled={!editing.data_fim}
                onChange={e => {
                  const d = isoToLocalDate(editing.data_fim ?? null);
                  if (d) setEditing(p => ({ ...p!, data_fim: new Date(`${d}T${e.target.value}`).toISOString() }));
                }}
              />
            </div>
          </Field>
          <Field label="URL da Imagem">
            <input className="admin-input" value={editing.imagem_url ?? ''} onChange={e => setEditing(p => ({ ...p!, imagem_url: e.target.value || null }))} />
          </Field>
          <div className="admin-toggle-row">
            <span>Exclusivo VIP</span>
            <button className={`admin-toggle ${editing.is_vip_only ? 'on' : 'off'}`} onClick={() => setEditing(p => ({ ...p!, is_vip_only: !p!.is_vip_only }))}>
              {editing.is_vip_only ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              {editing.is_vip_only ? 'Sim' : 'Não'}
            </button>
          </div>
          <div className="admin-toggle-row">
            <span>Ativo</span>
            <button className={`admin-toggle ${editing.ativo ? 'on' : 'off'}`} onClick={() => setEditing(p => ({ ...p!, ativo: !p!.ativo }))}>
              {editing.ativo ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              {editing.ativo ? 'Sim' : 'Não'}
            </button>
          </div>
          <div className="admin-modal__actions">
            <button className="admin-btn-secondary" onClick={closeModal}>Cancelar</button>
            <button className="admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionPremios({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  return <SectionGiveaways showToast={showToast} />;
}

// ─── SECTION: PLANOS ─────────────────────────────────────────────

interface PlanoEdit extends Omit<Plano, 'funcionalidades'> {
  funcionalidades_text: string;
}

const EMPTY_PLANO: PlanoEdit = {
  id: '', nome: '', preco: '', periodo: '', destaque: false,
  badge: null, poupanca: null, funcionalidades_text: '', ordem: 0,
};

function SectionPlanos({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlanoEdit | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('planos').select('*').order('ordem');
    setPlanos((data ?? []) as Plano[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toEdit = (p: Plano): PlanoEdit => ({ ...p, funcionalidades_text: (p.funcionalidades ?? []).join('\n') });
  const openNew = () => { setEditing({ ...EMPTY_PLANO }); setIsNew(true); };
  const openEdit = (p: Plano) => { setEditing(toEdit(p)); setIsNew(false); };
  const closeModal = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { funcionalidades_text, ...rest } = editing;
    const payload = { ...rest, funcionalidades: funcionalidades_text.split('\n').map(s => s.trim()).filter(Boolean) };
    let error;
    if (isNew) {
      const { id, ...withoutId } = payload;
      ({ error } = await supabase.from('planos').insert(id ? payload : withoutId));
    } else {
      const { id, ...fields } = payload;
      ({ error } = await supabase.from('planos').update(fields).eq('id', id));
    }
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Plano criado' : 'Plano atualizado');
    closeModal();
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Eliminar este plano?')) return;
    const { error } = await supabase.from('planos').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Plano eliminado'); load(); }
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <button className="admin-btn-primary" onClick={openNew}><Plus size={14} /> Novo Plano</button>
      </div>
      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Nome</th><th>Preço</th><th>Período</th><th>Destaque</th><th>Ordem</th><th></th></tr>
            </thead>
            <tbody>
              {planos.map(p => (
                <tr key={p.id}>
                  <td><code>{p.id}</code></td>
                  <td><strong>{p.nome}</strong></td>
                  <td>{p.preco}</td>
                  <td>{p.periodo}</td>
                  <td>{p.destaque ? '⭐' : '—'}</td>
                  <td>{p.ordem}</td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                    <button className="admin-btn-icon danger" onClick={() => del(p.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {planos.length === 0 && (
                <tr><td colSpan={7} className="admin-empty-row">Nenhum plano encontrado. Cria o primeiro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={isNew ? 'Novo Plano' : 'Editar Plano'} onClose={closeModal}>
          <Field label="ID (único, ex: monthly)">
            <input className="admin-input" value={editing.id} disabled={!isNew} onChange={e => setEditing(p => ({ ...p!, id: e.target.value }))} />
          </Field>
          <Field label="Nome">
            <input className="admin-input" value={editing.nome} onChange={e => setEditing(p => ({ ...p!, nome: e.target.value }))} />
          </Field>
          <Field label="Preço (ex: 19,99€)">
            <input className="admin-input" value={editing.preco} onChange={e => setEditing(p => ({ ...p!, preco: e.target.value }))} />
          </Field>
          <Field label="Período (ex: /mês)">
            <input className="admin-input" value={editing.periodo} onChange={e => setEditing(p => ({ ...p!, periodo: e.target.value }))} />
          </Field>
          <Field label="Badge (ex: 🔥 Melhor Preço)">
            <input className="admin-input" value={editing.badge ?? ''} onChange={e => setEditing(p => ({ ...p!, badge: e.target.value || null }))} />
          </Field>
          <Field label="Poupança (ex: Poupa 10€)">
            <input className="admin-input" value={editing.poupanca ?? ''} onChange={e => setEditing(p => ({ ...p!, poupanca: e.target.value || null }))} />
          </Field>
          <Field label="Funcionalidades (uma por linha)">
            <textarea className="admin-input" rows={5} value={editing.funcionalidades_text}
              onChange={e => setEditing(p => ({ ...p!, funcionalidades_text: e.target.value }))} />
          </Field>
          <Field label="Ordem">
            <NumericInput className="admin-input" value={editing.ordem} onChange={n => setEditing(p => ({ ...p!, ordem: n }))} />
          </Field>
          <div className="admin-toggle-row">
            <span>Destaque</span>
            <button className={`admin-toggle ${editing.destaque ? 'on' : 'off'}`} onClick={() => setEditing(p => ({ ...p!, destaque: !p!.destaque }))}>
              {editing.destaque ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
              {editing.destaque ? 'Sim' : 'Não'}
            </button>
          </div>
          <div className="admin-modal__actions">
            <button className="admin-btn-secondary" onClick={closeModal}>Cancelar</button>
            <button className="admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SECTION: PALPITES DO DIA ───────────────────────────────────────

const EMPTY_PALPITE: Omit<PalpiteDia, 'id'> = {
  data: '', team: '', league: '', odd: '', time: '', color: '#888888', ordem: 0,
};

function SectionPalpites({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [filterDate, setFilterDate] = useState(today);
  const [palpites, setPalpites] = useState<PalpiteDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<PalpiteDia> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    const { data } = await supabase.from('home_palpites_dia').select('*').eq('data', date).order('ordem');
    setPalpites((data ?? []) as PalpiteDia[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(filterDate); }, [filterDate, load]);

  const openNew = () => { setEditing({ ...EMPTY_PALPITE, data: filterDate }); setIsNew(true); };
  const openEdit = (p: PalpiteDia) => { setEditing({ ...p }); setIsNew(false); };
  const closeModal = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    let error;
    if (isNew) {
      const { id: _id, ...rest } = editing as PalpiteDia;
      ({ error } = await supabase.from('home_palpites_dia').insert(rest));
    } else {
      const { id, ...rest } = editing as PalpiteDia;
      ({ error } = await supabase.from('home_palpites_dia').update(rest).eq('id', id));
    }
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Palpite criado' : 'Palpite atualizado');
    closeModal();
    load(filterDate);
  };

  const del = async (id: string) => {
    if (!confirm('Eliminar este palpite?')) return;
    const { error } = await supabase.from('home_palpites_dia').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Palpite eliminado'); load(filterDate); }
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <div className="admin-search" style={{ flex: 'none', width: 200 }}>
          <Calendar size={14} />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ cursor: 'pointer' }} />
        </div>
        <button className="admin-btn-primary" onClick={openNew}><Plus size={14} /> Novo Palpite</button>
      </div>
      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Equipa</th><th>Liga</th><th>ODD</th><th>Hora</th><th>Ordem</th><th></th></tr>
            </thead>
            <tbody>
              {palpites.map(p => (
                <tr key={p.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    {p.team}
                  </td>
                  <td>{p.league}</td>
                  <td>{p.odd}</td>
                  <td>{p.time}</td>
                  <td>{p.ordem}</td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                    <button className="admin-btn-icon danger" onClick={() => del(p.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {palpites.length === 0 && (
                <tr><td colSpan={6} className="admin-empty-row">Nenhum palpite para esta data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={isNew ? 'Novo Palpite' : 'Editar Palpite'} onClose={closeModal}>
          <Field label="Data">
            <DateInput value={editing.data ?? filterDate}
              onChange={v => setEditing(p => ({ ...p!, data: v }))} />
          </Field>
          <Field label="Equipa">
            <input className="admin-input" value={editing.team ?? ''} onChange={e => setEditing(p => ({ ...p!, team: e.target.value }))} />
          </Field>
          <Field label="Liga">
            <input className="admin-input" value={editing.league ?? ''} onChange={e => setEditing(p => ({ ...p!, league: e.target.value }))} />
          </Field>
          <Field label="ODD">
            <input className="admin-input" value={editing.odd ?? ''} onChange={e => setEditing(p => ({ ...p!, odd: e.target.value }))} />
          </Field>
          <Field label="Hora (ex: 20:45)">
            <input className="admin-input" value={editing.time ?? ''} onChange={e => setEditing(p => ({ ...p!, time: e.target.value }))} />
          </Field>
          <Field label="Cor (hex)">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="color" value={editing.color ?? '#888888'} onChange={e => setEditing(p => ({ ...p!, color: e.target.value }))}
                style={{ width: 40, height: 36, padding: 2, border: '1px solid #333', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
              <input className="admin-input" value={editing.color ?? '#888888'} onChange={e => setEditing(p => ({ ...p!, color: e.target.value }))} />
            </div>
          </Field>
          <Field label="Ordem">
            <NumericInput className="admin-input" value={editing.ordem ?? 0} onChange={n => setEditing(p => ({ ...p!, ordem: n }))} />
          </Field>
          <div className="admin-modal__actions">
            <button className="admin-btn-secondary" onClick={closeModal}>Cancelar</button>
            <button className="admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SECTION: BILHETE DO DIA ─────────────────────────────────────

function SectionBilhete({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<BilheteDia>({ data: today, acertos: 0, possiveis: 0, odd: 0, ganhos: 0 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const { data } = await supabase.from('home_bilhete_dia').select('*').eq('data', d).maybeSingle();
    setForm(data ? (data as BilheteDia) : { data: d, acertos: 0, possiveis: 0, odd: 0, ganhos: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('home_bilhete_dia').upsert({ ...form, data: date }, { onConflict: 'data' });
    setSaving(false);
    if (error) showToast('Erro: ' + error.message, 'error');
    else showToast('Bilhete do dia guardado');
  };

  return (
    <div className="admin-section-content admin-form-section">
      <Field label="Data">
        <DateInput value={date} onChange={setDate} />
      </Field>
      {loading ? <div className="admin-loading"><Loader2 size={18} className="spin" /></div> : (
        <>
          <Field label="Acertos">
            <NumericInput className="admin-input" value={form.acertos} onChange={n => setForm(f => ({ ...f, acertos: n }))} />
          </Field>
          <Field label="Possíveis">
            <NumericInput className="admin-input" value={form.possiveis} onChange={n => setForm(f => ({ ...f, possiveis: n }))} />
          </Field>
          <Field label="ODD">
            <NumericInput className="admin-input" step={0.01} value={form.odd} onChange={n => setForm(f => ({ ...f, odd: n }))} />
          </Field>
          <Field label="Ganhos (€)">
            <NumericInput className="admin-input" step={0.01} value={form.ganhos} onChange={n => setForm(f => ({ ...f, ganhos: n }))} />
          </Field>
          <button className="admin-btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Guardar
          </button>
        </>
      )}
    </div>
  );
}

// ─── SECTION: LUCRO DO MÊS ───────────────────────────────────────

function SectionLucro({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const thisMonthPrefix = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonthPrefix);
  const [lucro, setLucro] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const mesParam = `${month}-01`;

  const load = useCallback(async (mes: string) => {
    setLoading(true);
    const { data } = await supabase.from('home_lucro_mes').select('lucro').eq('mes', mes).maybeSingle();
    setLucro(data?.lucro ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(mesParam); }, [mesParam, load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('home_lucro_mes').upsert({ mes: mesParam, lucro }, { onConflict: 'mes' });
    setSaving(false);
    if (error) showToast('Erro: ' + error.message, 'error');
    else showToast('Lucro do mês guardado');
  };

  return (
    <div className="admin-section-content admin-form-section">
      <Field label="Mês">
        <input className="admin-input" type="month" value={month} onChange={e => setMonth(e.target.value)} />
      </Field>
      {loading ? <div className="admin-loading"><Loader2 size={18} className="spin" /></div> : (
        <>
          <Field label="Lucro (€)">
            <NumericInput className="admin-input" step={0.01} value={lucro} onChange={n => setLucro(n)} />
          </Field>
          <button className="admin-btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Guardar
          </button>
        </>
      )}
    </div>
  );
}

// ─── SECTION: LUCRO DA SEMANA ───────────────────────────────────────

function SectionLucroSemana({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [semana, setSemana] = useState(new Date().toISOString().split('T')[0]);
  const [lucro, setLucro] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    const { data } = await supabase.from('home_lucro_semana').select('lucro').eq('semana', s).maybeSingle();
    setLucro(data?.lucro != null ? String(data.lucro) : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(semana); }, [semana, load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('home_lucro_semana').upsert({ semana, lucro: parseFloat(lucro) || 0 }, { onConflict: 'semana' });
    setSaving(false);
    if (error) showToast('Erro: ' + error.message, 'error');
    else showToast('Lucro da semana guardado');
  };

  return (
    <div className="admin-section-content admin-form-section">
      <Field label="Semana (Segunda-feira)">
        <DateInput value={semana} onChange={setSemana} />
      </Field>
      {loading ? <div className="admin-loading"><Loader2 size={18} className="spin" /></div> : (
        <>
          <Field label="Lucro (€)">
            <input className="admin-input" type="number" step="0.01" value={lucro} onChange={e => setLucro(e.target.value)} />
          </Field>
          <button className="admin-btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Guardar
          </button>
        </>
      )}
    </div>
  );
}

// ─── SECTION: TOP APOSTA ─────────────────────────────────────────

function SectionTopAposta({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<TopAposta>({
    data: today, mercado: '', jogo: '', odd: 0, valor_apostado: 0, valor_ganho: 0, imagem_url: null,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const { data } = await supabase.from('home_top_aposta').select('*').eq('data', d).maybeSingle();
    setForm(data ? (data as TopAposta) : { data: d, mercado: '', jogo: '', odd: 0, valor_apostado: 0, valor_ganho: 0, imagem_url: null });
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('home_top_aposta').upsert({ ...form, data: date }, { onConflict: 'data' });
    setSaving(false);
    if (error) showToast('Erro: ' + error.message, 'error');
    else showToast('Top Aposta guardado');
  };

  return (
    <div className="admin-section-content admin-form-section">
      <Field label="Data">
        <DateInput value={date} onChange={setDate} />
      </Field>
      {loading ? <div className="admin-loading"><Loader2 size={18} className="spin" /></div> : (
        <>
          <Field label="Mercado">
            <input className="admin-input" value={form.mercado} onChange={e => setForm(f => ({ ...f, mercado: e.target.value }))} />
          </Field>
          <Field label="Jogo">
            <input className="admin-input" value={form.jogo} onChange={e => setForm(f => ({ ...f, jogo: e.target.value }))} />
          </Field>
          <Field label="ODD">
            <NumericInput className="admin-input" step={0.01} value={form.odd} onChange={n => setForm(f => ({ ...f, odd: n }))} />
          </Field>
          <Field label="Valor Apostado (€)">
            <NumericInput className="admin-input" step={0.01} value={form.valor_apostado} onChange={n => setForm(f => ({ ...f, valor_apostado: n }))} />
          </Field>
          <Field label="Valor Ganho (€)">
            <NumericInput className="admin-input" step={0.01} value={form.valor_ganho} onChange={n => setForm(f => ({ ...f, valor_ganho: n }))} />
          </Field>
          <Field label="URL da Imagem (opcional)">
            <input className="admin-input" value={form.imagem_url ?? ''} onChange={e => setForm(f => ({ ...f, imagem_url: e.target.value || null }))} />
          </Field>
          <button className="admin-btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Guardar
          </button>
        </>
      )}
    </div>
  );
}

// ─── SECTION: MUNDIAL BETS ───────────────────────────────────────

const EMPTY_BET: Omit<MundialBet, 'id' | 'created_at'> = {
  match_date: new Date().toISOString().split('T')[0],
  match_label: '', pick: '', odd: 0, result: 'pending',
};

function SectionMundialBets({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [filterDate, setFilterDate] = useState(today);
  const [bets, setBets] = useState<MundialBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<MundialBet> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    const { data } = await supabase.from('mundial_bets').select('*').eq('match_date', date).order('created_at');
    setBets((data ?? []) as MundialBet[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(filterDate); }, [filterDate, load]);

  const openNew = () => { setEditing({ ...EMPTY_BET, match_date: filterDate }); setIsNew(true); };
  const openEdit = (b: MundialBet) => { setEditing({ ...b }); setIsNew(false); };
  const closeModal = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    let error;
    if (isNew) {
      const { id: _id, created_at: _ca, ...rest } = editing as MundialBet;
      ({ error } = await supabase.from('mundial_bets').insert(rest));
    } else {
      const { id, created_at: _ca, ...rest } = editing as MundialBet;
      ({ error } = await supabase.from('mundial_bets').update(rest).eq('id', id));
    }
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Aposta criada' : 'Aposta atualizada');
    closeModal();
    load(filterDate);
  };

  const del = async (id: string) => {
    if (!confirm('Eliminar esta aposta?')) return;
    const { error } = await supabase.from('mundial_bets').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Aposta eliminada'); load(filterDate); }
  };

  const RESULT_LABELS: Record<string, string> = {
    pending: '⏳ Pendente', won: '✅ Ganha', lost: '❌ Perdida', void: '⚪ Nula',
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <div className="admin-search" style={{ flex: 'none', width: 200 }}>
          <Calendar size={14} />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ cursor: 'pointer' }} />
        </div>
        <button className="admin-btn-primary" onClick={openNew}><Plus size={14} /> Nova Aposta</button>
      </div>
      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Jogo</th><th>Pick</th><th>ODD</th><th>Resultado</th><th></th></tr>
            </thead>
            <tbody>
              {bets.map(b => (
                <tr key={b.id}>
                  <td>{b.match_label}</td>
                  <td>{b.pick}</td>
                  <td>{b.odd}</td>
                  <td><span className={`admin-result-chip result-${b.result}`}>{RESULT_LABELS[b.result]}</span></td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" onClick={() => openEdit(b)}><Pencil size={14} /></button>
                    <button className="admin-btn-icon danger" onClick={() => del(b.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {bets.length === 0 && (
                <tr><td colSpan={5} className="admin-empty-row">Nenhuma aposta para esta data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={isNew ? 'Nova Aposta' : 'Editar Aposta'} onClose={closeModal}>
          <Field label="Data do Jogo">
            <DateInput value={editing.match_date ?? filterDate}
              onChange={v => setEditing(b => ({ ...b!, match_date: v }))} />
          </Field>
          <Field label="Jogo (ex: Portugal vs Brasil)">
            <input className="admin-input" value={editing.match_label ?? ''} onChange={e => setEditing(b => ({ ...b!, match_label: e.target.value }))} />
          </Field>
          <Field label="Pick (aposta)">
            <input className="admin-input" value={editing.pick ?? ''} onChange={e => setEditing(b => ({ ...b!, pick: e.target.value }))} />
          </Field>
          <Field label="ODD">
            <NumericInput className="admin-input" step={0.01} value={editing.odd ?? 0} onChange={n => setEditing(b => ({ ...b!, odd: n }))} />
          </Field>
          <Field label="Resultado">
            <select className="admin-input" value={editing.result ?? 'pending'} onChange={e => setEditing(b => ({ ...b!, result: e.target.value as MundialBet['result'] }))}>
              <option value="pending">Pendente</option>
              <option value="won">Ganha</option>
              <option value="lost">Perdida</option>
              <option value="void">Nula</option>
            </select>
          </Field>
          <div className="admin-modal__actions">
            <button className="admin-btn-secondary" onClick={closeModal}>Cancelar</button>
            <button className="admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SECTION: SUPORTE ────────────────────────────────────────────

function AdminTicketPanel({
  ticket, adminId, onBack, onTicketUpdate, showToast
}: {
  ticket: SupportTicket;
  adminId: string;
  onBack: () => void;
  onTicketUpdate: (t: SupportTicket) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const namesRef = useRef<Record<string, string>>({});

  const fetchNames = useCallback(async (ids: string[]) => {
    const unknown = ids.filter(id => !namesRef.current[id]);
    if (!unknown.length) return;
    const { data } = await supabase.from('membros').select('id, username').in('id', unknown);
    if (data) {
      data.forEach((m: { id: string; username: string }) => { namesRef.current[m.id] = m.username; });
      setNames({ ...namesRef.current });
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at');
      const msgs = (data ?? []) as SupportMessage[];
      setMessages(msgs);
      await fetchNames(msgs.map(m => m.user_id));
      setLoading(false);
    })();
  }, [ticket.id, fetchNames]);

  useEffect(() => {
    const sub = supabase.channel(`admin_tkt_${ticket.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'ticket_messages',
        filter: `ticket_id=eq.${ticket.id}`,
      }, async (payload) => {
        const msg = payload.new as SupportMessage;
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        await fetchNames([msg.user_id]);
      })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [ticket.id, fetchNames]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Apenas imagens', 'error'); return; }
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

  const sendReply = async (autoEstado?: SupportTicket['estado']) => {
    if (!text.trim() && !pendingFile) return;
    setSending(true);
    let imagem_url: string | null = null;
    if (pendingFile) { imagem_url = await uploadImage(pendingFile); }
    const conteudo = text.trim() || (imagem_url ? '📎 Imagem anexada' : '');
    const { error } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id, user_id: adminId, conteudo, is_admin: true, imagem_url,
    });
    if (error) { showToast('Erro ao enviar: ' + error.message, 'error'); setSending(false); return; }
    setText('');
    clearImage();
    if (autoEstado && ticket.estado !== autoEstado) {
      await changeStatus(autoEstado, false);
    }
    setSending(false);
  };

  const changeStatus = async (newEstado: SupportTicket['estado'], notify = true) => {
    setChangingStatus(true);
    const { data, error } = await supabase
      .from('tickets').update({ estado: newEstado }).eq('id', ticket.id).select().single();
    setChangingStatus(false);
    if (error) { showToast('Erro ao atualizar estado', 'error'); return; }
    if (notify) showToast(`Ticket marcado como "${ESTADO_LABELS[newEstado]}"`);
    onTicketUpdate(data as SupportTicket);
  };

  const ownerName = names[ticket.user_id] ?? ticket.user_id.slice(0, 8) + '…';
  const isClosed = ticket.estado === 'fechado' || ticket.estado === 'resolvido';

  const ESTADO_COLORS: Record<string, string> = {
    aberto: '#60a5fa', em_analise: '#fbbf24', resolvido: '#4ade80', fechado: '#9ca3af',
  };
  const ESTADO_LABELS: Record<string, string> = {
    aberto: 'Aberto', em_analise: 'Em Análise', resolvido: 'Resolvido', fechado: 'Fechado',
  };
  const PRIO_COLORS: Record<string, string> = {
    baixa: '#9ca3af', normal: '#d4d4d4', alta: '#fbbf24', urgente: '#f87171',
  };

  return (
    <div className="tkt-panel">
      {/* Header */}
      <div className="tkt-panel__header">
        <button className="tkt-back-btn" onClick={onBack}>
          <ChevronLeft size={16} /> Voltar
        </button>
        <div className="tkt-panel__meta">
          <span className="tkt-panel__subject">{ticket.assunto}</span>
          <div className="tkt-panel__chips">
            <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLORS[ticket.estado], background: `${ESTADO_COLORS[ticket.estado]}1a`, border: `1px solid ${ESTADO_COLORS[ticket.estado]}33`, borderRadius: 4, padding: '2px 8px' }}>
              {ESTADO_LABELS[ticket.estado]}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: PRIO_COLORS[ticket.prioridade], background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '2px 8px' }}>
              {ticket.prioridade}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-gray)' }}>
              <strong style={{ color: 'var(--gold-primary)' }}>{ownerName}</strong>
            </span>
          </div>
        </div>
        {/* Quick actions */}
        <div className="tkt-panel__actions">
          {ticket.estado !== 'em_analise' && ticket.estado !== 'resolvido' && ticket.estado !== 'fechado' && (
            <button className="tkt-action-btn tkt-action-btn--progress" onClick={() => changeStatus('em_analise')} disabled={changingStatus}>
              {changingStatus ? <Loader2 size={12} className="spin" /> : <AlertCircle size={12} />} Em Análise
            </button>
          )}
          {ticket.estado !== 'resolvido' && ticket.estado !== 'fechado' && (
            <button className="tkt-action-btn tkt-action-btn--resolve" onClick={() => changeStatus('resolvido')} disabled={changingStatus}>
              {changingStatus ? <Loader2 size={12} className="spin" /> : <CheckCircle size={12} />} Resolvido
            </button>
          )}
          {ticket.estado !== 'fechado' && (
            <button className="tkt-action-btn tkt-action-btn--close" onClick={() => changeStatus('fechado')} disabled={changingStatus}>
              {changingStatus ? <Loader2 size={12} className="spin" /> : <X size={12} />} Fechar
            </button>
          )}
          {(ticket.estado === 'resolvido' || ticket.estado === 'fechado') && (
            <button className="tkt-action-btn tkt-action-btn--reopen" onClick={() => changeStatus('aberto')} disabled={changingStatus}>
              {changingStatus ? <Loader2 size={12} className="spin" /> : <CheckCircle size={12} />} Reabrir
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="tkt-panel__desc">
        <span className="tkt-panel__desc-label">Descrição inicial</span>
        <p>{ticket.descricao}</p>
      </div>

      {/* Messages */}
      <div className="tkt-panel__messages">
        {loading ? (
          <div className="tkt-msg-loading"><Loader2 size={20} className="spin" /> A carregar mensagens…</div>
        ) : (
          <>
            {messages.map(msg => {
              const n = names[msg.user_id] ?? '…';
              return (
                <div key={msg.id} className={`tkt-msg ${msg.is_admin ? 'tkt-msg--admin' : 'tkt-msg--user'}`}>
                  <div className="tkt-msg__avatar">
                    {msg.is_admin ? <ShieldAlert size={12} /> : n[0]?.toUpperCase()}
                  </div>
                  <div className="tkt-msg__bubble">
                    <div className="tkt-msg__name">
                      {msg.is_admin ? 'Suporte El Pedrito' : n}
                      <span className="tkt-msg__time">
                        {new Date(msg.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {new Date(msg.created_at).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                    {msg.conteudo && <p className="tkt-msg__text">{msg.conteudo}</p>}
                    {msg.imagem_url && (
                      <a href={msg.imagem_url} target="_blank" rel="noreferrer">
                        <img src={msg.imagem_url} alt="Anexo" className="tkt-msg__img" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <div className="tkt-msg-empty">Nenhuma mensagem ainda. Responde abaixo para iniciar.</div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply box */}
      {isClosed ? (
        <div className="tkt-panel__closed-notice">
          Ticket {ESTADO_LABELS[ticket.estado].toLowerCase()} · Reabre para continuar a responder.
        </div>
      ) : (
        <div className="tkt-panel__reply">
          {pendingPreview && (
            <div className="tkt-preview">
              <img src={pendingPreview} alt="Preview" />
              <button onClick={clearImage}><X size={10} /></button>
            </div>
          )}
          <div className="tkt-reply-row">
            <textarea
              className="tkt-reply-input"
              rows={3}
              placeholder="Responder como suporte… (Enter envia, Shift+Enter nova linha)"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              disabled={sending}
            />
            <div className="tkt-reply-btns">
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileSelect} />
              <button className="tkt-btn-attach" onClick={() => fileInputRef.current?.click()} title="Anexar imagem">
                <Paperclip size={14} />
              </button>
              <button className="tkt-btn-send tkt-btn-resolve" onClick={() => sendReply('resolvido')} disabled={sending || (!text.trim() && !pendingFile)} title="Responder e marcar como Resolvido">
                {sending ? <Loader2 size={13} className="spin" /> : <CheckCircle size={13} />}
                <span>Responder &amp; Resolver</span>
              </button>
              <button className="tkt-btn-send" onClick={() => sendReply()} disabled={sending || (!text.trim() && !pendingFile)} title="Enviar resposta">
                {sending ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                <span>Enviar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionSuporte({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<'todos' | SupportTicket['estado']>('todos');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const namesRef = useRef<Record<string, string>>({});

  const fetchNames = useCallback(async (ids: string[]) => {
    const unknown = ids.filter(id => !namesRef.current[id]);
    if (!unknown.length) return;
    const { data } = await supabase.from('membros').select('id, username').in('id', unknown);
    if (data) {
      data.forEach((m: { id: string; username: string }) => { namesRef.current[m.id] = m.username; });
      setNames({ ...namesRef.current });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets').select('*').order('updated_at', { ascending: false });
    if (error) showToast('Erro ao carregar tickets: ' + error.message, 'error');
    const ts = (data ?? []) as SupportTicket[];
    setTickets(ts);
    await fetchNames(ts.map(t => t.user_id));
    setLoading(false);
  }, [showToast, fetchNames]);

  useEffect(() => { load(); }, [load]);

  const ESTADO_COLORS: Record<string, string> = {
    aberto: '#60a5fa', em_analise: '#fbbf24', resolvido: '#4ade80', fechado: '#9ca3af',
  };
  const ESTADO_LABELS: Record<string, string> = {
    aberto: 'Aberto', em_analise: 'Em Análise', resolvido: 'Resolvido', fechado: 'Fechado',
  };
  const PRIO_COLORS: Record<string, string> = {
    baixa: '#9ca3af', normal: '#d4d4d4', alta: '#fbbf24', urgente: '#f87171',
  };

  const counts = {
    todos: tickets.length,
    aberto: tickets.filter(t => t.estado === 'aberto').length,
    em_analise: tickets.filter(t => t.estado === 'em_analise').length,
    resolvido: tickets.filter(t => t.estado === 'resolvido').length,
    fechado: tickets.filter(t => t.estado === 'fechado').length,
  };

  const filtered = tickets.filter(t => {
    const matchEstado = filterEstado === 'todos' || t.estado === filterEstado;
    const q = search.toLowerCase();
    const matchSearch = !q || t.assunto.toLowerCase().includes(q) || (names[t.user_id] ?? '').toLowerCase().includes(q);
    return matchEstado && matchSearch;
  });

  if (selectedTicket && user) {
    return (
      <div className="admin-section-content" style={{ padding: 0 }}>
        <AdminTicketPanel
          ticket={selectedTicket}
          adminId={user.id}
          onBack={() => setSelectedTicket(null)}
          onTicketUpdate={(updated) => {
            setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
            setSelectedTicket(updated);
          }}
          showToast={showToast}
        />
      </div>
    );
  }

  return (
    <div className="admin-section-content">
      {/* Toolbar */}
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="admin-search">
          <Search size={14} />
          <input placeholder="Pesquisar por assunto ou utilizador…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="admin-btn-secondary" onClick={load}><CheckCircle size={13} /> Atualizar</button>
      </div>

      {/* Estado filter tabs */}
      <div className="tkt-filter-tabs">
        {(['todos', 'aberto', 'em_analise', 'resolvido', 'fechado'] as const).map(k => (
          <button
            key={k}
            className={`tkt-filter-tab ${filterEstado === k ? 'tkt-filter-tab--active' : ''}`}
            onClick={() => setFilterEstado(k)}
          >
            {k === 'todos' ? 'Todos' : ESTADO_LABELS[k]}
            <span className="tkt-filter-count">{counts[k]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar tickets…</div>
      ) : (
        <div className="tkt-list">
          {filtered.map(t => (
            <button key={t.id} className="tkt-row" onClick={() => setSelectedTicket(t)}>
              <div className="tkt-row__left">
                <div className="tkt-row__user">{names[t.user_id] ?? t.user_id.slice(0, 8) + '…'}</div>
                <div className="tkt-row__subject">{t.assunto}</div>
                <div className="tkt-row__date">{new Date(t.updated_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="tkt-row__right">
                <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLORS[t.estado], background: `${ESTADO_COLORS[t.estado]}1a`, border: `1px solid ${ESTADO_COLORS[t.estado]}33`, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                  {ESTADO_LABELS[t.estado]}
                </span>
                <span style={{ fontSize: 11, color: PRIO_COLORS[t.prioridade], fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {t.prioridade}
                </span>
                <ChevronRight size={14} style={{ color: 'var(--text-gray)', flexShrink: 0 }} />
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="tkt-empty">Nenhum ticket encontrado.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ROOT EXPORT ────────────────────────────────────────────────

export default function Admin() {
  const navigate = useNavigate();
  const { user, membro, loading } = useAuth();
  const [section, setSection] = useState<Section>('membros');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  if (loading) return null;

  if (!user || !membro?.badges?.includes('Administrador')) {
    return (
      <div className="admin-403">
        <ShieldAlert size={60} style={{ color: '#ef4444' }} />
        <h1>Acesso Negado</h1>
        <p>Não tens permissão para aceder a esta página.</p>
        <button className="admin-btn-primary" onClick={() => navigate('/')}>Voltar ao Início</button>
      </div>
    );
  }

  const active = NAV_ITEMS.find(n => n.key === section);

  return (
    <div className="admin-page">
      <Navbar />
      {toast && <AdminToast msg={toast.msg} type={toast.type} />}
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar__header">
            <ShieldAlert size={17} style={{ color: 'var(--gold-primary)' }} />
            Painel Admin
          </div>
          <nav className="admin-sidebar__nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                className={`admin-nav-btn${section === item.key ? ' active' : ''}`}
                onClick={() => setSection(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
                {section === item.key && <ChevronRight size={13} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </nav>
        </aside>

        <main className="admin-main">
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              {active?.icon}
              {active?.label}
            </h2>
          </div>
          {section === 'membros'      && <SectionMembros showToast={showToast} />}
          {section === 'live'         && <SectionLive showToast={showToast} />}
          {section === 'premios'      && <SectionPremios showToast={showToast} />}
          {section === 'planos'       && <SectionPlanos showToast={showToast} />}
          {section === 'palpites'     && <SectionPalpites showToast={showToast} />}
          {section === 'bilhete'      && <SectionBilhete showToast={showToast} />}
          {section === 'lucro'        && <SectionLucro showToast={showToast} />}
          {section === 'lucro-semana' && <SectionLucroSemana showToast={showToast} />}
          {section === 'top-aposta'   && <SectionTopAposta showToast={showToast} />}
          {section === 'mundial-bets' && <SectionMundialBets showToast={showToast} />}
          {section === 'suporte'       && <SectionSuporte showToast={showToast} />}
        </main>
      </div>
    </div>
  );
}
