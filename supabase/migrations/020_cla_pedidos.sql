-- 020 — PEDIDOS PARA ENTRAR NUM CLÃ
--
-- Até aqui entrar num clã era imediato (cla_entrar): qualquer membro carregava
-- em "Entrar" e ficava lá dentro. Passa a haver um passo pelo meio — o
-- utilizador pede, o dono aceita ou recusa. Um clã é um grupo pequeno com
-- pressão de grupo; quem entra devia ser escolha de quem já lá está.
--
-- Regras:
--   * um utilizador tem, no máximo, um pedido pendente (tal como só pode estar
--     num clã de cada vez) — a PK em user_id trata disso;
--   * quem já tem clã não pode pedir;
--   * o pedido morre quando é respondido (aceite → vira membro; recusado →
--     apagado sem deixar rasto) ou quando o clã se dissolve (cascade).

-- ─── COR DO CLÃ ────────────────────────────────────────────────────────────
-- O dono escolhe uma cor e o nome do clã passa a aparecer com ela (lista,
-- ranking, perfil dos membros). Guardada como hex #rrggbb; nulo = cor padrão.

alter table public.clas
  add column if not exists cor text check (cor ~ '^#[0-9A-Fa-f]{6}$');


create table if not exists public.cla_pedidos (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cla_id     uuid not null references public.clas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists cla_pedidos_cla_idx on public.cla_pedidos (cla_id);

alter table public.cla_pedidos enable row level security;

-- O próprio vê o seu pedido; o dono do clã vê os pedidos que lhe chegam.
drop policy if exists "cla pedidos leitura" on public.cla_pedidos;
create policy "cla pedidos leitura"
  on public.cla_pedidos for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.clas c
       where c.id = cla_pedidos.cla_id and c.dono_id = auth.uid()
    )
  );


-- ─── LISTA DE TODOS OS CLÃS ────────────────────────────────────────────────
-- Para o separador "Clãs": nome, tag, líder e lotação de cada um.

create or replace function public.cla_listar()
returns table (
  cla_id      uuid,
  nome        text,
  tag         text,
  descricao   text,
  aberto      boolean,
  membros     integer,
  max_membros integer,
  lider       text,
  cor         text
)
language sql stable security definer set search_path = public as $fn$
  select c.id, c.nome, c.tag, c.descricao, c.aberto,
         (select count(*)::int from public.cla_membros cm where cm.cla_id = c.id),
         c.max_membros,
         coalesce(m.username, 'membro'),
         c.cor
    from public.clas c
    left join public.membros m on m.id = c.dono_id
   order by (select count(*) from public.cla_membros cm where cm.cla_id = c.id) desc,
            c.created_at;
$fn$;

grant execute on function public.cla_listar() to authenticated;


-- ─── PEDIR PARA ENTRAR ─────────────────────────────────────────────────────

