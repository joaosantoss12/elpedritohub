import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Settings, ChevronDown, ChevronUp, Music,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/* Barra de música estilo Spotify. Controla um player do YouTube escondido
   (IFrame API) — o utilizador cola um link de vídeo ou de playlist no botão
   "Configurar". A barra vive no App, fora do <Routes>, por isso a música não
   pára ao mudar de página. Nada disto toca em direitos de terceiros: é o
   próprio player do YouTube a servir, com os anúncios e tudo. */

const CHAVE_CFG = 'ep-musica-cfg';
const CHAVE_ABERTO = 'ep-musica-aberto';

interface Config {
  tipo: 'video' | 'playlist';
  id: string;
  origem: string;
}

// Aceita: watch?v=ID, youtu.be/ID, list=ID, /playlist?list=ID, ou o ID cru.
function interpretarLink(bruto: string): Config | null {
  const s = bruto.trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const list = u.searchParams.get('list');
    if (list) return { tipo: 'playlist', id: list, origem: s };
    const v = u.searchParams.get('v');
    if (v) return { tipo: 'video', id: v, origem: s };
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1).split('/')[0];
      if (id) return { tipo: 'video', id, origem: s };
    }
  } catch {
    /* não era URL — talvez seja um ID direto */
  }
  if (/^[\w-]{11}$/.test(s)) return { tipo: 'video', id: s, origem: s };
  if (/^(PL|OL|RD|UU|FL|LL)[\w-]{10,}$/.test(s)) return { tipo: 'playlist', id: s, origem: s };
  return null;
}

// Playlist que carrega à primeira visita — começa em pausa.
const CONFIG_PADRAO: Config = {
  tipo: 'playlist',
  id: 'PLZjyOXTKuD2TKf4nWnkl5vo-qoRl8bW9y',
  origem: 'https://www.youtube.com/watch?v=yvOh7vVqlaE&list=PLZjyOXTKuD2TKf4nWnkl5vo-qoRl8bW9y',
};

function lerConfig(): Config {
  try {
    const cru = localStorage.getItem(CHAVE_CFG);
    return cru ? (JSON.parse(cru) as Config) : CONFIG_PADRAO;
  } catch {
    return CONFIG_PADRAO;
  }
}

