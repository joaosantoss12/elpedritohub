import type { VercelRequest, VercelResponse } from '@vercel/node';

/*
 * Resolve um link do Spotify (playlist, álbum ou faixa) numa lista de vídeos do
 * YouTube — o mesmo truque dos bots de música do Discord: o Spotify serve só os
 * metadados (título + artista), o áudio vem sempre do YouTube.
 *
 * Passo 1: token com client-credentials (não é preciso o utilizador ter conta
 *          Spotify — as credenciais são da app, guardadas na Vercel).
 * Passo 2: para cada faixa, primeira ocorrência de "videoId" na página de
 *          resultados do YouTube filtrada por vídeos.
 *
 * Precisa das variáveis de ambiente SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET.
 */

const MAX_FAIXAS = 60;
const CONCORRENCIA = 6;

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

  const base =
    alvo.tipo === 'playlist'
      ? `https://api.spotify.com/v1/playlists/${alvo.id}/tracks?limit=100&fields=items(track(name,artists(name))),next`
      : `https://api.spotify.com/v1/albums/${alvo.id}/tracks?limit=50`;

  let url: string | null = base;
  const faixas: { titulo: string; artista: string }[] = [];
  while (url && faixas.length < MAX_FAIXAS) {
    const r: Response = await fetch(url, auth);
    if (!r.ok) throw new Error('Lista do Spotify não encontrada ou privada.');
    const j = (await r.json()) as { items?: unknown[]; next?: string | null };
    for (const item of j.items ?? []) {
      const it = alvo.tipo === 'playlist' ? (item as { track?: SpItem }).track : (item as SpItem);
      const f = juntar(it);
      if (f.titulo) faixas.push(f);
    }
    url = j.next ?? null;
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

async function buscarNoYouTube(termo: string): Promise<string | null> {
  const url =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(termo)}` +
    `&sp=EgIQAQ%253D%253D&hl=en&gl=US`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: 'CONSENT=YES+1',
      },
    });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"videoId":"([\w-]{11})"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function resolverVideos(
  faixas: { titulo: string; artista: string }[],
): Promise<Faixa[]> {
  const saida: Faixa[] = [];
  for (let i = 0; i < faixas.length; i += CONCORRENCIA) {
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
    const token = await obterToken();
    const { nome, faixas } = await lerFaixasSpotify(alvo, token);
    if (faixas.length === 0) {
      return res.status(404).json({ error: 'Não encontrei faixas nessa lista.' });
    }
    const resolvidas = await resolverVideos(faixas);
    if (resolvidas.length === 0) {
      return res.status(502).json({ error: 'Não consegui encontrar estas músicas no YouTube.' });
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
