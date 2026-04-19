import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AtSign, ArrowRight, ArrowLeft, Check, X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import '../index.css';

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validação básica
    if (!formData.name || !formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('Por favor preencha todos os campos');
      setLoading(false);
      return;
    }

    // Validação do username
    const usernameClean = formData.username.replace(/^@/, '');
    if (usernameClean.length < 3) {
      setError('O username deve ter pelo menos 3 caracteres');
      setLoading(false);
      return;
    }
    if (!/^[a-zA-Z0-9._]+$/.test(usernameClean)) {
      setError('O username só pode conter letras, números, pontos e underscores');
      setLoading(false);
      return;
    }

    if (!formData.email.includes('@')) {
      setError('Email inválido');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('A palavra-passe deve ter pelo menos 6 caracteres');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('As palavras-passe não coincidem');
      setLoading(false);
      return;
    }

    if (!acceptTerms) {
      setError('Deve aceitar os termos e condições');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name,
            username: usernameClean,
          }
        }
      });

      if (error) {
        throw error;
      }

      // Guardar dados na tabela membros
      if (data.user) {
        const { error: membroError } = await supabase
          .from('membros')
          .upsert({
            id: data.user.id,
            email: formData.email,
            nome: formData.name,
            username: usernameClean,
            badges: ['Membro'],
          });

        if (membroError) {
          console.error('Erro ao criar dados do membro:', membroError);
        }
      }

      navigate('/login'); // Redirect after registration
    } catch (err: any) {
      console.error('Error during registration:', err);
      setError(err.message || 'Erro ao efetuar registo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} data-auth-container="true">
      <style>{`
        @media (max-width: 600px) {
          [data-auth-container="true"] {
            padding: 1rem !important;
          }
        }
      `}</style>
      {/* Botão voltar */}
      <button
        onClick={() => navigate('/')}
        style={{
          position: 'absolute',
          top: '2rem',
          left: '2rem',
          background: 'transparent',
          border: '1px solid var(--border-color)',
          color: 'var(--text-gray)',
          padding: '0.8rem 1.2rem',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem',
          transition: 'all 0.3s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(230,185,92,0.1)';
          e.currentTarget.style.borderColor = 'var(--gold-primary)';
          e.currentTarget.style.color = 'var(--gold-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--text-gray)';
        }}
      >
        <ArrowLeft size={18} /> VOLTAR
      </button>

      <div style={{
        background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
        border: '1px solid rgba(230,185,92,0.3)',
        borderRadius: '16px',
        padding: '3rem 2.5rem',
        maxWidth: '450px',
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 30px 60px rgba(0,0,0,0.9), 0 0 40px rgba(230,185,92,0.1)',
        marginTop: '4rem',
        boxSizing: 'border-box'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--gold-primary)', fontStyle: 'italic', letterSpacing: '-2px' }}>EP</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '900', letterSpacing: '1px', lineHeight: '1' }}>EL PEDRITO</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-gray)', letterSpacing: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{width: '20px', height: '1px', background: 'var(--gold-primary)'}}></div> HUB
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', margin: '1rem 0 0 0' }}>Crie sua conta agora</p>
        </div>

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Nome */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Nome Completo
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <User size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="El Pedrito"
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.8rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = '#333';
                }}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Username
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <AtSign size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={(e) => {
                  const val = e.target.value.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
                  setFormData(prev => ({ ...prev, username: val }));
                }}
                placeholder="elpedrito"
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.8rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box' as const
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = '#333';
                }}
              />
            </div>
            {formData.username && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginTop: '0.3rem', display: 'block' }}>
                O teu username será: <span style={{ color: 'var(--gold-primary)', fontWeight: '600' }}>@{formData.username.replace(/^@/, '')}</span>
              </span>
            )}
          </div>

          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Email
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="oseu@email.com"
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.8rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = '#333';
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Palavra-passe
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.9rem 2.8rem 0.9rem 2.8rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = '#333';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--gold-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffd700';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--gold-primary)';
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirmar Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Confirmar Palavra-passe
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.9rem 2.8rem 0.9rem 2.8rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = '#333';
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--gold-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffd700';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--gold-primary)';
                }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Aceitar Termos */}
          <div style={{
            background: 'rgba(34, 197, 94, 0.05)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            gap: '0.8rem',
            alignItems: 'center'
          }}>
            <input
              type="checkbox"
              id="terms"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                accentColor: 'var(--gold-primary)',
                flexShrink: 0
              }}
            />
            <label htmlFor="terms" style={{ fontSize: '0.85rem', color: 'var(--text-gray)', cursor: 'pointer', margin: 0 }}>
              Aceito os{' '}
              <button
                type="button"
                onClick={() => setShowTermsModal(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--gold-primary)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  fontWeight: '600'
                }}
              >
                Termos e Condições
              </button>
            </label>
          </div>

          {/* Erro */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              padding: '0.8rem',
              borderRadius: '8px',
              fontSize: '0.85rem'
            }}>
              {error}
            </div>
          )}

          {/* Botão Registar */}
          <button
            type="submit"
            disabled={loading}
            className="btn-gold"
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'CRIANDO CONTA...' : 'CRIAR CONTA'} <ArrowRight size={18} />
          </button>
        </form>

        {/* Link para Login */}
        <div style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.85rem', marginTop: '1.5rem' }}>
          Já tem conta?{' '}
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--gold-primary)',
              cursor: 'pointer',
              fontWeight: 'bold',
              textDecoration: 'underline',
              padding: 0,
              transition: 'opacity 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Faça login aqui
          </button>
        </div>
      </div>

      {/* Modal de Termos */}
      {showTermsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)',
          padding: '2rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(22,22,22,0.95) 0%, rgba(8,8,8,0.98) 100%)',
            border: '1px solid rgba(230,185,92,0.3)',
            borderRadius: '16px',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 30px 60px rgba(0,0,0,0.9)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '900', margin: 0 }}>Termos e Condições</h2>
              <button
                onClick={() => setShowTermsModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '1.5rem'
                }}
              >
                <X size={28} />
              </button>
            </div>

            <div style={{ color: 'var(--text-gray)', fontSize: '0.9rem', lineHeight: '1.8' }}>
              <h3 style={{ color: '#fff', marginTop: '1rem', marginBottom: '0.5rem' }}>1. Uso do Serviço</h3>
              <p>
                Ao aceitar estes termos, concorda em utilizar o El Pedrito Hub apenas para fins legítimos. Proibimos a utilização do serviço de forma fraudulenta ou ilegal.
              </p>

              <h3 style={{ color: '#fff', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Responsabilidade</h3>
              <p>
                O El Pedrito Hub fornece análises e recomendações de apostas. No entanto, as apostas desportivas envolvem risco. Não garantimos lucros. O utilizador é responsável pelas suas decisões.
              </p>

              <h3 style={{ color: '#fff', marginTop: '1rem', marginBottom: '0.5rem' }}>3. Dados Pessoais</h3>
              <p>
                Os seus dados serão protegidos e armazenados de acordo com a GDPR. Não partilhamos informações com terceiros sem consentimento.
              </p>

              <h3 style={{ color: '#fff', marginTop: '1rem', marginBottom: '0.5rem' }}>4. Contenção da Disputa</h3>
              <p>
                Qualquer disputa será resolvida através de arbitragem amigável. As leis portuguesas aplicam-se a todo o conteúdo.
              </p>

              <h3 style={{ color: '#fff', marginTop: '1rem', marginBottom: '0.5rem' }}>5. Modificações</h3>
              <p>
                Reservamo-nos o direito de modificar estes termos a qualquer momento. Notificaremos os utilizadores de mudanças significativas.
              </p>

              <div style={{ 
                background: 'rgba(230,185,92,0.1)',
                border: '1px solid rgba(230,185,92,0.3)',
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '1.5rem',
                textAlign: 'center'
              }}>
                <p style={{ margin: 0, fontWeight: '600' }}>Entidade Responsável: El Pedrito 2024</p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>Última atualização: Abril 2026</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button
                onClick={() => {
                  setShowTermsModal(false);
                  setAcceptTerms(true);
                }}
                className="btn-gold"
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                <Check size={18} /> ACEITAR
              </button>
              <button
                onClick={() => setShowTermsModal(false)}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <X size={18} /> FECHAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Register;
