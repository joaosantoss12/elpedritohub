import { useEffect, useRef, useState } from 'react';
import '../styles/SlotWins.css';

const AFFILIATE_URL = 'https://captainspartners.com/processing/click?btag=16361_18466';

/* Slots populares + thumbnails em /public/slots */
const SLOTS = [
  { name: 'Le Bandit', image: '/slots/1.jpg' },
  { name: 'Dork Unit', image: '/slots/5.jpg' },
  { name: 'Wanted Dead or a Wild', image: '/slots/8.jpg' },
  { name: 'Le Santa', image: '/slots/12.jpg' },
  { name: 'Pray for Three', image: '/slots/15.jpg' },
  { name: 'Le Pharaoh', image: '/slots/18.jpg' },
  { name: 'Donny Dough', image: '/slots/20.jpg' },
  { name: 'Benny the Beer', image: '/slots/22.jpg' },
  { name: 'Sweet Bonanza Super Scatter', image: '/slots/25.png' },
  { name: 'Cyber Heist City', image: '/slots/28.png' },
  { name: 'Starlight Princess Super Scatter', image: '/slots/30.png' },
  { name: 'Sweet Rush Bonanza', image: '/slots/31.png' },
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* Quantos ganhos ficam em circulação. Muitos cartões => o carrossel nunca
   parece repetir-se depressa. */
const POOL_SIZE = 40;

/* A maioria dos ganhos são centenas; milhares e dezenas de milhares são raros. */
function generateAmount() {
  const r = Math.random();
  const [min, max] = r < 0.8 ? [150, 950] : r < 0.95 ? [1000, 9999] : [10000, 50000];
  return Math.random() * (max - min) + min;
}

function formatAmount(value: number) {
  return value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Win = {
  id: number;
  initial: string;
  amount: number;
  minutesAgo: number;
  slot: (typeof SLOTS)[number];
};

let nextId = 0;

function makeWin(slotIndex = Math.floor(Math.random() * SLOTS.length)): Win {
  return {
    id: nextId++,
    initial: LETTERS[Math.floor(Math.random() * LETTERS.length)],
    amount: generateAmount(),
    minutesAgo: 1 + Math.floor(Math.random() * 55),
    slot: SLOTS[slotIndex % SLOTS.length],
  };
}

/* Baralha os slots para o arranque não sair sempre pela mesma ordem. */
function makePool(): Win[] {
  const ordem = SLOTS.map((_, i) => i).sort(() => Math.random() - 0.5);
  return Array.from({ length: POOL_SIZE }, (_, i) => makeWin(ordem[i % SLOTS.length]));
}

const SCROLL_SPEED = 55; // px por segundo

export default function SlotWinsSlider() {
  const [wins, setWins] = useState<Win[]>(makePool);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const offsetRef = useRef(0);

  /* Scroll infinito com requestAnimationFrame. A lista é renderizada em
     duplicado; quando o deslocamento chega ao fim da 1ª cópia recuamos
     exatamente a largura dessa cópia — como o conteúdo dos dois blocos é
     idêntico, o salto é imperceptível e o loop parece contínuo. */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let last: number | null = null;

    const step = (time: number) => {
      const dt = last === null ? 0 : Math.min(0.05, (time - last) / 1000);
      last = time;

      if (!pausedRef.current) {
        const singleWidth = track.scrollWidth / 2;
        offsetRef.current += SCROLL_SPEED * dt;
        if (singleWidth > 0 && offsetRef.current >= singleWidth) {
          offsetRef.current -= singleWidth;
        }
        track.style.transform = `translateX(-${offsetRef.current}px)`;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* Renova ganhos para dar sensação de tempo real. Só mexe no cartão que já
     passou a aresta esquerda há ~2 posições: na 1ª cópia está fora de vista e
     a 2ª cópia desse índice está sempre uma largura-de-lista à frente, também
     fora de vista — logo a troca nunca é vista e o loop não "salta". */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || pausedRef.current) return;
      const stride = track.scrollWidth / 2 / POOL_SIZE;
      if (stride <= 0) return;
      const alvo = Math.floor(offsetRef.current / stride) - 2;
      if (alvo < 0 || alvo >= POOL_SIZE) return;

      setWins((prev) => {
        const copia = prev.slice();
        copia[alvo] = makeWin();
        return copia;
      });
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  return (
    <section className="slot-wins" aria-label="Ganhos recentes na CaptainsBet">
      <div className="slot-wins__head">
        <div>
          <h2 className="slot-wins__title">
            <span>🎰</span> Ganhos recentes
          </h2>
          <p className="slot-wins__subtitle">Slots que estão a pagar agora na CaptainsBet.</p>
        </div>
        <span className="slot-wins__live">Ao vivo</span>
      </div>

      <div className="slot-wins__viewport">
        <div className="slot-wins__fade slot-wins__fade--left" />
        <div className="slot-wins__fade slot-wins__fade--right" />

        <div
          ref={trackRef}
          className="slot-wins__track"
          onMouseEnter={pause}
          onMouseLeave={resume}
          onTouchStart={pause}
          onTouchEnd={resume}
        >
          {[...wins, ...wins].map((win, index) => (
            <a
              key={`${win.id}-${index}`}
              className="slot-win-card"
              href={AFFILIATE_URL}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              <div className="slot-win-card__thumb">
                <span className="slot-win-card__badge">Big Win</span>
                <img src={win.slot.image} alt={win.slot.name} loading="lazy" />
              </div>

              <div className="slot-win-card__body">
                <div className="slot-win-card__row">
                  <p className="slot-win-card__user">
                    {win.initial}<span>*****</span>
                  </p>
                  <p className="slot-win-card__game">{win.slot.name}</p>
                </div>

                <div className="slot-win-card__amount">
                  <small>Ganhou</small>
                  <strong>{formatAmount(win.amount)}€</strong>
                </div>

                <p className="slot-win-card__time">há {win.minutesAgo} min</p>
              </div>

              <div className="slot-win-card__cta">
                <span>Jogar</span>
              </div>
            </a>
          ))}
        </div>
      </div>

      <p className="slot-wins__disclaimer">
        Ganhos ilustrativos de jogadores da comunidade. Jogo responsável • +18
      </p>
    </section>
  );
}
