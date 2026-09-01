/**
 * O catálogo de competições.
 *
 * Cada slug aqui foi sondado contra o endpoint real da ESPN antes de entrar —
 * nenhum é adivinhado. Slugs que pareciam óbvios (`pol.1`, `ukr.1`, `kor.1`,
 * `egy.1`, `por.2`) respondem 400 e por isso não estão cá: a ESPN não cobre
 * essas competições, e listá-las só criaria filtros permanentemente vazios.
 *
 * A lista é partilhada entre o browser e as funções em `api/` — é a razão de
 * viver num ficheiro sem imports. O browser nunca varre isto tudo: quem o faz
 * é o cron, que escreve o resultado em cache. Ver `src/lib/placar.ts`.
 */

export interface Competicao {
  slug: string;
  /** Rótulo de recurso. O nome verdadeiro vem da resposta da ESPN. */
  nome: string;
  continente: Continente;
  /**
   * O núcleo é o que o browser vai buscar sozinho quando a cache do servidor
   * está velha. Tem de caber num punhado de pedidos, por isso são só as ligas
   * que quase toda a gente segue.
   */
  nucleo?: true;
}

export type Continente =
  | 'Portugal'
  | 'Europa'
  | 'América do Sul'
  | 'América do Norte'
  | 'Ásia'
  | 'África'
  | 'Seleções';

export const ORDEM_CONTINENTES: readonly Continente[] = [
  'Portugal', 'Europa', 'América do Sul', 'América do Norte', 'Ásia', 'África', 'Seleções',
];

