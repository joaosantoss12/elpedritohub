import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Settings, ChevronDown, ChevronUp, Music, Shuffle, ListMusic, Heart,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { eLinkSpotify, resolverSpotify } from '../lib/musicaSpotify';

/* Barra de música estilo Spotify. Controla um player do YouTube escondido
   (IFrame API) — o utilizador cola um link de vídeo ou de playlist no botão
   "Configurar". A barra vive no App, fora do <Routes>, por isso a música não
   pára ao mudar de página. Nada disto toca em direitos de terceiros: é o
   próprio player do YouTube a servir, com os anúncios e tudo.

   Links do Spotify (playlist/álbum/faixa) também servem: o /api/musica/spotify
   traduz a lista para IDs do YouTube — como fazem os bots de música do Discord —
   e daí para a frente é uma playlist normal do player. */

const CHAVE_CFG = 'ep-musica-cfg';
const CHAVE_ABERTO = 'ep-musica-aberto';
// Onde ficou a reprodução ao sair da página, para retomar na mesma faixa.
const CHAVE_ESTADO = 'ep-musica-estado';

interface EstadoGuardado { cfg: string; indice: number; pos: number }

function lerEstado(): EstadoGuardado | null {
  try {
    const cru = localStorage.getItem(CHAVE_ESTADO);
    if (!cru) return null;
    const e = JSON.parse(cru) as EstadoGuardado;
    return typeof e?.cfg === 'string' ? e : null;
  } catch {
    return null;
  }
}

interface Config {
  // 'lista' = conjunto solto de IDs do YouTube (ex.: vindo de um link Spotify),
  // guardados em `id` separados por vírgula.
  tipo: 'video' | 'playlist' | 'lista';
  id: string;
  origem: string;
  nome?: string;
}

// Faixa marcada como favorita — guardada com título/autor para se poder
// listar sem voltar a pedir nada ao YouTube.
interface Faixa {
  id: string;
  titulo: string;
  autor: string;
}

const CHAVE_FAVS = 'ep-musica-favs';

