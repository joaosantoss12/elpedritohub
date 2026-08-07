import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { carregarCanais, fmtHandle, type CanalTelegram } from '../lib/canais';
import '../styles/Canais.css';

/**
 * Aviso de segurança — roadmap 9, o ponto marcado como URGENTE.
 *
 * Há perfis a imitar a marca e a pedir pagamentos por mensagem privada. O risco
 * é financeiro para o membro, não apenas reputacional, por isso o aviso aparece
 * em todas as páginas de entrada e não fica escondido atrás de login.
 *
 * Não é dispensável pelo utilizador de propósito: um banner que se fecha uma vez
 * deixa de proteger exatamente quem chega novo.
 */
export function AvisoPerfisFalsos({ compacto = false }: { compacto?: boolean } = {}) {
  const navigate = useNavigate();
  const [falsos, setFalsos] = useState<CanalTelegram[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarCanais({ tipo: 'falso' }).then(res => {
      if (ativo) { setFalsos(res); setCarregado(true); }
    });
    return () => { ativo = false; };
  }, []);

  // Sem perfis falsos registados não há nada de concreto a denunciar, e um
  // aviso genérico só semeia dúvida sem dar ao membro como se defender.
  if (!carregado || falsos.length === 0) return null;

  return (
    <div className={`aviso-falsos${compacto ? ' aviso-falsos--compacto' : ''}`}>
      <ShieldAlert size={compacto ? 18 : 22} className="aviso-falsos__icon" />

      <div className="aviso-falsos__corpo">
        <strong className="aviso-falsos__titulo">
          Atenção a perfis falsos no Telegram
        </strong>
        <p className="aviso-falsos__texto">
          O El Pedrito <strong>nunca pede pagamentos por mensagem privada</strong>.
          {' '}O acesso VIP faz-se sempre aqui no Hub.
          {!compacto && (
            <>
              {' '}Já foram identificados{' '}
              {falsos.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && (i === falsos.length - 1 ? ' e ' : ', ')}
                  <code className="aviso-falsos__handle">{fmtHandle(c.handle) ?? c.nome}</code>
                </span>
              ))}
              {' '}a usar o nome e o visual do Pedrito.
            </>
          )}
        </p>
      </div>

      <button className="aviso-falsos__cta" onClick={() => navigate('/sala', { state: { aba: 'canais' } })}>
        Ver canais oficiais <ArrowRight size={14} />
      </button>
    </div>
  );
}
