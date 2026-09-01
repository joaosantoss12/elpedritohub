import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Gift, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { carregarDropAtivo, reclamarDrop, segundosRestantes, type DropAtivo } from '../lib/drops';
import '../styles/Gamificacao.css';

/** De quanto em quanto tempo se pergunta se há drop. */
const INTERVALO_SONDA = 20_000;

/**
 * Quantos widgets presos a um jogo estão montados neste momento.
 *
 * O widget global (montado no App) e o da sala mostrariam dois cartões
 * sobrepostos no mesmo canto. Enquanto houver um preso a um jogo — que já
 * apanha os drops gerais *e* os desse jogo — o global cala-se.
 */
let escopadosMontados = 0;
const ouvintes = new Set<() => void>();

function subscrever(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

function haEscopado() {
  return escopadosMontados > 0;
}

/**
 * O cartão de EPC DROP, montado em todas as páginas com sessão iniciada.
 *
 * Sonda o servidor de vinte em vinte segundos. Não usa realtime de propósito:
 * uma subscrição permanente por cada separador aberto custa mais do que um
 * pedido leve, e um atraso de segundos numa janela de 30–60s é aceitável —
 * o drop está desenhado para ser apanhado, não para ser perdido por rede.
 */
export function DropWidget({ eventoId }: { eventoId?: string }) {
  const { user, refreshMembro } = useAuth();
  const [drop, setDrop] = useState<DropAtivo | null>(null);
  const [reclamado, setReclamado] = useState(false);
  const [aReclamar, setAReclamar] = useState(false);
  const [erro, setErro] = useState('');
  const [, setTique] = useState(0);
  // Drops já dispensados nesta sessão, para um drop fechado não voltar a
  // aparecer só porque a sonda correu outra vez.
  const vistos = useRef<Set<string>>(new Set());
  const escopadoAtivo = useSyncExternalStore(subscrever, haEscopado, haEscopado);

  useEffect(() => {
    if (!eventoId) return;
    escopadosMontados += 1;
    ouvintes.forEach((f) => f());
    return () => {
      escopadosMontados -= 1;
      ouvintes.forEach((f) => f());
    };
  }, [eventoId]);

  const sondar = useCallback(async () => {
    if (!user) return;
    const d = await carregarDropAtivo(eventoId);
    if (!d || vistos.current.has(d.id)) {
      setDrop(null);
      return;
    }
    setDrop(d);
    setReclamado(d.reclamado);
  }, [user, eventoId]);

  useEffect(() => {
    void sondar();
    const t = setInterval(() => void sondar(), INTERVALO_SONDA);
    return () => clearInterval(t);
  }, [sondar]);

  // Contador local. Quando chega a zero o cartão desaparece sozinho.
  useEffect(() => {
    if (!drop) return;
    const t = setInterval(() => {
      if (segundosRestantes(drop) <= 0) {
        vistos.current.add(drop.id);
        setDrop(null);
      }
      setTique((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [drop]);

  if (!user || !drop) return null;
  if (!eventoId && escopadoAtivo) return null;

  const restam = segundosRestantes(drop);

  async function reclamar() {
    if (!drop) return;
    setErro('');
    setAReclamar(true);
    try {
      await reclamarDrop(drop.id);
      setReclamado(true);
      await refreshMembro();
      // Fica dois segundos a mostrar que resultou, e sai.
      setTimeout(() => {
        vistos.current.add(drop.id);
        setDrop(null);
      }, 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível reclamar.');
    } finally {
      setAReclamar(false);
    }
  }

  return (
    <div className='gm-drop'>
      <div className='gm-drop-titulo'>
        <Gift size={17} />
        {drop.titulo}
      </div>
      <div className='gm-drop-valor'>+{drop.valor} EPC</div>
      <div className='gm-drop-contagem'>
        {drop.jogo_label ? `${drop.jogo_label} · ` : ''}
        fecha em {restam}s
      </div>

      {erro && <div className='gm-erro' style={{ marginBottom: 10 }}>{erro}</div>}

      <button className='gm-btn' onClick={reclamar} disabled={reclamado || aReclamar}>
        {reclamado
          ? <><Check size={15} /> Apanhado</>
          : aReclamar ? 'A reclamar…' : 'Reclamar'}
      </button>
    </div>
  );
}
