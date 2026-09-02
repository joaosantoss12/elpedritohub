import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2, MessageSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import type { MensagemSala } from '../lib/salasJogo';

/* Chat da sala como janela flutuante:
   - ícone fechado, arrastável; clicar abre o painel
   - painel aberto: arrastável pela barra de título, pode ir a full screen ou
     encolher outra vez para ícone
   O estado de posição/modo fica só em memória — é conveniência da sessão. */

type Modo = 'icone' | 'aberto' | 'full';

interface Props {
  mensagens: MensagemSala[];
  carregado: boolean;
  erro: string | null;
  texto: string;
  onTexto: (v: string) => void;
  onEnviar: () => void;
  enviando: boolean;
  onApagar: (id: string) => void;
  userId: string;
  isAdmin: boolean;
}

const MARGEM = 16;
const LARGURA = 360;
const ALTURA = 520;
const ICONE = 60;

/* Arranca como ícone no canto inferior direito, mas acima da barra do leitor
   de música quando ela está aberta (senão o ícone ficava por cima dela). */
function margemBaixo() {
  if (typeof document !== 'undefined'
    && document.body.classList.contains('tem-leitor-musica')) {
    return 88;
  }
  return MARGEM;
}

function posInicial() {
  if (typeof window === 'undefined') return { x: MARGEM, y: MARGEM };
  return {
    x: Math.max(MARGEM, window.innerWidth - ICONE - MARGEM),
    y: Math.max(MARGEM, window.innerHeight - ICONE - margemBaixo()),
  };
}

