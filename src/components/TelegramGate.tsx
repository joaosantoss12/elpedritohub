import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import '../styles/TelegramGate.css';

// Ported from FOOTMILLION LP (src/components/TelegramGate.tsx). Next.js bits
// swapped for Vite: manual <script> injection instead of next/script,
// import.meta.env instead of process.env, plain CSS instead of framer-motion.

type Status =
  | { kind: 'loading' }
  | { kind: 'logged_out' }
  | { kind: 'none' }
  | { kind: 'pending'; plan: string; expiresAt: string }
  | { kind: 'ready'; plan: string; expiresAt: string; telegramLink: string };

type TelegramAuthData = {
  id_token?: string;
  user?: { preferred_username?: string; given_name?: string };
  error?: string;
};

type SessionUser = {
  username?: string;
  first_name: string;
  photo_url?: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (data: TelegramAuthData) => void;
  }
}

const PLAN_LABELS: Record<string, string> = {
  monthly: '1 Mês',
  quarterly: '3 Meses',
  yearly: '1 Ano',
};

const CLIENT_ID = import.meta.env.VITE_TELEGRAM_CLIENT_ID as string | undefined;

export default function TelegramGate() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [meRes, statusRes] = await Promise.all([
        fetch('/api/telegram/me'),
        fetch('/api/subscription/status'),
      ]);
      const me = await meRes.json();
      const sub = (await statusRes.json()) as Status;
      setUser(me.loggedIn ? me.user : null);
      setStatus(sub && sub.kind ? sub : { kind: 'logged_out' });
    } catch {
      setStatus({ kind: 'logged_out' });
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/telegram/logout', { method: 'POST' });
    refresh();
    window.dispatchEvent(new Event('tg-auth'));
  }, [refresh]);

  const generateLink = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/subscription/link', { method: 'POST' });
      if (res.ok) await refresh();
      else alert('Não foi possível gerar o link. Tenta novamente ou contacta o suporte.');
    } catch {
      alert('Erro de ligação. Tenta novamente.');
    } finally {
      setGenerating(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    window.addEventListener('tg-auth', refresh);
    return () => window.removeEventListener('tg-auth', refresh);
  }, [refresh]);

  // Poll while the bot generates the invite link.
  useEffect(() => {
    if (status.kind === 'pending') {
      pollRef.current = setInterval(refresh, 5000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [status.kind, refresh]);

  // The telegram-login.js embed evals `onTelegramAuth(data)` in global scope.
  useEffect(() => {
    window.onTelegramAuth = async (data: TelegramAuthData) => {
      if (!data.id_token) {
        alert('Login sem id_token: ' + (data.error ?? '(sem detalhe)'));
        return;
      }
      const res = await fetch('/api/telegram/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: data.id_token }),
      });
      if (!res.ok) {
        alert('Login falhou (' + res.status + ').');
        return;
      }
      refresh();
      window.dispatchEvent(new Event('tg-auth'));
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, [refresh]);

  // Inject the Telegram login widget script once, when logged out.
  useEffect(() => {
    if (status.kind === 'loading' || user || !widgetRef.current || !CLIENT_ID) return;
    const host = widgetRef.current;
    if (host.querySelector('script')) return;
    const s = document.createElement('script');
    s.src = 'https://oauth.telegram.org/js/telegram-login.js?5';
    s.async = true;
    s.setAttribute('data-client-id', CLIENT_ID);
    s.setAttribute('data-onauth', 'onTelegramAuth(data)');
    s.setAttribute('data-request-access', 'write');
    host.appendChild(s);
  }, [status.kind, user]);

  if (status.kind === 'loading') return null;

  if (status.kind === 'ready') {
    const expires = new Date(status.expiresAt).toLocaleDateString('pt-PT');
    return (
      <div className="tg-gate tg-gate--ready">
        <div className="tg-gate__icon tg-gate__icon--ok">
          <CheckCircle2 size={28} />
        </div>
        <h3 className="tg-gate__title">O teu acesso VIP está pronto!</h3>
        <p className="tg-gate__sub">
          {PLAN_LABELS[status.plan] ?? status.plan} · válido até {expires}
        </p>
        <a
          className="tg-gate__cta"
          href={status.telegramLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={18} /> Entrar no Grupo VIP
        </a>
      </div>
    );
  }

  if (status.kind === 'pending') {
    return (
      <div className="tg-gate">
        <div className="tg-gate__icon tg-gate__icon--gold">
          <Loader2 size={28} className="tg-gate__spin" />
        </div>
        <h3 className="tg-gate__title">A preparar o teu acesso…</h3>
        <p className="tg-gate__sub">
          O pagamento foi confirmado. O link de acesso ao grupo aparece aqui em instantes.
        </p>
        <button className="tg-gate__ghost" onClick={generateLink} disabled={generating}>
          {generating ? <Loader2 size={16} className="tg-gate__spin" /> : <ExternalLink size={16} />}
          {generating ? 'A gerar…' : 'Gerar link de acesso'}
        </button>
        <p className="tg-gate__hint">Já pagaste e o link não aparece? Gera-o aqui (válido uma vez).</p>
      </div>
    );
  }

  return (
    <div className="tg-gate">
      {user ? (
        <>
          <div className="tg-gate__user">
            {user.photo_url && (
              <img
                src={user.photo_url}
                alt={user.first_name}
                referrerPolicy="no-referrer"
                className="tg-gate__avatar"
              />
            )}
            <div className="tg-gate__user-meta">
              <p className="tg-gate__user-name">{user.first_name}</p>
              {user.username && <p className="tg-gate__user-handle">@{user.username}</p>}
            </div>
            <button
              className="tg-gate__logout"
              onClick={logout}
              aria-label="Terminar sessão do Telegram"
              title="Terminar sessão"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="tg-gate__badge tg-gate__badge--warn">
            <AlertTriangle size={16} /> Sem subscrição ativa
          </div>
        </>
      ) : (
        <>
          <h3 className="tg-gate__title tg-gate__title--sm">Entra com o Telegram</h3>
          <p className="tg-gate__sub">
            É <strong>obrigatório</strong> iniciar sessão com o Telegram para comprar. Depois do
            pagamento, o link de acesso ao grupo aparece aqui — sem precisares de abrir o Telegram.
          </p>
          {CLIENT_ID ? (
            <div className="tg-gate__widget" ref={widgetRef} />
          ) : (
            <p className="tg-gate__hint">Login com Telegram ainda não está configurado.</p>
          )}
        </>
      )}
    </div>
  );
}