create or replace function public.cla_pedir(p_cla_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  c     record;
  v_qtd integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;
  if exists (select 1 from public.cla_membros where user_id = v_uid) then
    raise exception 'JA_TENS_CLA';
  end if;

  select * into c from public.clas where id = p_cla_id;
  if c.id is null then
    raise exception 'CLA_INEXISTENTE';
  end if;

  select count(*) into v_qtd from public.cla_membros where cla_id = p_cla_id;
  if v_qtd >= c.max_membros then
    raise exception 'CLA_CHEIO';
  end if;

  insert into public.cla_pedidos (user_id, cla_id)
  values (v_uid, p_cla_id)
  on conflict (user_id) do update set cla_id = excluded.cla_id, created_at = now();
end;
$fn$;

grant execute on function public.cla_pedir(uuid) to authenticated;


-- Cancelar o próprio pedido.
create or replace function public.cla_pedir_cancelar()
returns void
language sql security definer set search_path = public as $fn$
  delete from public.cla_pedidos where user_id = auth.uid();
$fn$;

grant execute on function public.cla_pedir_cancelar() to authenticated;


-- O pedido pendente do próprio (para o ecrã mostrar "pedido enviado").
create or replace function public.cla_meu_pedido()
returns table (cla_id uuid, nome text, tag text)
language sql stable security definer set search_path = public as $fn$
  select p.cla_id, c.nome, c.tag
    from public.cla_pedidos p
    join public.clas c on c.id = p.cla_id
   where p.user_id = auth.uid();
$fn$;

grant execute on function public.cla_meu_pedido() to authenticated;


-- ─── RESPONDER (SÓ O DONO) ─────────────────────────────────────────────────

create or replace function public.cla_pedidos_recebidos()
returns table (user_id uuid, username text, epcoins integer, pedido_em timestamptz)
language sql stable security definer set search_path = public as $fn$
  select p.user_id, coalesce(m.username, 'membro'), coalesce(m.epcoins, 0), p.created_at
    from public.cla_pedidos p
    join public.clas c on c.id = p.cla_id and c.dono_id = auth.uid()
    left join public.membros m on m.id = p.user_id
   order by p.created_at;
$fn$;

grant execute on function public.cla_pedidos_recebidos() to authenticated;


create or replace function public.cla_pedido_responder(p_user_id uuid, p_aceitar boolean)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_cla uuid;
  c     record;
  v_qtd integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  -- O pedido tem de existir e ser para um clã de que sou dono.
  select p.cla_id into v_cla
    from public.cla_pedidos p
    join public.clas c on c.id = p.cla_id and c.dono_id = v_uid
   where p.user_id = p_user_id;

  if v_cla is null then
    raise exception 'PEDIDO_INEXISTENTE';
  end if;

  if p_aceitar then
    if exists (select 1 from public.cla_membros where user_id = p_user_id) then
      -- Entrou noutro clã entretanto — descarta o pedido em silêncio.
      delete from public.cla_pedidos where user_id = p_user_id;
      return;
    end if;

    select * into c from public.clas where id = v_cla;
    select count(*) into v_qtd from public.cla_membros where cla_id = v_cla;
    if v_qtd >= c.max_membros then
      raise exception 'CLA_CHEIO';
    end if;

    insert into public.cla_membros (cla_id, user_id) values (v_cla, p_user_id);
  end if;

  delete from public.cla_pedidos where user_id = p_user_id;
end;
$fn$;

grant execute on function public.cla_pedido_responder(uuid, boolean) to authenticated;


-- ─── CRIAR / EDITAR COM COR ────────────────────────────────────────────────
-- Redefinições: cla_criar passa a aceitar cor; cla_detalhe e cla_ranking
-- passam a devolvê-la; cla_editar deixa o dono mudar descrição, abertura e cor.
--
-- As três mudam de assinatura/tipo de retorno, por isso caem primeiro — o
-- `create or replace` não altera o tipo de retorno de uma função existente.

drop function if exists public.cla_criar(text, text, text);
drop function if exists public.cla_ranking(integer);
drop function if exists public.cla_detalhe(uuid);

create or replace function public.cla_criar(
  p_nome      text,
  p_tag       text,
  p_descricao text default null,
  p_cor       text default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;
  if exists (select 1 from public.cla_membros where user_id = v_uid) then
    raise exception 'JA_TENS_CLA';
  end if;

  insert into public.clas (nome, tag, descricao, dono_id, cor)
  values (trim(p_nome), upper(trim(p_tag)), nullif(trim(p_descricao), ''), v_uid,
          nullif(trim(p_cor), ''))
  returning id into v_id;

  insert into public.cla_membros (cla_id, user_id, papel)
  values (v_id, v_uid, 'dono');

  return v_id;
end;
$fn$;

grant execute on function public.cla_criar(text, text, text, text) to authenticated;


create or replace function public.cla_editar(
  p_descricao text default null,
  p_aberto    boolean default null,
  p_cor       text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
begin
  update public.clas c
     set descricao = coalesce(nullif(trim(p_descricao), ''), c.descricao),
         aberto    = coalesce(p_aberto, c.aberto),
         cor       = case when p_cor is null then c.cor
                          when trim(p_cor) = '' then null
                          else trim(p_cor) end
   where c.dono_id = v_uid;

  if not found then
    raise exception 'NAO_ES_DONO';
  end if;
end;
$fn$;

grant execute on function public.cla_editar(text, boolean, text) to authenticated;


create or replace function public.cla_ranking(p_limite integer default 30)
returns table (
  cla_id    uuid,
  nome      text,
  tag       text,
  membros   integer,
  pontos    bigint,
  cor       text
)
language sql stable security definer set search_path = public as $fn$
  select c.id, c.nome, c.tag,
         count(distinct cm.user_id)::int,
         coalesce(sum(mv.valor), 0)::bigint,
         c.cor
    from public.clas c
    join public.cla_membros cm on cm.cla_id = c.id
    left join public.epc_movimentos mv
           on mv.user_id = cm.user_id
          and mv.valor > 0
          and mv.created_at >= date_trunc('month', now() at time zone 'Europe/Lisbon')
   group by c.id, c.nome, c.tag, c.cor
   order by 5 desc, 4 desc, c.created_at
   limit greatest(1, least(coalesce(p_limite, 30), 100));
$fn$;

grant execute on function public.cla_ranking(integer) to authenticated;


create or replace function public.cla_detalhe(p_cla_id uuid default null)
returns table (
  cla_id     uuid,
  nome       text,
  tag        text,
  descricao  text,
  aberto     boolean,
  max_membros integer,
  sou_dono   boolean,
  cor        text,
  username   text,
  papel      text,
  epcoins    integer
)
language sql stable security definer set search_path = public as $fn$
  with alvo as (
    select coalesce(
      p_cla_id,
      (select cla_id from public.cla_membros where user_id = auth.uid())
    ) as id
  )
  select c.id, c.nome, c.tag, c.descricao, c.aberto, c.max_membros,
         c.dono_id = auth.uid(), c.cor,
         coalesce(m.username, 'membro'), cm.papel, coalesce(m.epcoins, 0)
    from alvo a
    join public.clas c on c.id = a.id
    join public.cla_membros cm on cm.cla_id = c.id
    left join public.membros m on m.id = cm.user_id
   order by cm.papel desc, coalesce(m.epcoins, 0) desc;
$fn$;

grant execute on function public.cla_detalhe(uuid) to authenticated;


-- ─── PERFIL PÚBLICO: COR DO CLÃ ────────────────────────────────────────────
-- Para o nome do clã aparecer com a cor também no perfil público de um membro.

drop function if exists public.perfil_publico(text);

create or replace function public.perfil_publico(p_username text)
returns table (
  username     text,
  badges       text[],
  membro_desde timestamptz,
  previsoes    integer,
  certas       integer,
  taxa         numeric,
  streak       integer,
  cla_nome     text,
  cla_tag      text,
  cla_cor      text
)
language sql stable security definer set search_path = public as $fn$
  with alvo as (
    select m.* from public.membros m
     where lower(m.username) = lower(trim(p_username))
       and coalesce(m.ranking_oculto, false) = false
     limit 1
  ),
  p as (
    select count(*)::int as total,
           count(*) filter (where pr.correta)::int as certas
      from public.previsoes pr
      join alvo a on a.id = pr.user_id
     where pr.correta is not null
  )
  select a.username,
         coalesce(a.badges, '{}'),
         u.created_at,
         p.total,
         p.certas,
         case when p.total > 0
              then round((p.certas::numeric / p.total) * 100, 1)
              else 0 end,
         coalesce(a.streak_login, 0),
         c.nome, c.tag, c.cor
    from alvo a
    cross join p
    left join auth.users u on u.id = a.id
    left join public.cla_membros cm on cm.user_id = a.id
    left join public.clas c on c.id = cm.cla_id;
$fn$;

grant execute on function public.perfil_publico(text) to anon, authenticated;
