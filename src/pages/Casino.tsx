import { useState, useCallback, useRef, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { Spade, RotateCcw } from 'lucide-react';
import '../styles/Casino.css';

// ─── TYPES ────────────────────────────────────────────────────
type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
  faceDown?: boolean;
}

type GamePhase =
  | 'idle'        // waiting to place bet
  | 'playing'     // player's turn
  | 'split'       // player split, playing multiple hands
  | 'dealer'      // dealer's turn (resolving)
  | 'finished';   // round over

type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | null;

interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  result: HandResult;
  stood: boolean;
}

// ─── HELPERS ──────────────────────────────────────────────────
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(rank: Rank): number {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
}

function handTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.faceDown) continue;
    const v = cardValue(c.rank);
    total += v;
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

function isBust(cards: Card[]): boolean {
  return handTotal(cards) > 21;
}

function isRed(suit: Suit): boolean {
  return suit === '♥' || suit === '♦';
}

function canSplit(hand: Hand): boolean {
  return (
    hand.cards.length === 2 &&
    cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank)
  );
}

// ─── HELPERS ───────────────────────────────────────────────────
// Crash point: P(crash >= x) = 0.99/x  (Aviator-style, house-edge ~1%)
function generateCrash(): number {
  const r = Math.random();
  if (r < 0.01) return 1.00;
  return Math.max(1.01, Math.floor((0.99 / (1 - r)) * 100) / 100);
}
const HORSES = [
  { id: 0, name: 'Trovão',     color: '#ef4444' },
  { id: 1, name: 'Relâmpago', color: '#3b82f6' },
  { id: 2, name: 'Ouro Negro', color: '#d97706' },
  { id: 3, name: 'Vento Norte',color: '#10b981' },
  { id: 4, name: 'Fúria',      color: '#8b5cf6' },
  { id: 5, name: 'Tempestade', color: '#f97316' },
];

