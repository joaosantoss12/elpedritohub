import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Livestream from './Livestream';
import Chat from './Chat';
import { AvisoPerfisFalsos } from '../components/AvisoPerfisFalsos';
import { CanaisOficiais } from '../components/CanaisOficiais';
import { Radio, MessageSquare, Tv, ExternalLink, Send, ShieldCheck, LogIn } from 'lucide-react';
import '../styles/SalaComando.css';

type Aba = 'direto' | 'comunidade' | 'canais';

interface SalaConfig {
  online: boolean;
  titulo: string | null;
  twitch_channel: string | null;
  telegram_tv_url: string | null;
  telegram_chat_url: string | null;
}

/**
 * Sala de Comando — junta num só sítio o que antes estavam em dois separadores
 * distintos (Live e Chat). Nada aqui substitui as casas originais: os diretos
 * apontam para a Twitch, o chat e os canais apontam para o Telegram.
 */
export default function SalaComando() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const abaPedida = (location.state as { aba?: Aba } | null)?.aba;
  const [aba, setAba] = useState<Aba>(abaPedida ?? 'direto');
  const [config, setConfig] = useState<SalaConfig>({
    online: false, titulo: null, twitch_channel: null,
    telegram_tv_url: null, telegram_chat_url: null,
  });

  // A Sala já não exige sessão: os Canais Oficiais são aviso de segurança
  // público (roadmap 9) e têm de ficar acessíveis a quem ainda não é membro.
  // Só o Direto e a Comunidade continuam reservados a quem tem conta.
  useEffect(() => {
    if (!loading && !user && !abaPedida) setAba('canais');
  }, [loading, user, abaPedida]);

  useEffect(() => {
    supabase
      .from('livestream_config')
      .select('online, titulo, twitch_channel, telegram_tv_url, telegram_chat_url')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        // A migração pode ainda não ter corrido — a sala tem de abrir na mesma.
        if (error) { console.warn('livestream_config:', error.message); return; }
        if (data) setConfig(data as SalaConfig);
      });

    const sub = supabase
      .channel('sala_config')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'livestream_config' }, payload => {
        setConfig(prev => ({ ...prev, ...(payload.new as Partial<SalaConfig>) }));
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  return (
    <div className="sala-page">
      <Navbar />

      <header className="sala-header">
        <div>
          <h1 className="sala-title">
            <Radio size={24} color="var(--gold-primary)" />
            Sala de Comando
          </h1>
          <p className="sala-sub">
            Um único sítio para chegar aos dois: os diretos na Twitch, o chat e os
            canais no Telegram.
            {config.online ? ' Estamos em direto agora.' : ' O direto está offline de momento.'}
          </p>
        </div>

        {/* A Sala organiza o acesso, não substitui nenhuma das duas casas:
            direto vive na Twitch, comunidade vive no Telegram. */}
        <div className="sala-links">
          {config.twitch_channel && (
            <a
              className="sala-link sala-link--tv"
              href={`https://twitch.tv/${config.twitch_channel}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Tv size={15} /> Ver na Twitch <ExternalLink size={12} />
            </a>
          )}
          {config.telegram_chat_url && (
            <a className="sala-link" href={config.telegram_chat_url} target="_blank" rel="noopener noreferrer">
              <Send size={14} /> Canal público no Telegram <ExternalLink size={12} />
            </a>
          )}
          {config.telegram_tv_url && (
            <a className="sala-link" href={config.telegram_tv_url} target="_blank" rel="noopener noreferrer">
              <Send size={14} /> Canal TV <ExternalLink size={12} />
            </a>
          )}
        </div>
      </header>

      {/* O sítio onde mandamos gente para o Telegram é o sítio onde o aviso
          sobre perfis falsos tem mais valor (roadmap 9). */}
      <div className="sala-aviso">
        <AvisoPerfisFalsos compacto />
      </div>

      <nav className="sala-tabs">
        <button
          className={`sala-tab${aba === 'direto' ? ' sala-tab--active' : ''}`}
          onClick={() => setAba('direto')}
        >
          <Radio size={15} /> Direto
          {config.online && <span className="sala-tab__dot" />}
        </button>
        <button
          className={`sala-tab${aba === 'comunidade' ? ' sala-tab--active' : ''}`}
          onClick={() => setAba('comunidade')}
        >
          <MessageSquare size={15} /> Comunidade
        </button>
        <button
          className={`sala-tab${aba === 'canais' ? ' sala-tab--active' : ''}`}
          onClick={() => setAba('canais')}
        >
          <ShieldCheck size={15} /> Canais
        </button>
      </nav>

      {/* As três abas ficam montadas: o chat mantém o histórico e as
          subscrições realtime ao alternar de separador. */}
      <div className={`sala-panel${aba === 'direto' ? '' : ' sala-panel--hidden'}`}>
        {user ? <Livestream embedded /> : <SalaLoginCTA />}
      </div>
      <div className={`sala-panel${aba === 'comunidade' ? '' : ' sala-panel--hidden'}`}>
        {user ? <Chat embedded /> : <SalaLoginCTA />}
      </div>
      <div className={`sala-panel${aba === 'canais' ? '' : ' sala-panel--hidden'}`}>
        <CanaisOficiais />
      </div>
    </div>
  );
}

/** CTA de sessão para as abas Direto/Comunidade quando não há utilizador — os
    Canais continuam acessíveis nesta mesma página sem exigir login. */
function SalaLoginCTA() {
  const navigate = useNavigate();
  return (
    <div className="sala-login-cta">
      <LogIn size={28} color="var(--gold-primary)" />
      <h3>Inicia sessão para veres esta secção</h3>
      <p>O direto e o chat da comunidade são reservados a membros. Os canais oficiais ficam sempre visíveis, com ou sem conta.</p>
      <div className="sala-login-cta__actions">
        <button className="btn-gold" onClick={() => navigate('/login')}>ENTRAR</button>
        <button className="btn-outline" onClick={() => navigate('/register')}>REGISTAR</button>
      </div>
    </div>
  );
}
