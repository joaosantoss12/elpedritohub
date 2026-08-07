import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, Users, Eye, CalendarClock,
  ExternalLink, Loader2, Flag, MessageCircle, AlertTriangle,
} from 'lucide-react';
import {
  carregarCanais, alcance, fmtSubscritores, fmtEngagement, fmtHandle,
  type CanalTelegram,
} from '../lib/canais';
import { VERTICAL_COLORS } from '../lib/raiox';
import '../styles/Canais.css';

/**
 * Canais Oficiais — roadmap 9 (URGENTE) e 5.
 *
 * Faz duas coisas ao mesmo tempo, e de propósito na mesma página: dá ao membro
 * a lista verificável do que é legítimo, e mostra o alcance real de cada canal.
 * Quem chega a esta página com uma dúvida sobre um contacto sai com a resposta
 * e com a prova de escala. Vive dentro da Sala de Comando (mesmo separador na
 * topbar), sem exigir sessão iniciada — é informação de segurança pública.
 */
export function CanaisOficiais() {
  const [{ canais, loading }, setDados] = useState<{ canais: CanalTelegram[]; loading: boolean }>({
    canais: [], loading: true,
  });

  useEffect(() => {
    let ativo = true;
    carregarCanais().then(res => { if (ativo) setDados({ canais: res, loading: false }); });
    return () => { ativo = false; };
  }, []);

  const oficiais = useMemo(() => canais.filter(c => c.tipo === 'oficial'), [canais]);
  const contactos = useMemo(() => canais.filter(c => c.tipo === 'contacto'), [canais]);
  const falsos = useMemo(() => canais.filter(c => c.tipo === 'falso'), [canais]);
  const resumo = useMemo(() => alcance(canais), [canais]);

  const recolha = useMemo(() => {
    const datas = canais.map(c => c.recolhido_em).filter(Boolean) as string[];
    if (!datas.length) return null;
    return datas.sort().at(-1)!;
  }, [canais]);

  return (
    <div className="canais-wrapper">
      <header className="canais-header">
        <div className="canais-header__eyebrow">
          <ShieldCheck size={14} /> VERIFICAÇÃO DE MARCA
        </div>
        <h1>Canais <span>Oficiais</span></h1>
        <p>
          Estes são os únicos canais e contactos do El Pedrito. Se um perfil não
          estiver nesta lista, não é nosso — por muito parecido que pareça.
        </p>
      </header>

      {/* ── REGRA DE OURO ── */}
      <div className="canais-regra">
        <AlertTriangle size={20} />
        <div>
          <strong>Nunca pedimos pagamentos por mensagem privada.</strong>
          <span>
            O acesso VIP compra-se sempre no Hub, na página de Planos. Qualquer
            pessoa que te aborde em privado a vender acesso está a tentar enganar-te,
            mesmo que use o nome, a foto e o visual do Pedrito.
          </span>
        </div>
      </div>

      {loading ? (
        <div className="canais-loading">
          <Loader2 size={26} className="canais-spin" color="var(--gold-primary)" />
          A carregar canais…
        </div>
      ) : canais.length === 0 ? (
        <div className="canais-empty">
          <ShieldAlert size={40} color="#3f3f46" />
          <h3>Lista de canais ainda por publicar</h3>
          <p>Os canais oficiais são geridos em Admin › Canais.</p>
        </div>
      ) : (
        <>
          {/* ── ALCANCE E FIDELIDADE (roadmap 5) ── */}
          {oficiais.length > 0 && (
            <div className="canais-alcance">
              <div className="canais-alcance__stat">
                <span className="canais-alcance__val">{fmtSubscritores(resumo.totalSubscritores)}</span>
                <span className="canais-alcance__lbl">Subscritores nos canais oficiais</span>
              </div>
              {resumo.maisFiel && (
                <div className="canais-alcance__stat">
                  <span className="canais-alcance__val gold">
                    {fmtEngagement(resumo.maisFiel.engagement_min, resumo.maisFiel.engagement_max)}
                  </span>
                  <span className="canais-alcance__lbl">
                    Taxa de visualização em {resumo.maisFiel.nome}
                  </span>
                </div>
              )}
              <div className="canais-alcance__stat">
                <span className="canais-alcance__val">{oficiais.length}</span>
                <span className="canais-alcance__lbl">Canais oficiais, um por vertical</span>
              </div>
            </div>
          )}

          {/* ── OFICIAIS ── */}
          <section className="canais-sec">
            <h2 className="canais-sec__title">
              <ShieldCheck size={18} color="var(--green-success)" /> Canais oficiais
            </h2>
            <div className="canais-grid">
              {oficiais.map(c => {
                const cor = c.vertical ? VERTICAL_COLORS[c.vertical] : 'var(--gold-primary)';
                return (
                  <article key={c.id} className="canal-card" style={{ borderTopColor: cor }}>
                    <div className="canal-card__top">
                      <h3 className="canal-card__nome">{c.nome}</h3>
                      <span className={`canal-card__acesso canal-card__acesso--${c.acesso}`}>
                        {c.acesso === 'vip' ? 'VIP' : 'GRÁTIS'}
                      </span>
                    </div>

                    {c.handle ? (
                      <code className="canal-card__handle">{fmtHandle(c.handle)}</code>
                    ) : (
                      <span className="canal-card__handle canal-card__handle--vazio">
                        handle por confirmar
                      </span>
                    )}

                    <div className="canal-card__metricas">
                      <div>
                        <Users size={13} />
                        <strong>{fmtSubscritores(c.subscritores)}</strong>
                        <span>subscritores</span>
                      </div>
                      <div>
                        <Eye size={13} />
                        <strong>{fmtEngagement(c.engagement_min, c.engagement_max)}</strong>
                        <span>visualização</span>
                      </div>
                    </div>

                    {c.cadencia && (
                      <div className={`canal-card__cadencia${c.cadencia_estavel ? '' : ' canal-card__cadencia--irregular'}`}>
                        <CalendarClock size={13} />
                        {c.cadencia}
                      </div>
                    )}

                    {c.nota && <p className="canal-card__nota">{c.nota}</p>}

                    {c.url && (
                      <a className="canal-card__link" href={c.url} target="_blank" rel="noopener noreferrer">
                        Abrir no Telegram <ExternalLink size={12} />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── CONTACTOS ── */}
          {contactos.length > 0 && (
            <section className="canais-sec">
              <h2 className="canais-sec__title">
                <MessageCircle size={18} color="var(--gold-primary)" /> Contactos oficiais
              </h2>
              <p className="canais-sec__sub">
                Os únicos contactos diretos legítimos. Qualquer outro perfil que te
                escreva em privado a falar de VIP não é da equipa.
              </p>
              <div className="canais-contactos">
                {contactos.map(c => (
                  <a
                    key={c.id}
                    className="canal-contacto"
                    href={c.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ShieldCheck size={14} />
                    <code>{fmtHandle(c.handle)}</code>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ── FALSOS ── */}
          {falsos.length > 0 && (
            <section className="canais-sec">
              <h2 className="canais-sec__title canais-sec__title--perigo">
                <ShieldX size={18} /> Perfis falsos identificados
              </h2>
              <p className="canais-sec__sub">
                Verificados um a um. Nenhum destes tem qualquer ligação ao El Pedrito.
                Se receberes mensagem de algum, não pagues nada e denuncia.
              </p>
              <div className="canais-falsos">
                {falsos.map(c => (
                  <article key={c.id} className="canal-falso">
                    <div className="canal-falso__top">
                      <span className="canal-falso__badge">FALSO</span>
                      <h3>{c.nome}</h3>
                    </div>
                    <code className="canal-falso__handle">{fmtHandle(c.handle)}</code>
                    {c.subscritores != null && (
                      <span className="canal-falso__subs">
                        {fmtSubscritores(c.subscritores)} subscritores enganados
                      </span>
                    )}
                    {c.nota && <p className="canal-falso__nota">{c.nota}</p>}
                  </article>
                ))}
              </div>

              <div className="canais-denuncia">
                <Flag size={16} />
                <div>
                  <strong>Encontraste outro?</strong>
                  <span>
                    Denuncia dentro do Telegram (menu do perfil › Report) e avisa-nos
                    pelo suporte do Hub. Quanto mais depressa souberem, menos membros
                    são apanhados.
                  </span>
                </div>
              </div>
            </section>
          )}

          {recolha && (
            <p className="canais-recolha">
              Números recolhidos por observação direta a{' '}
              {new Date(recolha).toLocaleDateString('pt-PT', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}. Valores aproximados ao momento da recolha.
            </p>
          )}
        </>
      )}
    </div>
  );
}
