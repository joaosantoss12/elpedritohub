-- ═══════════════════════════════════════════════════════════════════════════
-- 013 — BATALHA DE PROGNÓSTICOS (boletim próprio, sem admin)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A primeira versão (008) tinha o admin a escrever as perguntas do dia. Isso
-- serve para o *Pedrito vs Comunidade* e para as perguntas dentro da sala de
-- um jogo, e essas ficam como estão — são conteúdo editorial.
--
-- A Batalha é outra coisa: cada membro escolhe **os seus** 5 jogos do dia,
-- entre os que ainda não começaram, e diz o que acha que vai acontecer. Não
-- há nada para configurar, e não há dois boletins iguais.
--
-- Duas consequências desenham o resto do ficheiro:
--
--   1. Se cada um escolhe os seus jogos, ninguém pode resolver à mão. O
--      resultado vem da mesma API que já dá o placar, por um endpoint
--      servidor (api/batalha/resolver) que corre com a service role. É a
--      razão de `batalha_registar_resultado` recusar chamadas de membros.
--   2. Um palpite só vale se for feito antes do apito. A janela fecha-se
--      contra `inicio`, que é guardado no momento da escolha e nunca mais
--      muda — não contra o relógio de quem escolhe.
--
-- Continua sem dinheiro: escolher é grátis, acertar dá EPCoins, e as EPCoins
-- não se convertem em nada com valor monetário.

-- ─── 1. MERCADOS ───────────────────────────────────────────────────────────
-- Ficam numa tabela e não num enum porque acrescentar um mercado passa a ser
-- uma linha, e o frontend lê a lista em vez de a repetir.

create table if not exists public.batalha_mercados (
  chave     text primary key,
  nome      text not null,
  -- Opções na ordem em que aparecem. Cada uma: {chave, label}.
  opcoes    jsonb not null,
  ordem     integer not null default 100,
  ativo     boolean not null default true
);

alter table public.batalha_mercados enable row level security;

drop policy if exists "mercados leitura" on public.batalha_mercados;
create policy "mercados leitura" on public.batalha_mercados
  for select to authenticated using (ativo = true);

-- As opções `casa`/`fora` ficam com o nome das equipas no cliente — aqui só
-- se guarda o papel, senão a linha dependia do jogo.
insert into public.batalha_mercados (chave, nome, opcoes, ordem) values
  ('1x2', 'Resultado final',
   '[{"chave":"casa","label":"Casa vence"},{"chave":"empate","label":"Empate"},{"chave":"fora","label":"Fora vence"}]'::jsonb, 10),
  ('total_golos', 'Quantidade de golos',
   '[{"chave":"menos_2_5","label":"Menos de 2.5"},{"chave":"mais_2_5","label":"Mais de 2.5"}]'::jsonb, 20),
  ('primeiro_golo', 'Quem marca primeiro',
   '[{"chave":"casa","label":"Casa"},{"chave":"fora","label":"Fora"},{"chave":"nenhum","label":"Ninguém marca"}]'::jsonb, 30)
on conflict (chave) do nothing;


-- ─── 2. BOLETIM DE CADA MEMBRO ─────────────────────────────────────────────

create table if not exists public.batalha_boletins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  dia        date not null,
  acertos    integer not null default 0,
  resolvidas integer not null default 0,
  pontos     integer not null default 0,
  -- Marcado quando as cinco escolhas ficam resolvidas e o bónus é pago.
  fechado_em timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, dia)
);

create index if not exists batalha_boletins_dia_idx
  on public.batalha_boletins (dia, pontos desc);

alter table public.batalha_boletins enable row level security;

-- O boletim é privado enquanto o dia corre — os pontos dos outros aparecem no
-- ranking, que é uma função à parte e só devolve agregados.
drop policy if exists "batalha boletim proprio" on public.batalha_boletins;
create policy "batalha boletim proprio" on public.batalha_boletins
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.batalha_escolhas (
  id           uuid primary key default gen_random_uuid(),
  boletim_id   uuid not null references public.batalha_boletins(id) on delete cascade,

  -- Congelados no momento da escolha: o jogo pode desaparecer da API, mas o
  -- boletim tem de continuar a fazer sentido daqui a um mês.
  evento_id    text not null,
  jogo_label   text not null,
  liga         text,
  inicio       timestamptz not null,

  mercado      text not null references public.batalha_mercados(chave),
  escolha      text not null,
  escolha_label text not null,

  correta      boolean,
  resolvida_em timestamptz,

  -- Um jogo por boletim. Cinco palpites no mesmo jogo não é um boletim.
  unique (boletim_id, evento_id)
);

create index if not exists batalha_escolhas_evento_idx
  on public.batalha_escolhas (evento_id) where correta is null;

