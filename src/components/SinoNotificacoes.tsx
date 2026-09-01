import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarNotificacoes, marcarNotificacoesLidas, subscreverNotificacoes,
  type Notificacao,
} from '../lib/hub';
import '../styles/Notificacoes.css';

/**
 * O sino da navbar.
 *
 * Só avisa do que a pessoa não podia saber sozinha: uma missão que fechou,
 * um palpite que se resolveu, um jackpot sorteado. O resto vê-se na página
 * onde acontece — encher o sino de barulho é a maneira mais rápida de ensinar
 * toda a gente a ignorá-lo.
 */
export function SinoNotificacoes() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const porLer = notificacoes.filter((n) => !n.lida).length;

  const carregar = useCallback(async () => {
    setNotificacoes(await carregarNotificacoes(30));
  }, []);

  useEffect(() => {
    if (!user) { setNotificacoes([]); return; }
    void carregar();
    // O realtime evita o polling: a maior parte do tempo não há nada para
    // dizer, e um pedido de minuto a minuto por membro não se justifica.
    return subscreverNotificacoes(user.id, (n) => {
      setNotificacoes((atual) => (atual.some((x) => x.id === n.id) ? atual : [n, ...atual]));
    });
  }, [user, carregar]);

  // Fechar ao clicar fora — um painel destes não deve exigir voltar ao sino.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  if (!user) return null;

  async function alternar() {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (!vaiAbrir) return;

    await carregar();
    // Abrir é ler. Marca-se em otimista para o contador cair já, e o servidor
    // confirma a seguir — se falhar, a próxima abertura corrige.
    if (porLer > 0) {
      setNotificacoes((atual) => atual.map((n) => ({ ...n, lida: true })));
      void marcarNotificacoesLidas();
    }
  }

  function abrirNotificacao(n: Notificacao) {
    setAberto(false);
    if (n.url) navigate(n.url);
  }

  return (
    <div className='nt-sino' ref={caixa}>
      <button className='nt-botao' onClick={() => { void alternar(); }} title='Notificações'>
        <Bell size={18} />
        {porLer > 0 && <span className='nt-bolha'>{porLer > 9 ? '9+' : porLer}</span>}
      </button>

      {aberto && (
        <div className='nt-painel'>
          <div className='nt-topo'>
            <strong>Notificações</strong>
            {notificacoes.length > 0 && (
              <span className='nt-lidas'><CheckCheck size={13} /> tudo lido</span>
            )}
          </div>

          {notificacoes.length === 0 ? (
            <div className='nt-vazio'>Ainda não há nada para te dizer.</div>
          ) : (
            <div className='nt-lista'>
              {notificacoes.map((n) => (
                <button key={n.id}
                        className={`nt-item ${n.lida ? '' : 'nova'} ${n.url ? 'clicavel' : ''}`}
                        onClick={() => abrirNotificacao(n)}>
                  <div className='nt-item-titulo'>{n.titulo}</div>
                  {n.corpo && <div className='nt-item-corpo'>{n.corpo}</div>}
                  <div className='nt-item-quando'>{quando(n.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "há 3 min", "ontem" — o relógio exacto não interessa a ninguém aqui. */
function quando(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';

  const minutos = Math.round((Date.now() - t) / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  if (horas < 48) return 'ontem';

  return new Date(t).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}
