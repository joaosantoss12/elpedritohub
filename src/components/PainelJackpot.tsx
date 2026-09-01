import { useCallback, useEffect, useState } from 'react';
import { Loader2, Ticket, Trophy } from 'lucide-react';
import {
  carregarJackpot, carregarVencedoresJackpot, chance,
  type JackpotAtual, type JackpotVencedor,
} from '../lib/hub';

/**
 * O EPC Jackpot.
 *
 * Os bilhetes **não se compram**. Ganham-se a participar — cada vez que
 * recebes EPCoins por seres activo, 5% do que ganhaste vai para o pote e
 * ficas com mais um bilhete. Como não há contrapartida financeira para
 * entrar, isto é um sorteio promocional interno e não uma aposta; e o prémio
 * sai em EPCoins, que não se convertem em dinheiro.
 */
export function PainelJackpot() {
  const [jackpot, setJackpot] = useState<JackpotAtual | null>(null);
  const [vencedores, setVencedores] = useState<JackpotVencedor[]>([]);
  const [carregado, setCarregado] = useState(false);

  const carregar = useCallback(async () => {
    const [j, v] = await Promise.all([carregarJackpot(), carregarVencedoresJackpot(8)]);
    setJackpot(j);
    setVencedores(v);
    setCarregado(true);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  if (!carregado) {
    return <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>;
  }

  return (
    <>
      <div className='gm-card'>
        <h2><Ticket size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} /> EPC Jackpot</h2>

        {!jackpot ? (
          <div className='gm-vazio'>Não há nenhum jackpot aberto de momento.</div>
        ) : (
          <>
            <p className='gm-sub'>{jackpot.titulo}</p>

            <div className='jk-pote'>
              <div className='jk-pote-valor'>{jackpot.pote.toLocaleString('pt-PT')}</div>
              <div className='jk-pote-label'>EPCoins no pote</div>
            </div>

            <div className='jk-numeros'>
              <div className='jk-numero'>
                <strong>{jackpot.meus_bilhetes}</strong>
                <span>os teus bilhetes</span>
              </div>
              <div className='jk-numero'>
                <strong>{chance(jackpot)}%</strong>
                <span>hipótese</span>
              </div>
              <div className='jk-numero'>
                <strong>{jackpot.participantes}</strong>
                <span>participantes</span>
              </div>
              <div className='jk-numero'>
                <strong>{quando(jackpot.sorteia_em)}</strong>
                <span>sorteio</span>
              </div>
            </div>

            <div className='jk-nota'>
              Os bilhetes não se compram — ganhas um sempre que recebes EPCoins
              por participares, e 5% dessas moedas alimentam o pote. Não há
              inscrição nem custo de entrada, e o prémio é pago em EPCoins.
            </div>
          </>
        )}
      </div>

      <div className='gm-card'>
        <h2><Trophy size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} /> Já ganharam</h2>
        {vencedores.length === 0 ? (
          <div className='gm-vazio'>Ainda não houve nenhum sorteio.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className='gm-tabela'>
              <thead>
                <tr>
                  <th>Jackpot</th>
                  <th>Vencedor</th>
                  <th className='num'>Pote</th>
                  <th className='num'>Quando</th>
                </tr>
              </thead>
              <tbody>
                {vencedores.map((v) => (
                  <tr key={v.id}>
                    <td>{v.titulo}</td>
                    <td>{v.vencedor}</td>
                    <td className='num'>{v.pote.toLocaleString('pt-PT')}</td>
                    <td className='num'>
                      {new Date(v.sorteado_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}
