-- 014 — Cache do placar.
--
-- Ate aqui cada browser aberto na Sala de Jogos ia buscar um scoreboard por
-- liga, de 45 em 45 segundos, directamente a ESPN. Com 32 ligas ja era muito;
-- com as ~140 que agora existem em src/lib/ligas.ts seria insustentavel — e
-- multiplicado por cada visitante ao mesmo tempo.
--
-- A partir daqui quem varre e o cron, uma vez, do lado do servidor, e escreve
-- aqui. O browser passa a ler uma linha.

create table if not exists public.placar_cache (
  -- Uma linha so. A chave fixa a 1 e a forma mais simples de garantir isso
  -- sem precisar de logica de limpeza.
  id            smallint primary key default 1 check (id = 1),
  jogos         jsonb       not null default '[]'::jsonb,
  ligas         integer     not null default 0,
  atualizado_em timestamptz not null default now()
);

insert into public.placar_cache (id) values (1) on conflict (id) do nothing;

alter table public.placar_cache enable row level security;

-- Toda a gente le, incluindo quem nao tem sessao: o placar e publico e a
-- pagina das salas nao exige login para espreitar.
drop policy if exists placar_cache_leitura on public.placar_cache;
create policy placar_cache_leitura on public.placar_cache
  for select using (true);

-- Nao ha politica de insert nem de update: escrever e exclusivo da service
-- role usada pelo cron, tal como no resto do projecto.
