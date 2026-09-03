import { supabase } from './supabase';

// ─── TIPOS ────────────────────────────────────────────────────

export interface Reel {
  id: string;
  titulo: string;
  descricao: string | null;
  video_url: string;
  poster_url: string | null;
  link_url: string | null;
  link_texto: string | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

// ─── LEITURA (feed público) ───────────────────────────────────

export async function carregarReels(): Promise<Reel[]> {
  const { data, error } = await supabase
    .from('el_pedrito_reels')
    .select('id, titulo, descricao, video_url, poster_url, link_url, link_texto, ordem, ativo, created_at')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as Reel[];
}

// ─── ADMIN ────────────────────────────────────────────────────

export async function carregarReelsAdmin(): Promise<Reel[]> {
  const { data, error } = await supabase
    .from('el_pedrito_reels')
    .select('id, titulo, descricao, video_url, poster_url, link_url, link_texto, ordem, ativo, created_at')
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Reel[];
}

export async function guardarReel(r: Partial<Reel>): Promise<void> {
  const payload = {
    titulo: r.titulo?.trim() ?? '',
    descricao: r.descricao?.trim() || null,
    video_url: r.video_url?.trim() ?? '',
    poster_url: r.poster_url?.trim() || null,
    link_url: r.link_url?.trim() || null,
    link_texto: r.link_texto?.trim() || null,
    ordem: r.ordem ?? 0,
    ativo: r.ativo ?? true,
  };
  const { error } = r.id
    ? await supabase.from('el_pedrito_reels').update(payload).eq('id', r.id)
    : await supabase.from('el_pedrito_reels').insert(payload);
  if (error) throw error;
}

export async function apagarReel(id: string): Promise<void> {
  const { error } = await supabase.from('el_pedrito_reels').delete().eq('id', id);
  if (error) throw error;
}

// ─── HELPERS ──────────────────────────────────────────────────

/** Um ficheiro de vídeo direto (autoplay como reel) vs. um embed (iframe). */
export function ehVideoDireto(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url.trim());
}

/** Normaliza links de YouTube/Vimeo para o formato de embed. */
export function urlEmbed(url: string): string {
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1`;
  const vim = u.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  return u;
}