export function ChatFlutuante({
  mensagens, carregado, erro, texto, onTexto, onEnviar, enviando, onApagar, userId, isAdmin,
}: Props) {
  const [modo, setModo] = useState<Modo>('icone');
  const [pos, setPos] = useState(posInicial);
  const [novasDesde, setNovasDesde] = useState(0);

  const fundoRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ px: number; py: number; baseX: number; baseY: number; moveu: boolean } | null>(null);
  /* Enquanto o utilizador não arrastar, o ícone segue o canto — e sobe/desce
     conforme a barra do leitor de música abre ou fecha. */
  const mexido = useRef(false);

  /* O leitor de música (barra em baixo) marca `body.tem-leitor-musica`. Sempre
     que isso muda, reencosta o ícone ao canto por cima dela. */
  useEffect(() => {
    const recolocar = () => { if (!mexido.current) setPos(posInicial()); };
    recolocar();
    const mo = new MutationObserver(recolocar);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  /* Contagem de mensagens novas enquanto está fechado. */
  useEffect(() => {
    if (modo === 'icone') return;
    setNovasDesde(mensagens.length);
  }, [modo, mensagens.length]);
  const naoLidas = modo === 'icone' ? Math.max(0, mensagens.length - novasDesde) : 0;

  /* Scroll ao fundo quando chega mensagem ou quando se abre o painel. */
  useLayoutEffect(() => {
    if (modo !== 'icone') fundoRef.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length, modo]);

  /* Se a janela encolher, não deixar o painel/ícone fora de vista. */
  useEffect(() => {
    const reencaixar = () => {
      setPos(p => ({
        x: Math.min(Math.max(MARGEM, p.x), window.innerWidth - 60),
        y: Math.min(Math.max(MARGEM, p.y), window.innerHeight - 60),
      }));
    };
    window.addEventListener('resize', reencaixar);
    return () => window.removeEventListener('resize', reencaixar);
  }, []);

  // Captura-se sempre o `currentTarget` (o botão do ícone ou a barra do painel),
  // nunca o `e.target` — que pode ser o SVG/texto lá dentro e fazia o primeiro
  // arrasto falhar por o pointer capture saltar de elemento.
  const onPointerDown = (e: React.PointerEvent) => {
    if (modo === 'full') return;
    // Carregar num botão de acção da barra (expandir/fechar) não arranca arrasto.
    const btn = (e.target as HTMLElement).closest('button');
    if (btn && btn !== e.currentTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { px: e.clientX, py: e.clientY, baseX: pos.x, baseY: pos.y, moveu: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const a = arrasto.current;
    if (!a) return;
    const dx = e.clientX - a.px;
    const dy = e.clientY - a.py;
    if (!a.moveu && Math.abs(dx) + Math.abs(dy) > 3) { a.moveu = true; mexido.current = true; }
    if (!a.moveu) return;
    const larg = modo === 'aberto' ? LARGURA : ICONE;
    const alt = modo === 'aberto' ? ALTURA : ICONE;
    setPos({
      x: Math.min(Math.max(MARGEM, a.baseX + dx), window.innerWidth - larg - MARGEM),
      y: Math.min(Math.max(MARGEM, a.baseY + dy), window.innerHeight - alt - MARGEM),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const a = arrasto.current;
    arrasto.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ok */ }
    // Só o ícone abre com um clique. Na barra do painel aberto, um clique sem
    // arrasto não faz nada — fechar/expandir é nos botões, senão o clique no
    // "expandir" fechava logo o chat.
    if (a && !a.moveu && modo === 'icone') setModo('aberto');
  };

  if (modo === 'icone') {
    return (
      <button
        className="chat-flut__icone"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Abrir chat do jogo"
      >
        <MessageSquare size={22} />
        {naoLidas > 0 && <span className="chat-flut__badge">{naoLidas > 9 ? '9+' : naoLidas}</span>}
        <style>{ESTILO}</style>
      </button>
    );
  }

  // O painel é maior que o ícone: encosta-o à vista a partir da posição do ícone.
  const estiloPainel = modo === 'full'
    ? undefined
    : {
        left: Math.max(MARGEM, Math.min(pos.x, window.innerWidth - LARGURA - MARGEM)),
        top: Math.max(MARGEM, Math.min(pos.y, window.innerHeight - ALTURA - MARGEM)),
        width: LARGURA,
        height: ALTURA,
      };

  return (
    <div className={`chat-flut chat-flut--${modo}`} style={estiloPainel}>
      <div
        className="chat-flut__barra"
        onPointerDown={modo === 'aberto' ? onPointerDown : undefined}
        onPointerMove={modo === 'aberto' ? onPointerMove : undefined}
        onPointerUp={modo === 'aberto' ? onPointerUp : undefined}
      >
        <span className="chat-flut__titulo"><MessageSquare size={15} /> Chat do jogo</span>
        <div className="chat-flut__acoes">
          {modo === 'full' ? (
            <button onClick={() => setModo('aberto')} aria-label="Reduzir"><Minimize2 size={15} /></button>
          ) : (
            <button onClick={() => setModo('full')} aria-label="Ecrã inteiro"><Maximize2 size={15} /></button>
          )}
          <button onClick={() => setModo('icone')} aria-label="Fechar para ícone"><X size={16} /></button>
        </div>
      </div>

      <div className="chat-flut__mensagens">
        {!carregado ? (
          <div className="salas-loading">
            <Loader2 size={22} className="salas-spin" color="var(--gold-primary)" />
          </div>
        ) : mensagens.length === 0 ? (
          <p className="sala-jogo__vazio">Ainda não há comentários neste jogo. Começa tu.</p>
        ) : (
          mensagens.map(m => (
            <div key={m.id} className={m.user_id === userId ? 'msg msg--eu' : 'msg'}>
              <div className="msg__topo">
                <strong>{m.username}</strong>
                <span>
                  {new Date(m.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {(m.user_id === userId || isAdmin) && (
                  <button className="msg__apagar" onClick={() => onApagar(m.id)} aria-label="Apagar">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <p>{m.texto}</p>
            </div>
          ))
        )}
        <div ref={fundoRef} />
      </div>

      {erro && <p className="sala-jogo__erro">{erro}</p>}

      <div className="sala-jogo__barra">
        <input
          value={texto}
          maxLength={500}
          placeholder="Comentar este jogo…"
          onChange={e => onTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onEnviar(); }}
        />
        <button onClick={onEnviar} disabled={enviando || !texto.trim()}>
          {enviando ? <Loader2 size={15} className="salas-spin" /> : <Send size={15} />}
        </button>
      </div>

      <style>{ESTILO}</style>
    </div>
  );
}

const ESTILO = `
.chat-flut__icone {
  position: fixed;
  z-index: 1200;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 1px solid var(--gold-primary);
  background: linear-gradient(135deg, var(--gold-primary), #8a6144);
  color: #0d1220;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
  touch-action: none;
}
.chat-flut__icone:active { cursor: grabbing; }

.chat-flut__badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-flut {
  position: fixed;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}
.chat-flut--full {
  inset: 12px;
  width: auto !important;
  height: auto !important;
  border-radius: 14px;
}

.chat-flut__barra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-color);
  touch-action: none;
}
.chat-flut--aberto .chat-flut__barra { cursor: grab; }
.chat-flut--aberto .chat-flut__barra:active { cursor: grabbing; }

.chat-flut__titulo {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--text-white);
}

.chat-flut__acoes { display: flex; gap: 0.15rem; }
.chat-flut__acoes button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-gray);
  cursor: pointer;
}
.chat-flut__acoes button:hover { background: var(--surface-sunken-hover); color: var(--text-white); }

.chat-flut__mensagens {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

@media (max-width: 560px) {
  .chat-flut:not(.chat-flut--full) {
    left: 12px !important;
    right: 12px;
    width: auto !important;
    top: auto !important;
    bottom: 12px;
    height: 70vh !important;
  }
}
`;
