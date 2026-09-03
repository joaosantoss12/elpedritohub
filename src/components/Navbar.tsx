import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, SquareArrowRight, Menu, X, LogOut } from 'lucide-react';
import { SinoNotificacoes } from './SinoNotificacoes';
import { SeletorTema } from './SeletorTema';

// A ordem aqui é a ordem da IA do Hub. Ver EPC Personal Desk · Execução.
// authOnly: páginas que redirecionam para /login ou ficam bloqueadas sem conta —
// não faz sentido mostrá-las no menu a quem ainda não tem sessão iniciada.
const NAV_LINKS: { label: string; path: string; authOnly?: boolean }[] = [
  { label: 'SALAS DE JOGO', path: '/salas', authOnly: true },
  { label: 'ARENA',          path: '/arena', authOnly: true },
  { label: 'RECOMPENSAS',    path: '/recompensas', authOnly: true },
  { label: 'SOCIAL',         path: '/clas', authOnly: true },
  { label: 'BANCA',          path: '/banca', authOnly: true },
  { label: 'EL PEDRITO',     path: '/el-pedrito' },
  { label: 'CASINO',         path: '/casino' },
  { label: 'PLANOS',         path: '/plans' },
  { label: 'SUPORTE',        path: '/suporte', authOnly: true },
];

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, membro, signOut } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);

  // Fecha o menu mobile sempre que se muda de página.
  useEffect(() => { setMenuAberto(false); }, [location.pathname]);

  // Trava o scroll do body enquanto o menu mobile está aberto.
  useEffect(() => {
    if (!menuAberto) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [menuAberto]);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const irPara = (path: string) => { setMenuAberto(false); navigate(path); };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : (location.pathname === path || location.pathname.startsWith(path + '/'));

  return (
    <nav className="epc-nav" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem 5%',
      borderBottom: '1px solid var(--border-color)',
      position: 'sticky',
      top: 0,
      background: 'rgba(13, 18, 32, 0.9)',
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
          justifyContent: 'center',
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
                e.currentTarget.style.background = 'var(--gold-tint)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(161, 124, 91,0.4)';
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
                background: 'linear-gradient(135deg, var(--gold-primary), #8a6144)',
                border: 'none',
                color: '#0d1220',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              onClick={() => navigate('/register')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(161, 124, 91,0.4)';
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
          <SeletorTema />
          <SinoNotificacoes />
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
                e.currentTarget.style.background = 'var(--gold-tint)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(161, 124, 91,0.4)';
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
          {membro?.badges?.includes('Administrador') && (
            <button
              style={{
                fontSize: '0.85rem',
                padding: '0.6rem 1.2rem',
                background: '#901010',
                border: 'none',
                color: '#dce3ee',
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
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(161, 124, 91,0.4)';
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
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.3s ease',
                background: 'linear-gradient(135deg, var(--gold-primary), #8a6144)',
                border: 'none',
                color: '#0d1220',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              onClick={handleLogout}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(161, 124, 91,0.4)';
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

      {/* BOTÃO HAMBÚRGUER (só mobile) */}
      <button
        className="epc-nav__burger"
        aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={menuAberto}
        onClick={() => setMenuAberto(v => !v)}
      >
        {menuAberto ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* PAINEL DE NAVEGAÇÃO MOBILE — em portal no body para não ser recortado
          pelo <nav> (que cria bloco de contexto por causa do backdrop-filter) */}
      {menuAberto && createPortal(
        <>
          <div className="epc-nav__backdrop" onClick={() => setMenuAberto(false)} />
          <div className="epc-nav__mobile">
            <ul>
              {NAV_LINKS.filter(link => !link.authOnly || user).map(link => (
                <li
                  key={link.path}
                  className={isActive(link.path) ? 'on' : undefined}
                  onClick={() => irPara(link.path)}
                >
                  {link.label}
                </li>
              ))}
            </ul>
            <div className="epc-nav__mobile-acoes">
              {!user ? (
                <>
                  <button className="epc-nav__mobile-btn" onClick={() => irPara('/login')}>
                    ENTRAR <SquareArrowRight size={16} />
                  </button>
                  <button className="epc-nav__mobile-btn epc-nav__mobile-btn--cheio" onClick={() => irPara('/register')}>
                    REGISTAR
                  </button>
                </>
              ) : (
                <>
                  <button className="epc-nav__mobile-btn" onClick={() => irPara('/profile')}>
                    <User size={16} /> Perfil
                  </button>
                  {membro?.badges?.includes('Administrador') && (
                    <button
                      className="epc-nav__mobile-btn"
                      style={{ background: '#901010', color: '#dce3ee', borderColor: '#901010' }}
                      onClick={() => irPara('/admin')}
                    >
                      ADMIN
                    </button>
                  )}
                  <button
                    className="epc-nav__mobile-btn epc-nav__mobile-btn--cheio"
                    onClick={() => { setMenuAberto(false); handleLogout(); }}
                  >
                    <LogOut size={16} /> Sair
                  </button>
                </>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}

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

        .epc-nav__burger {
          display: none;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--gold-primary);
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .epc-nav {
            padding: 0.7rem 3.5% !important;
            gap: 0.5rem !important;
            flex-wrap: nowrap !important;
          }

          .epc-nav-auth {
            gap: 0.5rem !important;
          }

          .epc-nav__burger {
            width: 40px;
            height: 40px;
          }

          .epc-nav-links {
            display: none !important;
          }

          /* Mantém só a bola de temas + o sino no topo; os botões (perfil,
             admin, sair, entrar, registar) passam para o painel mobile. */
          .epc-nav-auth > button {
            display: none !important;
          }

          .epc-nav__burger {
            display: flex;
          }

          .epc-nav__backdrop {
            position: fixed;
            inset: 0;
            top: 0;
            background: rgba(5, 8, 16, 0.6);
            backdrop-filter: blur(2px);
            z-index: 98;
          }

          .epc-nav__mobile {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(300px, 84vw);
            background: var(--bg-elevated, #0d1220);
            border-left: 1px solid var(--border-color);
            box-shadow: -20px 0 50px rgba(0, 0, 0, 0.5);
            z-index: 99;
            padding: 5rem 1.3rem 2rem;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 1.4rem;
            animation: epc-nav-slide 0.22s ease-out;
          }

          @keyframes epc-nav-slide {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }

          .epc-nav__mobile ul {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
          }

          .epc-nav__mobile li {
            padding: 0.9rem 0.4rem;
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--text-gray);
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
          }

          .epc-nav__mobile li.on {
            color: var(--gold-primary);
          }

          .epc-nav__mobile-acoes {
            display: flex;
            flex-direction: column;
            gap: 0.7rem;
            margin-top: auto;
          }

          .epc-nav__mobile-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
            padding: 0.85rem 1rem;
            font-size: 0.9rem;
            font-weight: 700;
            border-radius: 10px;
            cursor: pointer;
            background: transparent;
            border: 1.5px solid var(--gold-primary);
            color: var(--gold-primary);
          }

          .epc-nav__mobile-btn--cheio {
            background: linear-gradient(135deg, var(--gold-primary), #8a6144);
            border: none;
            color: #0d1220;
          }
        }
      `}</style>
    </nav>
  );
}