alter table public.batalha_escolhas enable row level security;

drop policy if exists "batalha escolhas proprias" on public.batalha_escolhas;
create policy "batalha escolhas proprias" on public.batalha_escolhas
  for select to authenticated
  using (exists (select 1 from public.batalha_boletins b
                  where b.id = boletim_id and b.user_id = auth.uid()));

-- Resultados já conhecidos, para não voltar a pedir o mesmo jogo à API e para
-- resolver escolhas que cheguem atrasadas.
create table if not exists public.batalha_resultados (
  evento_id   text primary key,
  golos_casa  integer not null,
  golos_fora  integer not null,
  -- 'casa' | 'fora' | 'nenhum'
  primeiro    text not null default 'nenhum',
  registado_em timestamptz not null default now()
);

alter table public.batalha_resultados enable row level security;

drop policy if exists "resultados leitura" on public.batalha_resultados;
create policy "resultados leitura" on public.batalha_resultados
  for select to authenticated using (true);


-- ─── 3. GUARDAR O BOLETIM ──────────────────────────────────────────────────

create or replace function public.batalha_max_jogos()
returns integer language sql immutable as $fn$ select 5 $fn$;

grant execute on function public.batalha_max_jogos() to authenticated;

-- Recebe o boletim inteiro e substitui o do dia. Substituir em vez de somar
-- deixa o cliente enviar sempre o estado que mostra ao membro, sem ter de
-- calcular diferenças — e o servidor continua a ser quem valida.
--
-- O que **não** é substituído: escolhas cujo jogo já começou. Essas ficam
-- exactamente como estavam. É o que impede alguém de reabrir o ecrã ao
-- intervalo e "corrigir" um palpite.
create or replace function public.batalha_guardar(p_escolhas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid       uuid := auth.uid();
  v_hoje      date := (now() at time zone 'Europe/Lisbon')::date;
  v_boletim   uuid;
  v_trancadas integer;
  v_novas     integer;
  e           jsonb;
begin
  if v_uid is null then
    raise exception 'batalha_guardar: sessão necessária';
  end if;
  if jsonb_typeof(p_escolhas) <> 'array' then
    raise exception 'batalha_guardar: formato inválido';
  end if;

  insert into public.batalha_boletins (user_id, dia)
  values (v_uid, v_hoje)
  on conflict (user_id, dia) do update set dia = excluded.dia
  returning id into v_boletim;

  -- Fora as trancadas, tudo o resto é reescrito.
  delete from public.batalha_escolhas
   where boletim_id = v_boletim
     and correta is null
     and inicio > now();

  select count(*) into v_trancadas
    from public.batalha_escolhas where boletim_id = v_boletim;

  v_novas := jsonb_array_length(p_escolhas);
  if v_trancadas + v_novas > public.batalha_max_jogos() then
    raise exception 'batalha_guardar: no máximo % jogos por dia', public.batalha_max_jogos();
  end if;

  for e in select * from jsonb_array_elements(p_escolhas) loop
    -- Um jogo que já começou não entra. A verificação é aqui e não no
    -- cliente porque o relógio do cliente é do cliente.
    if (e->>'inicio')::timestamptz <= now() then
      raise exception 'batalha_guardar: o jogo % já começou', coalesce(e->>'jogo_label', '?');
    end if;

    if not exists (select 1 from public.batalha_mercados m
                    where m.chave = e->>'mercado' and m.ativo) then
      raise exception 'batalha_guardar: mercado desconhecido';
    end if;

    if not exists (
      select 1 from public.batalha_mercados m, jsonb_array_elements(m.opcoes) o
       where m.chave = e->>'mercado' and o->>'chave' = e->>'escolha'
    ) then
      raise exception 'batalha_guardar: opção inválida para esse mercado';
    end if;

    insert into public.batalha_escolhas
      (boletim_id, evento_id, jogo_label, liga, inicio, mercado, escolha, escolha_label)
    values
      (v_boletim, e->>'evento_id', e->>'jogo_label', e->>'liga',
       (e->>'inicio')::timestamptz, e->>'mercado', e->>'escolha',
       coalesce(e->>'escolha_label', e->>'escolha'))
    on conflict (boletim_id, evento_id) do nothing;
  end loop;

  perform public.missao_registar(v_uid, 'previsao_feita', null, greatest(v_novas, 0));

  -- Se o jogo já acabou antes de o boletim ser guardado (chegou tarde), a
  -- escolha resolve-se na hora com o resultado que já está em tabela.
  perform public.batalha_aplicar_resultados_pendentes(v_boletim);

  return v_boletim;
end;
$fn$;

grant execute on function public.batalha_guardar(jsonb) to authenticated;


-- ─── 4. LEITURA ────────────────────────────────────────────────────────────

create or replace function public.batalha_meu_boletim(p_dia date default null)
returns table (
  boletim_id    uuid,
  dia           date,
  acertos       integer,
  resolvidas    integer,
  pontos        integer,
  escolha_id    uuid,
  evento_id     text,
  jogo_label    text,
  liga          text,
  inicio        timestamptz,
  mercado       text,
  escolha       text,
  escolha_label text,
  correta       boolean
)
language sql stable security definer set search_path = public as $fn$
  select b.id, b.dia, b.acertos, b.resolvidas, b.pontos,
         e.id, e.evento_id, e.jogo_label, e.liga, e.inicio,
         e.mercado, e.escolha, e.escolha_label, e.correta
    from public.batalha_boletins b
    left join public.batalha_escolhas e on e.boletim_id = b.id
   where b.user_id = auth.uid()
     and b.dia = coalesce(p_dia, (now() at time zone 'Europe/Lisbon')::date)
   order by e.inicio nulls last;
$fn$;

grant execute on function public.batalha_meu_boletim(date) to authenticated;

-- Ranking do mês. Soma os pontos dos boletins do mês corrente e respeita o
-- `ranking_oculto` que já existe no perfil.
create or replace function public.batalha_ranking(p_limite integer default 50)
returns table (posicao bigint, username text, pontos bigint, acertos bigint, boletins bigint)
language sql stable security definer set search_path = public as $fn$
  with base as (
    select m.username,
           sum(b.pontos)::bigint  as pontos,
           sum(b.acertos)::bigint as acertos,
           count(*)::bigint       as boletins
      from public.batalha_boletins b
      join public.membros m on m.id = b.user_id
     where b.dia >= date_trunc('month', (now() at time zone 'Europe/Lisbon'))::date
       and coalesce(m.ranking_oculto, false) = false
     group by m.username
  )
  select row_number() over (order by pontos desc, acertos desc, boletins asc),
         username, pontos, acertos, boletins
    from base
   order by pontos desc, acertos desc, boletins asc
   limit least(coalesce(p_limite, 50), 200);
$fn$;

grant execute on function public.batalha_ranking(integer) to authenticated;


-- ─── 5. RESOLUÇÃO ──────────────────────────────────────────────────────────
-- Quem decide se um palpite estava certo é esta função, a partir do placar
-- final. Nunca o cliente.

create or replace function public.batalha_acertou(
  p_mercado text, p_escolha text,
  p_casa integer, p_fora integer, p_primeiro text
) returns boolean
language sql immutable as $fn$
  select case p_mercado
    when '1x2' then case p_escolha
      when 'casa'   then p_casa > p_fora
      when 'fora'   then p_fora > p_casa
      when 'empate' then p_casa = p_fora
      else false end
    when 'total_golos' then case p_escolha
      when 'mais_2_5'  then (p_casa + p_fora) > 2
      when 'menos_2_5' then (p_casa + p_fora) < 3
      else false end
    when 'primeiro_golo' then p_escolha = p_primeiro
    else false
  end;
$fn$;

-- Aplica a um boletim os resultados que já estejam em tabela. Serve tanto
-- para escolhas guardadas depois do jogo acabar como para reprocessar sem
-- voltar a chamar a API.
create or replace function public.batalha_aplicar_resultados_pendentes(p_boletim_id uuid)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer := 0;
  r   record;
begin
  for r in
    select e.id, e.mercado, e.escolha, res.golos_casa, res.golos_fora, res.primeiro
      from public.batalha_escolhas e
      join public.batalha_resultados res on res.evento_id = e.evento_id
     where e.boletim_id = p_boletim_id and e.correta is null
  loop
    perform public.batalha_marcar(
      r.id, public.batalha_acertou(r.mercado, r.escolha, r.golos_casa, r.golos_fora, r.primeiro)
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

-- Marca uma escolha, paga se acertou, e actualiza os contadores do boletim.
-- Separada para não haver duas cópias desta contabilidade.
create or replace function public.batalha_marcar(p_escolha_id uuid, p_correta boolean)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_e       public.batalha_escolhas%rowtype;
  v_uid     uuid;
  v_total   integer;
  v_acertos integer;
  v_res     integer;
begin
  update public.batalha_escolhas
     set correta = p_correta, resolvida_em = now()
   where id = p_escolha_id and correta is null
  returning * into v_e;

  if not found then
    return;
  end if;

  select user_id into v_uid from public.batalha_boletins where id = v_e.boletim_id;

  select count(*) filter (where correta is not null),
         count(*) filter (where correta),
         count(*)
    into v_res, v_acertos, v_total
    from public.batalha_escolhas where boletim_id = v_e.boletim_id;

  update public.batalha_boletins
     set resolvidas = v_res, acertos = v_acertos, pontos = v_acertos
   where id = v_e.boletim_id;

  if p_correta then
    perform public.missao_registar(v_uid, 'previsao_certa');
    perform public.epc_creditar(
      v_uid,
      greatest(coalesce(public.epc_valor_regra('previsao_certa', v_uid), 0), 1),
      'previsao_certa', v_e.evento_id,
      'Acertaste: ' || v_e.jogo_label,
      'batalha:' || p_escolha_id::text
    );
  end if;

  -- Boletim perfeito: cinco jogos, cinco acertos. O bónus é pago uma vez, e a
  -- chave de idempotência garante isso mesmo que a função corra duas vezes.
  if v_res = v_total and v_total = public.batalha_max_jogos() and v_acertos = v_total then
    update public.batalha_boletins
       set pontos = v_acertos + 3, fechado_em = now()
     where id = v_e.boletim_id and fechado_em is null;

    perform public.epc_creditar(
      v_uid,
      greatest(coalesce(public.epc_valor_regra('boletim_perfeito', v_uid), 0), 50),
      'boletim_perfeito', v_e.boletim_id::text,
      'Boletim perfeito na Batalha',
      'batalha-perfeito:' || v_e.boletim_id::text
    );
    perform public.notificar(
      v_uid, 'batalha', 'Boletim perfeito!',
      'Acertaste nos cinco jogos. O bónus já está na tua conta.',
      '/arena', 'batalha-perfeito:' || v_e.boletim_id::text
    );
  elsif v_res = v_total then
    update public.batalha_boletins
       set fechado_em = coalesce(fechado_em, now())
     where id = v_e.boletim_id;
  end if;
end;
$fn$;

revoke all on function public.batalha_marcar(uuid, boolean) from public;
revoke all on function public.batalha_marcar(uuid, boolean) from authenticated;
revoke all on function public.batalha_aplicar_resultados_pendentes(uuid) from public;
revoke all on function public.batalha_aplicar_resultados_pendentes(uuid) from authenticated;

-- O ponto de entrada do resolvedor. `authenticated` está de fora de propósito:
-- quem chama isto é o endpoint servidor com a service role, ou um admin a
-- corrigir um jogo à mão. Um membro não pode declarar o resultado do jogo em
-- que apostou.
create or replace function public.batalha_registar_resultado(
  p_evento_id  text,
  p_golos_casa integer,
  p_golos_fora integer,
  p_primeiro   text default 'nenhum'
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer := 0;
  r   record;
begin
  if auth.uid() is not null and not public.e_admin(auth.uid()) then
    raise exception 'batalha_registar_resultado: sem permissão';
  end if;

  if p_primeiro not in ('casa', 'fora', 'nenhum') then
    p_primeiro := 'nenhum';
  end if;

  insert into public.batalha_resultados (evento_id, golos_casa, golos_fora, primeiro)
  values (p_evento_id, p_golos_casa, p_golos_fora, p_primeiro)
  on conflict (evento_id) do update
    set golos_casa = excluded.golos_casa,
        golos_fora = excluded.golos_fora,
        primeiro   = excluded.primeiro;

  for r in
    select id, mercado, escolha from public.batalha_escolhas
     where evento_id = p_evento_id and correta is null
  loop
    perform public.batalha_marcar(
      r.id, public.batalha_acertou(r.mercado, r.escolha, p_golos_casa, p_golos_fora, p_primeiro)
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

revoke all on function public.batalha_registar_resultado(text, integer, integer, text) from public;
grant execute on function public.batalha_registar_resultado(text, integer, integer, text) to authenticated;

-- Que jogos é que o resolvedor ainda tem de ir buscar. Sem isto teria de
-- varrer a API inteira; assim pede só o que alguém escolheu.
create or replace function public.batalha_eventos_por_resolver()
returns table (evento_id text, inicio timestamptz, escolhas bigint)
language sql stable security definer set search_path = public as $fn$
  select e.evento_id, min(e.inicio), count(*)
    from public.batalha_escolhas e
   where e.correta is null
     and e.inicio < now() - interval '105 minutes'
   group by e.evento_id
   order by min(e.inicio);
$fn$;

grant execute on function public.batalha_eventos_por_resolver() to authenticated;

-- Regra do bónus, para o valor ser configurável como os outros.
insert into public.epc_regras (chave, descricao, valor, valor_vip) values
  ('boletim_perfeito', 'Acertar nos cinco jogos da Batalha do dia', 50, 75)
on conflict (chave) do nothing;
