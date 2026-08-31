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

function makeWin(slotIndex: number): Win {
  return {
    id: nextId++,
    initial: LETTERS[Math.floor(Math.random() * LETTERS.length)],
    amount: generateAmount(),
    minutesAgo: 1 + Math.floor(Math.random() * 55),
    slot: SLOTS[slotIndex % SLOTS.length],
  };
}

const SCROLL_SPEED = 55; // px por segundo

export default function SlotWinsSlider() {
  const [wins, setWins] = useState<Win[]>(() => SLOTS.map((_, i) => makeWin(i)));
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const offsetRef = useRef(0);

  /* Scroll infinito com requestAnimationFrame — mais fluido que uma
     animação CSS porque não "salta" quando a lista é atualizada. */
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
        const singleWidth = track.scrollWidth / 2; // a lista está duplicada
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

  /* Vai entrando um ganho novo de vez em quando para parecer em tempo real. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setWins((prev) => {
        const slotIndex = Math.floor(Math.random() * SLOTS.length);
        return [makeWin(slotIndex), ...prev.slice(0, SLOTS.length - 1)];
      });
    }, 9000);
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
