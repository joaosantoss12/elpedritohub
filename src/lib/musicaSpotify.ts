/*
 * Cliente do /api/musica/spotify — troca um link do Spotify por uma lista de
 * IDs de vídeos do YouTube. O trabalho pesado (token do Spotify, pesquisa no
 * YouTube) é todo no servidor; aqui só se chama e se valida a resposta.
 */

export interface FaixaResolvida {
  titulo: string;
  artista: string;
  videoId: string;
}

export interface ListaSpotify {
  nome: string;
  /** Quantas faixas tinha a lista original (antes de falhas de match). */
  total: number;
  faixas: FaixaResolvida[];
}

export function eLinkSpotify(s: string): boolean {
  return /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track)\//.test(s.trim())
    || /^spotify:(playlist|album|track):/.test(s.trim());
}

export async function resolverSpotify(url: string): Promise<ListaSpotify> {
  const r = await fetch(`/api/musica/spotify?url=${encodeURIComponent(url.trim())}`);
  // Em `npm run dev` (Vite puro) não há funções `api/` — o pedido devolve o
  // index.html da SPA, que não é JSON. Isto só funciona no site publicado
  // (ou com `vercel dev`).
  const ct = r.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'O leitor de Spotify só corre no site publicado (a função /api não existe em localhost).',
    );
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j?.error === 'string' ? j.error : 'Não foi possível ler o Spotify.');
  }
  const faixas = Array.isArray(j.faixas) ? (j.faixas as FaixaResolvida[]) : [];
  if (faixas.length === 0) throw new Error('Lista do Spotify sem faixas utilizáveis.');
  return { nome: String(j.nome ?? 'Spotify'), total: Number(j.total ?? faixas.length), faixas };
}
