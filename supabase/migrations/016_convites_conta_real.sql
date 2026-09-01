-- 016 — O convite so paga por uma conta a serio.
--
-- A 010 ja tinha codigos, conversoes e credito. Faltava-lhe a parte que
-- distingue um convite util de um numero inflacionado: ate aqui bastava
-- **registar** uma conta com o codigo para as EPCoins cairem. Registar e
-- gratuito e instantaneo, e nada impedia alguem de criar dez emails
-- descartaveis e convidar-se a si proprio dez vezes.
--
-- A partir daqui exige-se as duas coisas ao mesmo tempo:
--   1. o email esta confirmado — a conta e de alguem que existe;
--   2. ha sessao iniciada — a pessoa chegou mesmo a entrar no Hub.
--
-- A condicao 2 e o `auth.uid()`: esta funcao so corre de dentro de uma sessao,
-- por isso um registo que nunca chega a fazer login nunca a alcanca.
--
-- Segunda coisa que faltava: o codigo vivia so no localStorage do browser onde
-- o registo aconteceu. Quem se regista no telemovel e confirma o email no
-- portatil perdia o convite. Agora o codigo tambem viaja nos metadados da
-- conta, que sobrevivem a mudanca de dispositivo.

-- ─── 1. A REGRA DO CONVIDADO ───────────────────────────────────────────────

insert into public.epc_regras (chave, descricao, valor, valor_vip) values
  ('referral_registo', 'Alguem entrou no Hub com o teu convite', 150, 150)
on conflict (chave) do nothing;

-- ─── 2. O NUCLEO ───────────────────────────────────────────────────────────

-- Toda a logica num sitio so, para as duas portas de entrada (codigo escrito a
-- mao e codigo vindo dos metadados) nao poderem divergir nas validacoes.
create or replace function public.referral_aplicar(p_codigo text)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid        uuid := auth.uid();
  v_padrinho   uuid;
  v_criado_em  timestamptz;
  v_confirmado timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  if p_codigo is null or btrim(p_codigo) = '' then
    return 'SEM_CODIGO';
  end if;

  -- Ja convertido: nao e erro, e o caso normal a partir do segundo login.
  if exists (select 1 from public.referral_conversoes where convidado_id = v_uid) then
    return 'JA_USADO';
  end if;

  select created_at, email_confirmed_at
    into v_criado_em, v_confirmado
    from auth.users where id = v_uid;

  -- A conta tem de ser de alguem que existe. Sem esta linha, um convite
  -- pagava-se com um endereco de email inventado.
  if v_confirmado is null then
    return 'EMAIL_POR_CONFIRMAR';
  end if;

  -- E tem de ser uma conta do Hub, nao so um registo no auth: sem linha em
  -- `membros` a pessoa nem sequer completou a entrada.
  if not exists (select 1 from public.membros where id = v_uid) then
    return 'SEM_PERFIL';
  end if;

  select user_id into v_padrinho
    from public.referral_codigos
   where upper(codigo) = upper(btrim(p_codigo));

  if v_padrinho is null then
    return 'CODIGO_INVALIDO';
  end if;
  if v_padrinho = v_uid then
    return 'CODIGO_PROPRIO';
  end if;

  -- Janela de 7 dias apos o registo. Sem isto, um codigo podia ser usado por
  -- contas antigas e o convite deixava de significar "trouxe alguem novo".
  if v_criado_em is not null and v_criado_em < now() - interval '7 days' then
    return 'FORA_DE_PRAZO';
  end if;

  insert into public.referral_conversoes (convidado_id, padrinho_id)
  values (v_uid, v_padrinho)
  on conflict (convidado_id) do nothing;

  -- As chaves de idempotencia sao por convidado, por isso dois logins
  -- simultaneos nao conseguem creditar a dobrar.
  perform public.epc_creditar(
    v_padrinho, coalesce(public.epc_valor_regra('referral_registo', v_padrinho), 150),
    'referral_registo', v_uid::text, 'Um convite teu aceite',
    'ref:padrinho:' || v_uid::text
  );
  perform public.epc_creditar(
    v_uid, coalesce(public.epc_valor_regra('referral_bonus', v_uid), 75),
    'referral_bonus', v_padrinho::text, 'Entraste por convite',
    'ref:convidado:' || v_uid::text
  );

  -- O padrinho fica a saber. Um convite aceite sem aviso nenhum e metade da
  -- razao para partilhar o link.
  begin
    insert into public.notificacoes (user_id, tipo, titulo, corpo)
    values (
      v_padrinho, 'referral', 'O teu convite foi aceite',
      'Alguem entrou no Hub com o teu codigo. As EPCoins ja estao na tua conta.'
    );
  exception when others then
    -- A notificacao e um extra; nunca pode desfazer o credito.
    null;
  end;

  return 'OK';
end;
$fn$;

grant execute on function public.referral_aplicar(text) to authenticated;

-- ─── 3. AS DUAS PORTAS ─────────────────────────────────────────────────────

-- Codigo escrito a mao no Hub. Mantem-se a lancar excepcao porque aqui ha
-- alguem a olhar para o ecra a espera de saber se resultou.
create or replace function public.referral_usar(p_codigo text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_r text := public.referral_aplicar(p_codigo);
begin
  if v_r <> 'OK' then
    if v_r = 'JA_USADO' then raise exception 'CONVITE_JA_USADO';
    elsif v_r = 'FORA_DE_PRAZO' then raise exception 'CONVITE_FORA_DE_PRAZO';
    elsif v_r = 'EMAIL_POR_CONFIRMAR' then raise exception 'CONVITE_EMAIL_POR_CONFIRMAR';
    else raise exception '%', v_r;
    end if;
  end if;
end;
$fn$;

grant execute on function public.referral_usar(text) to authenticated;

-- Resgate automatico, chamado a cada arranque de sessao. Nao lanca: se ainda
-- nao ha condicoes, devolve a razao e tenta outra vez no proximo login — que
-- e exactamente o que se quer quando falta confirmar o email.
create or replace function public.referral_resgatar(p_codigo text default null)
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_codigo text := nullif(btrim(coalesce(p_codigo, '')), '');
begin
  if v_uid is null then
    return 'SEM_SESSAO';
  end if;

  -- Sem codigo do browser, vale o que ficou gravado na conta no registo.
  if v_codigo is null then
    select nullif(btrim(coalesce(raw_user_meta_data->>'convite', '')), '')
      into v_codigo from auth.users where id = v_uid;
  end if;

  if v_codigo is null then
    return 'SEM_CODIGO';
  end if;

  return public.referral_aplicar(v_codigo);
end;
$fn$;

grant execute on function public.referral_resgatar(text) to authenticated;
