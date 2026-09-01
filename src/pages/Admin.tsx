import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionGamificacao } from '../components/AdminGamificacao';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Radio, Gift, CreditCard, Calendar, TrendingUp, Star,
  Plus, Pencil, Trash2, Save, X, Search, ShieldAlert, ShieldOff, Trophy,
  CheckCircle, AlertCircle, ChevronRight, Loader2, ToggleLeft, ToggleRight,
  MessageSquare, Send, Paperclip, ChevronLeft, Activity, ShieldCheck,
  CalendarClock, PlayCircle,
} from 'lucide-react';
import {
  VERTICAL_LABELS, RESULTADO_LABELS, calcularStats, fmtUnidades, fmtPercent, fmtRoi,
  type RaioxTip, type Vertical, type Resultado, type Canal,
} from '../lib/raiox';
import {
  fmtSubscritores, fmtEngagement, fmtHandle,
  type CanalTelegram, type TipoCanal, type AcessoCanal,
} from '../lib/canais';
import {
  carregarRanking, carregarConfig, carregarVencedores, CONFIG_PADRAO,
  nomeMes, nomeMesISO,
  // Alias: o Raio-X já exporta fmtRoi e fmtUnidades com outra unidade de base.
  fmtRoi as fmtRankingRoi, fmtUnidades as fmtRankingUnidades,
  type LinhaRanking, type RankingConfig, type Vencedor,
} from '../lib/ranking';
import {
  carregarVideos, carregarReunioes, ESTADO_REUNIAO_LABELS,
  type VipVideo, type Reuniao, type EstadoReuniao,
} from '../lib/funilVip';
import {
  carregarSalasConfig, SALAS_CONFIG_PADRAO, type SalasConfig,
} from '../lib/salasJogo';
import '../styles/Admin.css';

// ─── TYPES ──────────────────────────────────────────────────────

type Section = 'membros' | 'raiox' | 'canais' | 'ranking' | 'funil-vip' | 'salas' | 'planos' | 'palpites' | 'bilhete' | 'lucro' | 'lucro-semana' | 'top-aposta' | 'gamificacao' | 'suporte';

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



// ─── NAV ────────────────────────────────────────────────────────

