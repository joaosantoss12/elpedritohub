import { Dice5, ExternalLink } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import SlotWinsSlider from '../components/SlotWinsSlider';
import DemoSlots from '../components/DemoSlots';
import '../styles/Casino.css';

/** Link de afiliado do casino patrocinador do EL PEDRITO. */
const CASINO_URL = 'https://captainspartners.com/processing/click?btag=16361_33948';

export default function Casino() {
  return (
    <div className="casino-page">
      <Navbar />

      <div className="casino-wrapper">
        <section className="casino-hero">
          <div className="casino-hero__eyebrow"><Dice5 size={14} /> O casino oficial do EL PEDRITO</div>
          <h1 className="casino-hero__nome">CaptainsBet</h1>
          <p className="casino-hero__tagline">
            As mesmas slots que vês a pagar aqui em baixo. Regista-te pelo link
            oficial e apoia o projeto sem pagar mais por isso.
          </p>
          <a
            className="casino-hero__cta"
            href={CASINO_URL}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            Entrar no casino <ExternalLink size={16} />
          </a>
          <p className="casino-hero__nota">Jogo responsável • Apenas +18</p>
        </section>

        <div className="casino-slider">
          <SlotWinsSlider />
        </div>

        <DemoSlots />
      </div>
    </div>
  );
}
