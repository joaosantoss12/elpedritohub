-- 021 — CONVITES PARA ENTRAR NUM CLÃ
--
-- Até aqui o único caminho para dentro de um clã era o próprio utilizador
-- pedir e o dono aceitar (migração 020). Passa a haver o sentido inverso: o
-- dono convida alguém pelo nome de utilizador e essa pessoa aceita ou recusa.
--
-- Aproveita-se a tabela `cla_pedidos` — um utilizador continua a ter, no
-- máximo, uma linha pendente (pedido OU convite). A coluna `convite` diz de
-- que lado partiu:
--   * convite = false → pedido do utilizador, o dono responde (cla_pedido_responder);
--   * convite = true  → convite do dono, o utilizador responde (cla_convite_responder).
-- Os "pedidos recebidos" do dono passam a filtrar `convite = false` para ele
-- não ver os próprios convites como se fossem pedidos.

alter table public.cla_pedidos
  add column if not exists convite boolean not null default false;


-- ─── O PEDIDO/CONVITE PENDENTE DO PRÓPRIO ──────────────────────────────────
-- Agora também diz se é um convite (para o ecrã mostrar "Aceitar / Recusar").

drop function if exists public.cla_meu_pedido();

create or replace function public.cla_meu_pedido()
returns table (cla_id uuid, nome text, tag text, convite boolean)
language sql stable security definer set search_path = public as $fn$
  select p.cla_id, c.nome, c.tag, p.convite
    from public.cla_pedidos p
    join public.clas c on c.id = p.cla_id
   where p.user_id = auth.uid();
$fn$;

grant execute on function public.cla_meu_pedido() to authenticated;


-- ─── PEDIDOS RECEBIDOS (SÓ O DONO) ────────────────────────────────────────
-- Passa a ignorar os convites que o próprio dono enviou.

create or replace function public.cla_pedidos_recebidos()
returns table (user_id uuid, username text, epcoins integer, pedido_em timestamptz)
language sql stable security definer set search_path = public as $fn$
  select p.user_id, coalesce(m.username, 'membro'), coalesce(m.epcoins, 0), p.created_at
    from public.cla_pedidos p
    join public.clas c on c.id = p.cla_id and c.dono_id = auth.uid()
    left join public.membros m on m.id = p.user_id
   where p.convite = false
   order by p.created_at;
$fn$;

grant execute on function public.cla_pedidos_recebidos() to authenticated;


-- ─── PROCURAR MEMBROS PARA CONVIDAR (SÓ O DONO) ───────────────────────────
-- Alimenta o dropdown de sugestões à medida que o dono escreve. Só devolve
-- quem pode mesmo ser convidado (sem clã, não o próprio) e limita a poucos
-- resultados para não servir de raspador da lista de membros.

create or replace function public.cla_procurar_membros(p_q text)
returns table (user_id uuid, username text, nome text)
language sql stable security definer set search_path = public as $fn$
  select m.id, m.username, m.nome
    from public.membros m
   where length(trim(coalesce(p_q, ''))) >= 2
     and exists (select 1 from public.clas c where c.dono_id = auth.uid())
     and m.id <> auth.uid()
     and not exists (select 1 from public.cla_membros cm where cm.user_id = m.id)
     and (
       m.username ilike '%' || trim(p_q) || '%'
       or m.nome   ilike '%' || trim(p_q) || '%'
     )
   order by
     (lower(m.username) = lower(trim(p_q))) desc,
     (m.username ilike trim(p_q) || '%') desc,
     m.username
   limit 8;
$fn$;

grant execute on function public.cla_procurar_membros(text) to authenticated;


-- ─── CONVIDAR (SÓ O DONO) ─────────────────────────────────────────────────

create or replace function public.cla_convidar(p_username text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_cla   record;
  v_alvo  uuid;
  v_qtd   integer;
  v_linha record;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select c.* into v_cla from public.clas c where c.dono_id = v_uid;
  if v_cla.id is null then
    raise exception 'NAO_ES_DONO';
  end if;

  select m.id into v_alvo
    from public.membros m
   where lower(m.username) = lower(trim(p_username));
  if v_alvo is null then
    raise exception 'UTILIZADOR_INEXISTENTE';
  end if;
  if v_alvo = v_uid then
    raise exception 'UTILIZADOR_INEXISTENTE';
  end if;

  if exists (select 1 from public.cla_membros where user_id = v_alvo) then
    raise exception 'JA_TEM_CLA';
  end if;

  select count(*) into v_qtd from public.cla_membros where cla_id = v_cla.id;
  if v_qtd >= v_cla.max_membros then
    raise exception 'CLA_CHEIO';
  end if;

  select * into v_linha from public.cla_pedidos where user_id = v_alvo;
  if v_linha.user_id is not null then
    -- Já pediu para entrar neste mesmo clã: convite + pedido = entra já.
    if v_linha.convite = false and v_linha.cla_id = v_cla.id then
      insert into public.cla_membros (cla_id, user_id) values (v_cla.id, v_alvo);
      delete from public.cla_pedidos where user_id = v_alvo;
      return;
    end if;
    if v_linha.convite = true and v_linha.cla_id = v_cla.id then
      raise exception 'JA_CONVIDADO';
    end if;
    -- Tem um pedido/convite pendente para outro clã — o convite substitui-o.
  end if;

  insert into public.cla_pedidos (user_id, cla_id, convite)
  values (v_alvo, v_cla.id, true)
  on conflict (user_id) do update
    set cla_id = excluded.cla_id, convite = true, created_at = now();
end;
$fn$;

grant execute on function public.cla_convidar(text) to authenticated;


-- Convites que o dono enviou e ainda estão por responder.
create or replace function public.cla_convites_enviados()
returns table (user_id uuid, username text, convidado_em timestamptz)
language sql stable security definer set search_path = public as $fn$
  select p.user_id, coalesce(m.username, 'membro'), p.created_at
    from public.cla_pedidos p
    join public.clas c on c.id = p.cla_id and c.dono_id = auth.uid()
    left join public.membros m on m.id = p.user_id
   where p.convite = true
   order by p.created_at;
$fn$;

grant execute on function public.cla_convites_enviados() to authenticated;


-- O dono retira um convite que enviou.
create or replace function public.cla_convite_cancelar(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
begin
  delete from public.cla_pedidos p
   using public.clas c
   where p.user_id = p_user_id
     and p.convite = true
     and c.id = p.cla_id
     and c.dono_id = v_uid;
end;
$fn$;

grant execute on function public.cla_convite_cancelar(uuid) to authenticated;


-- ─── RESPONDER A UM CONVITE (O CONVIDADO) ─────────────────────────────────

create or replace function public.cla_convite_responder(p_aceitar boolean)
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

  select p.cla_id into v_cla
    from public.cla_pedidos p
   where p.user_id = v_uid and p.convite = true;
  if v_cla is null then
    raise exception 'CONVITE_INEXISTENTE';
  end if;

  if p_aceitar then
    if exists (select 1 from public.cla_membros where user_id = v_uid) then
      delete from public.cla_pedidos where user_id = v_uid;
      raise exception 'JA_TENS_CLA';
    end if;

    select * into c from public.clas where id = v_cla;
    select count(*) into v_qtd from public.cla_membros where cla_id = v_cla;
    if v_qtd >= c.max_membros then
      raise exception 'CLA_CHEIO';
    end if;

    insert into public.cla_membros (cla_id, user_id) values (v_cla, v_uid);
  end if;

  delete from public.cla_pedidos where user_id = v_uid;
end;
$fn$;

grant execute on function public.cla_convite_responder(boolean) to authenticated;
