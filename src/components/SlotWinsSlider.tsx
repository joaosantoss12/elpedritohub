import { useEffect, useRef, useState } from 'react';
import '../styles/SlotWins.css';

const AFFILIATE_URL = 'https://captainspartners.com/processing/click?btag=16361_18466';

/* Thumbnails disponíveis em /public/slots — reaproveitadas pelos vários
   títulos (o match exato imagem↔nome não é importante aqui). */
const IMAGES = [
  '/slots/1.jpg', '/slots/5.jpg', '/slots/8.jpg', '/slots/12.jpg',
  '/slots/15.jpg', '/slots/18.jpg', '/slots/20.jpg', '/slots/22.jpg',
  '/slots/25.png', '/slots/28.png', '/slots/30.png', '/slots/31.png',
];

/* Slots mais populares nas casas (Pragmatic, Hacksaw, Nolimit, Push, etc.). */
const SLOT_NAMES = [
  'Gates of Olympus', 'Sweet Bonanza', 'Sugar Rush', 'The Dog House',
  'Big Bass Bonanza', 'Wanted Dead or a Wild', 'Le Bandit', 'Book of Dead',
  'Money Train 3', 'San Quentin', 'Wild West Gold', 'Starlight Princess',
  'Fruit Party', "Gonzo's Quest", 'Bonanza', 'Dead or Alive 2',
  'Reactoonz', "Jammin' Jars", 'Razor Shark', 'Mental', 'Chaos Crew',
  'Fire in the Hole', 'Dork Unit', 'Pray for Three', 'Le Pharaoh',
  'Cash Elevator', 'Wisdom of Athena', 'Zeus vs Hades', 'The Hand of Midas',
  'Sweet Rush Bonanza', 'Sun of Egypt 3', 'Rise of Olympus', 'Book of Shadows',
];

const SLOTS = SLOT_NAMES.map((name, i) => ({ name, image: IMAGES[i % IMAGES.length] }));

/* Nomes de utilizador possíveis — só a 1ª letra fica visível, o resto é
   mascarado com o nº de asteriscos correspondente ao tamanho real do nome,
   por isso a coluna deixa de ter todos os nomes com o mesmo comprimento. */
const USERNAMES = [
  'joao', 'pedro', 'ruca', 'tozze', 'miguelm', 'andre88', 'bruno', 'rafa',
  'diogoo', 'goncalo', 'tiago', 'nuno', 'vasco', 'fabio', 'ricardo', 'hugo',
  'sergio', 'carlos', 'marco', 'luis', 'zecas', 'kdu', 'tomas', 'ivo',
  'nelsinho', 'joel', 'dani', 'edu', 'filipe', 'rodrigo', 'artur', 'mario',
  'xico', 'quim', 'guga', 'lipe', 'betoo', 'kelvin', 'wilson', 'romario',
  'catarina', 'ines', 'mariana', 'sofia', 'bea', 'raquel', 'joana', 'rita',
  'leonor', 'matilde', 'carol', 'vera', 'sara', 'patricia', 'claudia', 'ana',
  'fmartins', 'jgomes', 'pcosta', 'apereira', 'rsilva', 'mfonseca', 'tlopes',
  'apsimoes', 'jpc', 'mrx', 'thekid', 'aposta_certa', 'greenzao', 'lucky7',
  'ovicente', 'obruno', 'ozeca', 'manype', 'saldanha', 'moreira', 'teixeira',
];

function maskName(name: string) {
  const stars = Math.min(Math.max(name.length - 1, 2), 9);
  return { initial: name[0].toUpperCase(), mask: '*'.repeat(stars) };
}

/* Quantos ganhos ficam em circulação. Muitos cartões => o carrossel nunca
   parece repetir-se depressa. */
const POOL_SIZE = 100;

/* Maioria são centenas; milhares são menos comuns; o topo nunca passa dos 35k. */
function generateAmount() {
  const r = Math.random();
  const [min, max] = r < 0.82 ? [120, 900] : r < 0.96 ? [900, 6000] : [6000, 35000];
  return Math.random() * (max - min) + min;
}

function formatAmount(value: number) {
  return value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Win = {
  id: number;
  initial: string;
  mask: string;
  amount: number;
  minutesAgo: number;
  slot: (typeof SLOTS)[number];
};

let nextId = 0;

function makeWin(slotIndex = Math.floor(Math.random() * SLOTS.length)): Win {
  return {
    id: nextId++,
    ...maskName(USERNAMES[Math.floor(Math.random() * USERNAMES.length)]),
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
                    {win.initial}<span>{win.mask}</span>
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
                <p className="slot-win-card__cta-game">{win.slot.name}</p>
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