// ─── COMPONENT ────────────────────────────────────────────────
export default function Casino() {
  const { user, membro } = useAuth();
  const epcoins = membro?.epcoins ?? 0;

  const [activeGame, setActiveGame] = useState<'blackjack' | 'horse' | 'crash'>('blackjack');

  // Blackjack state
  const [deck, setDeck] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [hands, setHands] = useState<Hand[]>([]);        // player hands (1 normally, 2 after split)
  const [activeHandIdx, setActiveHandIdx] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [betInput, setBetInput] = useState<number>(50);

  // ─── HORSE RACING STATE ──────────────────────────────────── ────────────────────────────────────
  const [hrPhase, setHrPhase] = useState<'idle' | 'racing' | 'finished'>('idle');
  const [hrBet, setHrBet] = useState(50);
  const [hrSelectedHorse, setHrSelectedHorse] = useState<number | null>(null);
  const [hrPositions, setHrPositions] = useState<number[]>(new Array(HORSES.length).fill(0));
  const [hrWinnerId, setHrWinnerId] = useState<number | null>(null);
  const hrPosRef = useRef<number[]>(new Array(HORSES.length).fill(0));
  const hrWinnerRef = useRef<number>(-1);
  const hrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── CRASH STATE ──────────────────────────────────────────────
  const [crPhase, setCrPhase] = useState<'idle' | 'running' | 'crashed'>('idle');
  const [crBet, setCrBet] = useState(50);
  const [crAutoCashout, setCrAutoCashout] = useState('');
  const [crMultiplier, setCrMultiplier] = useState(1.00);
  const [crCashedOut, setCrCashedOut] = useState(false);
  const [crCashoutAt, setCrCashoutAt] = useState<number | null>(null);
  const [crHistory, setCrHistory] = useState<number[]>([]);
  const crCanvasRef = useRef<HTMLCanvasElement>(null);
  const crRAFRef = useRef<number | null>(null);
  const crPointsRef = useRef<[number, number][]>([]);
  const crCashedOutRef = useRef(false);
  const crCurrentMultRef = useRef(1.00);
  const crCrashPointRef = useRef(0);
  const crAutoCashoutRef = useRef<number | null>(null);
  const crStarsRef = useRef<Array<{x: number; y: number; size: number; speed: number}>>([]);
  const crParticlesRef = useRef<Array<{x: number; y: number; vx: number; vy: number; life: number; maxLife: number}>>([]);

  // ─── DEALING UTILS ─────────────────────────────────────────
  const freshDeck = useCallback((): Card[] => {
    // 6 decks
    let d: Card[] = [];
    for (let i = 0; i < 6; i++) d = [...d, ...buildDeck()];
    return shuffle(d);
  }, []);

  const dealCard = useCallback(
    (currentDeck: Card[], faceDown = false): [Card, Card[]] => {
      const d = currentDeck.length < 10 ? shuffle(freshDeck()) : [...currentDeck];
      const card: Card = { ...d[0], faceDown };
      return [card, d.slice(1)];
    },
    [freshDeck]
  );

  // ─── START ROUND ───────────────────────────────────────────
  const handleDeal = useCallback(() => {
    if (betInput <= 0 || betInput > epcoins) return;

    let d = deck.length < 10 ? freshDeck() : [...deck];

    let p1: Card, p2: Card, d1: Card, d2: Card;
    [p1, d] = dealCard(d);
    [d1, d] = dealCard(d);
    [p2, d] = dealCard(d);
    [d2, d] = dealCard(d, true); // dealer hole card face down

    const playerHand: Hand = {
      cards: [p1, p2],
      bet: betInput,
      doubled: false,
      result: null,
      stood: false,
    };

    setDeck(d);
    setDealerCards([d1, d2]);
    setHands([playerHand]);
    setActiveHandIdx(0);

    // Check for player blackjack immediately
    if (isBlackjack([p1, p2])) {
      // Reveal dealer card to check for push
      const revealedDealer = [d1, { ...d2, faceDown: false }];
      if (isBlackjack(revealedDealer)) {
        setDealerCards(revealedDealer);
        setHands([{ ...playerHand, result: 'push' }]);
      } else {
        setDealerCards(revealedDealer);
        setHands([{ ...playerHand, result: 'blackjack' }]);
      }
      setPhase('finished');
      return;
    }

    setPhase('playing');
  }, [betInput, deck, dealCard, epcoins, freshDeck]);

  // ─── RESOLVE DEALER (animated, one card at a time) ────────
  const resolveDealer = useCallback(
    (currentHands: Hand[], currentDeck: Card[], currentDealerCards: Card[]) => {
      // Reveal hole card immediately
      const revealed = currentDealerCards.map(c => ({ ...c, faceDown: false }));
      setDealerCards(revealed);

      const drawStep = (dealer: Card[], d: Card[]) => {
        if (handTotal(dealer) >= 17) {
          // Done drawing — evaluate results
          const dealerTotal = handTotal(dealer);
          const dealerBusted = dealerTotal > 21;
          const resolved = currentHands.map(hand => {
            if (hand.result !== null) return hand;
            const playerTotal = handTotal(hand.cards);
            let result: HandResult;
            if (dealerBusted || playerTotal > dealerTotal) result = 'win';
            else if (playerTotal < dealerTotal) result = 'lose';
            else result = 'push';
            return { ...hand, result };
          });
          setDeck(d);
          setHands(resolved);
          setPhase('finished');
          return;
        }

        // Draw one card after a delay
        setTimeout(() => {
          const [card, remaining] = dealCard(d);
          const newDealer = [...dealer, card];
          setDealerCards(newDealer);
          drawStep(newDealer, remaining);
        }, 700);
      };

      drawStep(revealed, currentDeck);
    },
    [dealCard]
  );

  // ─── HIT ───────────────────────────────────────────────────
  const handleHit = useCallback(() => {
    if (phase !== 'playing' && phase !== 'split') return;
    let d = [...deck];
    let card: Card;
    [card, d] = dealCard(d);

    setDeck(d);
    setHands(prev => {
      const updated = prev.map((h, i) => {
        if (i !== activeHandIdx) return h;
        const newCards = [...h.cards, card];
        if (isBust(newCards)) {
          return { ...h, cards: newCards, result: 'bust' as HandResult };
        }
        return { ...h, cards: newCards };
      });

      const currentHand = updated[activeHandIdx];
      if (currentHand.result === 'bust') {
        // Move to next hand or resolve
        const nextIdx = activeHandIdx + 1;
        if (nextIdx < updated.length) {
          setActiveHandIdx(nextIdx);
        } else {
          // All hands done
          setTimeout(() => resolveDealer(updated, d, dealerCards), 400);
          setPhase('dealer');
        }
      }
      return updated;
    });
  }, [phase, deck, dealCard, activeHandIdx, dealerCards, resolveDealer]);

  // ─── STAND ─────────────────────────────────────────────────
  const handleStand = useCallback(() => {
    if (phase !== 'playing' && phase !== 'split') return;

    setHands(prev => {
      const updated = prev.map((h, i) =>
        i === activeHandIdx ? { ...h, stood: true } : h
      );

      const nextIdx = activeHandIdx + 1;
      if (nextIdx < updated.length) {
        setActiveHandIdx(nextIdx);
        return updated;
      }

      // Last hand — go to dealer
      setPhase('dealer');
      setTimeout(() => resolveDealer(updated, deck, dealerCards), 400);
      return updated;
    });
  }, [phase, activeHandIdx, deck, dealerCards, resolveDealer]);

  // ─── DOUBLE ────────────────────────────────────────────────
  const handleDouble = useCallback(() => {
    if (phase !== 'playing' && phase !== 'split') return;
    const hand = hands[activeHandIdx];
    if (hand.cards.length !== 2) return;

    let d = [...deck];
    let card: Card;
    [card, d] = dealCard(d);
    setDeck(d);

    setHands(prev => {
      const updated = prev.map((h, i) => {
        if (i !== activeHandIdx) return h;
        const newCards = [...h.cards, card];
        const busted = isBust(newCards);
        return {
          ...h,
          cards: newCards,
          bet: h.bet * 2,
          doubled: true,
          stood: true,
          result: busted ? ('bust' as HandResult) : null,
        };
      });

      const nextIdx = activeHandIdx + 1;
      if (nextIdx < updated.length) {
        setActiveHandIdx(nextIdx);
      } else {
        setPhase('dealer');
        setTimeout(() => resolveDealer(updated, d, dealerCards), 400);
      }
      return updated;
    });
  }, [phase, hands, activeHandIdx, deck, dealCard, dealerCards, resolveDealer]);

  // ─── SPLIT ─────────────────────────────────────────────────
  const handleSplit = useCallback(() => {
    if (phase !== 'playing') return;
    const hand = hands[activeHandIdx];
    if (!canSplit(hand)) return;

    let d = [...deck];
    let c1: Card, c2: Card;
    [c1, d] = dealCard(d);
    [c2, d] = dealCard(d);
    setDeck(d);

    const hand1: Hand = {
      cards: [hand.cards[0], c1],
      bet: hand.bet,
      doubled: false,
      result: null,
      stood: false,
    };
    const hand2: Hand = {
      cards: [hand.cards[1], c2],
      bet: hand.bet,
      doubled: false,
      result: null,
      stood: false,
    };

    setHands([hand1, hand2]);
    setActiveHandIdx(0);
    setPhase('split');
  }, [phase, hands, activeHandIdx, deck, dealCard]);

  // ─── NEW ROUND ─────────────────────────────────────────────
  const handleNewRound = useCallback(() => {
    setPhase('idle');
    setHands([]);
    setDealerCards([]);
    setActiveHandIdx(0);
  }, []);

  // ─── HORSE RACING LOGIC ────────────────────────────────────
  const startRace = useCallback(() => {
    if (hrSelectedHorse === null || hrBet <= 0) return;
    const winner = Math.floor(Math.random() * HORSES.length);
    hrWinnerRef.current = winner;
    hrPosRef.current = new Array(HORSES.length).fill(0);
    setHrPositions(new Array(HORSES.length).fill(0));
    setHrWinnerId(null);
    setHrPhase('racing');

    hrIntervalRef.current = setInterval(() => {
      const prev = [...hrPosRef.current];
      const w = hrWinnerRef.current;
      const next = prev.map((p, i) => {
        if (p >= 100) return 100;
        const speed = Math.random() * 2.2 + 0.5;
        const boost = i === w ? 0.6 : 0;
        return p + speed + boost;
      });
      // Guarantee winner finishes first
      const winnerPos = next[w];
      const clamped = next.map((p, i) => {
        if (i === w) return Math.min(100, p);
        if (winnerPos < 100 && p >= 100) return 99;
        return Math.min(100, p);
      });
      hrPosRef.current = clamped;
      setHrPositions([...clamped]);
      if (clamped[w] >= 100) {
        clearInterval(hrIntervalRef.current!);
        hrIntervalRef.current = null;
        setHrWinnerId(w);
        setTimeout(() => setHrPhase('finished'), 1200);
      }
    }, 80);
  }, [hrSelectedHorse, hrBet]);

  const resetRace = useCallback(() => {
    if (hrIntervalRef.current) {
      clearInterval(hrIntervalRef.current);
      hrIntervalRef.current = null;
    }
    setHrPhase('idle');
    setHrWinnerId(null);
    hrPosRef.current = new Array(HORSES.length).fill(0);
    setHrPositions(new Array(HORSES.length).fill(0));
  }, []);

  useEffect(() => {
    return () => {
      if (hrIntervalRef.current) clearInterval(hrIntervalRef.current);
      if (crRAFRef.current) cancelAnimationFrame(crRAFRef.current);
    };
  }, []);

  // Reset stars when switching away from crash game
  useEffect(() => {
    if (activeGame !== 'crash') {
      crStarsRef.current = [];
      crParticlesRef.current = [];
    }
  }, [activeGame]);

  // ─── CRASH DRAW (canvas, no stale closures — only refs) ────────
  const drawCrash = useCallback((crashed: boolean) => {
    const canvas = crCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const padL = 46, padB = 28, padR = 18, padT = 16;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);
    
    // ─── BACKGROUND: Deep space gradient ───────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0e27');
    bgGrad.addColorStop(0.5, '#0d1420');
    bgGrad.addColorStop(1, '#040e08');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ─── STARS: parallax effect ────────────────────────────────────
    if (crStarsRef.current.length === 0) {
      // Initialize stars
      for (let i = 0; i < 80; i++) {
        crStarsRef.current.push({
          x: Math.random() * W,
          y: Math.random() * H,
          size: Math.random() * 1.5 + 0.5,
          speed: Math.random() * 0.3 + 0.1,
        });
      }
    }
    // Draw & animate stars
    crStarsRef.current.forEach(star => {
      if (!crashed) {
        star.y += star.speed;
        if (star.y > H) { star.y = 0; star.x = Math.random() * W; }
      }
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    const points = crPointsRef.current;
    if (points.length < 2) return;

    const maxT = Math.max(points[points.length - 1][0], 1000);
    const curM = points[points.length - 1][1];
    const maxM = Math.max(curM * 1.25, 1.8);
    const toX = (t: number) => padL + (t / maxT) * plotW;
    const toY = (m: number) => padT + plotH - ((m - 1) / (maxM - 1)) * plotH;

    // ─── GRID LINES ────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const gridMs = [1.5, 2, 3, 5, 10, 20, 50, 100].filter(v => v < maxM && toY(v) > padT + 4);
    gridMs.forEach(v => {
      const y = toY(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${v}x`, padL - 4, y + 4);
    });
    ctx.textAlign = 'left';

    const col = crashed ? '#ef4444' : '#22c55e';

    // ─── GRADIENT FILL UNDER CURVE ─────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(toX(points[0][0]), toY(1));
    points.forEach(([t, m]) => ctx.lineTo(toX(t), toY(m)));
    ctx.lineTo(toX(points[points.length - 1][0]), toY(1));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, crashed ? 'rgba(239,68,68,0.28)' : 'rgba(34,197,94,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // ─── GLOW EFFECT ON LINE ───────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = crashed ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.25)';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    points.forEach(([t, m], i) => { i === 0 ? ctx.moveTo(toX(t), toY(m)) : ctx.lineTo(toX(t), toY(m)); });
    ctx.stroke();

    // ─── MAIN LINE ─────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    points.forEach(([t, m], i) => { i === 0 ? ctx.moveTo(toX(t), toY(m)) : ctx.lineTo(toX(t), toY(m)); });
    ctx.stroke();

    // ─── ROCKET TRAIL ──────────────────────────────────────────────
    if (points.length > 4 && !crashed) {
      const trailLength = Math.min(12, points.length);
      for (let i = 0; i < trailLength; i++) {
        const idx = points.length - 1 - i;
        if (idx < 0) break;
        const [t, m] = points[idx];
        const alpha = (1 - i / trailLength) * 0.4;
        ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.beginPath();
        ctx.arc(toX(t), toY(m), 3 - i * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ─── ROCKET / EXPLOSION ────────────────────────────────────────
    const last = points[points.length - 1];
    const rocketX = toX(last[0]);
    const rocketY = toY(last[1]);

    if (crashed) {
      // Explosion particles
      const particles = crParticlesRef.current;
      if (particles.length === 0) {
        // Create explosion particles
        for (let i = 0; i < 30; i++) {
          const angle = (Math.PI * 2 * i) / 30 + Math.random() * 0.2;
          const speed = Math.random() * 3 + 2;
          particles.push({
            x: rocketX,
            y: rocketY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            maxLife: 40 + Math.random() * 20,
          });
        }
      }
      // Draw & update particles
      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.life++;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        const size = 3 * (1 - p.life / p.maxLife);
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        if (p.life > p.maxLife) particles.splice(idx, 1);
      });
      // Explosion icon
      ctx.font = '32px serif';
      ctx.fillText('💥', rocketX - 16, rocketY + 8);
    } else {
      // Flying rocket with flame
      ctx.save();
      ctx.translate(rocketX, rocketY);
      // Rocket angle: always diagonal up-right
      const angle = -Math.PI / 4;
      ctx.rotate(angle);
      
      // Rocket flame (animated)
      const flameOffset = Math.sin(Date.now() / 50) * 2;
      ctx.fillStyle = 'rgba(251, 146, 60, 0.8)';
      ctx.beginPath();
      ctx.moveTo(-3, 12 + flameOffset);
      ctx.lineTo(0, 18 + flameOffset);
      ctx.lineTo(3, 12 + flameOffset);
      ctx.closePath();
      ctx.fill();
      
      // Rocket emoji
      ctx.font = '28px serif';
      ctx.fillText('🚀', -14, 8);
      ctx.restore();
      
      // Speed lines
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.15 - i * 0.04})`;
        ctx.lineWidth = 2 - i * 0.5;
        ctx.beginPath();
        ctx.moveTo(rocketX - 20 - i * 8, rocketY + i * 3);
        ctx.lineTo(rocketX - 35 - i * 10, rocketY + i * 3);
        ctx.stroke();
      }
    }
  }, []);

  // ─── CRASH GAME LOGIC ────────────────────────────────────────
  const startCrashGame = useCallback(() => {
    if (crBet <= 0) return;
    const crashPoint = generateCrash();
    crCrashPointRef.current = crashPoint;
    crPointsRef.current = [];
    crCashedOutRef.current = false;
    crCurrentMultRef.current = 1.00;
    const acVal = parseFloat(crAutoCashout);
    crAutoCashoutRef.current = (!isNaN(acVal) && acVal >= 1.01) ? acVal : null;

    setCrPhase('running');
    setCrMultiplier(1.00);
    setCrCashedOut(false);
    setCrCashoutAt(null);

    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const raw = Math.pow(Math.E, 0.00007 * elapsed);
      const m = Math.floor(raw * 100) / 100;
      crCurrentMultRef.current = m;
      crPointsRef.current.push([elapsed, m]);

      // Auto cashout
      const auto = crAutoCashoutRef.current;
      if (!crCashedOutRef.current && auto !== null && m >= auto) {
        crCashedOutRef.current = true;
        setCrCashedOut(true);
        setCrCashoutAt(auto);
      }

      // Crash check
      if (m >= crashPoint) {
        const pts = crPointsRef.current;
        if (pts.length > 0) pts[pts.length - 1] = [elapsed, crashPoint];
        drawCrash(true);
        setCrMultiplier(crashPoint);
        setCrPhase('crashed');
        setCrHistory(prev => [crashPoint, ...prev].slice(0, 10));
        crRAFRef.current = null;
        return;
      }

      setCrMultiplier(m);
      drawCrash(false);
      crRAFRef.current = requestAnimationFrame(tick);
    };
    crRAFRef.current = requestAnimationFrame(tick);
  }, [crBet, crAutoCashout, drawCrash]);

  const cashOut = useCallback(() => {
    if (crCashedOutRef.current) return;
    crCashedOutRef.current = true;
    setCrCashedOut(true);
    setCrCashoutAt(crCurrentMultRef.current);
  }, []);

  const resetCrash = useCallback(() => {
    if (crRAFRef.current !== null) {
      cancelAnimationFrame(crRAFRef.current);
      crRAFRef.current = null;
    }
    crPointsRef.current = [];
    crCashedOutRef.current = false;
    crCurrentMultRef.current = 1.00;
    crParticlesRef.current = [];
    setCrPhase('idle');
    setCrMultiplier(1.00);
    setCrCashedOut(false);
    setCrCashoutAt(null);
  }, []);

  // Clear canvas when returning to idle
  useEffect(() => {
    if (crPhase !== 'idle') return;
    const canvas = crCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) { 
      // Reset background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#0a0e27');
      bgGrad.addColorStop(0.5, '#0d1420');
      bgGrad.addColorStop(1, '#040e08');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw stars on idle screen
      crStarsRef.current.forEach(star => {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [crPhase]);

  // ─── CHIP QUICK-BET ────────────────────────────────────────
  const addChip = (amount: number) => {
    setBetInput(prev => prev + amount);
  };

  // ─── RESULT LABEL ──────────────────────────────────────────
  const resultClass = (result: HandResult) => {
    if (result === 'win') return 'win';
    if (result === 'blackjack') return 'blackjack';
    if (result === 'lose' || result === 'bust') return 'lose';
    return 'push';
  };

  const resultText = (result: HandResult, bet: number, doubled: boolean) => {
    const actualBet = doubled ? bet : bet;
    if (result === 'blackjack') return `🃏 BLACKJACK! +${Math.floor(actualBet * 1.5)} EPCoins`;
    if (result === 'win') return `✅ GANHOU +${actualBet} EPCoins`;
    if (result === 'bust') return '💥 BUST!';
    if (result === 'lose') return `❌ PERDEU -${actualBet} EPCoins`;
    if (result === 'push') return '🤝 EMPATE';
    return '';
  };

  // ─── RENDER CARD ───────────────────────────────────────────
  const renderCard = (card: Card, idx: number) => {
    if (card.faceDown) {
      return <div key={idx} className="bj-card face-down" />;
    }
    const color = isRed(card.suit) ? 'red' : 'black';
    return (
      <div key={idx} className={`bj-card ${color}`}>
        <span className="bj-card__rank">{card.rank}</span>
        <span className="bj-card__suit">{card.suit}</span>
        <span className="bj-card__rank-bottom">{card.rank}</span>
      </div>
    );
  };

  const visibleDealerScore = () => {
    const visible = dealerCards.filter(c => !c.faceDown);
    if (visible.length === 0) return null;
    return handTotal(visible);
  };

  const isPlaying = phase === 'playing' || phase === 'split';
  const currentHand = hands[activeHandIdx];
  const canDoubleDown = isPlaying && currentHand?.cards.length === 2 && !currentHand.doubled;
  const canSplitNow = phase === 'playing' && currentHand && canSplit(currentHand);

  return (

    <div className="casino-page">
      <Navbar />
      <div className="casino-wrapper">
        {/* ─── MOBILE-FRIENDLY TOP BAR ───────────────────────── */}
        <div className="casino-topbar">
          <div className="casino-epcoins">
            <span className="casino-epcoins__icon">🪙</span>
            <div>
              <div className="casino-epcoins__label">EPCOINS</div>
              <div className="casino-epcoins__value">{epcoins.toLocaleString()}</div>
            </div>
          </div>
          <div className="casino-tabs">
            <button
              className={`casino-tab ${activeGame === 'blackjack' ? 'active' : ''}`}
              onClick={() => setActiveGame('blackjack')}
            >
              <Spade size={16} /> BLACKJACK
            </button>
            <button
              className={`casino-tab ${activeGame === 'horse' ? 'active' : ''}`}
              onClick={() => { resetRace(); setActiveGame('horse'); }}
            >
              🏇 CORRIDA
            </button>
            <button
              className={`casino-tab ${activeGame === 'crash' ? 'active' : ''}`}
              onClick={() => { resetCrash(); setActiveGame('crash'); }}
            >
              🚀 CRASH
            </button>
          </div>
        </div>

        {/* ─── BLACKJACK TABLE ───────────────────────────────── */}
        {activeGame === 'blackjack' && <div className="bj-table">

          {/* DEALER */}
          <div className="bj-hand-section">
            <div className="bj-hand-label">
              Dealer
              {dealerCards.length > 0 && visibleDealerScore() !== null && (
                <span className={`bj-score ${phase === 'finished' && handTotal(dealerCards) > 21 ? 'bust' : ''}`}>
                  {phase === 'finished' ? handTotal(dealerCards) : visibleDealerScore()}
                  {phase === 'finished' && handTotal(dealerCards) > 21 ? ' — BUST' : ''}
                </span>
              )}
            </div>
            <div className="bj-hand">
              {dealerCards.length === 0 && (
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', alignSelf: 'center' }}>
                  À espera da próxima ronda...
                </span>
              )}
              {dealerCards.map((c, i) => renderCard(c, i))}
            </div>
          </div>

          <div className="bj-divider" />

          {/* PLAYER */}
          <div className="bj-hand-section">
            <div className="bj-hand-label">
              As tuas cartas
            </div>

            {hands.length === 0 && (
              <div className="bj-hand">
                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
                  Faz a tua aposta e clica em DEAL para começar
                </span>
              </div>
            )}

            {/* Single hand */}
            {hands.length === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="bj-hand">
                  {hands[0].cards.map((c, i) => renderCard(c, i))}
                </div>
                {hands[0].cards.length > 0 && (
                  <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                    <span className={`bj-score ${isBust(hands[0].cards) ? 'bust' : isBlackjack(hands[0].cards) && hands[0].cards.length === 2 ? 'blackjack' : ''}`}>
                      {handTotal(hands[0].cards)}
                      {isBust(hands[0].cards) ? ' — BUST' : ''}
                      {isBlackjack(hands[0].cards) && hands[0].cards.length === 2 ? ' — BJ!' : ''}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-gray)', marginLeft: '0.8rem' }}>
                      Aposta: <strong style={{ color: 'var(--gold-primary)' }}>{hands[0].bet} EPCoins</strong>
                      {hands[0].doubled && <span style={{ color: '#60a5fa', marginLeft: '0.4rem' }}>(dobrada)</span>}
                    </span>
                  </div>
                )}
                {phase === 'finished' && hands[0].result && (
                  <div className={`bj-result ${resultClass(hands[0].result)}`}>
                    {resultText(hands[0].result, hands[0].bet, hands[0].doubled)}
                  </div>
                )}
              </div>
            )}

            {/* Split hands */}
            {hands.length === 2 && (
              <div className="bj-split-hands">
                {hands.map((hand, idx) => (
                  <div key={idx} className={`bj-split-hand ${idx === activeHandIdx && isPlaying ? 'active-split' : ''}`}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-gray)', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: 1 }}>
                      MÃO {idx + 1}
                      {idx === activeHandIdx && isPlaying && (
                        <span style={{ color: 'var(--gold-primary)', marginLeft: '0.5rem' }}>← ATIVA</span>
                      )}
                    </div>
                    <div className="bj-hand" style={{ minHeight: 80 }}>
                      {hand.cards.map((c, i) => renderCard(c, i))}
                    </div>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
                      <span className={`bj-score ${isBust(hand.cards) ? 'bust' : ''}`}>
                        {handTotal(hand.cards)}
                        {isBust(hand.cards) ? ' — BUST' : ''}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-gray)', marginLeft: '0.5rem' }}>
                        {hand.bet} EPCoins
                      </span>
                    </div>
                    {phase === 'finished' && hand.result && (
                      <div className={`bj-result ${resultClass(hand.result)}`} style={{ fontSize: '0.95rem', padding: '0.8rem' }}>
                        {resultText(hand.result, hand.bet, hand.doubled)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── CONTROLS ──────────────────────────────────── */}
          <div className="bj-controls">

            {/* IDLE: bet + deal */}
            {phase === 'idle' && (
              <>
                <div className="bj-bet-row">
                  <span className="bj-bet-label">APOSTA (EPCoins)</span>
                  <input
                    type="number"
                    className="bj-bet-input"
                    min={1}
                    max={epcoins}
                    value={betInput}
                    onChange={e => setBetInput(Math.max(1, Math.min(epcoins, Number(e.target.value))))}
                  />
                  {[10, 25, 50, 100, 250].map(chip => (
                    <button key={chip} className="bj-chip-btn" onClick={() => addChip(chip)}>
                      +{chip}
                    </button>
                  ))}
                  <button className="bj-chip-btn" onClick={() => setBetInput(1)} style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.35)' }}>
                    Limpar
                  </button>
                </div>
                <div className="bj-action-row">
                  <button className="bj-btn bj-btn-deal" onClick={handleDeal} disabled={!user || betInput <= 0 || betInput > epcoins}>
                    {user ? '🃏 DEAL' : '🔒 Inicia sessão'}
                  </button>
                </div>
              </>
            )}

            {/* PLAYING / SPLIT: action buttons */}
            {isPlaying && (
              <>
                <div className="bj-current-bet">
                  Aposta atual: <span>{currentHand?.bet ?? betInput} EPCoins</span>
                  {hands.length > 1 && <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '0.5rem' }}>· Mão {activeHandIdx + 1}/{hands.length}</span>}
                </div>
                <div className="bj-action-row">
                  <button className="bj-btn bj-btn-hit" onClick={handleHit}>
                    👊 HIT
                  </button>
                  <button className="bj-btn bj-btn-stand" onClick={handleStand}>
                    ✋ STAND
                  </button>
                  <button className="bj-btn bj-btn-double" onClick={handleDouble} disabled={!canDoubleDown}>
                    ✌️ DOUBLE
                  </button>
                  <button className="bj-btn bj-btn-split" onClick={handleSplit} disabled={!canSplitNow}>
                    ⚔️ SPLIT
                  </button>
                </div>
              </>
            )}

            {/* DEALER resolving */}
            {phase === 'dealer' && (
              <div style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.9rem', padding: '0.5rem' }}>
                O dealer está a jogar...
              </div>
            )}

            {/* FINISHED */}
            {phase === 'finished' && (
              <>
                <div className="bj-action-row" style={{ justifyContent: 'center' }}>
                  <button className="bj-btn bj-btn-new" onClick={handleNewRound} style={{ flex: 'none', width: 'auto', padding: '0.7rem 1.4rem' }}>
                    <RotateCcw size={16} /> NOVA RONDA
                  </button>
                  <button
                    className="bj-btn bj-btn-deal"
                    onClick={() => { handleNewRound(); setTimeout(handleDeal, 50); }}
                    style={{ flex: 'none', width: 'auto', padding: '0.7rem 1.4rem' }}
                  >
                    🃏 REPETIR ({betInput} EPCoins)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>}

        {/* ─── BLACKJACK RULES ───────────────────────────────── */}
        {activeGame === 'blackjack' && <div style={{
          marginTop: '1.5rem',
          padding: '1.2rem 1.5rem',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '10px',
          fontSize: '0.75rem',
          color: 'var(--text-gray)',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}>
          <span>🃏 <strong style={{color:'#fff'}}>Blackjack</strong> paga 1.5×</span>
          <span>👊 <strong style={{color:'#fff'}}>Hit</strong> — pede mais uma carta</span>
          <span>✋ <strong style={{color:'#fff'}}>Stand</strong> — fica com as cartas</span>
          <span>✌️ <strong style={{color:'#fff'}}>Double</strong> — dobra aposta, 1 carta extra</span>
          <span>⚔️ <strong style={{color:'#fff'}}>Split</strong> — divide par em 2 mãos</span>
          <span>🏠 <strong style={{color:'#fff'}}>Dealer</strong> retira até 17+</span>
        </div>}

        {/* ─── HORSE RACING ──────────────────────────────────── */}
        {activeGame === 'horse' && (
          <div className="hr-container">

            {/* Horse selection + bet */}
            {hrPhase === 'idle' && (
              <>
                <div className="hr-horses-grid">
                  {HORSES.map(horse => (
                    <div
                      key={horse.id}
                      className={`hr-horse-card ${hrSelectedHorse === horse.id ? 'selected' : ''}`}
                      onClick={() => setHrSelectedHorse(horse.id)}
                      style={{ borderColor: hrSelectedHorse === horse.id ? horse.color : undefined }}
                    >
                      <span className="hr-horse-emoji">🐴</span>
                      <div className="hr-horse-dot" style={{ background: horse.color }} />
                      <div className="hr-horse-name" style={{ color: hrSelectedHorse === horse.id ? horse.color : undefined }}>
                        {horse.name}
                      </div>
                      <div className="hr-horse-number">#{horse.id + 1}</div>
                    </div>
                  ))}
                </div>

                <div className="bj-controls" style={{ marginTop: 0 }}>
                  <div className="bj-bet-row">
                    <span className="bj-bet-label">APOSTA (EPCoins)</span>
                    <input
                      type="number"
                      className="bj-bet-input"
                      min={1}
                      max={epcoins}
                      value={hrBet}
                      onChange={e => setHrBet(Math.max(1, Math.min(epcoins, Number(e.target.value))))}
                    />
                    {[10, 25, 50, 100, 250].map(chip => (
                      <button key={chip} className="bj-chip-btn" onClick={() => setHrBet(prev => Math.min(epcoins, prev + chip))}>
                        +{chip}
                      </button>
                    ))}
                    <button className="bj-chip-btn" onClick={() => setHrBet(1)} style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.35)' }}>
                      Limpar
                    </button>
                  </div>
                  <div className="bj-action-row" style={{ justifyContent: 'center', gap: '1.5rem', alignItems: 'center' }}>
                    <button
                      className="bj-btn bj-btn-deal"
                      onClick={startRace}
                      disabled={!user || hrSelectedHorse === null || hrBet <= 0}
                      style={{ flex: 'none', width: 'auto', padding: '0.8rem 2.2rem' }}
                    >
                      {user ? '🏇 INICIAR CORRIDA' : '🔒 Inicia sessão'}
                    </button>
                    {hrSelectedHorse !== null && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-gray)' }}>
                        <strong style={{ color: HORSES[hrSelectedHorse].color }}>{HORSES[hrSelectedHorse].name}</strong>
                        {' · ganhas '}
                        <strong style={{ color: 'var(--gold-primary)' }}>{hrBet * 5} EPCoins</strong>
                        {' se ganhar'}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Race track */}
            {(hrPhase === 'racing' || hrPhase === 'finished') && (
              <>
                <div className="hr-track">
                  {HORSES.map((horse, idx) => (
                    <div key={horse.id} className="hr-lane">
                      <div className="hr-lane-info">
                        <span className="hr-lane-num">#{horse.id + 1}</span>
                        <span className="hr-lane-dot" style={{ background: horse.color }} />
                        <span
                          className="hr-lane-name"
                          style={{ color: hrSelectedHorse === horse.id ? horse.color : undefined }}
                        >
                          {horse.name}{hrSelectedHorse === horse.id ? ' ★' : ''}
                        </span>
                      </div>
                      <div className={`hr-lane-track ${hrSelectedHorse === horse.id ? 'selected-lane' : ''}`}>
                        <div
                          className="hr-horse-runner"
                          style={{ left: `calc(${hrPositions[idx]}% - 20px)` }}
                        >
                          🐴
                        </div>
                        <div className="hr-finish-flag" />
                      </div>
                      {hrPhase === 'finished' && hrWinnerId === horse.id && (
                        <span className="hr-winner-trophy">🏆</span>
                      )}
                    </div>
                  ))}
                </div>

                {hrPhase === 'racing' && (
                  <div style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.82rem' }}>
                    🏇 A corrida está a decorrer...
                  </div>
                )}

                {hrPhase === 'finished' && hrWinnerId !== null && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div
                      className="hr-result"
                      style={{
                        background: hrWinnerId === hrSelectedHorse ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                        border: `1px solid ${hrWinnerId === hrSelectedHorse ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)'}`,
                        color: hrWinnerId === hrSelectedHorse ? '#4ade80' : '#f87171',
                      }}
                    >
                      {hrWinnerId === hrSelectedHorse
                        ? `✅ GANHOU! +${hrBet * 5} EPCoins`
                        : `❌ PERDEU! ${HORSES[hrWinnerId].name} ganhou a corrida!`}
                    </div>
                    <div className="bj-action-row" style={{ justifyContent: 'center' }}>
                      <button
                        className="bj-btn bj-btn-new"
                        onClick={resetRace}
                        style={{ flex: 'none', width: 'auto', padding: '0.7rem 1.4rem' }}
                      >
                        <RotateCcw size={16} /> NOVA CORRIDA
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)' }}>
              {HORSES.length} cavalos · Odds 5× · Escolhe o teu cavalo e aposta
            </div>
          </div>
        )}

        {/* ─── CRASH GAME ──────────────────────────────────── */}
        {activeGame === 'crash' && (
          <div className="cr-container">

            {/* History bar */}
            {crHistory.length > 0 && (
              <div className="cr-history">
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', marginRight: '0.2rem', alignSelf: 'center' }}>HISTÓRICO:</span>
                {crHistory.map((h, i) => (
                  <span key={i} className={`cr-history-item ${h < 2 ? 'cr-low' : h < 5 ? 'cr-mid' : 'cr-high'}`}>
                    {h.toFixed(2)}x
                  </span>
                ))}
              </div>
            )}

            {/* Canvas graph */}
            <div className="cr-canvas-wrap">
              <canvas ref={crCanvasRef} width={900} height={280} />

              {/* Running: big multiplier */}
              {crPhase === 'running' && (
                <div className="cr-overlay">
                  <div style={{
                    fontSize: '3.8rem', fontWeight: 900, lineHeight: 1, fontFamily: 'monospace',
                    color: crCashedOut ? '#fbbf24' : '#22c55e',
                    textShadow: `0 0 40px ${crCashedOut ? 'rgba(251,191,36,0.4)' : 'rgba(34,197,94,0.4)'}`,
                  }}>
                    {crMultiplier.toFixed(2)}<span style={{ fontSize: '2rem', verticalAlign: 'middle' }}>x</span>
                  </div>
                  {crCashedOut && crCashoutAt && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#fbbf24', fontWeight: 700 }}>
                      ✅ Saíste a {crCashoutAt.toFixed(2)}x · a aguardar crash...
                    </div>
                  )}
                </div>
              )}

              {/* Crashed */}
              {crPhase === 'crashed' && (
                <div className="cr-overlay">
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#ef4444', letterSpacing: '3px', marginBottom: '0.2rem' }}>
                    CRASHED
                  </div>
                  <div style={{
                    fontSize: '3.5rem', fontWeight: 900, fontFamily: 'monospace', lineHeight: 1,
                    color: '#ef4444', textShadow: '0 0 40px rgba(239,68,68,0.5)',
                  }}>
                    {crMultiplier.toFixed(2)}<span style={{ fontSize: '2rem', verticalAlign: 'middle' }}>x</span>
                  </div>
                </div>
              )}

              {/* Idle */}
              {crPhase === 'idle' && (
                <div className="cr-overlay" style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.82rem' }}>
                  Faz a tua aposta e clica em 🚀 VOAR
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="bj-controls" style={{ marginTop: 0 }}>

              {/* IDLE */}
              {crPhase === 'idle' && (
                <>
                  <div className="bj-bet-row">
                    <span className="bj-bet-label">APOSTA</span>
                    <input
                      type="number" className="bj-bet-input" min={1} max={epcoins}
                      value={crBet}
                      onChange={e => setCrBet(Math.max(1, Math.min(epcoins, Number(e.target.value))))}
                    />
                    {[10, 25, 50, 100, 250].map(chip => (
                      <button key={chip} className="bj-chip-btn" onClick={() => setCrBet(prev => Math.min(epcoins, prev + chip))}>+{chip}</button>
                    ))}
                    <button className="bj-chip-btn" onClick={() => setCrBet(1)} style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.35)' }}>Limpar</button>
                  </div>
                  <div className="cr-auto-row">
                    <span className="bj-bet-label" style={{ whiteSpace: 'nowrap' }}>AUTO SAÍDA (x)</span>
                    <input
                      type="number" className="bj-bet-input" min={1.01} step={0.1}
                      placeholder="desativ."
                      value={crAutoCashout}
                      onChange={e => setCrAutoCashout(e.target.value)}
                      style={{ width: 110 }}
                    />
                    <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)' }}>
                      ex: 2.00 → sai automaticamente a 2.00x
                    </span>
                  </div>
                  <div className="bj-action-row" style={{ justifyContent: 'center' }}>
                    <button
                      className="bj-btn bj-btn-deal"
                      onClick={startCrashGame}
                      disabled={!user || crBet <= 0 || crBet > epcoins}
                      style={{ flex: 'none', width: 'auto', padding: '0.85rem 3rem', fontSize: '0.85rem' }}
                    >
                      {user ? '🚀 VOAR' : '🔒 Inicia sessão'}
                    </button>
                  </div>
                </>
              )}

              {/* RUNNING — manual cashout */}
              {crPhase === 'running' && !crCashedOut && (
                <button className="cr-cashout-btn" onClick={cashOut}>
                  💰 SAÍR AGORA — {crMultiplier.toFixed(2)}x
                  <span className="cr-cashout-profit">+{Math.max(0, Math.floor(crBet * crMultiplier - crBet))} EPCoins de lucro</span>
                </button>
              )}

              {/* RUNNING — already cashed out, watching */}
              {crPhase === 'running' && crCashedOut && (
                <div style={{ textAlign: 'center', padding: '0.9rem 1rem', background: 'rgba(34,197,94,0.07)', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '0.95rem' }}>
                    ✅ Saíste a {crCashoutAt?.toFixed(2)}x · +{Math.floor(crBet * (crCashoutAt ?? 1) - crBet)} EPCoins
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-gray)', marginTop: '0.2rem' }}>A aguardar o crash...</div>
                </div>
              )}

              {/* FINISHED — result */}
              {crPhase === 'crashed' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                  {crCashedOut && crCashoutAt ? (
                    <div className="hr-result" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}>
                      ✅ GANHOU +{Math.floor(crBet * crCashoutAt - crBet)} EPCoins · saíste a {crCashoutAt.toFixed(2)}x
                    </div>
                  ) : (
                    <div className="hr-result" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                      ❌ PERDEU -{crBet} EPCoins · crash a {crMultiplier.toFixed(2)}x
                    </div>
                  )}
                  <div className="bj-action-row" style={{ justifyContent: 'center' }}>
                    <button className="bj-btn bj-btn-new" onClick={resetCrash} style={{ flex: 'none', width: 'auto', padding: '0.7rem 1.4rem' }}>
                      <RotateCcw size={16} /> NOVO JOGO
                    </button>
                    <button
                      className="bj-btn bj-btn-deal"
                      onClick={() => { resetCrash(); setTimeout(startCrashGame, 30); }}
                      style={{ flex: 'none', width: 'auto', padding: '0.7rem 1.4rem' }}
                    >
                      🚀 REPETIR ({crBet} EPCoins)
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'rgba(255,255,255,0.18)' }}>
              P(≥2x) ≈ 49.5% · P(≥5x) ≈ 19.8% · P(≥10x) ≈ 9.9% · Casa tem 1% de vantagem
            </div>
          </div>
        )}

      </div>

      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
