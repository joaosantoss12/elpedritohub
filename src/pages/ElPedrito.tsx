import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Volume2, VolumeX, Play, ExternalLink, Film } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { carregarReels, ehVideoDireto, urlEmbed, type Reel } from '../lib/reels';
import '../styles/ElPedrito.css';

export default function ElPedrito() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semSom, setSemSom] = useState(true);
  const [ativo, setAtivo] = useState(0);
  const videosRef = useRef<(HTMLVideoElement | null)[]>([]);

  useEffect(() => {
    let vivo = true;
    carregarReels().then(r => {
      if (!vivo) return;
      setReels(r);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, []);

  // Qual reel está no ecrã: o mais visível manda.
  const onObserve = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach(e => {
      const i = Number((e.target as HTMLElement).dataset.idx);
      const vid = videosRef.current[i];
      if (e.isIntersecting && e.intersectionRatio > 0.6) {
        setAtivo(i);
        vid?.play().catch(() => { /* autoplay bloqueado até haver toque */ });
      } else {
        vid?.pause();
      }
    });
  }, []);

  useEffect(() => {
    if (carregando || reels.length === 0) return;
    const obs = new IntersectionObserver(onObserve, { threshold: [0, 0.6, 1] });
    document.querySelectorAll('.elp-reel').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [carregando, reels.length, onObserve]);

  // Aplica o mute a todos os <video> quando o botão muda.
  useEffect(() => {
    videosRef.current.forEach(v => { if (v) v.muted = semSom; });
  }, [semSom, ativo]);

  return (
    <div className="elp-page">
      <Navbar />

      <div className="elp-topo">
        <span className="elp-topo__marca"><Film size={15} /> EL PEDRITO</span>
        {reels.length > 0 && (
          <button
            className="elp-som"
            onClick={() => setSemSom(s => !s)}
            aria-label={semSom ? 'Ativar som' : 'Desativar som'}
          >
            {semSom ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        )}
      </div>

      {carregando ? (
        <div className="elp-estado">
          <Loader2 size={26} className="elp-spin" />
        </div>
      ) : reels.length === 0 ? (
        <div className="elp-estado">
          <Film size={34} />
          <p>Ainda não há vídeos por aqui. Volta em breve.</p>
        </div>
      ) : (
        <div className="elp-feed">
          {reels.map((r, i) => (
            <article className="elp-reel" key={r.id} data-idx={i}>
              <div className="elp-reel__media">
                {ehVideoDireto(r.video_url) ? (
                  <video
                    ref={el => { videosRef.current[i] = el; }}
                    src={r.video_url}
                    poster={r.poster_url ?? undefined}
                    playsInline
                    muted={semSom}
                    loop
                    preload={i <= 1 ? 'auto' : 'none'}
                    onClick={e => {
                      const v = e.currentTarget;
                      if (v.paused) v.play().catch(() => {});
                      else v.pause();
                    }}
                  />
                ) : (
                  <iframe
                    src={urlEmbed(r.video_url)}
                    title={r.titulo}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                )}
                {ehVideoDireto(r.video_url) && ativo !== i && (
                  <span className="elp-reel__play" aria-hidden="true"><Play size={30} /></span>
                )}
              </div>

              <div className="elp-reel__info">
                <h2>{r.titulo}</h2>
                {r.descricao && <p>{r.descricao}</p>}
                {r.link_url && (
                  <a className="elp-reel__cta" href={r.link_url} target="_blank" rel="noreferrer">
                    {r.link_texto || 'Saber mais'} <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
