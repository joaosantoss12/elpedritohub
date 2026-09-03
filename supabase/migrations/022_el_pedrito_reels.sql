-- ───────────────────────────────────────────────────────────────────────────
-- 022 · EL PEDRITO — feed de vídeos estilo reels
--
-- Correr no SQL Editor do Supabase depois da 021.
--
-- Uma página nova ("El Pedrito") com um feed vertical de vídeos curtos, ao
-- estilo dos reels do Instagram. Os vídeos são geridos no painel de admin.
-- `video_url` pode ser um ficheiro direto (.mp4/.webm — autoplay silencioso,
-- como um reel) ou um URL de embed (YouTube/Vimeo) — o cliente decide pelo
-- formato.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.el_pedrito_reels (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text,
  video_url   text not null,
  poster_url  text,
  link_url    text,                       -- CTA opcional (ex: canal, planos)
  link_texto  text,
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists el_pedrito_reels_ordem_idx
  on public.el_pedrito_reels (ordem, created_at desc);

alter table public.el_pedrito_reels enable row level security;

drop policy if exists "reels leitura publica" on public.el_pedrito_reels;
create policy "reels leitura publica"
  on public.el_pedrito_reels for select
  using (true);

drop policy if exists "reels escrita admin" on public.el_pedrito_reels;
create policy "reels escrita admin"
  on public.el_pedrito_reels for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  )
  with check (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );
