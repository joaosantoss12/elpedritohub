import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import {
  carregarTips, calcularStats, fmtRoi, fmtUnidades, fmtPercent,
  type RaioxTip,
} from '../lib/raiox';
import '../styles/RaioX.css';

/**
 * Versão compacta do Raio-X para a Home.
 * Substitui os cartões que mostravam 0,00€: em vez de dados internos ainda
 * modestos, mostra o histórico auditado do canal público.
 */
export function RaioXResumo() {
  const navigate = useNavigate();
  const [tips, setTips] = useState<RaioxTip[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    carregarTips({ canal: 'publico', desdeDias: 90, limite: 400 })
      .then(setTips)
      .finally(() => setCarregado(true));
  }, []);

  const stats = calcularStats(tips);

  // Sem histórico não há prova social — melhor não mostrar nada do que zeros.
  if (!carregado || stats.resolvidas === 0) return null;

  // Últimos 14 resultados, do mais antigo para o mais recente
  const forma = tips
    .filter(t => t.resultado === 'green' || t.resultado === 'red')
    .slice(0, 14)
    .reverse();

  const lucroPos = stats.lucroUnidades >= 0;

  return (
    <section className="raiox-resumo">
      <div className="raiox-resumo__head">
        <div>
          <h2 className="raiox-resumo__title">
            <Activity size={22} color="var(--gold-primary)" />
            Raio-X EPC
          </h2>
          <p className="raiox-resumo__sub">
            Últimos 90 dias do canal público, hora a hora. Publicado antes do jogo,
            resultado registado depois — sem edição.
          </p>
        </div>
        <button className="raiox-resumo__cta" onClick={() => navigate('/passaporte')}>
          VER RAIO-X COMPLETO <ArrowRight size={15} />
        </button>
      </div>

      <div className="raiox-resumo__grid">
        <div className="raiox-resumo__stat">
          <span className={`raiox-resumo__stat-val ${lucroPos ? 'pos' : 'neg'}`}>
            {fmtUnidades(stats.lucroUnidades)}
          </span>
          <span className="raiox-resumo__stat-lbl">Lucro em unidades</span>
        </div>
        <div className="raiox-resumo__stat">
          <span className={`raiox-resumo__stat-val ${stats.roi >= 0 ? 'pos' : 'neg'}`}>
            {fmtRoi(stats.roi)}
          </span>
          <span className="raiox-resumo__stat-lbl">ROI</span>
        </div>
        <div className="raiox-resumo__stat">
          <span className="raiox-resumo__stat-val gold">{fmtPercent(stats.taxaAcerto)}</span>
          <span className="raiox-resumo__stat-lbl">Taxa de acerto</span>
        </div>
        <div className="raiox-resumo__stat">
          <span className="raiox-resumo__stat-val">{stats.resolvidas}</span>
          <span className="raiox-resumo__stat-lbl">Tips auditadas</span>
        </div>
        <div className="raiox-resumo__stat">
          <span className="raiox-resumo__stat-val">{stats.oddMedia.toFixed(2)}</span>
          <span className="raiox-resumo__stat-lbl">Odd média</span>
        </div>
      </div>

      {forma.length > 0 && (
        <div className="raiox-forma">
          <span className="raiox-forma__label">Últimos resultados</span>
          <div className="raiox-forma__dots">
            {forma.map(t => (
              <span
                key={t.id}
                className={`raiox-forma__dot raiox-forma__dot--${t.resultado}`}
                title={`${t.evento} · @${t.odd.toFixed(2)} · ${t.resultado === 'green' ? 'Green' : 'Red'}`}
              />
            ))}
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--green-success)', marginLeft: 'auto' }}>
            <ShieldCheck size={13} /> Histórico auditado
          </span>
        </div>
      )}
    </section>
  );
}
