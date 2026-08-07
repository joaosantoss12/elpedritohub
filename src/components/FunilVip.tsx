import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, CalendarClock, CheckCircle, Loader2, X, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  carregarVideos, pedidoPendente, pedirReuniao,
  type VipVideo, type Reuniao,
} from '../lib/funilVip';
import '../styles/FunilVip.css';

/**
 * Funil de conversão para VIP — roadmap 12.
 *
 * O Pedrito explica o VIP em vídeo e quem ficar interessado marca 15 minutos
 * com ele e a equipa. O pedido fica registado no Hub, não num DM: é a mesma
 * regra da página de canais — o que é comercial acontece aqui, onde se vê.
 */
export default function FunilVip() {
  const navigate = useNavigate();
  const { user, membro } = useAuth();

  const [videos, setVideos] = useState<VipVideo[]>([]);
  const [ativo, setAtivo] = useState<VipVideo | null>(null);

  const [pendente, setPendente] = useState<Reuniao | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [preferencia, setPreferencia] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    let vivo = true;
    carregarVideos().then(vs => { if (vivo) setVideos(vs); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    pedidoPendente(user.id).then(r => { if (vivo) setPendente(r); });
    return () => { vivo = false; };
  }, [user]);

  const abrirForm = () => {
    if (!user) { navigate('/login'); return; }
    // Pré-preencher com o que já sabemos: menos campos, menos desistências.
    setNome(prev => prev || membro?.nome || '');
    setEmail(prev => prev || membro?.email || user.email || '');
    setErro(null);
    setFormAberto(true);
  };

  const submeter = async () => {
    if (!user) return;
    if (!nome.trim() || !email.trim()) {
      setErro('Nome e email são obrigatórios.');
      return;
    }
    try {
      setEnviando(true);
      setErro(null);
      await pedirReuniao(user.id, { nome, email, telefone, preferencia, mensagem });
      setEnviado(true);
      setFormAberto(false);
      setPendente(await pedidoPendente(user.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const jaEVip = membro?.subscription_status === 'active';

  // Sem vídeos e já VIP, não há funil nenhum para mostrar.
  if (jaEVip && videos.length === 0) return null;

  return (
    <section className="funil">
      <header className="funil__head">
        <div className="funil__eyebrow"><PlayCircle size={14} /> ANTES DE DECIDIRES</div>
        <h2>O VIP explicado pelo <span>Pedrito</span></h2>
        <p>
          Em vez de uma lista de promessas, vê o que lá está por dentro. Se
          ficares com dúvidas, falas com a equipa antes de pagar seja o que for.
        </p>
      </header>

      {videos.length > 0 && (
        <div className="funil__videos">
          {videos.map(v => (
            <button key={v.id} className="funil-video" onClick={() => setAtivo(v)}>
              <div className="funil-video__thumb">
                {v.thumb_url
                  ? <img src={v.thumb_url} alt={v.titulo} loading="lazy" />
                  : <div className="funil-video__placeholder" />}
                <span className="funil-video__play"><PlayCircle size={34} /></span>
                {v.duracao && <span className="funil-video__dur">{v.duracao}</span>}
              </div>
              <strong>{v.titulo}</strong>
              {v.descricao && <span>{v.descricao}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ── Reunião ── */}
      {!jaEVip && (
        <div className="funil-reuniao">
          <div className="funil-reuniao__icone"><CalendarClock size={22} /></div>

          {pendente ? (
            <div className="funil-reuniao__txt">
              <strong>O teu pedido está registado</strong>
              <span>
                {pendente.estado === 'agendada' && pendente.agendada_para
                  ? `Reunião marcada para ${new Date(pendente.agendada_para).toLocaleString('pt-PT')}.`
                  : 'A equipa vai contactar-te para combinar a hora. Não é preciso fazer mais nada.'}
              </span>
            </div>
          ) : enviado ? (
            <div className="funil-reuniao__txt">
              <strong><CheckCircle size={15} /> Pedido enviado</strong>
              <span>A equipa entra em contacto contigo para marcar os 15 minutos.</span>
            </div>
          ) : (
            <>
              <div className="funil-reuniao__txt">
                <strong>15 minutos com o Pedrito e a equipa</strong>
                <span>
                  Gratuito e sem compromisso. Fazes as perguntas que quiseres sobre
                  o VIP, a gestão de banca e o que esperar de resultados.
                </span>
              </div>
              <button className="funil-reuniao__cta" onClick={abrirForm}>
                Marcar reunião
              </button>
            </>
          )}
        </div>
      )}

      <p className="funil__nota">
        <ShieldCheck size={13} />
        A reunião marca-se aqui e a subscrição faz-se aqui. Ninguém da equipa te
        vai abordar em privado a pedir pagamentos.
      </p>

      {/* ── Modal do vídeo ── */}
      {ativo && (
        <div className="funil-modal" onClick={() => setAtivo(null)}>
          <div className="funil-modal__box" onClick={e => e.stopPropagation()}>
            <button className="funil-modal__close" onClick={() => setAtivo(null)} aria-label="Fechar">
              <X size={18} />
            </button>
            <div className="funil-modal__player">
              <iframe
                src={ativo.embed_url}
                title={ativo.titulo}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <h3>{ativo.titulo}</h3>
            {ativo.descricao && <p>{ativo.descricao}</p>}
          </div>
        </div>
      )}

      {/* ── Modal do pedido ── */}
      {formAberto && (
        <div className="funil-modal" onClick={() => setFormAberto(false)}>
          <div className="funil-modal__box funil-modal__box--form" onClick={e => e.stopPropagation()}>
            <button className="funil-modal__close" onClick={() => setFormAberto(false)} aria-label="Fechar">
              <X size={18} />
            </button>
            <h3>Marcar 15 minutos</h3>
            <p className="funil-form__sub">
              Deixa o contacto e a altura que te dá jeito. A equipa confirma contigo.
            </p>

            <label className="funil-form__campo">
              <span>Nome</span>
              <input value={nome} onChange={e => setNome(e.target.value)} />
            </label>
            <label className="funil-form__campo">
              <span>Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="funil-form__campo">
              <span>Telefone (opcional)</span>
              <input value={telefone} onChange={e => setTelefone(e.target.value)} />
            </label>
            <label className="funil-form__campo">
              <span>Quando te dá jeito</span>
              <input
                value={preferencia}
                onChange={e => setPreferencia(e.target.value)}
                placeholder="Ex.: dias de semana ao fim da tarde"
              />
            </label>
            <label className="funil-form__campo">
              <span>Alguma pergunta em concreto? (opcional)</span>
              <textarea rows={3} value={mensagem} onChange={e => setMensagem(e.target.value)} />
            </label>

            {erro && <p className="funil-form__erro">{erro}</p>}

            <div className="funil-form__acoes">
              <button className="funil-form__cancelar" onClick={() => setFormAberto(false)}>
                Cancelar
              </button>
              <button className="funil-form__enviar" onClick={submeter} disabled={enviando}>
                {enviando ? <Loader2 size={14} className="funil-spin" /> : <CalendarClock size={14} />}
                Enviar pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
