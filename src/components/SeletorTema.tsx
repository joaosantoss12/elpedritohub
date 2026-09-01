import { useEffect, useRef, useState } from 'react';

// Cada tema é uma bolinha bicolor: fundo (a metade escura) + acento (a
// dourado/turquesa/etc). Os valores batem com os blocos data-tema do index.css.
const TEMAS: { id: string; nome: string; fundo: string; acento: string }[] = [
  { id: 'castanho',  nome: 'Castanho',  fundo: '#111726', acento: '#a17c5b' },
  { id: 'oceano',    nome: 'Oceano',    fundo: '#0e1a28', acento: '#3fa9c9' },
  { id: 'esmeralda', nome: 'Esmeralda', fundo: '#0e1d17', acento: '#35b57e' },
  { id: 'ameixa',    nome: 'Ameixa',    fundo: '#1c1226', acento: '#a97cd8' },
  { id: 'carvao',    nome: 'Carvão',    fundo: '#16161a', acento: '#9aa3b2' },
];

const CHAVE = 'ep-tema';

function aplicar(id: string) {
  if (id === 'castanho') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', id);
}

export function SeletorTema() {
  const [tema, setTema] = useState<string>(() => {
    try { return localStorage.getItem(CHAVE) || 'castanho'; } catch { return 'castanho'; }
  });
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aplicar(tema);
    try { localStorage.setItem(CHAVE, tema); } catch { /* modo privado */ }
  }, [tema]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const atual = TEMAS.find(t => t.id === tema) ?? TEMAS[0];

  return (
    <div ref={caixaRef} className="seletor-tema">
      <button
        type="button"
        className="seletor-tema__bola"
        title="Mudar tema"
        aria-label="Mudar tema"
        aria-expanded={aberto}
        onClick={() => setAberto(a => !a)}
        style={{ background: `linear-gradient(135deg, ${atual.fundo} 50%, ${atual.acento} 50%)` }}
      />
      {aberto && (
        <div className="seletor-tema__painel" role="menu">
          {TEMAS.map(t => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === tema}
              className={`seletor-tema__opcao${t.id === tema ? ' is-ativa' : ''}`}
              onClick={() => { setTema(t.id); setAberto(false); }}
            >
              <span
                className="seletor-tema__amostra"
                style={{ background: `linear-gradient(135deg, ${t.fundo} 50%, ${t.acento} 50%)` }}
              />
              {t.nome}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .seletor-tema { position: relative; display: flex; align-items: center; flex-shrink: 0; }
        .seletor-tema__bola {
          width: 26px; height: 26px; border-radius: 50%; padding: 0;
          border: 1.5px solid var(--border-strong); cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .seletor-tema__bola:hover {
          transform: scale(1.1);
          box-shadow: 0 0 0 4px var(--gold-tint);
        }
        .seletor-tema__painel {
          position: absolute; top: calc(100% + 10px); right: 0; z-index: 200;
          display: flex; flex-direction: column; gap: 2px; padding: 6px;
          background: var(--bg-card); border: 1px solid var(--border-strong);
          border-radius: 10px; box-shadow: var(--shadow-card); min-width: 160px;
        }
        .seletor-tema__opcao {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 8px 10px; background: transparent; border: none; border-radius: 7px;
          color: var(--text-gray); font-size: 0.82rem; font-weight: 600;
          cursor: pointer; text-align: left; transition: background 0.15s ease, color 0.15s ease;
        }
        .seletor-tema__opcao:hover { background: var(--surface-sunken); color: var(--text-white); }
        .seletor-tema__opcao.is-ativa { color: var(--gold-primary); }
        .seletor-tema__amostra {
          width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
          border: 1px solid var(--border-strong);
        }
        @media (prefers-reduced-motion: reduce) {
          .seletor-tema__bola { transition: none; }
        }
      `}</style>
    </div>
  );
}