function mmss(seg: number): string {
  if (!Number.isFinite(seg) || seg < 0) return '0:00';
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Carrega a IFrame API uma só vez, resolve quando `window.YT` está pronto.
let promessaYT: Promise<void> | null = null;
function carregarYT(): Promise<void> {
  if (promessaYT) return promessaYT;
  promessaYT = new Promise((resolve) => {
    const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT && w.YT.Player) { resolve(); return; }
    const anterior = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { anterior?.(); resolve(); };
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return promessaYT;
}

export function LeitorMusica() {
  const { user } = useAuth();

  const [config, setConfig] = useState<Config>(lerConfig);
  const [aberto, setAberto] = useState<boolean>(() => {
    try { return localStorage.getItem(CHAVE_ABERTO) !== 'nao'; } catch { return true; }
  });
  const [aConfigurar, setAConfigurar] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [erroLink, setErroLink] = useState<string | null>(null);

  const [pronto, setPronto] = useState(false);
  const [tocar, setTocar] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [autor, setAutor] = useState('');
  const [videoId, setVideoId] = useState('');
  const [atual, setAtual] = useState(0);
  const [total, setTotal] = useState(0);
  const [volume, setVolume] = useState<number>(() => {
    try { return Number(localStorage.getItem('ep-musica-vol') ?? '70'); } catch { return 70; }
  });
  const [mudo, setMudo] = useState(false);

  const playerRef = useRef<any>(null);
  const arrastarRef = useRef(false);
  // Só toca sozinho depois de o utilizador escolher algo (é o gesto que
  // desbloqueia o autoplay). À primeira carga fica em pausa.
  const autoTocarRef = useRef(false);

  // Cria o player quando há configuração.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;

    void carregarYT().then(() => {
      if (cancelado) return;
      const w = window as any;
      const alvo = document.getElementById('ep-yt-alvo');
      if (!alvo) return;

      const comum = {
        events: {
          onReady: (e: any) => {
            setPronto(true);
            e.target.setVolume(volume);
            const d = e.target.getVideoData?.();
            if (d) { setTitulo(d.title ?? ''); setAutor(d.author ?? ''); }
          },
          onStateChange: (e: any) => {
            // 1 = a tocar, 2 = em pausa, 0 = fim
            setTocar(e.data === 1);
            const d = e.target.getVideoData?.();
            if (d?.title) { setTitulo(d.title); setAutor(d.author ?? ''); }
            setVideoId(e.target.getVideoData?.()?.video_id ?? '');
            setTotal(e.target.getDuration?.() ?? 0);
          },
        },
      };

      const auto = autoTocarRef.current;

      if (playerRef.current?.cueVideoById) {
        if (config.tipo === 'playlist') {
          if (auto) playerRef.current.loadPlaylist({ list: config.id, listType: 'playlist' });
          else playerRef.current.cuePlaylist({ list: config.id, listType: 'playlist' });
        } else if (auto) {
          playerRef.current.loadVideoById(config.id);
        } else {
          playerRef.current.cueVideoById(config.id);
        }
        playerRef.current.setVolume(mudo ? 0 : volume);
        setPronto(true);
        return;
      }

      playerRef.current = new w.YT.Player('ep-yt-alvo', {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: auto ? 1 : 0,
          playsinline: 1,
          ...(config.tipo === 'playlist'
            ? { listType: 'playlist', list: config.id }
            : {}),
        },
        ...(config.tipo === 'video' ? { videoId: config.id } : {}),
        ...comum,
      });
    });

    return () => { cancelado = true; };
  }, [config, user]);

  // Relógio da barra de progresso.
  useEffect(() => {
    if (!pronto) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime || arrastarRef.current) return;
      setAtual(p.getCurrentTime() ?? 0);
      const dur = p.getDuration?.() ?? 0;
      if (dur && dur !== total) setTotal(dur);
    }, 500);
    return () => clearInterval(t);
  }, [pronto, total]);

  useEffect(() => {
    try { localStorage.setItem('ep-musica-vol', String(volume)); } catch { /* privado */ }
    const p = playerRef.current;
    if (p?.setVolume) p.setVolume(mudo ? 0 : volume);
  }, [volume, mudo]);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_ABERTO, aberto ? 'sim' : 'nao'); } catch { /* privado */ }
  }, [aberto]);

  // O widget de DROP flutua no canto — empurra-o para cima quando a barra está.
  useEffect(() => {
    document.body.classList.toggle('tem-leitor-musica', Boolean(user) && aberto);
    return () => document.body.classList.remove('tem-leitor-musica');
  }, [user, aberto]);

  const alternar = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (tocar) p.pauseVideo(); else p.playVideo();
  }, [tocar]);

  const guardarConfig = () => {
    const c = interpretarLink(rascunho);
    if (!c) { setErroLink('Não reconheci esse link do YouTube.'); return; }
    try { localStorage.setItem(CHAVE_CFG, JSON.stringify(c)); } catch { /* privado */ }
    autoTocarRef.current = true; // escolha do utilizador → pode tocar já
    setConfig(c);
    setPronto(false);
    setAConfigurar(false);
    setErroLink(null);
    setRascunho('');
    setAtual(0);
    setTotal(0);
  };

  if (!user) return null;

  const temPlaylist = config?.tipo === 'playlist';
  const pct = total > 0 ? (atual / total) * 100 : 0;

  return (
    <>
      {/* alvo do player — 0×0, fora de vista, mas presente no DOM */}
      <div className="ep-yt-cofre"><div id="ep-yt-alvo" /></div>

      <div className={`leitor-musica${aberto ? '' : ' leitor-musica--min'}`}>
        <button
          className="leitor-musica__aba"
          onClick={() => setAberto(a => !a)}
          title={aberto ? 'Esconder o leitor' : 'Mostrar o leitor'}
        >
          {aberto ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {aberto && (
          <div className="leitor-musica__corpo">
            <div className="leitor-musica__faixa">
              {videoId ? (
                <img
                  src={`https://i.ytimg.com/vi/${videoId}/default.jpg`}
                  alt=""
                  className="leitor-musica__capa"
                />
              ) : (
                <span className="leitor-musica__capa leitor-musica__capa--vazia">
                  <Music size={18} />
                </span>
              )}
              <span className="leitor-musica__meta">
                <strong>{titulo || (config ? 'A carregar…' : 'Sem música configurada')}</strong>
                <em>{autor || (config ? '' : 'Carrega em Configurar para escolher')}</em>
              </span>
            </div>

            <div className="leitor-musica__centro">
              <div className="leitor-musica__botoes">
                <button
                  onClick={() => playerRef.current?.previousVideo?.()}
                  disabled={!temPlaylist || !pronto}
                  title="Anterior"
                >
                  <SkipBack size={18} />
                </button>
                <button
                  className="leitor-musica__play"
                  onClick={alternar}
                  disabled={!pronto}
                  title={tocar ? 'Pausar' : 'Tocar'}
                >
                  {tocar ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button
                  onClick={() => playerRef.current?.nextVideo?.()}
                  disabled={!temPlaylist || !pronto}
                  title="Próxima"
                >
                  <SkipForward size={18} />
                </button>
              </div>

              <div className="leitor-musica__progresso">
                <span>{mmss(atual)}</span>
                <input
                  type="range"
                  min={0}
                  max={total || 100}
                  value={atual}
                  step={1}
                  onPointerDown={() => { arrastarRef.current = true; }}
                  onChange={e => setAtual(Number(e.target.value))}
                  onPointerUp={e => {
                    arrastarRef.current = false;
                    const seg = Number((e.target as HTMLInputElement).value);
                    playerRef.current?.seekTo?.(seg, true);
                  }}
                  style={{ ['--pct' as string]: `${pct}%` }}
                  aria-label="Posição da música"
                />
                <span>{mmss(total)}</span>
              </div>
            </div>

            <div className="leitor-musica__direita">
              <button
                className="leitor-musica__vol-btn"
                onClick={() => setMudo(m => !m)}
                title={mudo ? 'Repor som' : 'Silenciar'}
              >
                {mudo || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                className="leitor-musica__vol"
                min={0}
                max={100}
                value={mudo ? 0 : volume}
                onChange={e => { setMudo(false); setVolume(Number(e.target.value)); }}
                style={{ ['--pct' as string]: `${mudo ? 0 : volume}%` }}
                aria-label="Volume"
              />
              <button
                className="leitor-musica__cfg"
                onClick={() => { setRascunho(config?.origem ?? ''); setAConfigurar(v => !v); }}
                title="Configurar música"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
        )}

        {aConfigurar && aberto && (
          <div className="leitor-musica__painel">
            <label>Link do YouTube (vídeo ou playlist)</label>
            <input
              autoFocus
              value={rascunho}
              onChange={e => { setRascunho(e.target.value); setErroLink(null); }}
              onKeyDown={e => { if (e.key === 'Enter') guardarConfig(); }}
              placeholder="https://www.youtube.com/watch?v=…  ou  …?list=…"
            />
            {erroLink && <p className="leitor-musica__erro">{erroLink}</p>}
            <div className="leitor-musica__painel-acoes">
              <button className="leitor-musica__ok" onClick={guardarConfig}>Tocar</button>
              <button className="leitor-musica__cancel" onClick={() => setAConfigurar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .ep-yt-cofre {
          position: fixed; width: 0; height: 0; overflow: hidden;
          left: -9999px; top: -9999px; pointer-events: none;
        }
        .leitor-musica {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 950;
          background: var(--card-gradient);
          border-top: 1px solid var(--border-strong);
          box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
        }
        .leitor-musica__aba {
          position: absolute; top: -26px; right: 24px;
          width: 42px; height: 26px; padding: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--card-gradient);
          border: 1px solid var(--border-strong); border-bottom: none;
          border-radius: 8px 8px 0 0; color: var(--text-gray); cursor: pointer;
        }
        .leitor-musica__aba:hover { color: var(--gold-primary); }
        .leitor-musica__corpo {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr) minmax(0, 1fr);
          align-items: center; gap: 1.2rem;
          padding: 0.7rem 1.4rem; max-width: 1400px; margin: 0 auto;
        }
        .leitor-musica__faixa { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
        .leitor-musica__capa {
          width: 42px; height: 42px; border-radius: 8px; object-fit: cover;
          flex-shrink: 0; border: 1px solid var(--border-color);
          display: flex; align-items: center; justify-content: center;
          background: var(--surface-sunken); color: var(--text-muted);
        }
        .leitor-musica__meta { display: flex; flex-direction: column; min-width: 0; }
        .leitor-musica__meta strong {
          font-size: 0.82rem; color: var(--text-white);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .leitor-musica__meta em {
          font-style: normal; font-size: 0.72rem; color: var(--text-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .leitor-musica__centro { display: flex; flex-direction: column; gap: 0.35rem; align-items: center; }
        .leitor-musica__botoes { display: flex; align-items: center; gap: 0.5rem; }
        .leitor-musica__botoes button {
          display: flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; padding: 0; border: none; border-radius: 50%;
          background: transparent; color: var(--text-gray); cursor: pointer;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .leitor-musica__botoes button:hover:not(:disabled) { color: var(--text-white); }
        .leitor-musica__botoes button:disabled { opacity: 0.35; cursor: default; }
        .leitor-musica__play {
          background: var(--gold-primary) !important; color: #0d1220 !important;
          width: 34px !important; height: 34px !important;
        }
        .leitor-musica__play:hover:not(:disabled) { background: var(--gold-light) !important; }
        .leitor-musica__progresso {
          display: flex; align-items: center; gap: 0.6rem; width: 100%;
          font-size: 0.68rem; color: var(--text-muted); font-variant-numeric: tabular-nums;
        }
        .leitor-musica__direita {
          display: flex; align-items: center; gap: 0.5rem; justify-content: flex-end;
        }
        .leitor-musica__vol-btn, .leitor-musica__cfg {
          display: flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; padding: 0; border: none; border-radius: 8px;
          background: transparent; color: var(--text-gray); cursor: pointer;
        }
        .leitor-musica__vol-btn:hover, .leitor-musica__cfg:hover { color: var(--gold-primary); }
        .leitor-musica__vol { width: 90px; }

        .leitor-musica input[type="range"] {
          -webkit-appearance: none; appearance: none; height: 4px; flex: 1;
          border-radius: 3px; cursor: pointer;
          background: linear-gradient(to right,
            var(--gold-primary) 0%, var(--gold-primary) var(--pct, 0%),
            var(--border-strong) var(--pct, 0%), var(--border-strong) 100%);
        }
        .leitor-musica input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 11px; height: 11px; border-radius: 50%;
          background: var(--text-white); border: none;
        }
        .leitor-musica input[type="range"]::-moz-range-thumb {
          width: 11px; height: 11px; border-radius: 50%;
          background: var(--text-white); border: none;
        }

        .leitor-musica--min .leitor-musica__corpo { display: none; }
        .leitor-musica--min { background: transparent; box-shadow: none; border-top: none; }
        .leitor-musica--min .leitor-musica__aba {
          border: 1px solid var(--border-strong);
          border-radius: 8px 8px 0 0;
        }

        .leitor-musica__painel {
          position: absolute; right: 16px; bottom: calc(100% + 8px);
          width: min(360px, calc(100vw - 32px));
          display: flex; flex-direction: column; gap: 0.5rem;
          padding: 1rem; background: var(--bg-card);
          border: 1px solid var(--border-strong); border-radius: 12px;
          box-shadow: var(--shadow-card);
        }
        .leitor-musica__painel label {
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.4px; color: var(--text-muted);
        }
        .leitor-musica__painel input {
          padding: 0.6rem 0.7rem; border-radius: 8px;
          border: 1px solid var(--border-strong); background: var(--bg-main);
          color: var(--text-white); font-size: 0.82rem;
        }
        .leitor-musica__painel input:focus { outline: none; border-color: var(--gold-primary); }
        .leitor-musica__erro { font-size: 0.74rem; color: #e0736b; margin: 0; }
        .leitor-musica__painel-acoes { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
        .leitor-musica__ok, .leitor-musica__cancel {
          flex: 1; padding: 0.55rem; border-radius: 8px; font-weight: 700;
          font-size: 0.8rem; cursor: pointer; border: 1px solid var(--border-strong);
        }
        .leitor-musica__ok { background: var(--gold-primary); color: #0d1220; border-color: transparent; }
        .leitor-musica__cancel { background: transparent; color: var(--text-gray); }

        body.tem-leitor-musica .gm-drop { bottom: 92px; }

        @media (max-width: 820px) {
          .leitor-musica__corpo {
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-areas: 'faixa botoes' 'progresso progresso';
            gap: 0.5rem 0.8rem; padding: 0.6rem 1rem;
          }
          .leitor-musica__faixa { grid-area: faixa; }
          .leitor-musica__centro { grid-area: progresso; }
          .leitor-musica__botoes { grid-area: botoes; }
          .leitor-musica__direita { display: none; }
          .leitor-musica__centro { display: contents; }
          .leitor-musica__progresso { grid-area: progresso; }
        }

        @media (prefers-reduced-motion: reduce) {
          .leitor-musica__botoes button, .leitor-musica__aba { transition: none; }
        }
      `}</style>
    </>
  );
}
