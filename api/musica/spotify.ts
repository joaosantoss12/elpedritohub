import type { VercelRequest, VercelResponse } from '@vercel/node';

/*
 * Resolve um link do Spotify (playlist, álbum ou faixa) numa lista de vídeos do
 * YouTube — o mesmo truque dos bots de música do Discord: o Spotify serve só os
 * metadados (título + artista), o áudio vem sempre do YouTube.
 *
 * Passo 1: ler a lista. Fonte principal = página `open.spotify.com/embed/…`,
 *          que traz o alinhamento em JSON e NÃO precisa de token nem de conta
 *          Premium (a Web API oficial passou a dar 403 a apps cujo dono não
 *          tem Premium). A Web API fica como reserva, se houver credenciais.
 * Passo 2: para cada faixa, procurar no YouTube (API interna, com o raspar
 *          da página como plano B).
 */

// Resolver 50+ faixas no YouTube demora — o default de 10s da Vercel não chega.
export const config = { maxDuration: 60 };

// O `playerVars.playlist` do IFrame do YouTube trava perto das 200 entradas —
// não vale a pena resolver mais do que isso.
const MAX_FAIXAS = 200;
const CONCORRENCIA = 24;

/* Um pedido ao YouTube que fica pendurado trava o lote inteiro (o `Promise.all`
   espera pelo mais lento) e come o orçamento de tempo da função. Corta-se cada
   pesquisa a poucos segundos — é melhor falhar um match do que perder faixas
   por causa do limite de 60s da Vercel. */
async function fetchCurto(url: string, init: RequestInit, ms = 4500): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type Faixa = { titulo: string; artista: string; videoId: string };

function interpretarUrl(bruto: string): { tipo: 'playlist' | 'album' | 'track'; id: string } | null {
  const s = (bruto || '').trim();
  const m = s.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]+)/);
  if (m) return { tipo: m[1] as 'playlist' | 'album' | 'track', id: m[2] };
  return null;
}

async function obterToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Spotify não configurado no servidor.');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('Não foi possível autenticar no Spotify.');
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error('Resposta do Spotify sem token.');
  return j.access_token;
}

/* Token anónimo — o mesmo que o site open.spotify.com usa para visitantes sem
   sessão. Não precisa de app registada nem de conta Premium e chega para ler
   playlists/álbuns públicos com PAGINAÇÃO (o embed trunca listas grandes). */