export const COMPETICOES: Competicao[] = [
  // ── Portugal ──────────────────────────────────────────────
  { slug: 'por.1', nome: 'Liga Portugal', continente: 'Portugal', nucleo: true },
  { slug: 'por.taca.portugal', nome: 'Taça de Portugal', continente: 'Portugal', nucleo: true },

  // ── Europa — primeiras divisões ───────────────────────────
  { slug: 'eng.1', nome: 'Premier League', continente: 'Europa', nucleo: true },
  { slug: 'esp.1', nome: 'LaLiga', continente: 'Europa', nucleo: true },
  { slug: 'ita.1', nome: 'Serie A', continente: 'Europa', nucleo: true },
  { slug: 'ger.1', nome: 'Bundesliga', continente: 'Europa', nucleo: true },
  { slug: 'fra.1', nome: 'Ligue 1', continente: 'Europa', nucleo: true },
  { slug: 'ned.1', nome: 'Eredivisie', continente: 'Europa' },
  { slug: 'bel.1', nome: 'Pro League', continente: 'Europa' },
  { slug: 'sco.1', nome: 'Premiership', continente: 'Europa' },
  { slug: 'tur.1', nome: 'Süper Lig', continente: 'Europa' },
  { slug: 'sui.1', nome: 'Super League', continente: 'Europa' },
  { slug: 'aut.1', nome: 'Bundesliga (AUT)', continente: 'Europa' },
  { slug: 'gre.1', nome: 'Super League (GRE)', continente: 'Europa' },
  { slug: 'den.1', nome: 'Superliga', continente: 'Europa' },
  { slug: 'nor.1', nome: 'Eliteserien', continente: 'Europa' },
  { slug: 'swe.1', nome: 'Allsvenskan', continente: 'Europa' },
  { slug: 'fin.1', nome: 'Veikkausliiga', continente: 'Europa' },
  { slug: 'irl.1', nome: 'Premier Division (IRL)', continente: 'Europa' },
  { slug: 'rus.1', nome: 'Premier League (RUS)', continente: 'Europa' },
  { slug: 'cze.1', nome: 'Chance Liga', continente: 'Europa' },
  { slug: 'rou.1', nome: 'Liga I', continente: 'Europa' },
  { slug: 'cyp.1', nome: 'First Division (CYP)', continente: 'Europa' },
  { slug: 'isr.1', nome: 'Ligat ha\'Al', continente: 'Europa' },
  { slug: 'mlt.1', nome: 'Premier League (MLT)', continente: 'Europa' },
  { slug: 'wal.1', nome: 'Cymru Premier', continente: 'Europa' },
  { slug: 'nir.1', nome: 'NIFL Premiership', continente: 'Europa' },

  // ── Europa — segundas divisões e abaixo ───────────────────
  { slug: 'eng.2', nome: 'Championship', continente: 'Europa', nucleo: true },
  { slug: 'eng.3', nome: 'League One', continente: 'Europa' },
  { slug: 'eng.4', nome: 'League Two', continente: 'Europa' },
  { slug: 'eng.5', nome: 'National League', continente: 'Europa' },
  { slug: 'esp.2', nome: 'LaLiga 2', continente: 'Europa' },
  { slug: 'ita.2', nome: 'Serie B', continente: 'Europa' },
  { slug: 'ger.2', nome: '2. Bundesliga', continente: 'Europa' },
  { slug: 'fra.2', nome: 'Ligue 2', continente: 'Europa' },
  { slug: 'ned.2', nome: 'Eerste Divisie', continente: 'Europa' },
  { slug: 'sco.2', nome: 'Championship (SCO)', continente: 'Europa' },
  { slug: 'sco.3', nome: 'League One (SCO)', continente: 'Europa' },
  { slug: 'sco.4', nome: 'League Two (SCO)', continente: 'Europa' },
  { slug: 'tur.2', nome: '1. Lig', continente: 'Europa' },
  { slug: 'sui.2', nome: 'Challenge League', continente: 'Europa' },
  { slug: 'aut.2', nome: '2. Liga (AUT)', continente: 'Europa' },
  { slug: 'den.2', nome: '1. Division (DEN)', continente: 'Europa' },
  { slug: 'nor.2', nome: '1. divisjon', continente: 'Europa' },
  { slug: 'swe.2', nome: 'Superettan', continente: 'Europa' },

  // ── Europa — taças nacionais ──────────────────────────────
  { slug: 'eng.fa', nome: 'FA Cup', continente: 'Europa' },
  { slug: 'eng.league_cup', nome: 'Carabao Cup', continente: 'Europa' },
  { slug: 'eng.trophy', nome: 'EFL Trophy', continente: 'Europa' },
  { slug: 'eng.charity', nome: 'Community Shield', continente: 'Europa' },
  { slug: 'sco.tennents', nome: 'Scottish Cup', continente: 'Europa' },
  { slug: 'sco.cis', nome: 'Scottish League Cup', continente: 'Europa' },
  { slug: 'esp.copa_del_rey', nome: 'Copa del Rey', continente: 'Europa' },
  { slug: 'esp.super_cup', nome: 'Supercopa de España', continente: 'Europa' },
  { slug: 'ita.coppa_italia', nome: 'Coppa Italia', continente: 'Europa' },
  { slug: 'ita.super_cup', nome: 'Supercoppa Italiana', continente: 'Europa' },
  { slug: 'ger.dfb_pokal', nome: 'DFB-Pokal', continente: 'Europa' },
  { slug: 'ger.super_cup', nome: 'DFL-Supercup', continente: 'Europa' },
  { slug: 'fra.coupe_de_france', nome: 'Coupe de France', continente: 'Europa' },
  { slug: 'fra.super_cup', nome: 'Trophée des Champions', continente: 'Europa' },
  { slug: 'ned.cup', nome: 'KNVB Beker', continente: 'Europa' },
  { slug: 'ned.supercup', nome: 'Johan Cruijff Schaal', continente: 'Europa' },
  { slug: 'sco.challenge', nome: 'Challenge Cup', continente: 'Europa' },

  // ── Europa — competições UEFA de clubes ───────────────────
  { slug: 'uefa.champions', nome: 'Liga dos Campeões', continente: 'Europa', nucleo: true },
  { slug: 'uefa.champions_qual', nome: 'Champions — Qualificação', continente: 'Europa' },
  { slug: 'uefa.europa', nome: 'Liga Europa', continente: 'Europa', nucleo: true },
  { slug: 'uefa.europa_qual', nome: 'Liga Europa — Qualificação', continente: 'Europa' },
  { slug: 'uefa.europa.conf', nome: 'Liga Conferência', continente: 'Europa', nucleo: true },
  { slug: 'uefa.europa.conf_qual', nome: 'Conferência — Qualificação', continente: 'Europa' },
  { slug: 'uefa.super_cup', nome: 'Supertaça Europeia', continente: 'Europa' },
  { slug: 'uefa.wchampions', nome: 'Champions Feminina', continente: 'Europa' },

  // ── América do Sul ────────────────────────────────────────
  { slug: 'bra.1', nome: 'Brasileirão Série A', continente: 'América do Sul', nucleo: true },
  { slug: 'bra.2', nome: 'Brasileirão Série B', continente: 'América do Sul' },
  { slug: 'bra.copa_do_brazil', nome: 'Copa do Brasil', continente: 'América do Sul' },
  { slug: 'bra.camp.paulista', nome: 'Paulistão', continente: 'América do Sul' },
  { slug: 'bra.camp.carioca', nome: 'Carioca', continente: 'América do Sul' },
  { slug: 'arg.1', nome: 'Liga Profesional', continente: 'América do Sul', nucleo: true },
  { slug: 'arg.2', nome: 'Primera Nacional', continente: 'América do Sul' },
  { slug: 'arg.copa', nome: 'Copa Argentina', continente: 'América do Sul' },
  { slug: 'arg.copa_lpf', nome: 'Copa de la Liga', continente: 'América do Sul' },
  { slug: 'arg.supercopa', nome: 'Supercopa Argentina', continente: 'América do Sul' },
  { slug: 'chi.1', nome: 'Primera División (CHI)', continente: 'América do Sul' },
  { slug: 'col.1', nome: 'Primera A', continente: 'América do Sul' },
  { slug: 'col.2', nome: 'Primera B', continente: 'América do Sul' },
  { slug: 'col.superliga', nome: 'Superliga (COL)', continente: 'América do Sul' },
  { slug: 'per.1', nome: 'Liga 1', continente: 'América do Sul' },
  { slug: 'uru.1', nome: 'Primera División (URU)', continente: 'América do Sul' },
  { slug: 'par.1', nome: 'Primera División (PAR)', continente: 'América do Sul' },
  { slug: 'ven.1', nome: 'Liga FUTVE', continente: 'América do Sul' },
  { slug: 'ecu.1', nome: 'LigaPro', continente: 'América do Sul' },
  { slug: 'bol.1', nome: 'Liga Profesional (BOL)', continente: 'América do Sul' },
  { slug: 'conmebol.libertadores', nome: 'Libertadores', continente: 'América do Sul', nucleo: true },
  { slug: 'conmebol.sudamericana', nome: 'Sudamericana', continente: 'América do Sul' },
  { slug: 'conmebol.recopa', nome: 'Recopa Sudamericana', continente: 'América do Sul' },

  // ── América do Norte e Central ────────────────────────────
  { slug: 'usa.1', nome: 'MLS', continente: 'América do Norte', nucleo: true },
  { slug: 'usa.usl.1', nome: 'USL Championship', continente: 'América do Norte' },
  { slug: 'usa.usl.l1', nome: 'USL League One', continente: 'América do Norte' },
  { slug: 'usa.open', nome: 'US Open Cup', continente: 'América do Norte' },
  { slug: 'usa.nwsl', nome: 'NWSL', continente: 'América do Norte' },
  { slug: 'mex.1', nome: 'Liga MX', continente: 'América do Norte' },
  { slug: 'mex.2', nome: 'Liga de Expansión', continente: 'América do Norte' },
  { slug: 'mex.copa_mx', nome: 'Copa MX', continente: 'América do Norte' },
  { slug: 'mex.supercopa', nome: 'Supercopa MX', continente: 'América do Norte' },
  { slug: 'mex.campeon', nome: 'Campeón de Campeones', continente: 'América do Norte' },
  { slug: 'concacaf.champions', nome: 'Concacaf Champions Cup', continente: 'América do Norte' },
  { slug: 'concacaf.league', nome: 'Concacaf League', continente: 'América do Norte' },
  { slug: 'crc.1', nome: 'Liga FPD', continente: 'América do Norte' },
  { slug: 'hon.1', nome: 'Liga Nacional (HON)', continente: 'América do Norte' },
  { slug: 'gua.1', nome: 'Liga Nacional (GUA)', continente: 'América do Norte' },
  { slug: 'slv.1', nome: 'Primera División (SLV)', continente: 'América do Norte' },
  { slug: 'jam.1', nome: 'Premier League (JAM)', continente: 'América do Norte' },

  // ── Ásia e Oceânia ────────────────────────────────────────
  { slug: 'ksa.1', nome: 'Saudi Pro League', continente: 'Ásia' },
  { slug: 'jpn.1', nome: 'J1 League', continente: 'Ásia' },
  { slug: 'chn.1', nome: 'Super League (CHN)', continente: 'Ásia' },
  { slug: 'aus.1', nome: 'A-League', continente: 'Ásia' },
  { slug: 'ind.1', nome: 'Indian Super League', continente: 'Ásia' },
  { slug: 'idn.1', nome: 'Liga 1 (IDN)', continente: 'Ásia' },
  { slug: 'mys.1', nome: 'Super League (MYS)', continente: 'Ásia' },
  { slug: 'tha.1', nome: 'Thai League 1', continente: 'Ásia' },
  { slug: 'sgp.1', nome: 'Premier League (SGP)', continente: 'Ásia' },
  { slug: 'afc.champions', nome: 'AFC Champions Elite', continente: 'Ásia' },
  { slug: 'afc.cup', nome: 'AFC Champions Two', continente: 'Ásia' },

  // ── África ────────────────────────────────────────────────
  { slug: 'rsa.1', nome: 'Premiership (RSA)', continente: 'África' },
  { slug: 'nga.1', nome: 'NPFL', continente: 'África' },
  { slug: 'gha.1', nome: 'Premier League (GHA)', continente: 'África' },
  { slug: 'ken.1', nome: 'Premier League (KEN)', continente: 'África' },
  { slug: 'caf.champions', nome: 'CAF Champions League', continente: 'África' },
  { slug: 'caf.confederation', nome: 'CAF Confederation Cup', continente: 'África' },

  // ── Seleções ──────────────────────────────────────────────
  { slug: 'fifa.world', nome: 'Mundial', continente: 'Seleções', nucleo: true },
  { slug: 'fifa.worldq.uefa', nome: 'Apuramento Mundial — UEFA', continente: 'Seleções', nucleo: true },
  { slug: 'fifa.worldq.conmebol', nome: 'Apuramento Mundial — CONMEBOL', continente: 'Seleções' },
  { slug: 'fifa.worldq.concacaf', nome: 'Apuramento Mundial — Concacaf', continente: 'Seleções' },
  { slug: 'fifa.worldq.afc', nome: 'Apuramento Mundial — AFC', continente: 'Seleções' },
  { slug: 'fifa.worldq.caf', nome: 'Apuramento Mundial — CAF', continente: 'Seleções' },
  { slug: 'fifa.worldq.ofc', nome: 'Apuramento Mundial — OFC', continente: 'Seleções' },
  { slug: 'uefa.euro', nome: 'Euro', continente: 'Seleções' },
  { slug: 'uefa.euroq', nome: 'Apuramento Euro', continente: 'Seleções' },
  { slug: 'uefa.nations', nome: 'Liga das Nações', continente: 'Seleções', nucleo: true },
  { slug: 'uefa.weuro', nome: 'Euro Feminino', continente: 'Seleções' },
  { slug: 'conmebol.america', nome: 'Copa América', continente: 'Seleções' },
  { slug: 'concacaf.gold', nome: 'Gold Cup', continente: 'Seleções' },
  { slug: 'concacaf.nations.league', nome: 'Concacaf Nations League', continente: 'Seleções' },
  { slug: 'afc.asian.cup', nome: 'Taça Asiática', continente: 'Seleções' },
  { slug: 'caf.nations', nome: 'CAN', continente: 'Seleções' },
  { slug: 'caf.nations_qual', nome: 'Apuramento CAN', continente: 'Seleções' },
  { slug: 'fifa.wwc', nome: 'Mundial Feminino', continente: 'Seleções' },
  { slug: 'fifa.olympics', nome: 'Jogos Olímpicos', continente: 'Seleções' },
  { slug: 'fifa.cwc', nome: 'Mundial de Clubes', continente: 'Seleções' },
  { slug: 'fifa.confederations', nome: 'Taça das Confederações', continente: 'Seleções' },
  { slug: 'fifa.friendly', nome: 'Particulares de seleções', continente: 'Seleções' },
];

