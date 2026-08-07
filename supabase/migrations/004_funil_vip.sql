-- ───────────────────────────────────────────────────────────────────────────
-- 004 · FUNIL DE CONVERSÃO PARA VIP  (roadmap 12)
--
-- Correr no SQL Editor do Supabase depois da 003.
--
-- Duas peças: os vídeos em que o Pedrito explica o VIP, e o pedido de reunião
-- de 15 minutos. O pedido fica registado no Hub em vez de ir parar a um DM —
-- é o mesmo princípio da página de canais: tudo o que é comercial acontece
-- aqui dentro, onde é verificável, e nunca em privado.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. VÍDEOS ─────────────────────────────────────────────────────────────

create table if not exists public.vip_videos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text,
  -- URL de embed já pronto (YouTube, Vimeo, ficheiro próprio). Guardar o
  -- embed e não o link de partilha evita ter de adivinhar o formato no cliente.
  embed_url   text not null,
  thumb_url   text,
  duracao     text,                     -- '4:12', livre de propósito
  ordem       integer not null default 0,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists vip_videos_ordem_idx on public.vip_videos (ordem);

alter table public.vip_videos enable row level security;

drop policy if exists "vip videos leitura" on public.vip_videos;
create policy "vip videos leitura"
  on public.vip_videos for select
  using (true);

drop policy if exists "vip videos escrita admin" on public.vip_videos;
create policy "vip videos escrita admin"
  on public.vip_videos for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );


-- ─── 2. PEDIDOS DE REUNIÃO ─────────────────────────────────────────────────

create table if not exists public.vip_reunioes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,

  nome          text not null,
  email         text not null,
  telefone      text,
  -- Texto livre: "fins de tarde", "sábado de manhã". Uma agenda a sério é
  -- outro problema; o que interessa é não perder o lead.
  preferencia   text,
  mensagem      text,

  estado        text not null default 'pendente'
                check (estado in ('pendente', 'agendada', 'realizada', 'cancelada', 'convertida')),
  agendada_para timestamptz,
  nota_interna  text,

  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists vip_reunioes_estado_idx
  on public.vip_reunioes (estado, created_at desc);

alter table public.vip_reunioes enable row level security;

-- O membro vê e cria os seus próprios pedidos. Não vê os de mais ninguém:
-- isto tem nome, email e telefone lá dentro.
drop policy if exists "reunioes le proprias" on public.vip_reunioes;
create policy "reunioes le proprias"
  on public.vip_reunioes for select
  using (auth.uid() = user_id);

drop policy if exists "reunioes cria proprias" on public.vip_reunioes;
create policy "reunioes cria proprias"
  on public.vip_reunioes for insert
  with check (auth.uid() = user_id);

drop policy if exists "reunioes admin total" on public.vip_reunioes;
create policy "reunioes admin total"
  on public.vip_reunioes for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );

create or replace function public.vip_reunioes_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists vip_reunioes_touch_trg on public.vip_reunioes;
create trigger vip_reunioes_touch_trg
  before update on public.vip_reunioes
  for each row execute function public.vip_reunioes_touch();