async function tokenAnonimo(): Promise<string | null> {
  for (const url of [
    'https://open.spotify.com/get_access_token?reason=transport&productType=embed',
    'https://open.spotify.com/get_access_token?reason=transport&productType=web-player',
  ]) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { accessToken?: string };
      if (j.accessToken) return j.accessToken;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

type SpItem = { name?: string; artists?: { name?: string }[] };

async function lerFaixasSpotify(
  alvo: { tipo: 'playlist' | 'album' | 'track'; id: string },
  token: string,
): Promise<{ nome: string; faixas: { titulo: string; artista: string }[] }> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const juntar = (it: SpItem | undefined) => ({
    titulo: it?.name ?? '',
    artista: (it?.artists ?? []).map(a => a?.name).filter(Boolean).join(', '),
  });

  if (alvo.tipo === 'track') {
    const r = await fetch(`https://api.spotify.com/v1/tracks/${alvo.id}`, auth);
    if (!r.ok) throw new Error('Faixa do Spotify não encontrada.');
    const j = (await r.json()) as SpItem;
    return { nome: j.name ?? 'Faixa', faixas: [juntar(j)] };
  }

  const recurso = alvo.tipo === 'playlist'
    ? `https://api.spotify.com/v1/playlists/${alvo.id}/tracks`
    : `https://api.spotify.com/v1/albums/${alvo.id}/tracks`;

  // Paginação por `offset` explícito (não confiar no `next` — com `fields`
  // vinha por vezes truncado e parava na 1.ª página de 100).
  const faixas: { titulo: string; artista: string }[] = [];
  for (let offset = 0; offset < MAX_FAIXAS; offset += 100) {
    const r: Response = await fetch(`${recurso}?limit=100&offset=${offset}`, auth);
    if (r.status === 404) {
      throw new Error(
        alvo.tipo === 'playlist'
          ? 'Playlist não acessível. Tem de ser pública e feita por ti — as playlists do próprio Spotify (Descobertas, Rádio, "This Is…") não podem ser lidas.'
          : 'Álbum do Spotify não encontrado.',
      );
    }
    if (!r.ok) throw new Error(`Spotify respondeu ${r.status} ao ler a lista.`);
    const j = (await r.json()) as { items?: unknown[]; next?: string | null };
    const itens = j.items ?? [];
    for (const item of itens) {
      const it = alvo.tipo === 'playlist' ? (item as { track?: SpItem }).track : (item as SpItem);
      const f = juntar(it);
      if (f.titulo) faixas.push(f);
    }
    if (itens.length < 100 && !j.next) break;
  }

  // O nome da coleção fica num pedido à parte (o de faixas não o traz).
  let nome = alvo.tipo === 'playlist' ? 'Playlist do Spotify' : 'Álbum do Spotify';
  try {
    const meta = await fetch(
      `https://api.spotify.com/v1/${alvo.tipo}s/${alvo.id}?fields=name`,
      auth,
    );
    if (meta.ok) nome = ((await meta.json()) as { name?: string }).name ?? nome;
  } catch { /* fica o genérico */ }

  return { nome, faixas: faixas.slice(0, MAX_FAIXAS) };
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* A página do player embutido (`open.spotify.com/embed/...`) devolve o
   alinhamento todo num `<script id="__NEXT_DATA__">` e não pede token nem conta
   Premium. É a via principal; a Web API oficial fica como reserva. */
async function lerViaEmbed(
  alvo: { tipo: 'playlist' | 'album' | 'track'; id: string },
): Promise<{ nome: string; faixas: { titulo: string; artista: string }[] } | null> {
  const r = await fetch(`https://open.spotify.com/embed/${alvo.tipo}/${alvo.id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;

  let entidade: {
    name?: string;
    title?: string;
    subtitle?: string;
    trackList?: { title?: string; subtitle?: string }[];
  } | undefined;
  try {
    const dados = JSON.parse(m[1]) as {
      props?: { pageProps?: { state?: { data?: { entity?: typeof entidade } } } };
    };
    entidade = dados.props?.pageProps?.state?.data?.entity;
  } catch {
    return null;
  }
  if (!entidade) return null;

  const nome = entidade.name || entidade.title || 'Spotify';
  const cru =
    alvo.tipo === 'track'
      ? [{ title: entidade.title, subtitle: entidade.subtitle }]
      : entidade.trackList ?? [];
  const faixas = cru
    .map(t => ({ titulo: String(t?.title ?? ''), artista: String(t?.subtitle ?? '') }))
    .filter(f => f.titulo);

  return faixas.length ? { nome, faixas: faixas.slice(0, MAX_FAIXAS) } : null;
}

// Chave "web" pública do InnerTube — a mesma que o próprio site do YouTube usa.
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/* A API interna do YouTube (a que o yt-dlp usa) é bem mais fiável a partir de
   IPs de datacenter do que raspar a página de resultados — esta última costuma
   vir sem `videoId` nenhum quando é a Vercel a pedir. Fica o raspar como
   plano B. */
async function pesquisaInnerTube(termo: string): Promise<string | null> {
  const r = await fetchCurto(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
        },
        query: termo,
        params: 'EgIQAQ%3D%3D', // só vídeos
      }),
    },
  );
  if (!r || !r.ok) return null;
  const txt = await r.text().catch(() => '');
  const m = txt.match(/"videoId":"([\w-]{11})"/);
  return m ? m[1] : null;
}

async function raspaResultados(termo: string): Promise<string | null> {
  const r = await fetchCurto(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(termo)}` +
      `&sp=EgIQAQ%253D%253D&hl=en&gl=US`,
    { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+1' } },
  );
  if (!r || !r.ok) return null;
  const m = (await r.text().catch(() => '')).match(/"videoId":"([\w-]{11})"/);
  return m ? m[1] : null;
}

async function buscarNoYouTube(termo: string): Promise<string | null> {
  return (await pesquisaInnerTube(termo)) ?? (await raspaResultados(termo));
}

async function resolverVideos(
  faixas: { titulo: string; artista: string }[],
): Promise<Faixa[]> {
  const saida: Faixa[] = [];
  // Margem para responder antes de a Vercel cortar aos 60s.
  const limite = Date.now() + 56_000;
  for (let i = 0; i < faixas.length; i += CONCORRENCIA) {
    if (Date.now() > limite) break;
    const lote = faixas.slice(i, i + CONCORRENCIA);
    const ids = await Promise.all(
      lote.map(f => buscarNoYouTube(`${f.titulo} ${f.artista}`.trim())),
    );
    lote.forEach((f, k) => {
      if (ids[k]) saida.push({ titulo: f.titulo, artista: f.artista, videoId: ids[k]! });
    });
  }
  return saida;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bruto = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const alvo = interpretarUrl(bruto ?? '');
  if (!alvo) {
    return res.status(400).json({ error: 'Link do Spotify não reconhecido.' });
  }

  try {
    // Via principal: Web API com token anónimo (pagina a lista TODA, ao
    // contrário do embed que trunca as playlists grandes).
    let lista: { nome: string; faixas: { titulo: string; artista: string }[] } | null = null;
    const tokenAnon = await tokenAnonimo();
    if (tokenAnon) {
      lista = await lerFaixasSpotify(alvo, tokenAnon).catch(() => null);
    }

    // Reserva 1: página do player embutido (sem token) — pode vir truncada.
    if (!lista || lista.faixas.length === 0) {
      const viaEmbed = await lerViaEmbed(alvo).catch(() => null);
      if (viaEmbed && viaEmbed.faixas.length > (lista?.faixas.length ?? 0)) lista = viaEmbed;
    }

    // Reserva 2: Web API com client-credentials (só se houver credenciais e a
    // conta dona da app tiver acesso — hoje isso implica Premium).
    if ((!lista || lista.faixas.length === 0)
      && process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      lista = await lerFaixasSpotify(alvo, await obterToken()).catch(() => null);
    }

    if (!lista || lista.faixas.length === 0) {
      return res.status(404).json({
        error: 'Não consegui ler faixas dessa lista. Confirma que o link está certo e a playlist é pública.',
      });
    }
    const { nome, faixas } = lista;
    const resolvidas = await resolverVideos(faixas);
    if (resolvidas.length === 0) {
      return res.status(502).json({
        error:
          `Li ${faixas.length} faixa(s) do Spotify mas o YouTube não devolveu ` +
          'nenhum resultado (costuma ser bloqueio aos servidores). Tenta outra vez.',
      });
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      nome,
      total: faixas.length,
      faixas: resolvidas,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha a resolver o link do Spotify.';
    return res.status(502).json({ error: msg });
  }
}