const NAV_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: 'membros',       label: 'Membros',        icon: <Users size={15} /> },
  { key: 'raiox',         label: 'Raio-X',         icon: <Activity size={15} /> },
  { key: 'canais',        label: 'Canais',         icon: <ShieldCheck size={15} /> },
  { key: 'ranking',       label: 'Ranking',        icon: <Trophy size={15} /> },
  { key: 'funil-vip',     label: 'Funil VIP',      icon: <PlayCircle size={15} /> },
  { key: 'salas',         label: 'Salas de Jogo',  icon: <Radio size={15} /> },
  { key: 'planos',        label: 'Planos',         icon: <CreditCard size={15} /> },
  { key: 'palpites',      label: 'Palpites do Dia', icon: <TrendingUp size={15} /> },
  { key: 'bilhete',       label: 'Bilhete do Dia', icon: <Calendar size={15} /> },
  { key: 'lucro',         label: 'Lucro do Mês',   icon: <TrendingUp size={15} /> },
  { key: 'lucro-semana',  label: 'Lucro da Semana', icon: <TrendingUp size={15} /> },
  { key: 'top-aposta',    label: 'Top Aposta',     icon: <Star size={15} /> },
  { key: 'gamificacao',   label: 'Gamificação',    icon: <Gift size={15} /> },
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
  data: '', team: '', league: '', odd: '', time: '', color: '#6b7891', ordem: 0,
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
              <input type="color" value={editing.color ?? '#6b7891'} onChange={e => setEditing(p => ({ ...p!, color: e.target.value }))}
                style={{ width: 40, height: 36, padding: 2, border: '1px solid #9aa7bd', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
              <input className="admin-input" value={editing.color ?? '#6b7891'} onChange={e => setEditing(p => ({ ...p!, color: e.target.value }))} />
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

// ─── SECTION: RAIO-X ─────────────────────────────────────────────
// O historial auditado que alimenta a Home, o Raio-X, o Passaporte e a Banca.
// Registar antes do jogo e só depois marcar o resultado é o que dá valor a
// isto — editar uma odd à posteriori destrói a prova social toda.

const VERTICAIS: Vertical[] = ['futebol', 'tenis', 'escadinha', 'footmillion'];
const RESULTADOS: Resultado[] = ['pendente', 'green', 'red', 'void'];

type TipDraft = Omit<RaioxTip, 'id' | 'resolvido_em'> & { id?: string };

const novaTip = (): TipDraft => ({
  vertical: 'futebol',
  canal: 'publico',
  publicado_em: new Date().toISOString().slice(0, 16),
  evento: '',
  competicao: '',
  pick: '',
  odd: 1.5,
  stake: 1,
  resultado: 'pendente',
});

function SectionRaioX({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [tips, setTips] = useState<RaioxTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroVertical, setFiltroVertical] = useState<'todas' | Vertical>('todas');
  const [editing, setEditing] = useState<TipDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('raiox_tips')
      .select('*')
      .order('publicado_em', { ascending: false })
      .limit(300);
    if (error) showToast('Erro ao carregar tips: ' + error.message, 'error');
    setTips((data ?? []) as RaioxTip[]);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const visiveis = filtroVertical === 'todas'
    ? tips
    : tips.filter(t => t.vertical === filtroVertical);

  const stats = calcularStats(visiveis);

  const openNew = () => { setEditing(novaTip()); setIsNew(true); };

  const openEdit = (t: RaioxTip) => {
    setEditing({ ...t, publicado_em: t.publicado_em.slice(0, 16) });
    setIsNew(false);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.evento.trim() || !editing.pick.trim()) {
      showToast('Evento e pick são obrigatórios', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      vertical: editing.vertical,
      canal: editing.canal,
      publicado_em: new Date(editing.publicado_em).toISOString(),
      evento: editing.evento.trim(),
      competicao: editing.competicao?.trim() || null,
      pick: editing.pick.trim(),
      odd: Number(editing.odd),
      stake: Number(editing.stake),
      resultado: editing.resultado,
    };
    const { error } = isNew
      ? await supabase.from('raiox_tips').insert(payload)
      : await supabase.from('raiox_tips').update(payload).eq('id', editing.id!);
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Tip registada' : 'Tip atualizada');
    setEditing(null);
    load();
  };

  /** Atalho para o caso mais frequente: marcar o resultado de uma pendente. */
  const marcarResultado = async (t: RaioxTip, resultado: Resultado) => {
    const { error } = await supabase.from('raiox_tips').update({ resultado }).eq('id', t.id);
    if (error) showToast('Erro: ' + error.message, 'error');
    else { showToast(`Marcada como ${RESULTADO_LABELS[resultado]}`); load(); }
  };

  const del = async (id: string) => {
    if (!confirm('Eliminar esta tip do historial auditado?')) return;
    const { error } = await supabase.from('raiox_tips').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Tip eliminada'); load(); }
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <select
          className="admin-input"
          style={{ flex: 'none', width: 190 }}
          value={filtroVertical}
          onChange={e => setFiltroVertical(e.target.value as 'todas' | Vertical)}
        >
          <option value="todas">Todas as verticais</option>
          {VERTICAIS.map(v => <option key={v} value={v}>{VERTICAL_LABELS[v]}</option>)}
        </select>
        <button className="admin-btn-primary" onClick={openNew}><Plus size={14} /> Nova Tip</button>
      </div>

      {stats.resolvidas > 0 && (
        <div className="admin-raiox-stats">
          <span>{stats.resolvidas} resolvidas</span>
          <span>{stats.pendentes} pendentes</span>
          <span>Acerto: <strong>{fmtPercent(stats.taxaAcerto)}</strong></span>
          <span>Lucro: <strong>{fmtUnidades(stats.lucroUnidades)}</strong></span>
          <span>ROI: <strong>{fmtRoi(stats.roi)}</strong></span>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Publicado</th><th>Vertical</th><th>Evento</th><th>Pick</th>
                <th>ODD</th><th>Stake</th><th>Resultado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(t => (
                <tr key={t.id}>
                  <td>{new Date(t.publicado_em).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{VERTICAL_LABELS[t.vertical] ?? t.vertical}</td>
                  <td>{t.evento}</td>
                  <td>{t.pick}</td>
                  <td>{Number(t.odd).toFixed(2)}</td>
                  <td>{Number(t.stake).toFixed(2)}u</td>
                  <td>
                    {t.resultado === 'pendente' ? (
                      <div className="admin-raiox-quick">
                        <button className="admin-btn-icon" title="Green" onClick={() => marcarResultado(t, 'green')}>✅</button>
                        <button className="admin-btn-icon" title="Red" onClick={() => marcarResultado(t, 'red')}>❌</button>
                        <button className="admin-btn-icon" title="Anulada" onClick={() => marcarResultado(t, 'void')}>⚪</button>
                      </div>
                    ) : (
                      <span className={`admin-result-chip result-${t.resultado}`}>{RESULTADO_LABELS[t.resultado]}</span>
                    )}
                  </td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" onClick={() => openEdit(t)}><Pencil size={14} /></button>
                    <button className="admin-btn-icon danger" onClick={() => del(t.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr><td colSpan={8} className="admin-empty-row">Sem tips registadas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={isNew ? 'Nova Tip' : 'Editar Tip'} onClose={() => setEditing(null)}>
          <Field label="Vertical">
            <select className="admin-input" value={editing.vertical}
              onChange={e => setEditing(t => ({ ...t!, vertical: e.target.value as Vertical }))}>
              {VERTICAIS.map(v => <option key={v} value={v}>{VERTICAL_LABELS[v]}</option>)}
            </select>
          </Field>
          <Field label="Canal">
            <select className="admin-input" value={editing.canal}
              onChange={e => setEditing(t => ({ ...t!, canal: e.target.value as Canal }))}>
              <option value="publico">Canal público (51 mil)</option>
              <option value="vip">VIP</option>
            </select>
          </Field>
          <Field label="Publicado em">
            <input type="datetime-local" className="admin-input" value={editing.publicado_em}
              onChange={e => setEditing(t => ({ ...t!, publicado_em: e.target.value }))} />
          </Field>
          <Field label="Evento (ex: Benfica vs Porto)">
            <input className="admin-input" value={editing.evento}
              onChange={e => setEditing(t => ({ ...t!, evento: e.target.value }))} />
          </Field>
          <Field label="Competição (opcional)">
            <input className="admin-input" value={editing.competicao ?? ''}
              onChange={e => setEditing(t => ({ ...t!, competicao: e.target.value }))} />
          </Field>
          <Field label="Pick">
            <input className="admin-input" value={editing.pick}
              onChange={e => setEditing(t => ({ ...t!, pick: e.target.value }))} />
          </Field>
          <Field label="ODD">
            <NumericInput className="admin-input" step={0.01} value={editing.odd}
              onChange={n => setEditing(t => ({ ...t!, odd: n }))} />
          </Field>
          <Field label="Stake (unidades)">
            <NumericInput className="admin-input" step={0.5} value={editing.stake}
              onChange={n => setEditing(t => ({ ...t!, stake: n }))} />
          </Field>
          <Field label="Resultado">
            <select className="admin-input" value={editing.resultado}
              onChange={e => setEditing(t => ({ ...t!, resultado: e.target.value as Resultado }))}>
              {RESULTADOS.map(r => <option key={r} value={r}>{RESULTADO_LABELS[r]}</option>)}
            </select>
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

// ─── SECTION: CANAIS DE TELEGRAM ─────────────────────────────────
// Roadmap 9 (perfis falsos), 5 (alcance e fidelidade) e 1 (cadência).

type CanalDraft = Omit<CanalTelegram, 'id'> & { id?: string };

const TIPOS_CANAL: { valor: TipoCanal; label: string }[] = [
  { valor: 'oficial',  label: 'Canal oficial' },
  { valor: 'contacto', label: 'Contacto oficial' },
  { valor: 'falso',    label: 'Perfil falso (a denunciar)' },
];

function novoCanal(): CanalDraft {
  return {
    nome: '', handle: null, url: null, tipo: 'oficial', vertical: null,
    acesso: 'gratuito', subscritores: null, engagement_min: null, engagement_max: null,
    cadencia: null, cadencia_estavel: true, nota: null, ordem: 0, ativo: true,
    recolhido_em: new Date().toISOString().slice(0, 10),
  };
}

function SectionCanais({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [canais, setCanais] = useState<CanalTelegram[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CanalDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('telegram_canais')
      .select('*')
      .order('tipo')
      .order('ordem');
    if (error) showToast('Erro ao carregar canais: ' + error.message, 'error');
    setCanais((data ?? []) as CanalTelegram[]);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const semHandle = canais.filter(c => c.tipo === 'oficial' && !c.handle).length;

  const save = async () => {
    if (!editing) return;
    if (!editing.nome.trim()) { showToast('O nome é obrigatório', 'error'); return; }

    // Um perfil falso listado sem handle não serve de nada: o handle é
    // precisamente o que o membro vai comparar.
    if (editing.tipo !== 'oficial' && !editing.handle?.trim()) {
      showToast('Handle obrigatório para contactos e perfis falsos', 'error');
      return;
    }

    setSaving(true);
    const handle = editing.handle?.trim().replace(/^@/, '') || null;
    const payload = {
      nome: editing.nome.trim(),
      handle,
      url: editing.url?.trim() || (handle ? `https://t.me/${handle}` : null),
      tipo: editing.tipo,
      vertical: editing.vertical || null,
      acesso: editing.acesso,
      subscritores: editing.subscritores ?? null,
      engagement_min: editing.engagement_min ?? null,
      engagement_max: editing.engagement_max ?? null,
      cadencia: editing.cadencia?.trim() || null,
      cadencia_estavel: editing.cadencia_estavel,
      nota: editing.nota?.trim() || null,
      ordem: editing.ordem,
      ativo: editing.ativo,
      recolhido_em: editing.recolhido_em || null,
    };
    const { error } = isNew
      ? await supabase.from('telegram_canais').insert(payload)
      : await supabase.from('telegram_canais').update(payload).eq('id', editing.id!);
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Canal registado' : 'Canal atualizado');
    setEditing(null);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Remover este canal da lista pública?')) return;
    const { error } = await supabase.from('telegram_canais').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Canal removido'); load(); }
  };

  return (
    <div className="admin-section-content">
      <div className="admin-toolbar">
        <button className="admin-btn-primary" onClick={() => { setEditing(novoCanal()); setIsNew(true); }}>
          <Plus size={14} /> Novo Canal
        </button>
      </div>

      {semHandle > 0 && (
        <div className="admin-canais-alerta">
          <ShieldAlert size={15} />
          <span>
            {semHandle} {semHandle === 1 ? 'canal oficial está' : 'canais oficiais estão'} sem handle.
            A página pública mostra “handle por confirmar” — preencher antes de divulgar,
            porque é o handle que o membro usa para distinguir o verdadeiro do falso.
          </span>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tipo</th><th>Nome</th><th>Handle</th><th>Subscritores</th>
                <th>Visualização</th><th>Cadência</th><th>Ativo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {canais.map(c => (
                <tr key={c.id}>
                  <td>
                    <span className={`admin-canal-chip canal-${c.tipo}`}>
                      {c.tipo === 'oficial' ? 'OFICIAL' : c.tipo === 'contacto' ? 'CONTACTO' : 'FALSO'}
                    </span>
                  </td>
                  <td>{c.nome}</td>
                  <td>{fmtHandle(c.handle) ?? <em style={{ color: 'var(--text-gray)' }}>por confirmar</em>}</td>
                  <td>{fmtSubscritores(c.subscritores)}</td>
                  <td>{fmtEngagement(c.engagement_min, c.engagement_max)}</td>
                  <td>
                    {c.cadencia ?? '—'}
                    {c.cadencia && !c.cadencia_estavel && (
                      <span className="admin-canal-irregular"> · irregular</span>
                    )}
                  </td>
                  <td>{c.ativo ? 'Sim' : 'Não'}</td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" onClick={() => { setEditing({ ...c }); setIsNew(false); }}>
                      <Pencil size={14} />
                    </button>
                    <button className="admin-btn-icon danger" onClick={() => del(c.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {canais.length === 0 && (
                <tr><td colSpan={8} className="admin-empty-row">Sem canais registados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={isNew ? 'Novo Canal' : 'Editar Canal'} onClose={() => setEditing(null)}>
          <Field label="Tipo">
            <select className="admin-input" value={editing.tipo}
              onChange={e => setEditing(c => ({ ...c!, tipo: e.target.value as TipoCanal }))}>
              {TIPOS_CANAL.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Nome apresentado">
            <input className="admin-input" value={editing.nome}
              onChange={e => setEditing(c => ({ ...c!, nome: e.target.value }))} />
          </Field>
          <Field label="Handle (sem @)">
            <input className="admin-input" value={editing.handle ?? ''} placeholder="elpedritooo"
              onChange={e => setEditing(c => ({ ...c!, handle: e.target.value }))} />
          </Field>
          <Field label="URL (deixa vazio para gerar a partir do handle)">
            <input className="admin-input" value={editing.url ?? ''} placeholder="https://t.me/…"
              onChange={e => setEditing(c => ({ ...c!, url: e.target.value }))} />
          </Field>

          {editing.tipo === 'oficial' && (
            <>
              <Field label="Vertical">
                <select className="admin-input" value={editing.vertical ?? ''}
                  onChange={e => setEditing(c => ({ ...c!, vertical: (e.target.value || null) as Vertical | null }))}>
                  <option value="">— sem vertical —</option>
                  {VERTICAIS.map(v => <option key={v} value={v}>{VERTICAL_LABELS[v]}</option>)}
                </select>
              </Field>
              <Field label="Acesso">
                <select className="admin-input" value={editing.acesso}
                  onChange={e => setEditing(c => ({ ...c!, acesso: e.target.value as AcessoCanal }))}>
                  <option value="gratuito">Gratuito</option>
                  <option value="vip">VIP</option>
                </select>
              </Field>
              <Field label="Taxa de visualização mínima (%)">
                <NumericInput className="admin-input" step={1} value={editing.engagement_min ?? 0}
                  onChange={n => setEditing(c => ({ ...c!, engagement_min: n }))} />
              </Field>
              <Field label="Taxa de visualização máxima (%)">
                <NumericInput className="admin-input" step={1} value={editing.engagement_max ?? 0}
                  onChange={n => setEditing(c => ({ ...c!, engagement_max: n }))} />
              </Field>
              <Field label="Cadência (ex: Diária, várias vezes por dia)">
                <input className="admin-input" value={editing.cadencia ?? ''}
                  onChange={e => setEditing(c => ({ ...c!, cadencia: e.target.value }))} />
              </Field>
              <Field label="Cadência regular?">
                <select className="admin-input" value={editing.cadencia_estavel ? 'sim' : 'nao'}
                  onChange={e => setEditing(c => ({ ...c!, cadencia_estavel: e.target.value === 'sim' }))}>
                  <option value="sim">Sim — publica com regularidade</option>
                  <option value="nao">Não — assume-se irregular publicamente</option>
                </select>
              </Field>
            </>
          )}

          <Field label="Subscritores">
            <NumericInput className="admin-input" step={1} value={editing.subscritores ?? 0}
              onChange={n => setEditing(c => ({ ...c!, subscritores: n }))} />
          </Field>
          <Field label="Data da recolha dos números">
            <input type="date" className="admin-input" value={editing.recolhido_em ?? ''}
              onChange={e => setEditing(c => ({ ...c!, recolhido_em: e.target.value }))} />
          </Field>
          <Field label="Nota">
            <input className="admin-input" value={editing.nota ?? ''}
              onChange={e => setEditing(c => ({ ...c!, nota: e.target.value }))} />
          </Field>
          <Field label="Ordem">
            <NumericInput className="admin-input" step={1} value={editing.ordem}
              onChange={n => setEditing(c => ({ ...c!, ordem: n }))} />
          </Field>
          <Field label="Visível na página pública">
            <select className="admin-input" value={editing.ativo ? 'sim' : 'nao'}
              onChange={e => setEditing(c => ({ ...c!, ativo: e.target.value === 'sim' }))}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
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

// ─── SECTION: RANKING MENSAL ─────────────────────────────────────

/**
 * Configuração do ranking mensal e fecho do mês (roadmap 10).
 *
 * O fecho existe porque a tabela ao vivo continua a mexer depois do mês
 * acabar — basta alguém resolver uma aposta atrasada. Fechar grava o pódio
 * em ranking_vencedores e é isso que passa a valer.
 */
function SectionRanking({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [cfg, setCfg] = useState<RankingConfig>(CONFIG_PADRAO);
  const [linhas, setLinhas] = useState<LinhaRanking[]>([]);
  const [vencedores, setVencedores] = useState<Vencedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fechando, setFechando] = useState(false);

  // Por omissão fecha-se o mês passado, que é o caso normal.
  const [mesISO, setMesISO] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [posicoes, setPosicoes] = useState(3);

  const mesDate = useMemo(() => {
    const [ano, mes] = mesISO.split('-').map(Number);
    return new Date(ano, (mes || 1) - 1, 1);
  }, [mesISO]);

  const load = async () => {
    setLoading(true);
    const [c, v] = await Promise.all([carregarConfig(), carregarVencedores(40)]);
    setCfg(c);
    setVencedores(v);
    setLinhas(await carregarRanking(mesDate));
    setLoading(false);
  };

  useEffect(() => { load(); }, [mesISO]);

  const guardarConfig = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('ranking_config')
      .update({
        ativo: cfg.ativo,
        premio_titulo: cfg.premio_titulo?.trim() || null,
        premio_descricao: cfg.premio_descricao?.trim() || null,
        min_apostas: cfg.min_apostas,
        lugares: cfg.lugares,
        regras: cfg.regras?.trim() || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', 1);
    setSaving(false);
    if (error) showToast('Erro: ' + error.message, 'error');
    else showToast('Configuração guardada');
  };

  const fecharMes = async () => {
    if (!linhas.length) {
      showToast('Não há ninguém elegível neste mês', 'error');
      return;
    }
    const nomes = linhas.slice(0, posicoes).map((l, i) => `${i + 1}º ${l.username}`).join(', ');
    if (!confirm(`Fechar ${nomeMes(mesDate)} e gravar o pódio?\n\n${nomes}\n\nVolta a correr sem problema se precisares de corrigir.`)) return;

    setFechando(true);
    const { data, error } = await supabase.rpc('ranking_fechar_mes', {
      p_mes: `${mesISO}-01`,
      p_posicoes: posicoes,
      p_premio: cfg.premio_titulo,
    });
    setFechando(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(`${data ?? 0} lugares gravados`);
    setVencedores(await carregarVencedores(40));
  };

  const marcarEntregue = async (v: Vencedor) => {
    const { error } = await supabase
      .from('ranking_vencedores')
      .update({ entregue: !v.entregue })
      .eq('id', v.id);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    setVencedores(await carregarVencedores(40));
  };

  return (
    <div className="admin-section-content">
      {/* ── Configuração ── */}
      <div className="admin-card">
        <h3 className="admin-card__title"><Trophy size={15} /> Prémio e regras</h3>

        <Field label="Título do prémio">
          <input className="admin-input" value={cfg.premio_titulo ?? ''}
            onChange={e => setCfg(c => ({ ...c, premio_titulo: e.target.value }))} />
        </Field>
        <Field label="Descrição do prémio">
          <input className="admin-input" value={cfg.premio_descricao ?? ''}
            onChange={e => setCfg(c => ({ ...c, premio_descricao: e.target.value }))} />
        </Field>
        <Field label="Mínimo de apostas resolvidas para entrar">
          <NumericInput className="admin-input" step={1} value={cfg.min_apostas}
            onChange={n => setCfg(c => ({ ...c, min_apostas: Math.max(1, Math.round(n)) }))} />
        </Field>
        <Field label="Lugares visíveis na tabela">
          <NumericInput className="admin-input" step={1} value={cfg.lugares}
            onChange={n => setCfg(c => ({ ...c, lugares: Math.min(100, Math.max(3, Math.round(n))) }))} />
        </Field>
        <Field label="Nota de regras (opcional)">
          <input className="admin-input" value={cfg.regras ?? ''}
            onChange={e => setCfg(c => ({ ...c, regras: e.target.value }))} />
        </Field>
        <Field label="Competição ativa">
          <select className="admin-input" value={cfg.ativo ? 'sim' : 'nao'}
            onChange={e => setCfg(c => ({ ...c, ativo: e.target.value === 'sim' }))}>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Field>

        <div className="admin-modal__actions">
          <button className="admin-btn-primary" onClick={guardarConfig} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </div>

      {/* ── Fechar o mês ── */}
      <div className="admin-card">
        <h3 className="admin-card__title"><CheckCircle size={15} /> Fechar o mês</h3>
        <p className="admin-card__hint">
          A tabela ao vivo continua a mexer depois do mês acabar — uma aposta
          resolvida com atraso muda posições. Fechar congela o pódio no estado
          que anunciaste.
        </p>

        <div className="admin-toolbar">
          <input className="admin-input" type="month" value={mesISO}
            onChange={e => setMesISO(e.target.value)} style={{ maxWidth: 180 }} />
          <NumericInput className="admin-input" step={1} value={posicoes}
            onChange={n => setPosicoes(Math.min(10, Math.max(1, Math.round(n))))} />
          <button className="admin-btn-primary" onClick={fecharMes} disabled={fechando || loading}>
            {fechando ? <Loader2 size={14} className="spin" /> : <Trophy size={14} />} Fechar {nomeMes(mesDate)}
          </button>
        </div>

        {loading ? (
          <div className="admin-loading"><Loader2 size={22} className="spin" /> A calcular…</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>#</th><th>Membro</th><th>ROI</th><th>Lucro</th><th>Acerto</th><th>Apostas</th></tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.user_id}>
                    <td>{l.posicao}</td>
                    <td>{l.username}</td>
                    <td>{fmtRankingRoi(l.roi)}</td>
                    <td>{fmtRankingUnidades(l.lucro_unidades)}</td>
                    <td>{l.taxa_acerto == null ? '—' : `${l.taxa_acerto.toFixed(0)}%`}</td>
                    <td>{l.apostas}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td colSpan={6} className="admin-empty-row">
                    Ninguém com {cfg.min_apostas} ou mais apostas resolvidas neste mês
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Vencedores gravados ── */}
      <div className="admin-card">
        <h3 className="admin-card__title"><Star size={15} /> Vencedores gravados</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Mês</th><th>#</th><th>Membro</th><th>ROI</th><th>Prémio</th><th>Entregue</th></tr>
            </thead>
            <tbody>
              {vencedores.map(v => (
                <tr key={v.id}>
                  <td>{nomeMesISO(v.mes)}</td>
                  <td>{v.posicao}</td>
                  <td>{v.username}</td>
                  <td>{fmtRankingRoi(v.roi)}</td>
                  <td>{v.premio ?? '—'}</td>
                  <td>
                    <button className="admin-btn-icon" onClick={() => marcarEntregue(v)}
                      title={v.entregue ? 'Marcar como não entregue' : 'Marcar como entregue'}>
                      {v.entregue ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
              {vencedores.length === 0 && (
                <tr><td colSpan={6} className="admin-empty-row">Nenhum mês fechado ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SECTION: FUNIL VIP ──────────────────────────────────────────

const ESTADOS_REUNIAO: EstadoReuniao[] =
  ['pendente', 'agendada', 'realizada', 'cancelada', 'convertida'];

function novoVideo(): Partial<VipVideo> {
  return { titulo: '', descricao: '', embed_url: '', thumb_url: '', duracao: '', ordem: 0, ativo: true };
}

/**
 * Vídeos do funil e pedidos de reunião (roadmap 12).
 *
 * Os pedidos têm nome, email e telefone: por isso é que a RLS de vip_reunioes
 * só deixa o próprio membro e os administradores lerem cada linha.
 */
function SectionFunilVip({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [videos, setVideos] = useState<VipVideo[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<VipVideo> | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = async () => {
    setLoading(true);
    const [vs, rs] = await Promise.all([carregarVideos(false), carregarReunioes()]);
    setVideos(vs);
    setReunioes(rs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const porTratar = reunioes.filter(r => r.estado === 'pendente').length;

  const save = async () => {
    if (!editing?.titulo?.trim() || !editing.embed_url?.trim()) {
      showToast('Título e URL de embed são obrigatórios', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      titulo: editing.titulo.trim(),
      descricao: editing.descricao?.trim() || null,
      embed_url: editing.embed_url.trim(),
      thumb_url: editing.thumb_url?.trim() || null,
      duracao: editing.duracao?.trim() || null,
      ordem: editing.ordem ?? 0,
      ativo: editing.ativo ?? true,
    };
    const { error } = isNew
      ? await supabase.from('vip_videos').insert(payload)
      : await supabase.from('vip_videos').update(payload).eq('id', editing.id!);
    setSaving(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast(isNew ? 'Vídeo adicionado' : 'Vídeo atualizado');
    setEditing(null);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Remover este vídeo do funil?')) return;
    const { error } = await supabase.from('vip_videos').delete().eq('id', id);
    if (error) showToast('Erro ao eliminar', 'error');
    else { showToast('Vídeo removido'); load(); }
  };

  const mudarEstado = async (r: Reuniao, estado: EstadoReuniao) => {
    const { error } = await supabase.from('vip_reunioes').update({ estado }).eq('id', r.id);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    setReunioes(await carregarReunioes());
  };

  return (
    <div className="admin-section-content">
      {/* ── Pedidos de reunião ── */}
      <div className="admin-card">
        <h3 className="admin-card__title">
          <CalendarClock size={15} /> Pedidos de reunião
          {porTratar > 0 && <span style={{ color: '#ef4444' }}>· {porTratar} por contactar</span>}
        </h3>
        <p className="admin-card__hint">
          Cada linha é alguém que pediu 15 minutos antes de subscrever. Quanto
          mais depressa forem contactados, mais valem.
        </p>

        {loading ? (
          <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pedido</th><th>Nome</th><th>Contacto</th>
                  <th>Disponibilidade</th><th>Mensagem</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {reunioes.map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleDateString('pt-PT')}</td>
                    <td>{r.nome}</td>
                    <td>
                      {r.email}
                      {r.telefone && <><br />{r.telefone}</>}
                    </td>
                    <td>{r.preferencia ?? '—'}</td>
                    <td>{r.mensagem ?? '—'}</td>
                    <td>
                      <select
                        className="admin-input"
                        value={r.estado}
                        onChange={e => mudarEstado(r, e.target.value as EstadoReuniao)}
                      >
                        {ESTADOS_REUNIAO.map(e => (
                          <option key={e} value={e}>{ESTADO_REUNIAO_LABELS[e]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {reunioes.length === 0 && (
                  <tr><td colSpan={6} className="admin-empty-row">Sem pedidos de reunião</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Vídeos ── */}
      <div className="admin-card">
        <h3 className="admin-card__title"><PlayCircle size={15} /> Vídeos do funil</h3>
        <p className="admin-card__hint">
          O URL tem de ser de <strong>embed</strong>, não o link de partilha —
          por exemplo <code>https://www.youtube.com/embed/ID</code>.
        </p>

        <div className="admin-toolbar">
          <button className="admin-btn-primary" onClick={() => { setEditing(novoVideo()); setIsNew(true); }}>
            <Plus size={14} /> Novo Vídeo
          </button>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Ordem</th><th>Título</th><th>Duração</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
              {videos.map(v => (
                <tr key={v.id}>
                  <td>{v.ordem}</td>
                  <td>{v.titulo}</td>
                  <td>{v.duracao ?? '—'}</td>
                  <td>{v.ativo ? 'Sim' : 'Não'}</td>
                  <td className="admin-actions-cell">
                    <button className="admin-btn-icon" onClick={() => { setEditing({ ...v }); setIsNew(false); }}>
                      <Pencil size={14} />
                    </button>
                    <button className="admin-btn-icon danger" onClick={() => del(v.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {videos.length === 0 && (
                <tr><td colSpan={5} className="admin-empty-row">Sem vídeos no funil</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={isNew ? 'Novo Vídeo' : 'Editar Vídeo'} onClose={() => setEditing(null)}>
          <Field label="Título">
            <input className="admin-input" value={editing.titulo ?? ''}
              onChange={e => setEditing(v => ({ ...v!, titulo: e.target.value }))} />
          </Field>
          <Field label="Descrição">
            <input className="admin-input" value={editing.descricao ?? ''}
              onChange={e => setEditing(v => ({ ...v!, descricao: e.target.value }))} />
          </Field>
          <Field label="URL de embed">
            <input className="admin-input" value={editing.embed_url ?? ''}
              placeholder="https://www.youtube.com/embed/…"
              onChange={e => setEditing(v => ({ ...v!, embed_url: e.target.value }))} />
          </Field>
          <Field label="Miniatura (URL)">
            <input className="admin-input" value={editing.thumb_url ?? ''}
              onChange={e => setEditing(v => ({ ...v!, thumb_url: e.target.value }))} />
          </Field>
          <Field label="Duração">
            <input className="admin-input" value={editing.duracao ?? ''} placeholder="4:12"
              onChange={e => setEditing(v => ({ ...v!, duracao: e.target.value }))} />
          </Field>
          <Field label="Ordem">
            <NumericInput className="admin-input" step={1} value={editing.ordem ?? 0}
              onChange={n => setEditing(v => ({ ...v!, ordem: Math.round(n) }))} />
          </Field>
          <Field label="Visível">
            <select className="admin-input" value={editing.ativo ? 'sim' : 'nao'}
              onChange={e => setEditing(v => ({ ...v!, ativo: e.target.value === 'sim' }))}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </Field>

          <div className="admin-modal__actions">
            <button className="admin-btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SECTION: SALAS POR JOGO ─────────────────────────────────────

/**
 * Configuração das salas por jogo (roadmap 11). As salas criam-se sozinhas a
 * partir dos jogos do dia — aqui só se escolhe que competições seguir.
 */
function SectionSalas({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [cfg, setCfg] = useState<SalasConfig>(SALAS_CONFIG_PADRAO);
  const [ligasTexto, setLigasTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    carregarSalasConfig().then(c => {
      setCfg(c);
      setLigasTexto(c.ligas.join(', '));
      setLoading(false);
    });
  }, []);

  const guardar = async () => {
    const ligas = ligasTexto.split(',').map(s => s.trim()).filter(Boolean);
    if (!ligas.length) {
      showToast('Indica pelo menos uma competição', 'error');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('salas_config')
      .update({
        ativo: cfg.ativo,
        ligas,
        janela_horas: cfg.janela_horas,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', 1);
    setSaving(false);
    if (error) showToast('Erro: ' + error.message, 'error');
    else { setCfg(c => ({ ...c, ligas })); showToast('Configuração guardada'); }
  };

  if (loading) {
    return (
      <div className="admin-section-content">
        <div className="admin-loading"><Loader2 size={22} className="spin" /> A carregar…</div>
      </div>
    );
  }

  return (
    <div className="admin-section-content">
      <div className="admin-card">
        <h3 className="admin-card__title"><Radio size={15} /> Competições seguidas</h3>
        <p className="admin-card__hint">
          Slugs de competição da fonte de placar, separados por vírgulas.
          Exemplos: <code>por.1</code> Liga Portugal, <code>eng.1</code> Premier
          League, <code>esp.1</code> LaLiga, <code>uefa.champions</code>.
          As salas aparecem e desaparecem sozinhas conforme os jogos do dia.
        </p>

        <Field label="Ligas">
          <input className="admin-input" value={ligasTexto}
            onChange={e => setLigasTexto(e.target.value)} />
        </Field>
        <Field label="Horas que a sala fica aberta depois do apito">
          <NumericInput className="admin-input" step={1} value={cfg.janela_horas}
            onChange={n => setCfg(c => ({ ...c, janela_horas: Math.min(48, Math.max(1, Math.round(n))) }))} />
        </Field>
        <Field label="Salas ativas">
          <select className="admin-input" value={cfg.ativo ? 'sim' : 'nao'}
            onChange={e => setCfg(c => ({ ...c, ativo: e.target.value === 'sim' }))}>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </Field>

        <div className="admin-modal__actions">
          <button className="admin-btn-primary" onClick={guardar} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      </div>
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
    aberto: '#60a5fa', em_analise: '#8a6144', resolvido: '#4ade80', fechado: '#2a3750',
  };
  const ESTADO_LABELS: Record<string, string> = {
    aberto: 'Aberto', em_analise: 'Em Análise', resolvido: 'Resolvido', fechado: 'Fechado',
  };
  const PRIO_COLORS: Record<string, string> = {
    baixa: '#2a3750', normal: '#3a4a6b', alta: '#8a6144', urgente: '#f87171',
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
            <span style={{ fontSize: 11, fontWeight: 600, color: PRIO_COLORS[ticket.prioridade], background: 'rgba(255, 255, 255,.04)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '2px 8px' }}>
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
    aberto: '#60a5fa', em_analise: '#8a6144', resolvido: '#4ade80', fechado: '#2a3750',
  };
  const ESTADO_LABELS: Record<string, string> = {
    aberto: 'Aberto', em_analise: 'Em Análise', resolvido: 'Resolvido', fechado: 'Fechado',
  };
  const PRIO_COLORS: Record<string, string> = {
    baixa: '#2a3750', normal: '#3a4a6b', alta: '#8a6144', urgente: '#f87171',
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
          {section === 'raiox'        && <SectionRaioX showToast={showToast} />}
          {section === 'canais'       && <SectionCanais showToast={showToast} />}
          {section === 'ranking'      && <SectionRanking showToast={showToast} />}
          {section === 'funil-vip'    && <SectionFunilVip showToast={showToast} />}
          {section === 'salas'        && <SectionSalas showToast={showToast} />}
          {section === 'planos'       && <SectionPlanos showToast={showToast} />}
          {section === 'palpites'     && <SectionPalpites showToast={showToast} />}
          {section === 'bilhete'      && <SectionBilhete showToast={showToast} />}
          {section === 'lucro'        && <SectionLucro showToast={showToast} />}
          {section === 'lucro-semana' && <SectionLucroSemana showToast={showToast} />}
          {section === 'top-aposta'   && <SectionTopAposta showToast={showToast} />}
          {section === 'gamificacao'  && <SectionGamificacao showToast={showToast} />}
          {section === 'suporte'       && <SectionSuporte showToast={showToast} />}
        </main>
      </div>
    </div>
  );
}
