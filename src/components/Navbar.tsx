import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, SquareArrowRight } from 'lucide-react';

export function Navbar() {
  const navigate = useNavigate();
  const { user, membro, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '1rem 5%', 
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      background: 'rgba(10, 10, 10, 0.95)',
      backdropFilter: 'blur(10px)',
      zIndex: 100
    }}>
      {/* LOGO */}
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}
        onClick={() => navigate('/')}
      >
        <span style={{ fontSize: '2.2rem', fontWeight: '900', color: 'var(--gold-primary)', fontStyle: 'italic', letterSpacing: '-2px' }}>EP</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: '900', letterSpacing: '1px', lineHeight: '1' }}>EL PEDRITO</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-gray)', letterSpacing: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
             <div style={{width: '20px', height: '1px', background: 'var(--gold-primary)'}}></div> HUB
          </span>
        </div>
      </div>
      
      {/* NAVIGATION LINKS */}
      <ul style={{ 
        display: 'flex', 
        gap: '1.4rem', 
        listStyle: 'none', 
        color: 'var(--text-gray)', 
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
        zIndex: '99',
        whiteSpace: 'nowrap',
        flexShrink: 1,
        minWidth: 0
      }}>
        <li 
          className="nav-item" 
          onClick={() => navigate('/')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          INÍCIO
        </li>
        <li 
          className="nav-item mundial-glow"
          onClick={() => navigate('/mundial')}
          style={{
            transition: 'color 0.3s ease',
            position: 'relative',
            color: 'var(--gold-primary)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fbbf24';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
        >
          MUNDIAL 2026
        </li>
        <li 
          className="nav-item"
          onClick={() => navigate('/banca')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          GESTÃO BANCA
        </li>
        <li 
          className="nav-item"
          onClick={() => navigate('/casino')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          CASINO
        </li>
        <li 
          className="nav-item"
          onClick={() => navigate('/live')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          LIVE
        </li>
        <li 
          className="nav-item"
          onClick={() => navigate('/chat')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          CHAT
        </li>
        <li 
          className="nav-item"
          onClick={() => navigate('/premios')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          PRÉMIOS
        </li>
        <li 
          className="nav-item"
          onClick={() => navigate('/plans')}
          style={{
            transition: 'all 0.3s ease',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--gold-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-gray)';
          }}
        >
          PLANOS
        </li>
        <li
          className="nav-item"
          onClick={() => navigate('/suporte')}
          style={{ transition: 'all 0.3s ease', position: 'relative' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-gray)'; }}
        >
          SUPORTE
        </li>
      </ul>

      {/* AUTH BUTTONS */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {!user ? (
          <>
            <button 
              style={{ 
                fontSize: '0.85rem', 
                padding: '0.6rem 1.2rem',
                background: 'transparent',
                border: '1.5px solid var(--gold-primary)',
                color: 'var(--gold-primary)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onClick={() => navigate('/login')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(230,185,92,0.1)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(230,185,92,0.4)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ENTRAR <SquareArrowRight size={16} />
            </button>
            <button 
              style={{ 
                fontSize: '0.85rem', 
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.3s ease',
                background: 'linear-gradient(135deg, var(--gold-primary), #b38b3b)',
                border: 'none',
                color: '#000',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }} 
              onClick={() => navigate('/register')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(230,185,92,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              REGISTAR
            </button>
          </>
        ) : (
          <>  
          {membro?.badges?.includes('Administrador') && (
            <button
              style={{
                fontSize: '0.85rem',
                padding: '0.6rem 1.2rem',
                background: '#901010',
                border: 'none',
                color: '#ffffff',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.3s ease'
              }}
              onClick={() => navigate('/admin')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(230,185,92,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ADMIN
             </button>
             )}
            <button 
              style={{ 
                fontSize: '0.85rem', 
                padding: '0.6rem 1.2rem',
                background: 'transparent',
                border: '1.5px solid var(--gold-primary)',
                color: 'var(--gold-primary)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onClick={() => navigate('/profile')}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(230,185,92,0.1)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(230,185,92,0.4)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              PERFIL <User size={16} />
            </button>
            <button 
              style={{ 
                fontSize: '0.85rem', 
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.3s ease',
                background: 'linear-gradient(135deg, var(--gold-primary), #b38b3b)',
                border: 'none',
                color: '#000',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }} 
              onClick={handleLogout}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(230,185,92,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              SAIR
            </button>
          </>
        )}
      </div>

      <style>{`
        .nav-item {
          white-space: nowrap;
        }

        @keyframes mundial-glow {
          0%, 100% { text-shadow: 0 0 8px rgba(230,185,92,0.7), 0 0 20px rgba(230,185,92,0.35); }
          50%       { text-shadow: 0 0 12px rgba(251,191,36,1), 0 0 30px rgba(251,191,36,0.6), 0 0 50px rgba(251,191,36,0.3); }
        }

        .mundial-glow {
          animation: mundial-glow 2s ease-in-out infinite;
        }

        .mundial-glow:hover {
          animation: none;
          text-shadow: 0 0 12px rgba(251,191,36,1), 0 0 30px rgba(251,191,36,0.6) !important;
        }

        @media (max-width: 768px) {
          nav {
            flex-direction: column !important;
            gap: 1rem !important;
            padding: 1rem 5% !important;
          }

          nav > div:first-child {
            order: 0;
            flex: 0 0 auto;
          }

          nav ul {
            flex-direction: row !important;
            gap: 0.8rem !important;
            font-size: 0.65rem !important;
            order: 1;
            flex: 1 1 100%;
            justify-content: center !important;
            width: 100% !important;
            flex-wrap: wrap;
          }

          nav > div:last-child {
            flex-direction: row !important;
            width: 100% !important;
            order: 2;
            gap: 0.5rem !important;
            justify-content: center !important;
            flex-wrap: wrap;
          }

          nav > div:last-child button {
            width: auto !important;
            font-size: 0.7rem !important;
            padding: 0.5rem 0.8rem !important;
          }
        }
      `}</style>
    </nav>
  );
}
