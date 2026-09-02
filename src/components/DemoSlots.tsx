import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, X, ExternalLink, Search, ChevronLeft, ChevronRight, ArrowDownWideNarrow } from 'lucide-react';
import '../styles/DemoSlots.css';

/**
 * Slots em modo demo (dinheiro fictício).
 *
 * Os jogos são servidos pelo host de demos gratuitas da Pragmatic Play, que
 * permite embutir em iframe. Se algum símbolo deixar de funcionar, é só
 * atualizar a entrada em SLOTS — o botão "abrir em nova aba" serve de recurso.
 */
const DEMO_BASE = 'https://demogamesfree.pragmaticplay.net/gs2c/openGame.do';

/* Fallback enquanto a grelha ainda não foi medida (ver useEffect de colunas). */
const PAGE_SIZE_INICIAL = 24;

/**
 * Ordenação da lista.
 * Todos os jogos são da Pragmatic Play, por isso em vez de "provider" (que seria
 * sempre igual) agrupamos por categoria — dá uma ordenação útil de facto.
 */
type Ordem = 'az' | 'popular' | 'categoria';

/* Jogos mais conhecidos primeiro. O que não estiver aqui cai para o fim,
   ordenado por nome. Lista curada — não há métrica de jogadas real. */
const POPULARES: string[] = [
  'vs20olympgate', 'vs20fruitsw', 'vs10bbbonanza', 'vs20sugarrush', 'vs20doghouse',
  'vs25wolfgold', 'vs20starlight', 'vs20fruitparty', 'vs12bbb', 'vswaysbbb',
  'vs10bbextreme', 'vs20sugarrushx', 'vs20olympx', 'vs20starlightx', 'vs20fruitswx',
  'vswaysdogs', 'vs5joker', 'vs20midas', 'vs40wildwest', 'vs5aztecgems',
  'vs243lions', 'vs20chickdrop', 'vs25chilli', 'vs25hotfiesta', 'vs20sbxmas',
  'vs1600drago', 'vs20bonzgold', 'vs7776aztec', 'vs10firestrike', 'vs20gorilla',
  'vs20swordofares', 'vs20phoenixf', 'vs117649starz', 'vs20wildboost', 'vs25gladiator',
];
const POP_INDICE = new Map(POPULARES.map((s, i) => [s, i]));

/* Categorias derivadas do símbolo do jogo. */
const SIMBOLOS_MESA = new Set(['bjmb', 'bjma', 'bca', 'rla', 'kna', 'vpa', 'vs1024dtiger']);
function categoriaDe(symbol: string): string {
  if (SIMBOLOS_MESA.has(symbol)) return 'Mesa & cartas';
  if (symbol.startsWith('sc')) return 'Raspadinhas';
  if (symbol.startsWith('cs')) return 'Clássicas';
  return 'Slots';
}

/* Thumbnails oficiais da Pragmatic Play (CDN público de imagens de jogo). */
function thumbUrl(symbol: string) {
  return `https://common-static.ppgames.net/game_pic/square/200/${symbol}.png`;
}

function demoUrl(symbol: string) {
  const p = new URLSearchParams({
    gameSymbol: symbol,
    websiteUrl: 'https://demogamesfree.pragmaticplay.net',
    jurisdiction: '99',
    lobby_url: '1',
    lang: 'pt',
    cur: 'EUR',
  });
  return `${DEMO_BASE}?${p.toString()}`;
}

type Slot = { name: string; symbol: string };

