import { useEffect, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, Wallet, PlusCircle, CheckCircle2,
  CalendarDays, BarChart3, ShieldCheck, LogIn,
} from 'lucide-react';

/* Tutorial da Banca — modal com passos. É só leitura, não toca em dados;
   serve para quem abre a página pela primeira vez perceber o fluxo. */

type Passo = {
  icone: React.ReactNode;
  titulo: string;
  corpo: React.ReactNode;
};

const PASSOS: Passo[] = [
  {
    icone: <BarChart3 size={22} />,
    titulo: 'O que é a Banca',
    corpo: (
      <>
        É o teu registo de apostas. Metes cada aposta, marcas o resultado e a
        página mostra-te a evolução do saldo, o ROI e os teus hábitos ao longo
        do tempo. Os dados são teus e ficam ligados à tua conta.
      </>
    ),
  },
  {
    icone: <Wallet size={22} />,
    titulo: 'Define a banca inicial',
    corpo: (
      <>
        Carrega em <strong>«Banca inicial»</strong> no topo (ou no lápis do
        cartão <em>Saldo Inicial</em>) e mete o valor com que começaste. É a
        base de tudo — o ROI e os gráficos são calculados a partir daí, por
        isso vale a pena acertá-lo antes de registares apostas.
      </>
    ),
  },
  {
    icone: <PlusCircle size={22} />,
    titulo: 'Regista uma aposta',
    corpo: (
      <>
        Botão <strong>«Nova Aposta»</strong>. Escolhe <em>Simples</em> ou{' '}
        <em>Múltipla</em>, o desporto, o confronto, o mercado, a odd e o valor
        apostado. Podes datá-la no dia certo e deixá-la como{' '}
        <em>pendente</em> para resolver mais tarde.
      </>
    ),
  },
  {
    icone: <CheckCircle2 size={22} />,
    titulo: 'Resolve o resultado',
    corpo: (
      <>
        Quando o jogo acaba, edita a aposta e marca-a <strong>Ganha</strong> ou{' '}
        <strong>Perdida</strong>. O lucro/prejuízo e o saldo atual atualizam-se
        sozinhos. Numa múltipla, só conta como ganha se todas as seleções
        entrarem.
      </>
    ),
  },
  {
    icone: <CalendarDays size={22} />,
    titulo: 'Navega no tempo',
    corpo: (
      <>
        A barra <strong>Desde sempre · Ano · Mês · Dia</strong> filtra os
        números, o gráfico e a tabela. No calendário, cada dia mostra o
        resultado (verde = lucro, vermelho = perda, ponto = pendente) — clica
        num dia para ver as apostas desse dia.
      </>
    ),
  },
  {
    icone: <BarChart3 size={22} />,
    titulo: 'Lê os indicadores',
    corpo: (
      <>
        <strong>Lucro/Prejuízo</strong> e <strong>ROI</strong> resumem o
        período escolhido. <em>Taxa de vitória</em>, <em>sequência</em>,{' '}
        <em>odd média</em> e <em>aposta média</em> ajudam a perceber o teu
        padrão. O gráfico mostra o lucro acumulado ao longo do período.
      </>
    ),
  },
  {
    icone: <ShieldCheck size={22} />,
    titulo: 'Canal público e Excel',
    corpo: (
      <>
        O painel <strong>«Canal público»</strong> mostra as tips auditadas dos
        últimos 90 dias — publicadas antes do jogo, resultado registado depois.
        Podes importá-las para a tua banca com um clique.{' '}
        <strong>«Descarregar Excel»</strong> exporta tudo o que tens registado.
      </>
    ),
  },
  {
    icone: <LogIn size={22} />,
    titulo: 'Precisas de ajuda?',
    corpo: (
      <>
        Se te baralhares na gestão de banca ou tiveres dúvidas sobre os
        números, fala com o suporte pelo link no fundo da página.
      </>
    ),
  },
];

