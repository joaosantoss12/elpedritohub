import { useEffect, useRef, useState } from 'react';

// Cada tema é uma bolinha bicolor: fundo (a metade escura) + acento (a
// dourado/turquesa/etc). Os valores batem com os blocos data-tema do index.css.
const TEMAS: { id: string; nome: string; fundo: string; acento: string }[] = [
  { id: 'neve',      nome: 'Neve',      fundo: '#f4f6fb', acento: '#3b6fb0' },
  { id: 'castanho',  nome: 'Castanho',  fundo: '#111726', acento: '#a17c5b' },
  { id: 'oceano',    nome: 'Oceano',    fundo: '#0e1a28', acento: '#3fa9c9' },
  { id: 'esmeralda', nome: 'Esmeralda', fundo: '#0e1d17', acento: '#35b57e' },
  { id: 'ameixa',    nome: 'Ameixa',    fundo: '#1c1226', acento: '#a97cd8' },
  { id: 'carvao',    nome: 'Carvão',    fundo: '#16161a', acento: '#9aa3b2' },
];

const CHAVE = 'ep-tema';
const CHAVE_COR = 'ep-tema-cor';
const COR_PADRAO = '#c07f4a';

// ── Derivação da cor personalizada ───────────────────────────────────────
// A partir de um só acento escolhido pelo utilizador calculamos as variantes
// (hover mais escura, light mais clara, tint translúcida). Assim a cor entra
// em todos os sítios onde a app usa --gold-*, sem precisar de bloco no CSS.
function hexParaRgb(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return [192, 127, 74];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function misturar([r, g, b]: [number, number, number], alvo: number, peso: number): string {
  const f = (c: number) => Math.round(c + (alvo - c) * peso);
  return `#${[f(r), f(g), f(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function aplicarCorPersonalizada(hex: string) {
  const raiz = document.documentElement;
  const rgb = hexParaRgb(hex);
  raiz.style.setProperty('--gold-primary', hex);
  raiz.style.setProperty('--gold-hover', misturar(rgb, 0, 0.22));   // ~22% mais escura
  raiz.style.setProperty('--gold-light', misturar(rgb, 255, 0.4));  // ~40% mais clara
  raiz.style.setProperty('--gold-tint', `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.14)`);
}

function limparCorPersonalizada() {
  const raiz = document.documentElement;
  raiz.style.removeProperty('--gold-primary');
  raiz.style.removeProperty('--gold-hover');
  raiz.style.removeProperty('--gold-light');
  raiz.style.removeProperty('--gold-tint');
}

function aplicar(id: string, cor: string) {
  if (id === 'personalizado') {
    document.documentElement.removeAttribute('data-tema');
    aplicarCorPersonalizada(cor);
    return;
  }
  limparCorPersonalizada();
  if (id === 'castanho') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', id);
}

export function SeletorTema() {
  const [tema, setTema] = useState<string>(() => {
    try { return localStorage.getItem(CHAVE) || 'castanho'; } catch { return 'castanho'; }
  });
  const [cor, setCor] = useState<string>(() => {
    try { return localStorage.getItem(CHAVE_COR) || COR_PADRAO; } catch { return COR_PADRAO; }
  });
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aplicar(tema, cor);
    try {
      localStorage.setItem(CHAVE, tema);
      localStorage.setItem(CHAVE_COR, cor);
    } catch { /* modo privado */ }
  }, [tema, cor]);

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

  const ehPersonalizado = tema === 'personalizado';
  const predefinido = TEMAS.find(t => t.id === tema) ?? TEMAS[0];
  const bolaFundo = ehPersonalizado
    ? `linear-gradient(135deg, ${TEMAS[1].fundo} 50%, ${cor} 50%)`
    : `linear-gradient(135deg, ${predefinido.fundo} 50%, ${predefinido.acento} 50%)`;

  return (
    <div ref={caixaRef} className="seletor-tema">
      <button
        type="button"
        className="seletor-tema__bola"
        title="Mudar tema"
        aria-label="Mudar tema"
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto(a => !a)}
        style={{ background: bolaFundo }}
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

          {/* A linha inteira volta a activar a cor guardada — carregar só no
              seletor de cor obrigava a re-escolher para repetir a mesma. */}
          <div
            className={`seletor-tema__opcao seletor-tema__opcao--cor${ehPersonalizado ? ' is-ativa' : ''}`}
            role="menuitemradio"
            aria-checked={ehPersonalizado}
            tabIndex={0}
            onClick={() => setTema('personalizado')}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTema('personalizado'); } }}
          >
            <span
              className="seletor-tema__amostra"
              style={{ background: `linear-gradient(135deg, ${TEMAS[1].fundo} 50%, ${cor} 50%)` }}
            />
            <span className="seletor-tema__cor-texto">Personalizada</span>
            <input
              type="color"
              className="seletor-tema__cor-input"
              value={cor}
              aria-label="Escolher cor de destaque personalizada"
              onChange={e => { setCor(e.target.value); setTema('personalizado'); }}
            />
          </div>
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
          border-radius: 10px; box-shadow: var(--shadow-card); min-width: 180px;
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
        .seletor-tema__opcao--cor { cursor: pointer; }
        .seletor-tema__opcao--cor.is-ativa { color: var(--gold-primary); }
        .seletor-tema__cor-texto { flex: 1; }
        .seletor-tema__cor-input {
          width: 28px; height: 28px; min-width: 28px; padding: 0;
          border: 1px solid var(--border-strong); border-radius: 6px;
          background: transparent; cursor: pointer;
        }
        .seletor-tema__cor-input::-webkit-color-swatch-wrapper { padding: 2px; }
        .seletor-tema__cor-input::-webkit-color-swatch { border: none; border-radius: 4px; }
        .seletor-tema__cor-input::-moz-color-swatch { border: none; border-radius: 4px; }
        @media (prefers-reduced-motion: reduce) {
          .seletor-tema__bola { transition: none; }
        }
      `}</style>
    </div>
  );
}
