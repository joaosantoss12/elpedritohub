import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock, Lock, Sparkles } from 'lucide-react';
import {
  carregarDistribuicao, carregarMinhasPrevisoes, responder,
  estaAberta, segundosParaFechar,
  type Distribuicao, type Pergunta,
} from '../lib/previsoes';

/**
 * A lista de perguntas de previsão, com as opções, o contador e o resultado.
 *
 * É o mesmo componente na Arena (boletim do dia) e dentro da Sala de Jogo
 * (perguntas presas ao jogo). A diferença entre os dois casos está nos dados,
 * não no ecrã — e por isso não há dois componentes.
 */
export function PainelPrevisoes({
  perguntas,
  onResposta,
}: {
  perguntas: Pergunta[];
  /** Chamado depois de uma resposta aceite, para quem quiser refrescar saldos. */
  onResposta?: () => void;
}) {
  const [minhas, setMinhas] = useState<Record<string, string>>({});
  const [dist, setDist] = useState<Record<string, Distribuicao[]>>({});
  const [aPedir, setAPedir] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  // Só existe para forçar o re-render do contador uma vez por segundo.
  const [, setTique] = useState(0);

  const ids = useMemo(() => perguntas.map((p) => p.id), [perguntas]);
  const chaveIds = ids.join(',');

  const recarregar = useCallback(async () => {
    if (ids.length === 0) return;
    const respostas = await carregarMinhasPrevisoes(ids);
    setMinhas(Object.fromEntries(respostas.map((r) => [r.pergunta_id, r.escolha])));

    const pares = await Promise.all(
      ids.map(async (id) => [id, await carregarDistribuicao(id)] as const),
    );
    setDist(Object.fromEntries(pares));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveIds]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // O contador precisa de acordar de segundo a segundo; o resto do painel não.
  useEffect(() => {
    const t = setInterval(() => setTique((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function escolher(pergunta: Pergunta, chave: string) {
    if (!estaAberta(pergunta)) return;
    setErro('');
    setAPedir(pergunta.id);
    // Optimista: a resposta aparece marcada antes da confirmação, e volta
    // atrás se o servidor recusar.
    const anterior = minhas[pergunta.id];
    setMinhas((m) => ({ ...m, [pergunta.id]: chave }));
    try {
      await responder(pergunta.id, chave);
      onResposta?.();
      void recarregar();
    } catch (e) {
      setMinhas((m) => ({ ...m, [pergunta.id]: anterior }));
      setErro(e instanceof Error ? e.message : 'Não foi possível registar a previsão.');
    } finally {
      setAPedir(null);
    }
  }

  if (perguntas.length === 0) {
    return (
      <div className='gm-vazio'>
        Ainda não há perguntas abertas. Aparecem quando o Pedrito lançar as do dia.
      </div>
    );
  }

  return (
    <div>
      {erro && <div className='gm-erro'>{erro}</div>}

      {perguntas.map((p) => {
        const aberta = estaAberta(p);
        const restam = segundosParaFechar(p);
        const minha = minhas[p.id];
        const linhas = dist[p.id] ?? [];
        const total = linhas.reduce((s, l) => s + l.votos, 0);
        const porOpcao = new Map(linhas.filter((l) => l.chave).map((l) => [l.chave!, l.votos]));

        return (
          <div key={p.id} className='gm-pergunta'>
            <div className='gm-pergunta-topo'>
              <span className='gm-pergunta-jogo'>
                {p.jogo_label ?? p.mercado}
                {p.peso > 1 && ` · vale ${p.peso}×`}
              </span>
              <span className={`gm-relogio ${aberta && restam < 60 ? 'urgente' : ''}`}>
                {p.resolvida_em
                  ? 'Resolvida'
                  : aberta
                    ? <><Clock size={12} style={{ verticalAlign: '-2px' }} /> {formatarRestante(restam)}</>
                    : <><Lock size={12} style={{ verticalAlign: '-2px' }} /> Fechada</>}
              </span>
            </div>

            <p className='gm-pergunta-texto'>{p.texto}</p>

            <div className='gm-opcoes'>
              {p.opcoes.map((o) => {
                const votos = porOpcao.get(o.chave) ?? 0;
                // A percentagem só se mostra depois de fechar: o servidor não
                // manda a repartição enquanto está aberta, de propósito.
                const pct = !aberta && total > 0 ? Math.round((votos / total) * 100) : null;
                const certa = p.resposta_correta === o.chave;

                return (
                  <button
                    key={o.chave}
                    className={[
                      'gm-opcao',
                      minha === o.chave ? 'escolhida' : '',
                      certa ? 'certa' : '',
                    ].join(' ')}
                    disabled={!aberta || aPedir === p.id}
                    onClick={() => escolher(p, o.chave)}
                  >
                    {pct !== null && <i className='gm-barra' style={{ width: `${pct}%` }} />}
                    <span>
                      {minha === o.chave && <Check size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />}
                      {o.label}
                    </span>
                    {pct !== null && <span className='gm-opcao-pct'>{pct}%</span>}
                  </button>
                );
              })}
            </div>

            {aberta && total > 0 && (
              <div className='gm-pedrito'>
                {total} {total === 1 ? 'previsão' : 'previsões'} até agora
              </div>
            )}

            {/* A escolha do Pedrito só aparece depois do fecho. Antes disso
                seria uma cábula, e a batalha deixava de ser batalha. */}
            {p.revelar_pedrito && p.pedrito_escolha && (
              <div className='gm-pedrito'>
                <Sparkles size={14} />
                Pedrito escolheu:{' '}
                <strong style={{ color: 'var(--gold-light)' }}>
                  {p.opcoes.find((o) => o.chave === p.pedrito_escolha)?.label ?? p.pedrito_escolha}
                </strong>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatarRestante(segundos: number): string {
  if (segundos <= 0) return '0s';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