export function TutorialBanca({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!aberto) return;
    setI(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
      if (e.key === 'ArrowRight') setI(v => Math.min(v + 1, PASSOS.length - 1));
      if (e.key === 'ArrowLeft') setI(v => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  const passo = PASSOS[i];
  const ultimo = i === PASSOS.length - 1;

  return (
    <div className="banca-overlay" onClick={aoFechar}>
      <div className="banca-modal banca-tutorial" onClick={e => e.stopPropagation()}>
        <div className="banca-modal__header">
          <h2>Como funciona a Banca</h2>
          <button className="banca-modal__close" onClick={aoFechar} aria-label="Fechar"><X size={20} /></button>
        </div>

        <div className="banca-tutorial__corpo">
          <div className="banca-tutorial__icone">{passo.icone}</div>
          <span className="banca-tutorial__passo">Passo {i + 1} de {PASSOS.length}</span>
          <h3 className="banca-tutorial__titulo">{passo.titulo}</h3>
          <p className="banca-tutorial__texto">{passo.corpo}</p>
        </div>

        <div className="banca-tutorial__pontos" role="tablist" aria-label="Passos do tutorial">
          {PASSOS.map((_, idx) => (
            <button
              key={idx}
              className={`banca-tutorial__ponto ${idx === i ? 'is-ativo' : ''}`}
              onClick={() => setI(idx)}
              aria-label={`Ir para o passo ${idx + 1}`}
              aria-selected={idx === i}
              role="tab"
            />
          ))}
        </div>

        <div className="banca-tutorial__acoes">
          <button
            className="banca-btn-cancel"
            onClick={() => setI(v => Math.max(v - 1, 0))}
            disabled={i === 0}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          {ultimo ? (
            <button className="banca-btn-submit" onClick={aoFechar}>Começar</button>
          ) : (
            <button className="banca-btn-submit" onClick={() => setI(v => v + 1)}>
              Seguinte <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>

      <style>{`
        .banca-tutorial { max-width: 460px; }
        .banca-tutorial__corpo {
          padding: 1.6rem 1.6rem 0.4rem;
          text-align: center;
        }
        .banca-tutorial__icone {
          width: 52px; height: 52px; margin: 0 auto 0.9rem;
          display: flex; align-items: center; justify-content: center;
          border-radius: 14px;
          background: var(--gold-tint); color: var(--gold-primary);
        }
        .banca-tutorial__passo {
          font-size: 0.7rem; font-weight: 800; letter-spacing: 1px;
          text-transform: uppercase; color: var(--text-muted);
        }
        .banca-tutorial__titulo {
          margin: 0.4rem 0 0.6rem;
          font-size: 1.15rem; font-weight: 800; color: var(--text-white);
        }
        .banca-tutorial__texto {
          margin: 0; font-size: 0.9rem; line-height: 1.6; color: var(--text-gray);
        }
        .banca-tutorial__texto strong { color: var(--text-white); font-weight: 700; }
        .banca-tutorial__texto em { font-style: normal; color: var(--gold-light); }
        .banca-tutorial__pontos {
          display: flex; justify-content: center; gap: 6px;
          padding: 1.2rem 1rem 0.4rem;
        }
        .banca-tutorial__ponto {
          width: 7px; height: 7px; padding: 0; border: none; border-radius: 50%;
          background: var(--surface-sunken-hover, rgba(255,255,255,0.18));
          cursor: pointer; transition: background 0.15s ease, transform 0.15s ease;
        }
        .banca-tutorial__ponto.is-ativo {
          background: var(--gold-primary); transform: scale(1.25);
        }
        .banca-tutorial__acoes {
          display: flex; justify-content: space-between; gap: 0.8rem;
          padding: 0.8rem 1.6rem 1.6rem;
        }
        .banca-tutorial__acoes button {
          display: inline-flex; align-items: center; gap: 0.3rem;
        }
        .banca-tutorial__acoes .banca-btn-cancel:disabled {
          opacity: 0.4; cursor: not-allowed;
        }
        @media (prefers-reduced-motion: reduce) {
          .banca-tutorial__ponto { transition: none; }
        }
      `}</style>
    </div>
  );
}
