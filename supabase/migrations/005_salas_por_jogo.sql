-- ───────────────────────────────────────────────────────────────────────────
-- 005 · SALAS POR JOGO — chat de comentários  (roadmap 11)
--
-- Correr no SQL Editor do Supabase depois da 004.
--
-- O placar não vive aqui: vem da API pública da ESPN, do lado do cliente.
-- O que a base de dados guarda é a única coisa que é nossa — o que a
-- comunidade escreve. Cada jogo tem dois canais: geral, aberto a todos os
-- membros, e VIP, fechado aos subscritores.
--
-- Isto não substitui o chat principal do Telegram. É conteúdo novo do Hub,
-- ligado a um jogo concreto e com fim à vista quando o jogo acaba.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. QUEM É VIP ─────────────────────────────────────────────────────────
-- Numa policy não se pode consultar membros à vontade sem entrar em recursão
-- de RLS. Esta função resolve isso e fica como fonte única da regra.

create or replace function public.e_vip(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros m
    where m.id = p_uid
      and (
        m.subscription_status = 'active'
        or 'Administrador' = any (m.badges)
        or 'VIP' = any (m.badges)
      )
  );
$$;

grant execute on function public.e_vip(uuid) to authenticated;


-- ─── 2. CONFIGURAÇÃO ───────────────────────────────────────────────────────

create table if not exists public.salas_config (
  id            integer primary key default 1 check (id = 1),
  ativo         boolean not null default true,
  -- Slugs de competição da ESPN. Mudar aqui muda o que aparece no Hub, sem
  -- deploy: 'eng.1' Premier League, 'por.1' Liga Portugal, etc.
  ligas         text[] not null default array[
                  'por.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1',
                  'uefa.champions', 'uefa.europa'
                ],
  -- Quanto tempo depois do apito a sala continua aberta para comentários.
  janela_horas  integer not null default 6 check (janela_horas between 1 and 48),
  atualizado_em timestamptz not null default now()
);

insert into public.salas_config (id) values (1) on conflict (id) do nothing;

alter table public.salas_config enable row level security;

drop policy if exists "salas config leitura" on public.salas_config;
create policy "salas config leitura"
  on public.salas_config for select
  using (true);

drop policy if exists "salas config escrita admin" on public.salas_config;
create policy "salas config escrita admin"
  on public.salas_config for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );


-- ─── 3. MENSAGENS ──────────────────────────────────────────────────────────

create table if not exists public.sala_jogo_mensagens (
  id          uuid primary key default gen_random_uuid(),

  -- ID do evento na fonte do placar. Guardar também a fonte para o dia em que
  -- a ESPN for substituída sem que os IDs antigos passem a apontar ao lado.
  evento_id   text not null,
  fonte       text not null default 'espn',
  -- Congelado no momento em que a sala é aberta, para o histórico continuar a
  -- fazer sentido quando o jogo já não está em lado nenhum.
  jogo_label  text,

  canal       text not null default 'geral' check (canal in ('geral', 'vip')),

  user_id     uuid not null references auth.users(id) on delete cascade,
  username    text not null,
  texto       text not null check (char_length(trim(texto)) between 1 and 500),

  created_at  timestamptz not null default now()
);

create index if not exists sala_jogo_msg_idx
  on public.sala_jogo_mensagens (evento_id, canal, created_at);

alter table public.sala_jogo_mensagens enable row level security;

-- Ler: o canal geral é para qualquer membro com sessão; o VIP é só para
-- subscritores. É esta policy que faz a versão fechada ser mesmo fechada —
-- esconder o separador no frontend não fecha nada.
drop policy if exists "sala jogo le" on public.sala_jogo_mensagens;
create policy "sala jogo le"
  on public.sala_jogo_mensagens for select
  using (
    auth.uid() is not null
    and (canal = 'geral' or public.e_vip(auth.uid()))
  );

drop policy if exists "sala jogo escreve" on public.sala_jogo_mensagens;
create policy "sala jogo escreve"
  on public.sala_jogo_mensagens for insert
  with check (
    auth.uid() = user_id
    and (canal = 'geral' or public.e_vip(auth.uid()))
  );

-- Apagar a própria mensagem; os administradores apagam qualquer uma.
drop policy if exists "sala jogo apaga" on public.sala_jogo_mensagens;
create policy "sala jogo apaga"
  on public.sala_jogo_mensagens for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );

-- Realtime: sem isto o chat só atualiza a cada refresh. Em bloco para a
-- migração poder ser corrida duas vezes sem rebentar.
do $$
begin
  alter publication supabase_realtime add table public.sala_jogo_mensagens;
exception
  when duplicate_object then null;
end;
$$;