/** Todos os slugs. É isto que o cron varre — nunca o browser. */
export const LIGAS_TODAS: string[] = COMPETICOES.map(c => c.slug);

/** O subconjunto que o browser aguenta pedir sozinho se a cache falhar. */
export const LIGAS_NUCLEO: string[] = COMPETICOES.filter(c => c.nucleo).map(c => c.slug);

const POR_SLUG = new Map(COMPETICOES.map(c => [c.slug, c]));

export function continenteDaLiga(slug: string): string {
  return POR_SLUG.get(slug)?.continente ?? 'Outras';
}

export function nomeDaLiga(slug: string): string {
  return POR_SLUG.get(slug)?.nome ?? slug;
}

// ─── BANDEIRAS ────────────────────────────────────────────────
//
// Uma pista visual à frente do nome da liga: quem passa os olhos pela lista
// reconhece a bandeira antes de ler "Serie B" ou "Segunda División". O slug
// da ESPN começa quase sempre pelo código do país (`por.1`, `eng.2`), por
// isso basta o prefixo — não é preciso mais uma coluna no catálogo.
//
// As competições continentais e de seleções não têm país; algumas caem na
// bandeira da confederação (a UE serve a UEFA), as outras ficam sem bandeira
// e a interface mostra só o troféu.

const ISO_POR_PREFIXO: Record<string, string> = {
  por: 'pt', eng: 'gb-eng', sco: 'gb-sct', wal: 'gb-wls', nir: 'gb-nir',
  esp: 'es', ita: 'it', ger: 'de', fra: 'fr', ned: 'nl', bel: 'be',
  tur: 'tr', sui: 'ch', aut: 'at', gre: 'gr', den: 'dk', nor: 'no',
  swe: 'se', fin: 'fi', irl: 'ie', rus: 'ru', cze: 'cz', rou: 'ro',
  cyp: 'cy', isr: 'il', mlt: 'mt', ukr: 'ua', pol: 'pl', hun: 'hu',
  srb: 'rs', cro: 'hr', bul: 'bg', slo: 'si', svk: 'sk', bih: 'ba',
  bra: 'br', arg: 'ar', chi: 'cl', col: 'co', per: 'pe', uru: 'uy',
  par: 'py', ven: 've', ecu: 'ec', bol: 'bo',
  usa: 'us', usl: 'us', mex: 'mx', crc: 'cr', hon: 'hn', gua: 'gt',
  slv: 'sv', jam: 'jm', pan: 'pa',
  ksa: 'sa', jpn: 'jp', kor: 'kr', chn: 'cn', aus: 'au', ind: 'in',
  idn: 'id', mys: 'my', tha: 'th', sgp: 'sg', uae: 'ae', qat: 'qa',
  rsa: 'za', nga: 'ng', gha: 'gh', ken: 'ke', egy: 'eg', mar: 'ma',
  tun: 'tn', alg: 'dz',
  uefa: 'eu',
};

/** URL da bandeira para pôr à frente do nome da liga, ou `null` se não houver
 *  país associado (competições da CONMEBOL, CONCACAF, AFC, CAF, FIFA…). */
export function bandeiraDaLiga(slug: string): string | null {
  const prefixo = slug.split('.')[0];
  const iso = ISO_POR_PREFIXO[prefixo];
  return iso ? `https://flagcdn.com/${iso}.svg` : null;
}
