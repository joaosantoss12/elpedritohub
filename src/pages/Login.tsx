import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import '../index.css';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validação básica
    if (!email || !password) {
      setError('Por favor preencha todos os campos');
      setLoading(false);
      return;
    }

    if (!email.includes('@')) {
      setError('Email inválido');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('ignore this error:', data);
        throw error;
      }

      navigate('/passaporte'); // Redirect after login
    } catch (err: any) {
      console.error('Error during login:', err);
      setError(err.message || 'Erro ao efetuar login. Verifique as suas credenciais.');
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
          e.currentTarget.style.background = 'rgba(154, 98, 56,0.1)';
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
        background: 'linear-gradient(145deg, rgba(245, 236, 221,0.95) 0%, rgba(222, 208, 182,0.98) 100%)',
        border: '1px solid rgba(154, 98, 56,0.3)',
        borderRadius: '16px',
        padding: '3rem 2.5rem',
        maxWidth: '450px',
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 30px 60px rgba(74, 55, 35,0.9), 0 0 40px rgba(154, 98, 56,0.1)',
        boxSizing: 'border-box'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--gold-primary)', fontStyle: 'italic', letterSpacing: '-2px' }}>EP</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '900', letterSpacing: '1px', lineHeight: '1' }}>EL PEDRITO</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-gray)', letterSpacing: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{width: '20px', height: '1px', background: 'var(--gold-primary)'}}></div> HUB
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--text-gray)', fontSize: '0.85rem', margin: '1rem 0 0 0' }}>Bem-vindo de volta</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Email
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="oseu@email.com"
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem 0.9rem 2.8rem',
                  background: 'rgba(44, 34, 22,0.05)',
                  border: '1px solid #d3c2a5',
                  borderRadius: '8px',
                  color: '#2c2216',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(44, 34, 22,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(44, 34, 22,0.05)';
                  e.currentTarget.style.borderColor = '#d3c2a5';
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-gray)' }}>
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--gold-primary)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '0.9rem 2.8rem 0.9rem 2.8rem',
                  background: 'rgba(44, 34, 22,0.05)',
                  border: '1px solid #d3c2a5',
                  borderRadius: '8px',
                  color: '#2c2216',
                  fontSize: '0.95rem',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.background = 'rgba(44, 34, 22,0.08)';
                  e.currentTarget.style.borderColor = 'var(--gold-primary)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.background = 'rgba(44, 34, 22,0.05)';
                  e.currentTarget.style.borderColor = '#d3c2a5';
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

          {/* Botão Login */}
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
            {loading ? 'ENTRANDO...' : 'ENTRAR'} <ArrowRight size={18} />
          </button>
        </form>

        {/* Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
          <button
            onClick={() => navigate('/forgot-password')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--gold-primary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              textDecoration: 'underline',
              padding: 0,
              fontWeight: '600',
              transition: 'opacity 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Esqueceu-se da palavra-passe?
          </button>

          <div style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.85rem' }}>
            Não tem conta?{' '}
            <button
              onClick={() => navigate('/register')}
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
              Registe-se aqui
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