function lerFavoritas(): Faixa[] {
  try {
    const cru = localStorage.getItem(CHAVE_FAVS);
    const arr = cru ? JSON.parse(cru) : [];
    return Array.isArray(arr) ? arr.filter((f: Faixa) => f && f.id) : [];
  } catch {
    return [];
  }
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

/* Nome que não cabe passa a correr tipo rodapé, com pausa nas duas pontas para
   dar tempo de ler. Só anima quando o texto realmente transborda. */
function TextoRolante({ texto }: { texto: string }) {
  const externoRef = useRef<HTMLSpanElement>(null);
  const internoRef = useRef<HTMLSpanElement>(null);
  const [rola, setRola] = useState(false);

  useEffect(() => {
    const ext = externoRef.current;
    const int = internoRef.current;
    if (!ext || !int) return;
    const medir = () => setRola(int.scrollWidth > ext.clientWidth + 4);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(ext);
    return () => ro.disconnect();
  }, [texto]);

  return (
    <span ref={externoRef} className={`texto-rolante${rola ? ' texto-rolante--ativo' : ''}`}>
      <span ref={internoRef} className="texto-rolante__faixa">
        <span className="texto-rolante__parte">{texto}</span>
        {rola && <span className="texto-rolante__parte texto-rolante__parte--eco" aria-hidden="true">{texto}</span>}
      </span>
    </span>
  );
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
  const [aResolver, setAResolver] = useState<string | null>(null);

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

  const [lista, setLista] = useState<string[]>([]);
  const [indiceLista, setIndiceLista] = useState(-1);
  const [verLista, setVerLista] = useState(false);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [aleatorio, setAleatorio] = useState<boolean>(() => {
    try { return localStorage.getItem('ep-musica-shuffle') === 'sim'; } catch { return false; }
  });
  const [favoritas, setFavoritas] = useState<Faixa[]>(lerFavoritas);
  const [abaLista, setAbaLista] = useState<'playlist' | 'favoritas'>('playlist');

  const playerRef = useRef<any>(null);
  const arrastarRef = useRef(false);
  // Só toca sozinho depois de o utilizador escolher algo (é o gesto que
  // desbloqueia o autoplay). À primeira carga fica em pausa.
  const autoTocarRef = useRef(false);
  // Que config já está montada no player. Evita re-cue (que volta a faixa ao
  // início e põe em pausa) quando o efeito re-corre sem a config ter mudado —
  // p.ex. o Supabase renova o token ao voltar à tab e o objeto `user` muda de
  // identidade.
  const configMontadaRef = useRef<string | null>(null);
  const autenticado = Boolean(user);

  // Cria o player quando há configuração.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;

    void carregarYT().then(() => {
      if (cancelado) return;
      const w = window as any;
      const alvo = document.getElementById('ep-yt-alvo');
      if (!alvo) return;

      const sincronizarLista = (p: any) => {
        const arr: string[] = p.getPlaylist?.() ?? [];
        setLista(Array.isArray(arr) ? arr : []);
        setIndiceLista(p.getPlaylistIndex?.() ?? -1);
      };

      const auto = autoTocarRef.current;
      const chaveConfig = `${config.tipo}:${config.id}`;
      // 'lista': IDs soltos do YouTube (ex.: vindos de um link Spotify).
      const idsLista = config.tipo === 'lista' ? config.id.split(',').filter(Boolean) : [];
      // Só se retoma se a lista/faixa for exactamente a mesma de antes.
      const guardado = lerEstado();
      const retomar = guardado && guardado.cfg === chaveConfig
        ? { indice: Math.max(0, guardado.indice), pos: Math.max(0, guardado.pos - 1) }
        : null;

      const comum = {
        events: {
          onReady: (e: any) => {
            setPronto(true);
            e.target.setVolume(mudo ? 0 : volume);
            if (config.tipo !== 'video') e.target.setShuffle?.(aleatorio);
            // Recoloca a reprodução onde ficou (em fila, sem tocar sozinho).
            if (retomar) {
              if (config.tipo === 'playlist') {
                e.target.cuePlaylist({
                  list: config.id, listType: 'playlist',
                  index: retomar.indice, startSeconds: retomar.pos,
                });
              } else if (config.tipo === 'lista') {
                e.target.cuePlaylist(idsLista, retomar.indice, retomar.pos);
              } else {
                e.target.cueVideoById({ videoId: config.id, startSeconds: retomar.pos });
              }
            }
            const d = e.target.getVideoData?.();
            if (d) { setTitulo(d.title ?? ''); setAutor(d.author ?? ''); }
            sincronizarLista(e.target);
          },
          onStateChange: (e: any) => {
            // 1 = a tocar, 2 = em pausa, 0 = fim, 5 = em fila
            setTocar(e.data === 1);
            const d = e.target.getVideoData?.();
            if (d?.title) { setTitulo(d.title); setAutor(d.author ?? ''); }
            setVideoId(d?.video_id ?? '');
            setTotal(e.target.getDuration?.() ?? 0);
            sincronizarLista(e.target);
          },
        },
      };

      if (playerRef.current?.cueVideoById) {
        // Já é a mesma config montada — não mexer, senão a faixa volta ao início.
        if (configMontadaRef.current === chaveConfig) { setPronto(true); return; }

        // 'lista' = IDs soltos do YouTube (link do Spotify). O `loadPlaylist`/
        // `cuePlaylist` com um array de IDs não recarrega um player que já
        // existe (bug antigo do IFrame API — só a via `playerVars.playlist` na
        // criação é fiável). Por isso destrói-se e recria-se do zero.
        if (config.tipo === 'lista') {
          try { playerRef.current.destroy?.(); } catch { /* já morto */ }
          playerRef.current = null;
          const cofre = document.querySelector('.ep-yt-cofre');
          if (cofre) cofre.innerHTML = '<div id="ep-yt-alvo"></div>';
          // cai para o ramo de criação abaixo
        } else {
          configMontadaRef.current = chaveConfig;
          if (config.tipo === 'playlist') {
            if (auto) playerRef.current.loadPlaylist({ list: config.id, listType: 'playlist' });
            else playerRef.current.cuePlaylist({ list: config.id, listType: 'playlist' });
          } else if (auto) {
            playerRef.current.loadVideoById(config.id);
          } else {
            playerRef.current.cueVideoById(config.id);
          }
          playerRef.current.setVolume(mudo ? 0 : volume);
          if (config.tipo !== 'video') playerRef.current.setShuffle?.(aleatorio);
          setPronto(true);
          return;
        }
      }

      configMontadaRef.current = chaveConfig;
      playerRef.current = new w.YT.Player('ep-yt-alvo', {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: auto ? 1 : 0,
          playsinline: 1,
          ...(config.tipo === 'playlist'
            ? { listType: 'playlist', list: config.id }
            : {}),
          ...(config.tipo === 'lista' && idsLista.length > 1
            ? { playlist: idsLista.slice(1).join(',') }
            : {}),
        },
        ...(config.tipo === 'video' ? { videoId: config.id } : {}),
        ...(config.tipo === 'lista' ? { videoId: idsLista[0] } : {}),
        ...comum,
      });
    });

    return () => { cancelado = true; };
    // `autenticado` (booleano) em vez de `user`: só reage a entrar/sair, não a
    // cada renovação de token.
  }, [config, autenticado]);

  // Relógio da barra de progresso. Também apanha os metadados quando a faixa
  // está só em fila (cue) — aí o `onStateChange` ainda não disparou, mas o
  // `getVideoData`/`getPlaylist` já respondem passado um instante.
  useEffect(() => {
    if (!pronto) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;

      const d = p.getVideoData?.();
      if (d?.video_id) {
        setVideoId(prev => (prev === d.video_id ? prev : d.video_id));
        if (d.title) {
          setTitulo(prev => (prev ? prev : d.title));
          setAutor(prev => (prev ? prev : d.author ?? ''));
        }
      }
      const arr: string[] = p.getPlaylist?.() ?? [];
      if (Array.isArray(arr) && arr.length) {
        setLista(prev => (prev.length === arr.length ? prev : arr));
        setIndiceLista(p.getPlaylistIndex?.() ?? -1);
      }

      if (arrastarRef.current) return;
      setAtual(p.getCurrentTime() ?? 0);
      const dur = p.getDuration?.() ?? 0;
      if (dur && dur !== total) setTotal(dur);
    }, 500);
    return () => clearInterval(t);
  }, [pronto, total]);

  // Guarda de tempos a tempos onde vai a reprodução, para retomar depois de
  // recarregar ou voltar à página.
  useEffect(() => {
    if (!pronto) return;
    const gravar = () => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      const pos = p.getCurrentTime() ?? 0;
      const idx = p.getPlaylistIndex?.() ?? -1;
      const vid = p.getVideoData?.()?.video_id ?? '';
      if (!vid && pos <= 0) return;
      try {
        localStorage.setItem(CHAVE_ESTADO, JSON.stringify({
          cfg: `${config.tipo}:${config.id}`,
          indice: idx,
          pos,
        }));
      } catch { /* privado */ }
    };
    const t = setInterval(gravar, 3000);
    window.addEventListener('pagehide', gravar);
    return () => { clearInterval(t); window.removeEventListener('pagehide', gravar); gravar(); };
  }, [pronto, config]);

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

  // Vai buscar os títulos das faixas da playlist quando a lista abre (oEmbed
  // do YouTube, sem chave de API). Guarda o que já tiver.
  useEffect(() => {
    if (!verLista) return;
    const emFalta = lista.filter(id => id && !(id in titulos));
    if (emFalta.length === 0) return;
    let vivo = true;
    void Promise.all(
      emFalta.slice(0, 60).map(async id => {
        try {
          const r = await fetch(
            `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`,
          );
          if (!r.ok) return [id, ''] as const;
          const j = await r.json();
          return [id, String(j.title ?? '')] as const;
        } catch {
          return [id, ''] as const;
        }
      }),
    ).then(pares => {
      if (!vivo) return;
      setTitulos(prev => {
        const prox = { ...prev };
        for (const [id, t] of pares) prox[id] = t;
        return prox;
      });
    });
    return () => { vivo = false; };
  }, [verLista, lista, titulos]);

  // Faixa "atual" mesmo antes de tocar: o player em fila já sabe o índice da
  // playlist, por isso dá para mostrar capa/favorito à primeira carga.
  const videoIdAtual = videoId || (indiceLista >= 0 ? lista[indiceLista] : '') || '';

  // Se ainda não temos título/autor da faixa atual (típico com a playlist só
  // em fila), vai buscá-los ao oEmbed — assim a barra fica completa em pausa.
  useEffect(() => {
    if (!videoIdAtual || titulo) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(
          `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoIdAtual}`,
        );
        if (!r.ok || !vivo) return;
        const j = await r.json();
        if (!vivo) return;
        setTitulo(j.title ?? '');
        setAutor(j.author_name ?? '');
        setTitulos(prev => (videoIdAtual in prev ? prev : { ...prev, [videoIdAtual]: String(j.title ?? '') }));
      } catch { /* sem rede — fica o fallback "A carregar…" */ }
    })();
    return () => { vivo = false; };
  }, [videoIdAtual, titulo]);

  const alternar = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (tocar) { p.pauseVideo(); }
    else { autoTocarRef.current = true; p.playVideo(); }
  }, [tocar]);

  const alternarAleatorio = () => {
    setAleatorio(a => {
      const prox = !a;
      try { localStorage.setItem('ep-musica-shuffle', prox ? 'sim' : 'nao'); } catch { /* privado */ }
      playerRef.current?.setShuffle?.(prox);
      return prox;
    });
  };

  const alternarFavorita = (f: Faixa) => {
    if (!f.id) return;
    setFavoritas(prev => {
      const existe = prev.some(x => x.id === f.id);
      const prox = existe
        ? prev.filter(x => x.id !== f.id)
        : [{ id: f.id, titulo: f.titulo, autor: f.autor }, ...prev];
      try { localStorage.setItem(CHAVE_FAVS, JSON.stringify(prox)); } catch { /* privado */ }
      return prox;
    });
  };

  // Toca uma faixa solta (favorita). loadVideoById sai da playlist, o que é o
  // comportamento esperado — o utilizador pediu aquela música.
  const tocarFaixaSolta = (id: string) => {
    autoTocarRef.current = true;
    playerRef.current?.loadVideoById?.(id);
  };

  const aplicarConfig = (c: Config) => {
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

  const guardarConfig = async () => {
    const bruto = rascunho.trim();
    if (aResolver) return;

    if (eLinkSpotify(bruto)) {
      // O Spotify não serve o áudio: traduz-se a lista para vídeos do YouTube
      // no servidor (mesmo princípio dos bots de música do Discord).
      setErroLink(null);
      setAResolver('A ler a lista do Spotify…');
      try {
        const lista = await resolverSpotify(bruto);
        setAResolver(null);
        aplicarConfig({
          tipo: 'lista',
          id: lista.faixas.map(f => f.videoId).join(','),
          origem: bruto,
          nome: lista.nome,
        });
      } catch (e) {
        setAResolver(null);
        setErroLink(e instanceof Error ? e.message : 'Não consegui ler o Spotify.');
      }
      return;
    }

    const c = interpretarLink(bruto);
    if (!c) { setErroLink('Não reconheci esse link do YouTube ou Spotify.'); return; }
    aplicarConfig(c);
  };

  if (!user) return null;

  const temPlaylist = config?.tipo === 'playlist' || config?.tipo === 'lista';
  const pct = total > 0 ? (atual / total) * 100 : 0;
  const favSet = new Set(favoritas.map(f => f.id));
  const abaAtiva: 'playlist' | 'favoritas' =
    !temPlaylist && abaLista === 'playlist' ? 'favoritas' : abaLista;

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
              {videoIdAtual ? (
                <img
                  src={`https://i.ytimg.com/vi/${videoIdAtual}/default.jpg`}
                  alt=""
                  className="leitor-musica__capa"
                />
              ) : (
                <span className="leitor-musica__capa leitor-musica__capa--vazia">
                  <Music size={18} />
                </span>
              )}
              <span className="leitor-musica__meta">
                <strong><TextoRolante texto={titulo || (config ? 'A carregar…' : 'Sem música configurada')} /></strong>
                <em>{autor || (config ? '' : 'Carrega em Configurar para escolher')}</em>
              </span>
              {videoIdAtual && (
                <button
                  className={`leitor-musica__fav${favSet.has(videoIdAtual) ? ' leitor-musica__fav--on' : ''}`}
                  onClick={() => alternarFavorita({ id: videoIdAtual, titulo, autor })}
                  title={favSet.has(videoIdAtual) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                >
                  <Heart size={16} fill={favSet.has(videoIdAtual) ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>

            <div className="leitor-musica__centro">
              <div className="leitor-musica__botoes">
                {temPlaylist && (
                  <button
                    className={aleatorio ? 'leitor-musica__on' : ''}
                    onClick={alternarAleatorio}
                    disabled={!pronto}
                    title={aleatorio ? 'Aleatório ligado' : 'Aleatório'}
                  >
                    <Shuffle size={16} />
                  </button>
                )}
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
                <button
                  className={verLista ? 'leitor-musica__on' : ''}
                  onClick={() => setVerLista(v => !v)}
                  title="Faixas e favoritos"
                >
                  <ListMusic size={16} />
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

        {verLista && aberto && (
          <div className="leitor-musica__lista">
            <div className="leitor-musica__lista-topo">
              <div className="leitor-musica__abas">
                {temPlaylist && (
                  <button
                    className={abaAtiva === 'playlist' ? 'leitor-musica__aba-on' : ''}
                    onClick={() => setAbaLista('playlist')}
                  >
                    Playlist ({lista.length})
                  </button>
                )}
                <button
                  className={abaAtiva === 'favoritas' ? 'leitor-musica__aba-on' : ''}
                  onClick={() => setAbaLista('favoritas')}
                >
                  Favoritas ({favoritas.length})
                </button>
              </div>
              <button onClick={() => setVerLista(false)} title="Fechar">
                <ChevronDown size={16} />
              </button>
            </div>

            {abaAtiva === 'playlist' ? (
              <ul>
                {lista.map((id, i) => (
                  <li
                    key={`${id}-${i}`}
                    className={i === indiceLista ? 'leitor-musica__faixa-item leitor-musica__faixa-item--atual' : 'leitor-musica__faixa-item'}
                    onClick={() => playerRef.current?.playVideoAt?.(i)}
                  >
                    <img src={`https://i.ytimg.com/vi/${id}/default.jpg`} alt="" />
                    <span>{titulos[id] ?? '…'}</span>
                    <button
                      className={`leitor-musica__fav${favSet.has(id) ? ' leitor-musica__fav--on' : ''}`}
                      onClick={e => { e.stopPropagation(); alternarFavorita({ id, titulo: titulos[id] ?? '', autor: '' }); }}
                      title={favSet.has(id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                      <Heart size={14} fill={favSet.has(id) ? 'currentColor' : 'none'} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : favoritas.length === 0 ? (
              <p className="leitor-musica__lista-vazia">
                Ainda não marcaste favoritos. Carrega no <Heart size={12} /> junto à música.
              </p>
            ) : (
              <ul>
                {favoritas.map(f => (
                  <li
                    key={f.id}
                    className={f.id === videoIdAtual ? 'leitor-musica__faixa-item leitor-musica__faixa-item--atual' : 'leitor-musica__faixa-item'}
                    onClick={() => tocarFaixaSolta(f.id)}
                  >
                    <img src={`https://i.ytimg.com/vi/${f.id}/default.jpg`} alt="" />
                    <span>{f.titulo || f.id}</span>
                    <button
                      className="leitor-musica__fav leitor-musica__fav--on"
                      onClick={e => { e.stopPropagation(); alternarFavorita(f); }}
                      title="Remover dos favoritos"
                    >
                      <Heart size={14} fill="currentColor" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {aConfigurar && aberto && (
          <div className="leitor-musica__painel">
            <label>Link do YouTube ou Spotify</label>
            <input
              autoFocus
              value={rascunho}
              onChange={e => { setRascunho(e.target.value); setErroLink(null); }}
              onKeyDown={e => { if (e.key === 'Enter') void guardarConfig(); }}
              placeholder="youtube.com/watch?v=…  ·  open.spotify.com/playlist/…"
            />
            {aResolver && <p className="leitor-musica__aviso-mini">{aResolver}</p>}
            {erroLink && <p className="leitor-musica__erro">{erroLink}</p>}
            <p className="leitor-musica__aviso-mini">
              Playlists do Spotify tocam via YouTube — pode demorar uns segundos a preparar.
            </p>
            <div className="leitor-musica__painel-acoes">
              <button
                className="leitor-musica__ok"
                onClick={() => void guardarConfig()}
                disabled={Boolean(aResolver)}
              >
                {aResolver ? 'A preparar…' : 'Tocar'}
              </button>
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
          display: flex; align-items: center; justify-content: space-between;
          gap: 1.2rem; padding: 0.7rem 1.6rem;
        }
        .leitor-musica__faixa {
          display: flex; align-items: center; gap: 0.7rem;
          min-width: 0; flex: 0 1 280px;
        }
        .leitor-musica__centro { flex: 0 1 480px; }
        .leitor-musica__direita { flex: 0 1 280px; }
        .leitor-musica__capa {
          width: 42px; height: 42px; border-radius: 8px; object-fit: cover;
          flex-shrink: 0; border: 1px solid var(--border-color);
          display: flex; align-items: center; justify-content: center;
          background: var(--surface-sunken); color: var(--text-muted);
        }
        .leitor-musica__meta { display: flex; flex-direction: column; min-width: 0; }
        .leitor-musica__meta strong {
          font-size: 0.82rem; color: var(--text-white); display: block; min-width: 0;
        }
        .texto-rolante {
          display: block; overflow: hidden; white-space: nowrap; max-width: 100%;
        }
        .texto-rolante__faixa { display: inline-flex; }
        .texto-rolante--ativo .texto-rolante__faixa {
          animation: texto-rolante-anda 14s linear infinite;
        }
        .texto-rolante__parte--eco { padding-left: 2.6rem; }
        @keyframes texto-rolante-anda {
          0%, 10% { transform: translateX(0); }
          90%, 100% { transform: translateX(calc(-50% - 1.3rem)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .texto-rolante--ativo .texto-rolante__faixa { animation: none; }
          .texto-rolante--ativo .texto-rolante__parte--eco { display: none; }
          .texto-rolante--ativo { text-overflow: ellipsis; }
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
        .leitor-musica__aviso-mini { font-size: 0.72rem; color: var(--text-muted); margin: 0; }
        .leitor-musica__painel-acoes { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
        .leitor-musica__ok, .leitor-musica__cancel {
          flex: 1; padding: 0.55rem; border-radius: 8px; font-weight: 700;
          font-size: 0.8rem; cursor: pointer; border: 1px solid var(--border-strong);
        }
        .leitor-musica__ok { background: var(--gold-primary); color: #0d1220; border-color: transparent; }
        .leitor-musica__cancel { background: transparent; color: var(--text-gray); }

        .leitor-musica__botoes button.leitor-musica__on { color: var(--gold-primary); }

        .leitor-musica__lista {
          position: absolute; left: 50%; transform: translateX(-50%);
          bottom: calc(100% + 8px); width: min(420px, calc(100vw - 32px));
          max-height: 320px; display: flex; flex-direction: column;
          background: var(--bg-card); border: 1px solid var(--border-strong);
          border-radius: 12px; box-shadow: var(--shadow-card); overflow: hidden;
        }
        .leitor-musica__lista-topo {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.7rem 0.9rem; font-size: 0.72rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
        }
        .leitor-musica__lista-topo button {
          background: none; border: none; color: var(--text-gray); cursor: pointer;
          display: flex; padding: 0;
        }
        .leitor-musica__lista ul { list-style: none; margin: 0; padding: 0.35rem; overflow-y: auto; }
        .leitor-musica__faixa-item {
          display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem;
          border-radius: 8px; cursor: pointer; font-size: 0.8rem; color: var(--text-gray);
        }
        .leitor-musica__faixa-item:hover { background: var(--surface-sunken); color: var(--text-white); }
        .leitor-musica__faixa-item--atual { color: var(--gold-primary); }
        .leitor-musica__faixa-item img {
          width: 40px; height: 30px; border-radius: 4px; object-fit: cover; flex-shrink: 0;
        }
        .leitor-musica__faixa-item span {
          flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .leitor-musica__fav {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; padding: 0; flex-shrink: 0;
          border: none; border-radius: 50%; background: transparent;
          color: var(--text-muted); cursor: pointer; transition: color 0.15s ease;
        }
        .leitor-musica__fav:hover { color: var(--gold-light); }
        .leitor-musica__fav--on { color: var(--gold-primary); }

        .leitor-musica__abas { display: flex; gap: 0.3rem; }
        .leitor-musica__abas button {
          background: none; border: none; cursor: pointer; padding: 0.15rem 0.1rem;
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.4px; color: var(--text-muted);
          border-bottom: 2px solid transparent;
        }
        .leitor-musica__aba-on { color: var(--gold-primary) !important; border-bottom-color: var(--gold-primary) !important; }
        .leitor-musica__lista-vazia {
          margin: 0; padding: 1.1rem 0.9rem; font-size: 0.8rem;
          color: var(--text-muted); display: flex; align-items: center;
          gap: 0.3rem; flex-wrap: wrap;
        }

        /* Com uma slot demo aberta, a barra passa à frente do modal para se
           poder pausar ou trocar de música sem fechar o jogo. */
        body.slot-demo-aberta .leitor-musica { z-index: 1001; }

        body.tem-leitor-musica .gm-drop { bottom: 92px; }
        /* O botão "ir para o topo" da Home não pode ficar por baixo da barra. */
        body.tem-leitor-musica .home-ir-topo { bottom: 96px !important; }

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