/* Catálogo Pragmatic Play — modo demo. Ordenado por nome. */
const SLOTS: Slot[] = [
  { name: "3 Genie Wishes", symbol: 'vs50aladdin' },
  { name: "3 Kingdoms – Battle of Red Cliffs", symbol: 'vs25kingdoms' },
  { name: "5 Lions", symbol: 'vs243lions' },
  { name: "5 Lions Dance", symbol: 'vs1024lionsd' },
  { name: "5 Lions Gold", symbol: 'vs243lionsgold' },
  { name: "5 Lions Megaways", symbol: 'vswayslions' },
  { name: "7 Monkeys", symbol: 'vs7monkeys' },
  { name: "7 Piggies", symbol: 'vs7pigs' },
  { name: "7 Piggies Scratchcard", symbol: 'sc7piggies' },
  { name: "8 Dragons", symbol: 'vs20eightdragons' },
  { name: "888 Dragons", symbol: 'vs1dragon8' },
  { name: "888 Gold", symbol: 'cs5triple8gold' },
  { name: "Aladdin and the Sorcerer", symbol: 'vs20aladdinsorc' },
  { name: "Aladdin’s Treasure", symbol: 'vs50amt' },
  { name: "American Blackjack", symbol: 'bjmb' },
  { name: "Ancient Egypt", symbol: 'vs10egypt' },
  { name: "Ancient Egypt Classic", symbol: 'vs10egyptcls' },
  { name: "Asgard", symbol: 'vs25asgard' },
  { name: "Aztec Bonanza", symbol: 'vs7776aztec' },
  { name: "Aztec Gems", symbol: 'vs5aztecgems' },
  { name: "Aztec Gems Deluxe", symbol: 'vs9aztecgemsdx' },
  { name: "Baccarat", symbol: 'bca' },
  { name: "Barn Festival", symbol: 'vs20farmfest' },
  { name: "Beowulf", symbol: 'vs40beowulf' },
  { name: "Big Bass Bonanza", symbol: 'vs10bbbonanza' },
  { name: "Big Bass Bonanza Megaways", symbol: 'vswaysbbb' },
  { name: "Big Bass Splash", symbol: 'vs10bbextreme' },
  { name: "Bigger Bass Bonanza", symbol: 'vs12bbb' },
  { name: "Bonanza Gold", symbol: 'vs20bonzgold' },
  { name: "Book of Kingdoms", symbol: 'vs25bkofkngdm' },
  { name: "Book of Tut", symbol: 'vs10bookoftut' },
  { name: "Book of Vikings", symbol: 'vs10bookviking' },
  { name: "Bronco Spirit", symbol: 'vs75bronco' },
  { name: "Buffalo King", symbol: 'vs4096bufking' },
  { name: "Buffalo King Megaways", symbol: 'vswaysbufking' },
  { name: "Caishen’s Cash", symbol: 'vs243caishien' },
  { name: "Caishen’s Gold", symbol: 'vs243fortune' },
  { name: "Cash Elevator", symbol: 'vs20terrorv' },
  { name: "Chicken Drop", symbol: 'vs20chickdrop' },
  { name: "Chilli Heat", symbol: 'vs25chilli' },
  { name: "Christmas Carol Megaways", symbol: 'vs20xmascarol' },
  { name: "Cleocatra", symbol: 'vs20cleocatra' },
  { name: "Congo Cash", symbol: 'vs432congocash' },
  { name: "Cowboys Gold", symbol: 'vs10cowgold' },
  { name: "Curse of the Werewolf Megaways", symbol: 'vswayswerewolf' },
  { name: "Da Vinci’s Treasure", symbol: 'vs25davinci' },
  { name: "Dance Party", symbol: 'vs243dancingpar' },
  { name: "Diamond Strike", symbol: 'vs15diamond' },
  { name: "Diamond Strike Scratchcard", symbol: 'scdiamond' },
  { name: "Diamonds are Forever 3 Lines", symbol: 'cs3w' },
  { name: "Drago – Jewels of Fortune", symbol: 'vs1600drago' },
  { name: "Dragon Hot Hold and Spin", symbol: 'vs5drhs' },
  { name: "Dragon Kingdom", symbol: 'vs25dragonkingdom' },
  { name: "Dragon Kingdom – Eyes of Fire", symbol: 'vs5drmystery' },
  { name: "Dragon Tiger", symbol: 'vs1024dtiger' },
  { name: "Drill That Gold", symbol: 'vs20drtgold' },
  { name: "Dwarven Gold Deluxe", symbol: 'vs25dwarves' },
  { name: "Egyptian Fortunes", symbol: 'vs20egypttrs' },
  { name: "Emerald King", symbol: 'vs20eking' },
  { name: "Emerald King Rainbow Road", symbol: 'vs20ekingrr' },
  { name: "Empty the Bank", symbol: 'vs20emptybank' },
  { name: "Extra Juicy", symbol: 'vs10fruity2' },
  { name: "Eye of the Storm", symbol: 'vs10eyestorm' },
  { name: "Fairytale Fortune", symbol: 'vs15fairytale' },
  { name: "Fire 88", symbol: 'vs7fire88' },
  { name: "Fire Strike", symbol: 'vs10firestrike' },
  { name: "Fish Eye", symbol: 'vs10fisheye' },
  { name: "Fishin’ Reels", symbol: 'vs10goldfish' },
  { name: "Floating Dragon", symbol: 'vs10floatdrg' },
  { name: "Fruit Party", symbol: 'vs20fruitparty' },
  { name: "Fruit Party 2", symbol: 'vs20fparty2' },
  { name: "Fruit Rainbow", symbol: 'vs40frrainbow' },
  { name: "Gates of Olympus", symbol: 'vs20olympgate' },
  { name: "Gates of Olympus 1000", symbol: 'vs20olympx' },
  { name: "Gems Bonanza", symbol: 'vs20goldfever' },
  { name: "Glorious Rome", symbol: 'vs20rome' },
  { name: "Gold Rush", symbol: 'vs25goldrush' },
  { name: "Gold Rush Scratchcard", symbol: 'scgoldrush' },
  { name: "Gold Train", symbol: 'vs3train' },
  { name: "Golden Beauty", symbol: 'vs75empress' },
  { name: "Gorilla Mayhem", symbol: 'vs20gorilla' },
  { name: "Great Reef", symbol: 'vs25sea' },
  { name: "Great Rhino", symbol: 'vs20rhino' },
  { name: "Great Rhino Deluxe", symbol: 'vs20rhinoluxe' },
  { name: "Great Rhino Megaways", symbol: 'vswaysrhino' },
  { name: "Greek Gods", symbol: 'vs243fortseren' },
  { name: "Heart of Rio", symbol: 'vs25rio' },
  { name: "Hercules and Pegasus", symbol: 'vs20hercpeg' },
  { name: "Hercules Son of Zeus", symbol: 'vs50hercules' },
  { name: "Hockey League", symbol: 'vs20hockey' },
  { name: "Hockey League Wild Match", symbol: 'vs9hockey' },
  { name: "Honey Honey Honey", symbol: 'vs20honey' },
  { name: "Hot Chilli", symbol: 'vs9hotroll' },
  { name: "Hot Fiesta", symbol: 'vs25hotfiesta' },
  { name: "Hot Safari", symbol: 'vs25safari' },
  { name: "Hot Safari Scratchcard", symbol: 'scsafari' },
  { name: "Hot to burn", symbol: 'vs5hotburn' },
  { name: "Hot to Burn Hold and Spin", symbol: 'vs20hburnhs' },
  { name: "Irish Charms", symbol: 'cs3irishcharms' },
  { name: "Jacks or Better", symbol: 'vpa' },
  { name: "Jade Butterfly", symbol: 'vs1024butterfly' },
  { name: "John Hunter and the Aztec Treasure", symbol: 'vs7776secrets' },
  { name: "John Hunter and the Mayan Gods", symbol: 'vs10mayangods' },
  { name: "Joker King", symbol: 'vs25jokerking' },
  { name: "Joker's Jewels", symbol: 'vs5joker' },
  { name: "Journey to the West", symbol: 'vs25journey' },
  { name: "Juicy Fruits", symbol: 'vs50juicyfr' },
  { name: "Jurassic Giants", symbol: 'vs4096jurassic' },
  { name: "Keno", symbol: 'kna' },
  { name: "Lady Godiva", symbol: 'vs20godiva' },
  { name: "Lady of the Moon", symbol: 'vs13ladyofmoon' },
  { name: "Leprechaun Carol", symbol: 'vs20leprexmas' },
  { name: "Leprechaun Song", symbol: 'vs20leprechaun' },
  { name: "Lucky Dragons", symbol: 'vs50chinesecharms' },
  { name: "Lucky Grace And Charm", symbol: 'vs10luckcharm' },
  { name: "Lucky Lightning", symbol: 'vswayslight' },
  { name: "Lucky New Year", symbol: 'vs25newyear' },
  { name: "Madame Destiny", symbol: 'vs10madame' },
  { name: "Madame Destiny Megaways", symbol: 'vswaysmadame' },
  { name: "Magic Crystals", symbol: 'vs243crystalcave' },
  { name: "Magic Journey", symbol: 'vs8magicjourn' },
  { name: "Master Chen’s Fortune", symbol: 'vs9chen' },
  { name: "Master Joker", symbol: 'vs1masterjoker' },
  { name: "Mighty Kong", symbol: 'vs50kingkong' },
  { name: "Money Mouse", symbol: 'vs25mmouse' },
  { name: "Monkey Madness", symbol: 'vs9madmonkey' },
  { name: "Monkey Warrior", symbol: 'vs243mwarrior' },
  { name: "Multihand Blackjack", symbol: 'bjma' },
  { name: "Mustang Gold", symbol: 'vs25mustang' },
  { name: "Mysterious", symbol: 'vs4096mystery' },
  { name: "Mysterious Egypt", symbol: 'vs10wildtut' },
  { name: "Panda Gold Scratchcard", symbol: 'scpanda' },
  { name: "Panda’s Fortune", symbol: 'vs25pandagold' },
  { name: "Panda’s Fortune 2", symbol: 'vs25pandatemple' },
  { name: "Panther Queen", symbol: 'vs25pantherqueen' },
  { name: "Peaky Blinders", symbol: 'vs20pblinders' },
  { name: "Peking Luck", symbol: 'vs25peking' },
  { name: "Phoenix Forge", symbol: 'vs20phoenixf' },
  { name: "Pirate Gold", symbol: 'vs40pirate' },
  { name: "Pirate Gold Deluxe", symbol: 'vs40pirgold' },
  { name: "Pixie Wings", symbol: 'vs50pixie' },
  { name: "Power of Thor Megaways", symbol: 'vswayshammthor' },
  { name: "Pyramid King", symbol: 'vs25pyramid' },
  { name: "Queen of Atlantis", symbol: 'vs1024atlantis' },
  { name: "Queen of Gold", symbol: 'vs25queenofgold' },
  { name: "Queen of Gold Scratchcard", symbol: 'scqog' },
  { name: "Release the Kraken", symbol: 'vs20kraken' },
  { name: "Return of the Dead", symbol: 'vs10returndead' },
  { name: "Romeo and Juliet", symbol: 'vs25romeoandjuliet' },
  { name: "Roulette", symbol: 'rla' },
  { name: "Safari King", symbol: 'vs50safariking' },
  { name: "Santa", symbol: 'vs20santa' },
  { name: "Santa's Wonderland", symbol: 'vs20santawonder' },
  { name: "Spartan King", symbol: 'vs40spartaking' },
  { name: "Star Bounty", symbol: 'vswayshive' },
  { name: "Starlight Princess", symbol: 'vs20starlight' },
  { name: "Starlight Princess 1000", symbol: 'vs20starlightx' },
  { name: "Starz Megaways", symbol: 'vs117649starz' },
  { name: "Street Racer", symbol: 'vs40streetracer' },
  { name: "Sugar Rush", symbol: 'vs20sugarrush' },
  { name: "Sugar Rush 1000", symbol: 'vs20sugarrushx' },
  { name: "Super 7s", symbol: 'vs5super7' },
  { name: "Super Joker", symbol: 'vs5spjoker' },
  { name: "Sweet Bonanza", symbol: 'vs20fruitsw' },
  { name: "Sweet Bonanza 1000", symbol: 'vs20fruitswx' },
  { name: "Sweet Bonanza Xmas", symbol: 'vs20sbxmas' },
  { name: "Sword of Ares", symbol: 'vs20swordofares' },
  { name: "Tales of Egypt", symbol: 'vs20egypt' },
  { name: "Temujin Treasures", symbol: 'vs1024temuj' },
  { name: "The Amazing Money Machine", symbol: 'vs10amm' },
  { name: "The Catfather", symbol: 'vs9catz' },
  { name: "The Catfather Part II", symbol: 'vs30catz' },
  { name: "The Champions", symbol: 'vs25champ' },
  { name: "The Dog House", symbol: 'vs20doghouse' },
  { name: "The Dog House Megaways", symbol: 'vswaysdogs' },
  { name: "The Great Chicken Escape", symbol: 'vs20chicken' },
  { name: "The Hand of Midas", symbol: 'vs20midas' },
  { name: "The Magic Cauldron – Enchanted Brew", symbol: 'vs20magicpot' },
  { name: "The Wild Machine", symbol: 'vs40madwheel' },
  { name: "Three Star Fortune", symbol: 'vs10threestar' },
  { name: "Tomb of the Scarab Queen", symbol: 'vs25scarabqueen' },
  { name: "Treasure Horse", symbol: 'vs18mashang' },
  { name: "Tree of Riches", symbol: 'vs1fortunetree' },
  { name: "Triple Dragons", symbol: 'vs5trdragons' },
  { name: "Triple Jokers", symbol: 'vs5trjokers' },
  { name: "Triple Tigers", symbol: 'vs1tigers' },
  { name: "Ultra Burn", symbol: 'vs5ultrab' },
  { name: "Ultra Hold and Spin", symbol: 'vs5ultra' },
  { name: "Vampires vs Wolves", symbol: 'vs10vampwolf' },
  { name: "Vegas Magic", symbol: 'vs20vegasmagic' },
  { name: "Vegas Nights", symbol: 'vs25vegas' },
  { name: "Voodoo Magic", symbol: 'vs40voodoo' },
  { name: "Wild Booster", symbol: 'vs20wildboost' },
  { name: "Wild Gladiators", symbol: 'vs25gladiator' },
  { name: "Wild Pixies", symbol: 'vs20wildpix' },
  { name: "Wild Spells", symbol: 'vs25wildspells' },
  { name: "Wild Walker", symbol: 'vs25walker' },
  { name: "Wild West Gold", symbol: 'vs40wildwest' },
  { name: "Wild Wild Riches", symbol: 'vs576treasures' },
  { name: "Wolf Gold", symbol: 'vs25wolfgold' },
  { name: "Wolf Gold Scratchcard", symbol: 'scwolfgold' },
  { name: "Yum Yum Powerways", symbol: 'vs10nudgeit' },
];

