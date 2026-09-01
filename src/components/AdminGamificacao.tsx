import { useCallback, useEffect, useState } from 'react';
import { Bell, Gift, Plus, MessageCircleQuestion, Check, Loader2, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { lancarDrop } from '../lib/drops';
import {
  abrirJackpot, carregarJackpot, difundirNotificacao, sortearJackpot,
  type JackpotAtual,
} from '../lib/hub';
import {
  carregarBoletimDeHoje, fecharBoletim, resolverPergunta,
  type Boletim, type Pergunta,
} from '../lib/previsoes';
import '../styles/Gamificacao.css';

type Toast = (msg: string, type?: 'success' | 'error') => void;

/**
 * A secção de gamificação do painel Admin: lançar drops e escrever as
 * perguntas editoriais do dia.
 *
 * A Batalha de Prognósticos deixou de passar por aqui: cada membro monta o
 * seu próprio boletim a partir dos jogos da API e o resultado é resolvido
 * pelo servidor. O que sobra para o admin são as perguntas do Pedrito —
 * aquelas que precisam de alguém a decidir o que perguntar.
 *
 * Vive num ficheiro à parte porque o Admin.tsx já tem três mil linhas e esta
 * secção não partilha estado com nenhuma das outras.
 */
export function SectionGamificacao({ showToast }: { showToast: Toast }) {
  return (
    <div className='admin-section-content'>
      <BlocoDrops showToast={showToast} />
      <BlocoJackpot showToast={showToast} />
      <BlocoAviso showToast={showToast} />
      <BlocoBoletim showToast={showToast} />
    </div>
  );
}

// ─── DROPS ────────────────────────────────────────────────────

function BlocoDrops({ showToast }: { showToast: Toast }) {
  const [titulo, setTitulo] = useState('EPC DROP');
  const [valor, setValor] = useState(25);
  const [duracao, setDuracao] = useState(45);
  const [eventoId, setEventoId] = useState('');
  const [jogoLabel, setJogoLabel] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function lancar() {
    setOcupado(true);
    try {
      await lancarDrop({
        titulo,
        valor,
        duracaoSegundos: duracao,
        eventoId: eventoId.trim() || null,
        jogoLabel: jogoLabel.trim() || null,
      });
      showToast('Drop lançado. Está aberto agora.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível lançar', 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className='gm-card' style={{ marginBottom: 18 }}>
      <h2><Gift size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} /> Lançar EPC DROP</h2>
      <p className='gm-sub'>
        Abre já e fecha ao fim da duração. Deixa o jogo em branco para o drop
        aparecer em todo o Hub; preenche-o para só quem estiver nessa sala o ver.
      </p>

      <div style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
        <input className='admin-input' value={titulo}
               onChange={(e) => setTitulo(e.target.value)} placeholder='Título' />
        <div style={{ display: 'flex', gap: 12 }}>
          <input className='admin-input' type='number' min={1} max={5000} value={valor}
                 onChange={(e) => setValor(Number(e.target.value))} placeholder='EPCoins' />
          <input className='admin-input' type='number' min={10} max={600} value={duracao}
                 onChange={(e) => setDuracao(Number(e.target.value))} placeholder='Segundos' />
        </div>
        <input className='admin-input' value={eventoId}
               onChange={(e) => setEventoId(e.target.value)}
               placeholder='ID do jogo na ESPN (opcional)' />
        <input className='admin-input' value={jogoLabel}
               onChange={(e) => setJogoLabel(e.target.value)}
               placeholder='Nome do jogo, para mostrar no cartão (opcional)' />

        <button className='gm-btn' onClick={lancar} disabled={ocupado}>
          {ocupado ? 'A lançar…' : `Lançar drop de ${duracao}s`}
        </button>
      </div>
    </div>
  );
}

// ─── BOLETIM ──────────────────────────────────────────────────

function BlocoBoletim({ showToast }: { showToast: Toast }) {
  const [boletim, setBoletim] = useState<Boletim | null>(null);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const [texto, setTexto] = useState('');
  const [opcoesTexto, setOpcoesTexto] = useState('');
  const [pedrito, setPedrito] = useState('');
  const [fechaEm, setFechaEm] = useState('');
  const [jogoLabel, setJogoLabel] = useState('');
  const [eventoId, setEventoId] = useState('');
  const [peso, setPeso] = useState(1);

  const carregar = useCallback(async () => {
    const r = await carregarBoletimDeHoje();
    setBoletim(r.boletim);
    setPerguntas(r.perguntas);
    setCarregado(true);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function criarBoletim() {
    setOcupado(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('previsao_boletins')
      .upsert({ data: hoje, estado: 'aberto' }, { onConflict: 'data' });
    setOcupado(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }
    showToast('Boletim do dia aberto');
    void carregar();
  }

  /**
   * Uma opção por linha. A chave é gerada a partir do texto: escrever
   * "Benfica" chega, e a chave estável (`benfica`) é o que fica guardado nas
   * respostas e no resultado.
   */
  function opcoesDoTexto(): { chave: string; label: string }[] {
    return opcoesTexto
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label) => ({
        // NFD separa os acentos das letras; o intervalo apanha esses acentos
        // já soltos, e o resto vira sublinhado. "Não há" fica "nao_ha".
        chave: label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'opcao',
        label,
      }));
  }

  async function criarPergunta() {
    const opcoes = opcoesDoTexto();
    if (opcoes.length < 2) { showToast('Precisas de pelo menos duas opções', 'error'); return; }
    if (!fechaEm) { showToast('Define a hora de fecho', 'error'); return; }

    setOcupado(true);
    const { error } = await supabase.from('previsao_perguntas').insert({
      boletim_id: eventoId.trim() ? null : boletim?.id ?? null,
      evento_id: eventoId.trim() || null,
      jogo_label: jogoLabel.trim() || null,
      texto: texto.trim(),
      mercado: 'outro',
      opcoes,
      pedrito_escolha: pedrito.trim() || null,
      fecha_em: new Date(fechaEm).toISOString(),
      peso,
    });
    setOcupado(false);
    if (error) { showToast('Erro: ' + error.message, 'error'); return; }

    showToast('Pergunta criada');
    setTexto(''); setOpcoesTexto(''); setPedrito(''); setPeso(1);
    void carregar();
  }

  async function resolver(p: Pergunta, chave: string) {
    setOcupado(true);
    try {
      const n = await resolverPergunta(p.id, chave);
      showToast(`Resolvida. ${n} ${n === 1 ? 'membro acertou' : 'membros acertaram'}.`);
      void carregar();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao resolver', 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function fechar() {
    if (!boletim) return;
    setOcupado(true);
    try {
      const n = await fecharBoletim(boletim.id);
      showToast(`Boletim fechado. ${n} com boletim perfeito.`);
      void carregar();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao fechar', 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (!carregado) {
    return <div className='gm-vazio'><Loader2 className='animate-spin' size={20} /></div>;
  }

  return (
    <div className='gm-card'>
      <h2><MessageCircleQuestion size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} /> Perguntas do Pedrito</h2>
      <p className='gm-sub'>
        As perguntas escritas por ti, que alimentam o Pedrito vs Comunidade.
        Com um ID de jogo preenchido, a pergunta sai do boletim e passa a
        aparecer dentro da sala desse jogo. Não têm nada a ver com a Batalha
        de Prognósticos, essa é montada por cada membro.
      </p>

      {!boletim ? (
        <button className='gm-btn' onClick={criarBoletim} disabled={ocupado}>
          <Plus size={15} /> Abrir boletim de hoje
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12, maxWidth: 560, marginBottom: 24 }}>
            <input className='admin-input' value={texto}
                   onChange={(e) => setTexto(e.target.value)}
                   placeholder='Pergunta — ex.: Quem marca primeiro?' />
            <textarea className='admin-input' rows={4} value={opcoesTexto}
                      onChange={(e) => setOpcoesTexto(e.target.value)}
                      placeholder={'Uma opção por linha:\nBenfica\nEmpate\nPorto'} />
            <input className='admin-input' value={pedrito}
                   onChange={(e) => setPedrito(e.target.value)}
                   placeholder='Escolha do Pedrito (a chave, ex.: benfica) — opcional' />
            <div style={{ display: 'flex', gap: 12 }}>
              <input className='admin-input' type='datetime-local' value={fechaEm}
                     onChange={(e) => setFechaEm(e.target.value)} />
              <input className='admin-input' type='number' min={1} max={5} value={peso}
                     onChange={(e) => setPeso(Number(e.target.value))} placeholder='Peso' />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <input className='admin-input' value={eventoId}
                     onChange={(e) => setEventoId(e.target.value)}
                     placeholder='ID do jogo (opcional — tira do boletim)' />
              <input className='admin-input' value={jogoLabel}
                     onChange={(e) => setJogoLabel(e.target.value)}
                     placeholder='Nome do jogo (opcional)' />
            </div>
            <button className='gm-btn' onClick={criarPergunta} disabled={ocupado || !texto.trim()}>
              <Plus size={15} /> Criar pergunta
            </button>
          </div>

          {perguntas.length === 0 ? (
            <div className='gm-vazio'>O boletim de hoje ainda não tem perguntas.</div>
          ) : (
            <>
              {perguntas.map((p) => (
                <div key={p.id} className='gm-pergunta'>
                  <div className='gm-pergunta-topo'>
                    <span className='gm-pergunta-jogo'>{p.jogo_label ?? 'Boletim'}</span>
                    <span className='gm-relogio'>
                      {p.resolvida_em ? 'Resolvida' : `fecha ${new Date(p.fecha_em).toLocaleString('pt-PT')}`}
                    </span>
                  </div>
                  <p className='gm-pergunta-texto'>{p.texto}</p>

                  <div className='gm-opcoes'>
                    {p.opcoes.map((o) => (
                      <button key={o.chave}
                              className={`gm-opcao ${p.resposta_correta === o.chave ? 'certa' : ''}`}
                              disabled={ocupado || Boolean(p.resolvida_em)}
                              onClick={() => resolver(p, o.chave)}>
                        <span>
                          {p.resposta_correta === o.chave && (
                            <Check size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                          )}
                          {o.label}
                        </span>
                        {!p.resolvida_em && <span className='gm-opcao-pct'>marcar certa</span>}
                      </button>
                    ))}
                  </div>

                  {p.pedrito_escolha && (
                    <div className='gm-pedrito'>Pedrito: {p.pedrito_escolha}</div>
                  )}
                </div>
              ))}

              <button className='gm-btn gm-btn-fantasma' style={{ marginTop: 18 }}
                      onClick={fechar}
                      disabled={ocupado || boletim.estado === 'resolvido'}>
                {boletim.estado === 'resolvido'
                  ? 'Boletim já fechado'
                  : 'Fechar boletim e pagar boletins perfeitos'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── JACKPOT ──────────────────────────────────────────────────

/**
 * Abrir e sortear o EPC Jackpot.
 *
 * O pote alimenta-se sozinho — 5% de cada crédito de EPCoins — por isso o
 * campo do pote inicial serve só para arrancar com um valor de cortesia. Não
 * há forma de comprar bilhetes, nem aqui nem em lado nenhum: seria isso que
 * transformava o sorteio numa aposta.
 */
function BlocoJackpot({ showToast }: { showToast: Toast }) {
  const [atual, setAtual] = useState<JackpotAtual | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const [titulo, setTitulo] = useState('EPC JACKPOT');
  const [sorteiaEm, setSorteiaEm] = useState('');
  const [pote, setPote] = useState(0);

  const carregar = useCallback(async () => {
    setAtual(await carregarJackpot());
    setCarregado(true);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function abrir() {
    if (!sorteiaEm) { showToast('Define a data do sorteio', 'error'); return; }
    setOcupado(true);
    try {
      await abrirJackpot({ titulo, sorteiaEm, pote });
      showToast('Jackpot aberto.');
      void carregar();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível abrir', 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function sortear() {
    if (!atual) return;
    setOcupado(true);
    try {
      const vencedor = await sortearJackpot(atual.id);
      showToast(vencedor ? 'Sorteado e creditado.' : 'Sem participantes — nada a sortear.');
      void carregar();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível sortear', 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (!carregado) {
    return <div className='gm-vazio'><Loader2 className='animate-spin' size={20} /></div>;
  }

  return (
    <div className='gm-card' style={{ marginBottom: 18 }}>
      <h2><Ticket size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} /> EPC Jackpot</h2>

      {atual ? (
        <>
          <p className='gm-sub'>
            <strong>{atual.titulo}</strong> — {atual.pote.toLocaleString('pt-PT')} EPC no pote,
            {' '}{atual.total_bilhetes} bilhetes de {atual.participantes} participantes.
          </p>
          <button className='gm-btn' onClick={sortear} disabled={ocupado}>
            {ocupado ? 'A sortear…' : 'Sortear agora e creditar'}
          </button>
        </>
      ) : (
        <>
          <p className='gm-sub'>
            Não há nenhum aberto. Só pode existir um de cada vez — o pote do
            seguinte começa a encher assim que este for sorteado.
          </p>
          <div style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
            <input className='admin-input' value={titulo}
                   onChange={(e) => setTitulo(e.target.value)} placeholder='Título' />
            <div style={{ display: 'flex', gap: 12 }}>
              <input className='admin-input' type='datetime-local' value={sorteiaEm}
                     onChange={(e) => setSorteiaEm(e.target.value)} />
              <input className='admin-input' type='number' min={0} max={100000} value={pote}
                     onChange={(e) => setPote(Number(e.target.value))} placeholder='Pote inicial' />
            </div>
            <button className='gm-btn' onClick={abrir} disabled={ocupado || !titulo.trim()}>
              <Plus size={15} /> Abrir jackpot
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── AVISO A TODOS ────────────────────────────────────────────

/**
 * Notificação para todos os membros não banidos.
 *
 * Vale a pena resistir à tentação de usar isto: o sino só continua a ser
 * lido enquanto raramente tiver lá coisas que não interessam.
 */
function BlocoAviso({ showToast }: { showToast: Toast }) {
  const [titulo, setTitulo] = useState('');
  const [corpo, setCorpo] = useState('');
  const [url, setUrl] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    setOcupado(true);
    try {
      const n = await difundirNotificacao({
        tipo: 'aviso',
        titulo: titulo.trim(),
        corpo: corpo.trim() || null,
        url: url.trim() || null,
      });
      showToast(`Aviso enviado a ${n} ${n === 1 ? 'membro' : 'membros'}.`);
      setTitulo(''); setCorpo(''); setUrl('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível enviar', 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className='gm-card' style={{ marginBottom: 18 }}>
      <h2><Bell size={17} style={{ verticalAlign: '-3px', marginRight: 7 }} /> Avisar toda a gente</h2>
      <p className='gm-sub'>
        Cai no sino de todos os membros. Usa com conta — um sino cheio de
        ruído é um sino que ninguém abre.
      </p>

      <div style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
        <input className='admin-input' value={titulo}
               onChange={(e) => setTitulo(e.target.value)} placeholder='Título' />
        <textarea className='admin-input' rows={3} value={corpo}
                  onChange={(e) => setCorpo(e.target.value)} placeholder='Corpo (opcional)' />
        <input className='admin-input' value={url}
               onChange={(e) => setUrl(e.target.value)}
               placeholder='Para onde levar, ex.: /arena (opcional)' />
        <button className='gm-btn' onClick={enviar} disabled={ocupado || !titulo.trim()}>
          {ocupado ? 'A enviar…' : 'Enviar aviso'}
        </button>
      </div>
    </div>
  );
}
