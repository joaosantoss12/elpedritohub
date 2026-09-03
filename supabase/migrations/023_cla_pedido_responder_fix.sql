-- 023 — CORREÇÃO: aceitar/recusar pedido de entrada num clã
--
-- Sintoma: o dono carregava em "Aceitar" e aparecia
--   "Algo correu mal. Tente outra vez."
--   → SQLSTATE 55000 · record "c" is not assigned yet
--
-- Causa: em cla_pedido_responder a variável local chamava-se `c` (um record)
-- e a própria query usava o alias de tabela `c` (public.clas c). O plpgsql dá
-- precedência à variável sobre o alias, por isso `c.dono_id` dentro do JOIN era
-- lido como "campo dono_id do record c" — que ainda não tinha sido atribuído.
--
-- Solução: renomear a variável local para `v_cla_rec`; o alias de tabela `c`
-- deixa de colidir. Sem mudança de assinatura nem de comportamento.

create or replace function public.cla_pedido_responder(p_user_id uuid, p_aceitar boolean)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid     uuid := auth.uid();
  v_cla     uuid;
  v_cla_rec record;
  v_qtd     integer;
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

    select * into v_cla_rec from public.clas where id = v_cla;
    select count(*) into v_qtd from public.cla_membros where cla_id = v_cla;
    if v_qtd >= v_cla_rec.max_membros then
      raise exception 'CLA_CHEIO';
    end if;

    insert into public.cla_membros (cla_id, user_id) values (v_cla, p_user_id);
  end if;

  delete from public.cla_pedidos where user_id = p_user_id;
end;
$fn$;

grant execute on function public.cla_pedido_responder(uuid, boolean) to authenticated;
