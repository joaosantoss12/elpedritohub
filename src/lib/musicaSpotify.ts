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
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j?.error === 'string' ? j.error : 'Não foi possível ler o Spotify.');
  }
  const faixas = Array.isArray(j.faixas) ? (j.faixas as FaixaResolvida[]) : [];
  if (faixas.length === 0) throw new Error('Lista do Spotify sem faixas utilizáveis.');
  return { nome: String(j.nome ?? 'Spotify'), total: Number(j.total ?? faixas.length), faixas };
}
