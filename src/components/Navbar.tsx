import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, SquareArrowRight } from 'lucide-react';

// A ordem aqui é a ordem da IA do Hub. Ver EPC Personal Desk · Execução.
// authOnly: páginas que redirecionam para /login ou ficam bloqueadas sem conta —
// não faz sentido mostrá-las no menu a quem ainda não tem sessão iniciada.
const NAV_LINKS: { label: string; path: string; authOnly?: boolean }[] = [
  { label: 'RAIO-X',         path: '/passaporte' },
  { label: 'SALA DE COMANDO', path: '/sala' },
  { label: 'SALAS DE JOGO', path: '/salas', authOnly: true },
  { label: 'BANCA',          path: '/banca', authOnly: true },
  { label: 'RANKING ROI',    path: '/ranking', authOnly: true },
  { label: 'SIMULADOR',      path: '/simulador', authOnly: true },
  { label: 'PRÉMIOS',        path: '/premios' },
  { label: 'PLANOS',         path: '/plans' },
  { label: 'SUPORTE',        path: '/suporte', authOnly: true },
];

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, membro, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <nav className="epc-nav" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 5%',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      background: 'rgba(10, 10, 10, 0.95)',
      backdropFilter: 'blur(10px)',
      zIndex: 100,
      gap: '1rem'
    }}>
      {/* LOGO */}
      <div
        className="epc-nav-logo"
        style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
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
      <ul
        className="epc-nav-links"
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth) {
            el.scrollLeft += e.deltaY;
          }
        }}
        style={{
          display: 'flex',
          gap: '1.4rem',
          listStyle: 'none',
          color: 'var(--text-gray)',
          fontSize: '0.85rem',
          fontWeight: '600',
          cursor: 'pointer',
          zIndex: 99,
          whiteSpace: 'nowrap',
          flex: '1 1 auto',
          minWidth: 0,
          overflowX: 'auto',
          padding: '0.2rem 1.4rem 0.6rem 1.4rem'
        }}>
        {NAV_LINKS.filter(link => !link.authOnly || user).map(link => {
          const active = isActive(link.path);
          return (
            <li
              key={link.path}
              className={`nav-item${active ? ' nav-item--active' : ''}`}
              onClick={() => navigate(link.path)}
              style={{
                transition: 'all 0.3s ease',
                position: 'relative',
                color: active ? 'var(--gold-primary)' : 'var(--text-gray)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold-primary)'; }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = active ? 'var(--gold-primary)' : 'var(--text-gray)';
              }}
            >
              {link.label}
            </li>
          );
        })}
      </ul>

      {/* AUTH BUTTONS */}
      <div className="epc-nav-auth" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexShrink: 0 }}>
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
              className="nav-passaporte-btn"
              title="Passaporte — gere a tua conta, subscrição e progresso"
              style={{
                fontSize: '0.85rem',
                padding: '0.6rem 0.7rem',
                background: 'transparent',
                border: '1.5px solid var(--gold-primary)',
                color: 'var(--gold-primary)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
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
              <User size={16} />
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

        .nav-item--active::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -6px;
          height: 2px;
          border-radius: 2px;
          background: var(--gold-primary);
        }

        .nav-plan-chip:hover {
          transform: scale(1.05);
        }

        .epc-nav-links {
          scrollbar-width: thin;
          scrollbar-color: var(--gold-primary) transparent;
          /* Esbate os dois lados por igual — o padding esquerdo/direito da
             lista é simétrico, por isso o fade também tem de ser. */
          mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent);
        }

        .epc-nav-links::-webkit-scrollbar {
          height: 3px;
        }

        .epc-nav-links::-webkit-scrollbar-thumb {
          background: var(--gold-primary);
          border-radius: 3px;
        }

        .epc-nav-links::-webkit-scrollbar-track {
          background: transparent;
        }

        /* O Chromium/Edge desenham setas de avanço/recuo nas pontas da
           scrollbar quando o SO força "sempre visível" — cortavam o último
           item (SUPORTE). Sem elas a scrollbar fica só a barra fina dourada. */
        .epc-nav-links::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
        }

        /* Shrink progressively so the links stay visible (not scrolled-away)
           down to laptop widths; only very narrow desktop windows need to scroll. */
        @media (max-width: 1700px) {
          .epc-nav-links {
            gap: 1rem !important;
          }
        }

        @media (max-width: 1500px) {
          .epc-nav-links {
            gap: 0.7rem !important;
            font-size: 0.78rem !important;
          }

          .epc-nav-auth {
            gap: 0.6rem !important;
          }

          .epc-nav-auth button {
            padding: 0.5rem 0.9rem !important;
            font-size: 0.78rem !important;
          }
        }

        @media (max-width: 1300px) {
          .epc-nav-logo span:first-child {
            font-size: 1.8rem !important;
          }

          .epc-nav-links {
            gap: 0.5rem !important;
            font-size: 0.72rem !important;
          }

          .epc-nav-auth button {
            padding: 0.45rem 0.7rem !important;
            font-size: 0.72rem !important;
            gap: 0.35rem !important;
          }
        }

        @media (max-width: 1100px) {
          .epc-nav-logo > div {
            display: none;
          }

          .epc-nav-links {
            gap: 0.4rem !important;
            font-size: 0.68rem !important;
          }
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
            overflow-x: visible !important;
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