export default function DemoSlots() {
  const [query, setQuery] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('az');
  const [page, setPage] = useState(1);
  const [ativo, setAtivo] = useState<Slot | null>(null);
  const [porPagina, setPorPagina] = useState(PAGE_SIZE_INICIAL);
  const grelhaRef = useRef<HTMLUListElement>(null);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? SLOTS.filter(s => s.name.toLowerCase().includes(q)) : SLOTS.slice();
    if (ordem === 'popular') {
      return base.sort((a, b) => {
        const ia = POP_INDICE.get(a.symbol) ?? 999;
        const ib = POP_INDICE.get(b.symbol) ?? 999;
        return ia - ib || a.name.localeCompare(b.name);
      });
    }
    if (ordem === 'categoria') {
      return base.sort((a, b) => {
        const c = categoriaDe(a.symbol).localeCompare(categoriaDe(b.symbol));
        return c || a.name.localeCompare(b.name);
      });
    }
    return base.sort((a, b) => a.name.localeCompare(b.name));
  }, [query, ordem]);

  // Mede quantas colunas a grelha auto-fill rende e ajusta os itens por página
  // para nº-de-colunas × linhas — assim a última página enche sempre a grelha.
  useEffect(() => {
    const el = grelhaRef.current;
    if (!el) return;
    const medir = () => {
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (cols > 0) setPorPagina(cols * (cols <= 2 ? 8 : 5));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [filtradas.length === 0]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaAtual = Math.min(page, totalPages);
  const visiveis = filtradas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  const irPara = (p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!ativo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAtivo(null); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [ativo]);

  return (
    <section className="demo-slots" aria-label="Slots em modo demo">
      <div className="demo-slots__head">
        <div>
          <h2 className="demo-slots__title">Joga grátis em modo demo</h2>
          <p className="demo-slots__subtitle">
            {SLOTS.length} slots da Pragmatic Play com saldo fictício. Sem registo,
            sem depósito — só para testares o jogo antes de ires a sério.
          </p>
        </div>
        <div className="demo-slots__ferramentas">
          <label className="demo-slots__search">
            <Search size={15} />
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="Procurar slot…"
              aria-label="Procurar slot"
            />
          </label>
          <label className="demo-slots__ordenar">
            <ArrowDownWideNarrow size={15} />
            <select
              value={ordem}
              onChange={e => { setOrdem(e.target.value as Ordem); setPage(1); }}
              aria-label="Ordenar slots"
            >
              <option value="az">Ordem alfabética</option>
              <option value="popular">Popularidade</option>
              <option value="categoria">Categoria</option>
            </select>
          </label>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="demo-slots__vazio">Nenhuma slot com esse nome.</p>
      ) : (
        <>
          <ul className="demo-slots__grid" ref={grelhaRef}>
            {visiveis.map(slot => (
              <li key={slot.symbol}>
                <button
                  type="button"
                  className="demo-slot-card"
                  onClick={() => setAtivo(slot)}
                >
                  <span className="demo-slot-card__thumb">
                    <img
                      src={thumbUrl(slot.symbol)}
                      alt={slot.name}
                      loading="lazy"
                      onError={e => { (e.currentTarget.parentElement as HTMLElement).dataset.fallback = '1'; }}
                    />
                    <span className="demo-slot-card__play"><Play size={20} fill="currentColor" /></span>
                  </span>
                  <span className="demo-slot-card__name">{slot.name}</span>
                  <span className="demo-slot-card__tag">Demo grátis</span>
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="demo-slots__pager" aria-label="Paginação de slots">
              <button
                type="button"
                className="demo-slots__pager-btn"
                onClick={() => irPara(paginaAtual - 1)}
                disabled={paginaAtual === 1}
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="demo-slots__pager-info">
                Página {paginaAtual} de {totalPages}
              </span>
              <button
                type="button"
                className="demo-slots__pager-btn"
                onClick={() => irPara(paginaAtual + 1)}
                disabled={paginaAtual === totalPages}
                aria-label="Página seguinte"
              >
                <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </>
      )}

      <p className="demo-slots__disclaimer">
        Modo demo com dinheiro fictício. Jogo responsável • Apenas +18 •
        Jogos por Pragmatic Play.
      </p>

      {ativo && (
        <div
          className="demo-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${ativo.name} — modo demo`}
          onClick={() => setAtivo(null)}
        >
          <div className="demo-modal__box" onClick={e => e.stopPropagation()}>
            <header className="demo-modal__bar">
              <strong>{ativo.name}</strong>
              <div className="demo-modal__actions">
                <a
                  href={demoUrl(ativo.symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="demo-modal__ext"
                >
                  Nova aba <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  className="demo-modal__close"
                  onClick={() => setAtivo(null)}
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className="demo-modal__frame">
              <iframe
                key={ativo.symbol}
                src={demoUrl(ativo.symbol)}
                title={`${ativo.name} — modo demo`}
                allow="autoplay; fullscreen; encrypted-media"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
