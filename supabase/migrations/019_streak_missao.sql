-- ─── STREAK DE 7 DIAS: LIGAR O PERFIL À MISSÃO ────────────────────────────
--
-- Bug: o perfil mostrava o streak real (ex.: 3 dias) mas a missão "Streak de
-- 7 dias" ficava sempre a 0 — nada chamava `missao_registar` no login, e
-- mesmo que chamasse, um contador +1 por login não é um streak (não recua
-- quando se falha um dia) e o período 'semanal' rebentava-o à quinta-feira.
--
-- Correção: a missão passa a espelhar o `streak_login` do próprio membro. O
-- progresso É o número de dias seguidos, e o período passa a 'sempre' (é uma
-- conquista, não uma tarefa semanal).

update public.missoes
   set periodo = 'sempre'
 where chave = 'streak_7';

-- Reaproveita o progresso que já exista noutro período (semanal) para o novo
-- balde 'sempre', para ninguém perder dias já contados.
insert into public.missao_progresso (user_id, missao_id, periodo_chave, progresso, concluida_em)
select p.user_id, p.missao_id, 'sempre',
       greatest(p.progresso, coalesce(mb.streak_login, 0)),
       case when greatest(p.progresso, coalesce(mb.streak_login, 0)) >= m.alvo then now() else null end
  from public.missao_progresso p
  join public.missoes m on m.id = p.missao_id and m.chave = 'streak_7'
  left join public.membros mb on mb.id = p.user_id
 where p.periodo_chave <> 'sempre'
on conflict (user_id, missao_id, periodo_chave) do update
   set progresso = greatest(missao_progresso.progresso, excluded.progresso);


create or replace function public.epc_registar_login()
returns table (streak integer, creditado integer, saldo integer)
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid       uuid := auth.uid();
  v_hoje      date := (now() at time zone 'Europe/Lisbon')::date;
  v_ultimo    date;
  v_streak    integer;
  v_valor     integer;
  v_creditado integer := 0;
  v_saldo     integer;
  v_m         record;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select last_login_date::date, coalesce(streak_login, 0)
    into v_ultimo, v_streak
    from public.membros where id = v_uid for update;

  if v_ultimo is not distinct from v_hoje then
    -- Já contou hoje. Devolve o estado sem mexer em nada.
    select coalesce(epcoins, 0) into v_saldo from public.membros where id = v_uid;
    return query select v_streak, 0, coalesce(v_saldo, 0);
    return;
  end if;

  v_streak := case when v_ultimo = v_hoje - 1 then v_streak + 1 else 1 end;

  update public.membros
     set streak_login = v_streak, last_login_date = v_hoje
   where id = v_uid;

  -- Espelha o streak real na missão "Streak de 7 dias". O progresso é o
  -- próprio número de dias seguidos; nunca recua (quem chegou ao dia 6 e
  -- falhou não perde o já andado), e fecha-se quando bate no alvo.
  for v_m in
    select id, alvo, periodo from public.missoes where chave = 'streak_7' and ativo
  loop
    insert into public.missao_progresso (user_id, missao_id, periodo_chave, progresso, concluida_em)
    values (
      v_uid, v_m.id, public.epc_periodo(v_m.periodo),
      least(v_m.alvo, v_streak),
      case when v_streak >= v_m.alvo then now() else null end
    )
    on conflict (user_id, missao_id, periodo_chave) do update
      set progresso    = greatest(missao_progresso.progresso, least(v_m.alvo, v_streak)),
          concluida_em = coalesce(
            missao_progresso.concluida_em,
            case when v_streak >= v_m.alvo then now() else null end
          );
  end loop;

  -- O valor cresce com o streak, como já crescia, mas o tecto evita que uma
  -- conta com 400 dias credite 2.000 moedas por dia.
  v_valor := coalesce(public.epc_valor_regra('login_streak', v_uid), 0) * least(v_streak, 30);

  if v_valor > 0 then
    v_saldo := public.epc_creditar(
      v_uid, v_valor, 'login_streak', v_hoje::text,
      'Streak de login · dia ' || v_streak,
      'streak:' || v_uid::text || ':' || v_hoje::text
    );
    v_creditado := v_valor;
  else
    select coalesce(epcoins, 0) into v_saldo from public.membros where id = v_uid;
  end if;

  return query select v_streak, v_creditado, coalesce(v_saldo, 0);
end;
$fn$;

grant execute on function public.epc_registar_login() to authenticated;
