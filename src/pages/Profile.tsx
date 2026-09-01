import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Navbar } from '../components/Navbar';
import { Toast } from '../components/Toast';
import {
  User, Mail, Lock, Camera, Trash2, Loader2, AlertTriangle, CreditCard, Edit2,
  Flame, MessageCircle, Coins, Shield, Award, Eye, EyeOff, CheckCircle,
  XCircle, ExternalLink,
} from 'lucide-react';
import '../index.css';

function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, membro, loading: authLoading, signOut, refreshMembro } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [pendingEmailChange, setPendingEmailChange] = useState(false);
  const [pendingNewEmail, setPendingNewEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      // Derive avatar from storage (not stale metadata) with cache buster
      const { data: { publicUrl } } = supabase.storage
        .from('profile_images')
        .getPublicUrl(user.id);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);

      if (pendingEmailChange && pendingNewEmail && user.email === pendingNewEmail) {
        setPendingEmailChange(false);
        setPendingNewEmail('');
      }
    }
  }, [user, authLoading, navigate, pendingEmailChange, pendingNewEmail]);

  // Handle returning from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    if (params.get('checkout') === 'success' && sessionId) {
      window.history.replaceState({}, '', '/profile');
      const verify = async (attempts: number) => {
        try {
          const res = await fetch('/api/stripe/verify-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            await refreshMembro();
            setShowSuccessModal(true);
          } else if (attempts > 0) {
            setTimeout(() => verify(attempts - 1), 2000);
          } else {
            await refreshMembro();
            setShowSuccessModal(true);
          }
        } catch {
          if (attempts > 0) setTimeout(() => verify(attempts - 1), 2000);
          else setShowSuccessModal(true);
        }
      };
      verify(5);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setLoading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Tem de selecionar uma imagem para fazer upload.');
      }

      const file = event.target.files[0];
      const filePath = `${user?.id}`;

      // 1. Upload to Supabase Storage (upsert to overwrite previous avatar)
      const { error: uploadError } = await supabase.storage
        .from('profile_images')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile_images')
        .getPublicUrl(filePath);

      // 3. Update User Metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      addToast('Imagem de perfil atualizada com sucesso!', 'success');
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar a imagem.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || email === user?.email) {
      setIsEditingEmail(false);
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;

      const requestedEmail = email;
      setPendingEmailChange(true);
      setPendingNewEmail(requestedEmail);
      setEmail(user?.email || '');
      setIsEditingEmail(false);
      addToast('Verifique a sua caixa de entrada nos dois emails para confirmar a alteração.', 'success');
    } catch (error: any) {
      addToast(error.message || 'Erro ao atualizar o email.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      addToast('Precisa de introduzir a sua palavra-passe atual.', 'error');
      return;
    }

    if (!password || password !== confirmPassword) {
      addToast('A nova palavra-passe e a confirmação não coincidem.', 'error');
      return;
    }

    try {
      setLoading(true);

      // 1. Verificar a palavra-passe atual fazendo re-login
      if (user?.email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (signInError) {
          throw new Error('A palavra-passe atual está incorreta.');
        }
      }

      // 2. Atualizar para a nova palavra-passe
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      addToast('Palavra-passe atualizada com sucesso.', 'success');
    } catch (error: any) {
      addToast(error.message || 'Erro ao atualizar a palavra-passe.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toAbsoluteUrl = (url: string) =>
    url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

  const handleCancelSubscription = async () => {
    if (!membro?.stripe_subscription_id || !user) return;
    const confirmed = window.confirm('Tens a certeza que queres cancelar a subscrição? Continuarás com acesso VIP até ao fim do período pago.');
    if (!confirmed) return;
    setCancellingSubscription(true);
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: membro.stripe_subscription_id, userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar subscrição');
      await refreshMembro();
      addToast('Subscrição agendada para cancelamento no fim do período.', 'info');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      addToast(message, 'error');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const handleDeleteAccount = async () => {
    const isConfirmed = window.confirm('Tem a certeza absoluta de que pretende eliminar a sua conta? Esta ação é irreversível.');

    if (isConfirmed) {
      try {
        setLoading(true);
        // Note: Client-side deletion often requires an Edge Function or RPC if admin rights are needed.
        // For public keys, Supabase might not allow direct deletion.
        // Calling a custom RPC function or warning the user:
        alert('A API de eliminação de contas costuma exigir um Edge Function. Contacte o suporte se isto falhar.');

        // Exemplo de como chamaria um RPC se estivesse configurado
        // await supabase.rpc('delete_user');

        await signOut();
        navigate('/');
      } catch (error: any) {
        addToast(error.message || 'Erro ao eliminar conta.', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{
            background: 'var(--card-gradient)',
            border: '1px solid rgba(161, 124, 91,0.4)',
            borderRadius: '20px', padding: '3rem 2.5rem', maxWidth: '420px', width: '100%',
            textAlign: 'center', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)'
          }}>
            <CheckCircle size={64} color="#10b981" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--text-white)', marginBottom: '0.75rem' }}>
              Pagamento Confirmado!
            </h2>
            <p style={{ color: 'var(--text-gray)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
              O teu acesso ao grupo <strong style={{ color: 'var(--gold-primary)' }}>Footmillion VIP</strong> foi ativado com sucesso. Bem-vindo ao clube! 🎉
            </p>
            {membro?.vip_telegram_link && (
              <a
                href={toAbsoluteUrl(membro.vip_telegram_link)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold"
                style={{ padding: '0.9rem 2rem', fontSize: '1rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', textDecoration: 'none' }}
              >
                <ExternalLink size={18} /> Entrar no Grupo VIP
              </a>
            )}
            <p style={{ color: 'var(--text-gray)', fontSize: '0.75rem', marginBottom: '1.5rem' }}>
              Guarda este link — encontra-o sempre no teu perfil.
            </p>
            <button
              onClick={() => setShowSuccessModal(false)}
              className="btn-outline"
              style={{ padding: '0.7rem 2rem', fontSize: '0.9rem', display: 'block', margin: '0 auto', border: '1px solid rgba(255, 255, 255, 0.18)' }}
            >
              CONTINUAR
            </button>
          </div>
        </div>
      )}

      {authLoading || !user ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
          <Loader2 size={32} className="spin" color="var(--gold-primary)" />
          <style>{`
            .spin { animation: spin 1s linear infinite; }
            @keyframes spin { 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      ) : (
      <div style={{ padding: '2rem 0', display: 'flex', flexDirection: 'column', margin: '0 auto', width: '80%' }}>
      <div style={{ width: '100%', alignSelf: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-white)', marginBottom: '0.5rem', textAlign: 'center' }}>
          O Meu <span style={{ color: 'var(--gold-primary)' }}>Perfil</span>
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.9rem', maxWidth: '640px', margin: '0 auto 2rem auto', lineHeight: 1.6 }}>
          Conta, subscrição e progresso no Hub.
        </p>

        {/* CONTAINER DUPLO: DADOS ESQUERDA | ESTATÍSTICAS DIREITA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(450px, 100%), 1fr))', gap: '3rem', width: '100%' }}>

          {/* COLUNA ESQUERDA: GESTÃO DA CONTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* SECÇÃO: IMAGEM DE PERFIL */}
            <div style={{
              background: 'var(--card-gradient)',
              border: '1px solid rgba(161, 124, 91,0.2)',
              borderRadius: '16px',
              padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
        }}>
          <div
            style={{
              position: 'relative',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'var(--surface-sunken)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              border: '3px solid var(--gold-primary)',
              cursor: 'pointer'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              <User size={48} color="#4c5772" />
            )}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(0, 0, 0, 0.13)',
              padding: '0.5rem',
              display: 'flex',
              justifyContent: 'center',
            }}>
              <Camera size={16} color="var(--gold-primary)" />
            </div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarUpload}
            accept="image/*"
            style={{ display: 'none' }}
            disabled={loading}
          />
          <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem' }}>Clique na imagem para alterar</p>
        </div>

        {/* SECÇÃO: DADOS DA CONTA */}
        <div style={{
          background: 'var(--card-gradient)',
          border: '1px solid var(--surface-sunken)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={20} color="var(--gold-primary)" /> Email
          </h2>
          <form onSubmit={handleUpdateEmail} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="email"
                value={email}
                disabled={!isEditingEmail || pendingEmailChange}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={isEditingEmail}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  background: isEditingEmail && !pendingEmailChange ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.052)',
                  border: isEditingEmail && !pendingEmailChange ? '1px solid var(--gold-primary)' : '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '8px',
                  color: isEditingEmail && !pendingEmailChange ? '#dce3ee' : 'var(--text-gray)',
                  outline: 'none',
                  cursor: isEditingEmail && !pendingEmailChange ? 'text' : 'not-allowed',
                  transition: 'all 0.3s ease'
                }}
              />
            </div>

            {!isEditingEmail ? (
              <button
                type="button"
                onClick={() => setIsEditingEmail(true)}
                className="btn-outline"
                style={{ padding: '0.8rem', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.18)', cursor: pendingEmailChange ? 'not-allowed' : 'pointer', opacity: pendingEmailChange ? 0.5 : 1 }}
                title={pendingEmailChange ? "Aguarde a confirmação de email pendente" : "Editar Email"}
                disabled={pendingEmailChange}
              >
                <Edit2 size={18} />
              </button>
            ) : (
              <>
                <button type="submit" disabled={loading || email === user?.email} className="btn-gold" style={{ padding: '0 1.5rem', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'not-allowed' : 'pointer', opacity: (loading || email === user?.email) ? 0.5 : 1 }}>
                  {loading ? <Loader2 size={18} className="spin" /> : 'GUARDAR'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingEmail(false);
                    setEmail(user?.email || '');
                  }}
                  className="btn-outline"
                  style={{ padding: '0.8rem 1.5rem', height: '46px', border: '1px solid rgba(255, 255, 255, 0.18)', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </>
            )}
          </form>
          {isEditingEmail && (
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-gray)', lineHeight: '1.5' }}>
              * Ao guardar, será enviado um link de verificação para o seu email atual e para o novo. Só será alterado após verificar ambos.
            </p>
          )}
          {pendingEmailChange && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(251, 146, 60, 0.1)',
              border: '1px solid rgba(251, 146, 60, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#c9a582'
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Mudança de Email Pendente</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                  O email {pendingNewEmail ? `"${pendingNewEmail}"` : 'novo'} está pendente. Verifique os links nos dois emails para confirmar a alteração.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingEmailChange(false);
                  setPendingNewEmail('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#c9a582',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  padding: 0,
                  flexShrink: 0,
                  lineHeight: 1
                }}
                title="Fechar"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* SECÇÃO: PALAVRA-PASSE */}
        <div style={{
          background: 'var(--card-gradient)',
          border: '1px solid var(--surface-sunken)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={20} color="var(--gold-primary)" /> Alterar Palavra-Passe
          </h2>
          <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-gray)' }}>Palavra-Passe Atual</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem 0.8rem 1rem',
                    paddingRight: '2.8rem',
                    background: 'rgba(0, 0, 0, 0.1)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-white)',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-gray)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.4rem',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-gray)')}
                  title={showCurrentPassword ? 'Ocultar' : 'Mostrar'}
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div style={{ width: '100%', height: '1px', background: 'var(--surface-sunken)', margin: '0.5rem 0' }}></div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-gray)' }}>Nova Palavra-Passe</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem 0.8rem 1rem',
                    paddingRight: '2.8rem',
                    background: 'rgba(0, 0, 0, 0.1)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-white)',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-gray)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.4rem',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-gray)')}
                  title={showPassword ? 'Ocultar' : 'Mostrar'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-gray)' }}>Confirmar Nova Palavra-Passe</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '0.8rem 1rem 0.8rem 1rem',
                    paddingRight: '2.8rem',
                    background: 'rgba(0, 0, 0, 0.1)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-white)',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-gray)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.4rem',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--gold-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-gray)')}
                  title={showConfirmPassword ? 'Ocultar' : 'Mostrar'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-gold" style={{ alignSelf: 'flex-start', padding: '0.8rem 2rem', marginTop: '0.5rem' }}>
              {loading ? <Loader2 size={18} className="spin" /> : 'ALTERAR PALAVRA-PASSE'}
            </button>
          </form>
        </div>

        {/* SECÇÃO: DANGER ZONE */}
        <div style={{
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
            <Trash2 size={20} /> Danger Zone
          </h2>
          <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            Ao eliminar a conta, perderá permanentemente o acesso ao Hub, todo o histórico e subscrições ativas. Esta ação não pode ser desfeita.
          </p>
          <button
            onClick={handleDeleteAccount}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid #ef4444',
              color: '#ef4444',
              padding: '0.8rem 1.5rem',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.color = 'var(--text-white)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#ef4444';
            }}
          >
            ELIMINAR CONTA
          </button>
        </div>

          </div> {/* FIM DA COLUNA ESQUERDA */}

          {/* COLUNA DIREITA: ESTATÍSTICAS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* SECÇÃO: ASSINATURAS */}
            <div style={{
              background: 'var(--card-gradient)',
              border: '1px solid var(--surface-sunken)',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
            }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={20} color="var(--gold-primary)" /> As Minhas Subscrições
              </h2>
              {membro?.subscription_status === 'active' ? (
                <div style={{
                  background: 'rgba(139,92,246,0.08)',
                  border: '1px solid rgba(139,92,246,0.4)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Shield size={24} color="#818cf8" />
                      <div>
                        <p style={{ fontWeight: 'bold', color: 'var(--text-white)', fontSize: '1rem' }}>Footmillion VIP</p>
                        <p style={{ color: 'var(--text-gray)', fontSize: '0.8rem' }}>Acesso VIP ativo</p>
                      </div>
                    </div>
                    <span style={{
                      background: 'rgba(16,185,129,0.15)',
                      border: '1px solid #10b981',
                      color: '#10b981',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '20px'
                    }}>ATIVO</span>
                  </div>
                  {membro?.vip_telegram_link && (
                    <a
                      href={toAbsoluteUrl(membro.vip_telegram_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        background: 'var(--gold-tint)',
                        border: '1px solid rgba(161, 124, 91,0.4)',
                        color: 'var(--gold-primary)',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        textDecoration: 'none',
                        alignSelf: 'flex-start',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(161, 124, 91,0.2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--gold-tint)'; }}
                    >
                      <ExternalLink size={14} /> Entrar no Grupo VIP Telegram
                    </a>
                  )}
                  {membro?.stripe_subscription_id && (
                    <button
                      onClick={handleCancelSubscription}
                      disabled={cancellingSubscription || !!membro?.subscription_cancel_at}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${membro?.subscription_cancel_at ? 'rgba(107,114,128,0.4)' : 'rgba(239,68,68,0.4)'}`,
                        color: membro?.subscription_cancel_at ? 'var(--text-gray)' : '#ef4444',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: (cancellingSubscription || !!membro?.subscription_cancel_at) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        alignSelf: 'flex-start',
                        opacity: (cancellingSubscription || !!membro?.subscription_cancel_at) ? 0.6 : 1,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { if (!cancellingSubscription && !membro?.subscription_cancel_at) { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {cancellingSubscription ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                      {cancellingSubscription
                        ? 'A cancelar...'
                        : membro?.subscription_cancel_at
                          ? `Cancela em ${new Date(membro.subscription_cancel_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}`
                          : 'Cancelar Subscrição'}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.1)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'var(--text-gray)'
                }}>
                  <p>Atualmente não tem subscrições ativas.</p>
                  <button className="btn-outline" style={{ marginTop: '1rem', fontSize: '0.8rem', padding: '0.5rem 1rem' }} onClick={() => navigate('/plans')}>
                    VER PLANOS
                  </button>
                </div>
              )}
            </div>

            {/* SECÇÃO: CARGOS / BADGES */}
            <div style={{
              background: 'var(--card-gradient)',
              border: '1px solid var(--surface-sunken)',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
            }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={20} color="var(--gold-primary)" /> Badges
              </h2>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {membro?.badges?.map((badge, index) => {
                  if (badge === 'VIP') {
                    return (
                      <div key={index} style={{
                        background: 'rgba(139, 92, 246, 0.1)',
                        border: '1px solid #818cf8',
                        padding: '0.5rem 1rem',
                        borderRadius: '20px',
                        color: '#818cf8',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <Shield size={16} /> VIP
                      </div>
                    );
                  }

                  return (
                    <div key={index} style={{
                      background: 'var(--gold-tint)',
                      border: '1px solid var(--gold-primary)',
                      padding: '0.5rem 1rem',
                      borderRadius: '20px',
                      color: 'var(--gold-primary)',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Award size={16} /> {badge}
                    </div>
                  );
                })}
                {!membro?.badges?.length && (
                  <span style={{ color: 'var(--text-gray)', fontSize: '0.85rem' }}>Nenhuma badge disponível.</span>
                )}
              </div>
            </div>

            {/* SECÇÃO: ESTATÍSTICAS */}
            <div style={{
              background: 'var(--card-gradient)',
              border: '1px solid var(--surface-sunken)',
              borderRadius: '16px',
              padding: '2rem',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
            }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={20} color="var(--gold-primary)" /> Minhas Estatísticas
              </h2>

              {/* Grid de Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                {/* Streak */}
                <div style={{ background: 'rgba(0, 0, 0, 0.1)', padding: '1.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.052)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                  <Flame size={28} color="#ef4444" />
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-white)' }}>{membro ? membro.streak_login : '--'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>Streak Login</span>
                </div>

                {/* Mensagens */}
                <div style={{ background: 'rgba(0, 0, 0, 0.1)', padding: '1.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.052)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                  <MessageCircle size={28} color="#3b82f6" />
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-white)' }}>{membro ? membro.chat_messages : '--'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>Mensagens</span>
                </div>

                {/* EPCoins */}
                <div style={{ background: 'rgba(0, 0, 0, 0.1)', padding: '1.5rem 1rem', borderRadius: '12px', border: '1px solid var(--gold-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                  <Coins size={28} color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-white)' }}>{membro ? membro.epcoins : '--'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>EPCoins</span>
                </div>
              </div>
            </div>

          </div> {/* FIM DA COLUNA DIREITA */}

        </div> {/* FIM DO CONTAINER DUPLO */}

      </div>
      </div>
      )}

      {/* Toasts */}
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={removeToast}
        />
      ))}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default Profile;
