import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Lock, Plus, Save, Search, X } from 'lucide-react';
import {
  MAX_JOGOS, carregarJogosElegiveis, carregarMercados, carregarMeuBoletim,
  estaTrancada, guardarBoletim, rotularOpcao,
  type Escolha, type EscolhaGuardada, type Mercado, type MeuBoletim,
} from '../lib/batalha';
import type { JogoAoVivo } from '../lib/placar';

/**
 * O construtor do boletim do dia.
 *
 * A regra que desenha este ecrã: um palpite só conta se for feito antes do
 * apito. Por isso a lista só mostra jogos que ainda não começaram, e uma
 * escolha cujo jogo entretanto arrancou passa a aparecer trancada em vez de
 * desaparecer — o membro tem de continuar a ver o que apostou.
 */
export function BatalhaBoletim({ onGuardado }: { onGuardado?: () => void }) {
  const [jogos, setJogos] = useState<JogoAoVivo[]>([]);
  const [mercados, setMercados] = useState<Mercado[]>([]);
  const [boletim, setBoletim] = useState<MeuBoletim | null>(null);
  const [carregado, setCarregado] = useState(false);

  // As escolhas ainda editáveis. As trancadas vivem no boletim e não aqui.
  const [rascunho, setRascunho] = useState<Escolha[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const [guardadoEm, setGuardadoEm] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const [js, ms, b] = await Promise.all([
      carregarJogosElegiveis(),
      carregarMercados(),
      carregarMeuBoletim(),
    ]);
    setJogos(js);
    setMercados(ms);
    setBoletim(b);
    // O rascunho e o boletim guardado nao sao a mesma coisa: o rascunho nao
    // tem id nem veredicto, porque ainda pode mudar ate ao apito.
    setRascunho(
      (b?.escolhas ?? [])
        .filter((e) => !estaTrancada(e))
        .map((e) => ({
          evento_id: e.evento_id, jogo_label: e.jogo_label, liga: e.liga,
          inicio: e.inicio, mercado: e.mercado, escolha: e.escolha,
          escolha_label: e.escolha_label,
        })),
    );
    setCarregado(true);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const trancadas: EscolhaGuardada[] = useMemo(
    () => (boletim?.escolhas ?? []).filter(estaTrancada),
    [boletim],
  );

  const restam = MAX_JOGOS - trancadas.length - rascunho.length;

  const escolhidos = useMemo(
    () => new Set([...trancadas.map((e) => e.evento_id), ...rascunho.map((e) => e.evento_id)]),
    [trancadas, rascunho],
  );

  const disponiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return jogos
      .filter((j) => !escolhidos.has(j.id))
      .filter((j) => !q || `${j.casa} ${j.fora} ${j.liga}`.toLowerCase().includes(q));
  }, [jogos, escolhidos, busca]);

  function escolher(jogo: JogoAoVivo, mercado: Mercado, opcao: { chave: string; label: string }) {
    setErro('');
    setRascunho((atual) => {
      const sem = atual.filter((e) => e.evento_id !== jogo.id);
      if (sem.length + trancadas.length >= MAX_JOGOS) {
        setErro(`O boletim leva ${MAX_JOGOS} jogos. Tira um para pôr outro.`);
        return atual;
      }
      return [...sem, {
        evento_id: jogo.id,
        jogo_label: `${jogo.casa} x ${jogo.fora}`,
        liga: jogo.liga,
        inicio: jogo.inicio,
        mercado: mercado.chave,
        escolha: opcao.chave,
        escolha_label: rotularOpcao(opcao, jogo),
      }];
    });
    setAberto(null);
  }

  function remover(eventoId: string) {
    setRascunho((atual) => atual.filter((e) => e.evento_id !== eventoId));
  }

  async function guardar() {
    setErro('');
    setAGuardar(true);
    try {
      await guardarBoletim(rascunho);
      setGuardadoEm(Date.now());
      await carregar();
      onGuardado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível guardar o boletim.');
    } finally {
      setAGuardar(false);
    }
  }

  if (!carregado) {
    return <div className='gm-vazio'><Loader2 className='animate-spin' size={22} /></div>;
  }

  return (
    <>
      <div className='gm-card'>
        <h2>O teu boletim de hoje</h2>
        <p className='gm-sub'>
          Escolhe {MAX_JOGOS} jogos que ainda não começaram e diz o que achas que
          vai acontecer. Cada acerto vale EPCoins; acertar nos {MAX_JOGOS} dá bónus.
          Não há dinheiro envolvido em lado nenhum.
        </p>

        <div className='bt-contador'>
          <strong>{trancadas.length + rascunho.length}</strong> / {MAX_JOGOS} jogos
          {boletim && boletim.resolvidas > 0 && (
            <span className='bt-contador-res'>
              · {boletim.acertos} {boletim.acertos === 1 ? 'acerto' : 'acertos'} em{' '}
              {boletim.resolvidas} resolvidos
            </span>
          )}
        </div>

        {erro && <div className='gm-erro'>{erro}</div>}

        {trancadas.length === 0 && rascunho.length === 0 ? (
          <div className='gm-vazio'>Ainda não escolheste nenhum jogo.</div>
        ) : (
          <div className='bt-lista'>
            {trancadas.map((e) => (
              <div key={e.id}
                   className={`bt-pick trancada ${e.correta === true ? 'certa' : e.correta === false ? 'errada' : ''}`}>
                <div className='bt-pick-jogo'>
                  <strong>{e.jogo_label}</strong>
                  <span>{e.liga}</span>
                </div>
                <div className='bt-pick-escolha'>{e.escolha_label}</div>
                <div className='bt-pick-estado'>
                  {e.correta === true ? <><Check size={14} /> Acertaste</>
                    : e.correta === false ? <><X size={14} /> Falhou</>
                    : <><Lock size={13} /> A decorrer</>}
                </div>
              </div>
            ))}

            {rascunho.map((e) => (
              <div key={e.evento_id} className='bt-pick'>
                <div className='bt-pick-jogo'>
                  <strong>{e.jogo_label}</strong>
                  <span>{e.liga} · {horaDe(e.inicio)}</span>
                </div>
                <div className='bt-pick-escolha'>{e.escolha_label}</div>
                <button className='bt-remover' onClick={() => remover(e.evento_id)} title='Tirar do boletim'>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button className='gm-btn' style={{ marginTop: 18 }}
                onClick={guardar}
                disabled={aGuardar || rascunho.length === 0}>
          {aGuardar
            ? 'A guardar…'
            : guardadoEm
              ? <><Check size={15} /> Boletim guardado</>
              : <><Save size={15} /> Guardar boletim</>}
        </button>
      </div>

      <div className='gm-card'>
        <h2>Jogos de hoje</h2>
        <p className='gm-sub'>
          Só os que ainda não começaram. {restam > 0
            ? `Faltam-te ${restam} ${restam === 1 ? 'jogo' : 'jogos'}.`
            : 'O boletim está completo — tira um jogo para trocar.'}
        </p>

        <div className='bt-busca'>
          <Search size={15} />
          <input value={busca} onChange={(ev) => setBusca(ev.target.value)}
                 placeholder='Procurar equipa ou liga' />
        </div>

        {disponiveis.length === 0 ? (
          <div className='gm-vazio'>
            {jogos.length === 0
              ? 'Não há jogos por começar hoje. Volta amanhã de manhã.'
              : 'Nenhum jogo corresponde à procura.'}
          </div>
        ) : (
          <div className='bt-jogos'>
            {disponiveis.map((j) => (
              <div key={j.id} className='bt-jogo'>
                <button className='bt-jogo-topo'
                        onClick={() => setAberto(aberto === j.id ? null : j.id)}
                        disabled={restam <= 0}>
                  <div className='bt-jogo-nomes'>
                    <strong>{j.casa}</strong>
                    <span className='bt-x'>x</span>
                    <strong>{j.fora}</strong>
                  </div>
                  <div className='bt-jogo-meta'>
                    <span>{j.liga}</span>
                    <span>{horaDe(j.inicio)}</span>
                  </div>
                  <Plus size={16} className='bt-mais' />
                </button>

                {aberto === j.id && (
                  <div className='bt-mercados'>
                    {mercados.map((m) => (
                      <div key={m.chave} className='bt-mercado'>
                        <div className='bt-mercado-nome'>{m.nome}</div>
                        <div className='bt-opcoes'>
                          {m.opcoes.map((o) => (
                            <button key={o.chave} className='bt-opcao'
                                    onClick={() => escolher(j, m, o)}>
                              {rotularOpcao(o, j)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function horaDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}
