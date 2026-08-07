import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, ChevronLeft, ChevronRight, Loader2, Gift, Info,
  Target, TrendingUp, Crown, EyeOff,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarRanking, carregarConfig, carregarVencedores,
  nomeMes, nomeMesISO, fmtRoi, fmtUnidades, medalha, CONFIG_PADRAO,
  type LinhaRanking, type RankingConfig, type Vencedor,
} from '../lib/ranking';
import '../styles/Ranking.css';

/**
 * Ranking Mensal de Banca — roadmap 10.
 *
 * Ordena por ROI e não por lucro em euros de propósito: um quadro que premeia
 * quem ganha mais dinheiro premeia na prática quem aposta mais alto, e isso é o
 * oposto do que a Banca ensina. Aqui ganha quem escolhe melhor.
 *
 * Os números saem do RPC ranking_banca_mensal, que agrega do lado do servidor.
 * O cliente nunca vê uma aposta de outro membro.
 */
export default function Ranking() {
  const navigate = useNavigate();
  const { user, membro, loading: authLoading } = useAuth();

  // Mês em consulta, sempre normalizado ao dia 1.
  const [mes, setMes] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });

  // O mês a que as linhas pertencem serve de estado de carregamento: enquanto
  // não bate com o mês em consulta, os dados no ecrã são do mês anterior.
  const [{ linhas, mesCarregado }, setDados] = useState<{
    linhas: LinhaRanking[]; mesCarregado: number | null;
  }>({ linhas: [], mesCarregado: null });
  const loading = mesCarregado !== mes.getTime();
  const [config, setConfig] = useState<RankingConfig>(CONFIG_PADRAO);
  const [vencedores, setVencedores] = useState<Vencedor[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  useEffect(() => {
    let ativo = true;
    Promise.all([carregarConfig(), carregarVencedores()]).then(([cfg, vs]) => {
      if (!ativo) return;
      setConfig(cfg);
      setVencedores(vs);
    });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    let ativo = true;
    carregarRanking(mes).then(res => {
      if (ativo) setDados({ linhas: res, mesCarregado: mes.getTime() });
    });
    return () => { ativo = false; };
  }, [mes]);

  const inicioMesAtual = useMemo(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  }, []);
  const emCurso = mes.getTime() === inicioMesAtual.getTime();

  const mudarMes = (delta: number) => {
    setMes(prev => {
      const proximo = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      // Não há ranking do futuro.
      return proximo > inicioMesAtual ? prev : proximo;
    });
  };

  const minhaLinha = useMemo(
    () => linhas.find(l => l.user_id === user?.id) ?? null,
    [linhas, user],
  );

  // Só interessa mostrar o pódio congelado de meses que já fecharam.
  const podioGravado = useMemo(() => {
    const alvo = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`;
    return vencedores.filter(v => v.mes === alvo);
  }, [vencedores, mes]);

  const historico = useMemo(
    () => vencedores.filter(v => v.posicao === 1).slice(0, 6),
    [vencedores],
  );

  return (
    <div className="ranking-page">
      <Navbar />

      <div className="ranking-wrapper">
        <header className="ranking-header">
          <div className="ranking-header__eyebrow">
            <Trophy size={14} /> COMPETIÇÃO DA COMUNIDADE
          </div>
          <h1>Ranking <span>Mensal</span></h1>
          <p>
            Todos os meses, quem gere melhor a banca sobe. Conta o ROI das apostas
            que registaste na tua Banca e que já foram resolvidas — não o dinheiro
            que arriscaste.
          </p>
        </header>

        {/* ── PRÉMIO ── */}
        {config.ativo && config.premio_titulo && (
          <div className="ranking-premio">
            <div className="ranking-premio__icone"><Gift size={22} /></div>
            <div>
              <strong>{config.premio_titulo}</strong>
              {config.premio_descricao && <span>{config.premio_descricao}</span>}
            </div>
          </div>
        )}

        {/* ── NAVEGAÇÃO DE MÊS ── */}
        <div className="ranking-mes">
          <button className="ranking-mes__nav" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <div className="ranking-mes__label">
            <strong>{nomeMes(mes)}</strong>
            <span>{emCurso ? 'Em curso — a tabela mexe até ao fim do mês' : 'Mês fechado'}</span>
          </div>
          <button
            className="ranking-mes__nav"
            onClick={() => mudarMes(1)}
            disabled={emCurso}
            aria-label="Mês seguinte"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* ── A MINHA POSIÇÃO ── */}
        {minhaLinha ? (
          <div className="ranking-eu">
            <span className="ranking-eu__pos">#{minhaLinha.posicao}</span>
            <div className="ranking-eu__txt">
              <strong>Estás em {minhaLinha.posicao}.º lugar</strong>
              <span>
                {fmtRoi(minhaLinha.roi)} de ROI em {minhaLinha.apostas} apostas resolvidas
              </span>
            </div>
          </div>
        ) : !loading && (
          <div className="ranking-eu ranking-eu--fora">
            <span className="ranking-eu__pos"><Target size={20} /></span>
            <div className="ranking-eu__txt">
              <strong>Ainda não estás na tabela</strong>
              <span>
                {membro?.ranking_oculto
                  ? 'Escolheste não aparecer no ranking. Podes voltar atrás no teu perfil.'
                  : `São precisas ${config.min_apostas} apostas resolvidas neste mês para entrares.`}
              </span>
            </div>
          </div>
        )}

        {/* ── TABELA ── */}
        {loading ? (
          <div className="ranking-loading">
            <Loader2 size={26} className="ranking-spin" color="var(--gold-primary)" />
            <span>A calcular o ranking…</span>
          </div>
        ) : linhas.length === 0 ? (
          <div className="ranking-vazio">
            <Trophy size={30} color="var(--text-gray)" />
            <strong>Ainda não há ninguém neste mês</strong>
            <span>
              O ranking só mostra membros com pelo menos {config.min_apostas} apostas
              resolvidas. Regista as tuas na Banca e aparece aqui.
            </span>
            <button onClick={() => navigate('/banca')}>Ir para a Banca</button>
          </div>
        ) : (
          <div className="ranking-tabela">
            <div className="ranking-linha ranking-linha--head">
              <span>#</span>
              <span>Membro</span>
              <span>ROI</span>
              <span>Lucro</span>
              <span>Acerto</span>
              <span>Apostas</span>
            </div>

            {linhas.map(l => {
              const eu = l.user_id === user?.id;
              const m = medalha(l.posicao);
              return (
                <div
                  key={l.user_id}
                  className={`ranking-linha${eu ? ' ranking-linha--eu' : ''}${l.posicao <= 3 ? ' ranking-linha--podio' : ''}`}
                >
                  <span className="ranking-pos">{m ?? l.posicao}</span>
                  <span className="ranking-nome">
                    {l.username}
                    {eu && <em>tu</em>}
                  </span>
                  <span className={`ranking-roi${(l.roi ?? 0) >= 0 ? ' pos' : ' neg'}`}>
                    {fmtRoi(l.roi)}
                  </span>
                  <span className={`ranking-un${(l.lucro_unidades ?? 0) >= 0 ? ' pos' : ' neg'}`}>
                    {fmtUnidades(l.lucro_unidades)}
                  </span>
                  <span className="ranking-acerto">
                    {l.taxa_acerto == null ? '—' : `${l.taxa_acerto.toFixed(0)}%`}
                  </span>
                  <span className="ranking-apostas">{l.apostas}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── PÓDIO JÁ ANUNCIADO ── */}
        {podioGravado.length > 0 && (
          <section className="ranking-bloco">
            <h2><Crown size={16} /> Pódio anunciado</h2>
            <p className="ranking-bloco__sub">
              Resultado congelado no dia do anúncio. Apostas resolvidas depois disso
              não mudam quem ganhou.
            </p>
            <div className="ranking-podio">
              {podioGravado.map(v => (
                <div key={v.id} className="ranking-podio__card">
                  <span className="ranking-podio__medalha">{medalha(v.posicao) ?? v.posicao}</span>
                  <strong>{v.username}</strong>
                  <span className="ranking-podio__roi">{fmtRoi(v.roi)}</span>
                  {v.premio && <span className="ranking-podio__premio">{v.premio}</span>}
                  {v.entregue && <span className="ranking-podio__entregue">Prémio entregue</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── QUADRO DE HONRA ── */}
        {historico.length > 0 && (
          <section className="ranking-bloco">
            <h2><TrendingUp size={16} /> Quadro de honra</h2>
            <div className="ranking-honra">
              {historico.map(v => (
                <div key={v.id} className="ranking-honra__linha">
                  <span>{nomeMesISO(v.mes)}</span>
                  <strong>{v.username}</strong>
                  <span className="ranking-honra__roi">{fmtRoi(v.roi)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── REGRAS ── */}
        <section className="ranking-regras">
          <h2><Info size={16} /> Como funciona</h2>
          <ul>
            <li>
              <strong>Ordena por ROI, não por euros.</strong> Um ranking por lucro
              absoluto premeia quem aposta mais alto. Aqui ganha quem escolhe melhor,
              tenha a banca que tiver.
            </li>
            <li>
              <strong>Só contam apostas resolvidas.</strong> Pendentes ficam de fora
              até terem resultado.
            </li>
            <li>
              <strong>Mínimo de {config.min_apostas} apostas.</strong> Sem mínimo, uma
              única aposta certeira a odd alta ganhava o mês.
            </li>
            <li>
              <strong>Ninguém vê as tuas apostas.</strong> O ranking mostra apenas
              percentagens e contagens — nunca valores em euros nem apostas individuais.
            </li>
            <li className="ranking-regras__optout">
              <EyeOff size={14} />
              <span>
                Não queres aparecer? Podes sair do ranking a qualquer momento sem
                perder nada do resto do Hub.
              </span>
            </li>
          </ul>
          {config.regras && <p className="ranking-regras__extra">{config.regras}</p>}
        </section>
      </div>
    </div>
  );
}
