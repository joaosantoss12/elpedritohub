-- ───────────────────────────────────────────────────────────────────────────
-- 008 · PREVISÕES GRATUITAS  (Batalha de Prognósticos · Pedrito vs Comunidade
--                             · MVP da Comunidade · perguntas na sala)
--
-- Correr depois da 007.
--
-- Uma só mecânica serve quatro funcionalidades da lista, e é de propósito:
-- uma pergunta com opções fechadas, uma resposta por membro, uma resolução.
-- O que muda entre elas é onde a pergunta aparece e quando fecha.
--
--   Batalha de Prognósticos  → perguntas agrupadas num boletim do dia
--   Pedrito vs Comunidade    → a mesma pergunta guarda a escolha do Pedrito
--   Sala do Jogo             → perguntas presas a um evento_id da ESPN
--   MVP da Comunidade        → uma pergunta que fecha aos 30 minutos
--
-- Duas decisões que importam:
--
-- 1. Não há dinheiro em lado nenhum. Isto é previsão gratuita: entra XP e
--    EPCoins, nunca uma aposta. É o que mantém a funcionalidade fora do
--    perímetro do jogo a dinheiro.
--
-- 2. O cliente não escreve directamente em previsoes. Responder passa por
--    uma função que valida a janela de tempo do lado do servidor — senão
--    responde-se depois de saber o resultado, que é o único bug que
--    destruiria a credibilidade do ranking.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. BOLETINS ───────────────────────────────────────────────────────────
-- O boletim é a "Batalha de Prognósticos": os 5 jogos do dia escolhidos pelo
-- Pedrito. Perguntas de sala não precisam de boletim e ficam com boletim_id
-- nulo.

create table if not exists public.previsao_boletins (
  id            uuid primary key default gen_random_uuid(),
  data          date not null,
  titulo        text not null default 'Batalha de Prognósticos',
  descricao     text,
  -- rascunho: só o Admin vê. aberto: aceita respostas. fechado: mostra mas
  -- não aceita. resolvido: já tem resultados e já creditou.
  estado        text not null default 'rascunho'
                check (estado in ('rascunho', 'aberto', 'fechado', 'resolvido')),
  created_at    timestamptz not null default now()
);

create unique index if not exists previsao_boletins_data_idx
  on public.previsao_boletins (data);

alter table public.previsao_boletins enable row level security;

drop policy if exists "boletins leitura" on public.previsao_boletins;
create policy "boletins leitura"
  on public.previsao_boletins for select
  using (
    estado <> 'rascunho'
    or exists (select 1 from public.membros m
                where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );

drop policy if exists "boletins escrita admin" on public.previsao_boletins;
create policy "boletins escrita admin"
  on public.previsao_boletins for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


-- ─── 2. PERGUNTAS ──────────────────────────────────────────────────────────

create table if not exists public.previsao_perguntas (
  id            uuid primary key default gen_random_uuid(),

  boletim_id    uuid references public.previsao_boletins(id) on delete cascade,
  -- Presa a um jogo concreto: é assim que a pergunta aparece dentro da sala.
  evento_id     text,
  jogo_label    text,

  texto         text not null check (char_length(trim(texto)) between 3 and 200),
  -- mercado é só uma etiqueta para agrupar e para o histórico fazer sentido:
  -- 'resultado', 'golos', 'primeiro_golo', 'mvp', 'outro'.
  mercado       text not null default 'outro',

  -- [{ "chave": "casa", "label": "Benfica" }, ...]. Guardar o label evita ter
  -- de reconstituir nomes de equipas meses depois.
  opcoes        jsonb not null check (jsonb_typeof(opcoes) = 'array'
                                      and jsonb_array_length(opcoes) between 2 and 12),

  -- Pedrito vs Comunidade: a escolha dele fica aqui, e só é revelada depois
  -- de a pergunta fechar. Revelá-la antes transformava a batalha em cópia.
  pedrito_escolha text,
  revelar_pedrito boolean not null default false,

  abre_em       timestamptz not null default now(),
  fecha_em      timestamptz not null,
  -- Perguntas de desempate ou de risco podem valer mais.
  peso          integer not null default 1 check (peso between 1 and 5),

  resposta_correta text,
  resolvida_em     timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists previsao_perguntas_boletim_idx
  on public.previsao_perguntas (boletim_id);
create index if not exists previsao_perguntas_evento_idx
  on public.previsao_perguntas (evento_id, fecha_em);

alter table public.previsao_perguntas enable row level security;

drop policy if exists "perguntas leitura" on public.previsao_perguntas;
create policy "perguntas leitura"
  on public.previsao_perguntas for select
  using (auth.uid() is not null);

drop policy if exists "perguntas escrita admin" on public.previsao_perguntas;
create policy "perguntas escrita admin"
  on public.previsao_perguntas for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


-- ─── 3. RESPOSTAS ──────────────────────────────────────────────────────────

create table if not exists public.previsoes (
  id          uuid primary key default gen_random_uuid(),
  pergunta_id uuid not null references public.previsao_perguntas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  username    text not null,
  escolha     text not null,
  -- Nulo enquanto a pergunta não estiver resolvida.
  correta     boolean,
  created_at  timestamptz not null default now(),

  unique (pergunta_id, user_id)
);

create index if not exists previsoes_user_idx on public.previsoes (user_id, created_at desc);

alter table public.previsoes enable row level security;

-- Cada um vê as suas. As dos outros só aparecem em agregado, pelas funções
-- da secção 5 — mostrar a resposta individual de terceiros antes do fecho
-- era dar a copiar.
drop policy if exists "previsoes leitura propria" on public.previsoes;
create policy "previsoes leitura propria"
  on public.previsoes for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.membros m
                where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );

-- Sem policy de insert: responder passa pela função da secção 4.


-- ─── 4. RESPONDER ──────────────────────────────────────────────────────────

-- Regista a resposta e credita os EPCoins de participação.
-- Deixa mudar de ideias enquanto a pergunta estiver aberta, mas credita uma
-- só vez — a chave de idempotência trata disso.
create or replace function public.previsao_responder(
  p_pergunta_id uuid,
  p_escolha     text
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid      uuid := auth.uid();
  v_username text;
  v_fecha    timestamptz;
  v_abre     timestamptz;
  v_opcoes   jsonb;
  v_valor    integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select p.abre_em, p.fecha_em, p.opcoes
    into v_abre, v_fecha, v_opcoes
    from public.previsao_perguntas p where p.id = p_pergunta_id;

  if v_fecha is null then
    raise exception 'PERGUNTA_INEXISTENTE';
  end if;
  if now() < v_abre then
    raise exception 'PERGUNTA_POR_ABRIR';
  end if;
  if now() >= v_fecha then
    raise exception 'PERGUNTA_FECHADA';
  end if;

  -- A escolha tem de ser uma das opções. Sem isto, o cliente inventa uma
  -- chave que nunca vai bater com a resposta certa nem com a distribuição.
  if not exists (
    select 1 from jsonb_array_elements(v_opcoes) o
     where o->>'chave' = p_escolha
  ) then
    raise exception 'ESCOLHA_INVALIDA';
  end if;

  select m.username into v_username from public.membros m where m.id = v_uid;

  insert into public.previsoes (pergunta_id, user_id, username, escolha)
  values (p_pergunta_id, v_uid, coalesce(v_username, 'membro'), p_escolha)
  on conflict (pergunta_id, user_id)
  do update set escolha = excluded.escolha, created_at = now();

  v_valor := coalesce(public.epc_valor_regra('previsao_feita', v_uid), 0);
  if v_valor > 0 then
    perform public.epc_creditar(
      v_uid, v_valor, 'previsao_feita', p_pergunta_id::text,
      'Previsão registada',
      'prev:' || p_pergunta_id::text || ':' || v_uid::text
    );
  end if;
end;
$fn$;

grant execute on function public.previsao_responder(uuid, text) to authenticated;


-- ─── 5. RESOLVER ───────────────────────────────────────────────────────────

-- Fecha a pergunta com a resposta certa e credita quem acertou.
-- Idempotente: correr duas vezes com a mesma resposta não credita a dobrar.
create or replace function public.previsao_resolver(
  p_pergunta_id uuid,
  p_resposta    text
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_peso     integer;
  v_acertos  integer := 0;
  r          record;
  v_valor    integer;
begin
  if not exists (select 1 from public.membros m
                  where m.id = auth.uid() and 'Administrador' = any (m.badges)) then
    raise exception 'SEM_PERMISSAO';
  end if;

  select peso into v_peso from public.previsao_perguntas where id = p_pergunta_id;
  if v_peso is null then
    raise exception 'PERGUNTA_INEXISTENTE';
  end if;

  update public.previsao_perguntas
     set resposta_correta = p_resposta,
         resolvida_em     = now(),
         revelar_pedrito  = true
   where id = p_pergunta_id;

  update public.previsoes
     set correta = (escolha = p_resposta)
   where pergunta_id = p_pergunta_id;

  for r in
    select user_id from public.previsoes
     where pergunta_id = p_pergunta_id and correta is true
  loop
    v_valor := coalesce(public.epc_valor_regra('previsao_certa', r.user_id), 0) * v_peso;
    if v_valor > 0 then
      perform public.epc_creditar(
        r.user_id, v_valor, 'previsao_certa', p_pergunta_id::text,
        'Previsão certa',
        'prevok:' || p_pergunta_id::text || ':' || r.user_id::text
      );
    end if;
    v_acertos := v_acertos + 1;
  end loop;

  return v_acertos;
end;
$fn$;

grant execute on function public.previsao_resolver(uuid, text) to authenticated;


-- Bónus de boletim perfeito. Corre-se depois de todas as perguntas do
-- boletim estarem resolvidas; marca o boletim e credita quem acertou tudo.
create or replace function public.previsao_fechar_boletim(p_boletim_id uuid)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_total    integer;
  v_premiados integer := 0;
  r          record;
  v_valor    integer;
begin
  if not exists (select 1 from public.membros m
                  where m.id = auth.uid() and 'Administrador' = any (m.badges)) then
    raise exception 'SEM_PERMISSAO';
  end if;

  select count(*) into v_total
    from public.previsao_perguntas where boletim_id = p_boletim_id;

  if v_total = 0 then
    raise exception 'BOLETIM_SEM_PERGUNTAS';
  end if;

  if exists (
    select 1 from public.previsao_perguntas
     where boletim_id = p_boletim_id and resposta_correta is null
  ) then
    raise exception 'BOLETIM_POR_RESOLVER';
  end if;

  for r in
    select p.user_id
      from public.previsoes p
      join public.previsao_perguntas q on q.id = p.pergunta_id
     where q.boletim_id = p_boletim_id
     group by p.user_id
    having count(*) = v_total and bool_and(p.correta)
  loop
    v_valor := coalesce(public.epc_valor_regra('previsao_perfeita', r.user_id), 0);
    if v_valor > 0 then
      perform public.epc_creditar(
        r.user_id, v_valor, 'previsao_perfeita', p_boletim_id::text,
        'Boletim perfeito',
        'perfeito:' || p_boletim_id::text || ':' || r.user_id::text
      );
    end if;
    v_premiados := v_premiados + 1;
  end loop;

  update public.previsao_boletins set estado = 'resolvido' where id = p_boletim_id;
  return v_premiados;
end;
$fn$;

grant execute on function public.previsao_fechar_boletim(uuid) to authenticated;


-- ─── 6. AGREGADOS PARA O ECRÃ ──────────────────────────────────────────────

-- Distribuição das respostas de uma pergunta. É isto que faz "3.842 pessoas
-- desafiaram o Pedrito" ser um número verdadeiro e não uma frase.
--
-- Enquanto a pergunta está aberta devolve só o total, sem abrir por opção:
-- mostrar a maioria antes do fecho enviesa quem ainda não respondeu.
create or replace function public.previsao_distribuicao(p_pergunta_id uuid)
returns table (chave text, votos bigint, aberta boolean)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_aberta boolean;
begin
  select now() < fecha_em into v_aberta
    from public.previsao_perguntas where id = p_pergunta_id;

  if v_aberta is null then
    return;
  end if;

  if v_aberta then
    return query
      select null::text, count(*)::bigint, true
        from public.previsoes where pergunta_id = p_pergunta_id;
  else
    return query
      select p.escolha, count(*)::bigint, false
        from public.previsoes p
       where p.pergunta_id = p_pergunta_id
       group by p.escolha
       order by count(*) desc;
  end if;
end;
$fn$;

grant execute on function public.previsao_distribuicao(uuid) to authenticated;


-- Ranking de acertos. Ordena por acertos e desempata pela taxa, para que
-- quem responde a tudo não passe à frente de quem escolhe melhor só por
-- volume. p_desde permite ranking do mês, da semana ou de sempre.
create or replace function public.previsao_ranking(
  p_desde  date default null,
  p_limite integer default 50
) returns table (
  user_id      uuid,
  username     text,
  respondidas  bigint,
  acertos      bigint,
  taxa         numeric
)
language sql stable security definer set search_path = public as $fn$
  select p.user_id,
         max(p.username)                                        as username,
         count(*) filter (where p.correta is not null)           as respondidas,
         count(*) filter (where p.correta is true)               as acertos,
         round(
           100.0 * count(*) filter (where p.correta is true)
                 / nullif(count(*) filter (where p.correta is not null), 0)
         , 1)                                                    as taxa
    from public.previsoes p
    join public.membros m on m.id = p.user_id
   where p.correta is not null
     and coalesce(m.ranking_oculto, false) = false
     and (p_desde is null or p.created_at >= p_desde)
   group by p.user_id
  having count(*) filter (where p.correta is not null) >= 3
   order by acertos desc, taxa desc nulls last
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$fn$;

grant execute on function public.previsao_ranking(date, integer) to authenticated;


-- Pedrito vs Comunidade: quantas perguntas resolvidas o Pedrito acertou e
-- quantas a comunidade acertou em média. Dois números, uma manchete.
create or replace function public.previsao_pedrito_vs_comunidade(
  p_desde date default null
) returns table (
  perguntas          bigint,
  pedrito_acertos    bigint,
  comunidade_taxa    numeric,
  participantes      bigint
)
language sql stable security definer set search_path = public as $fn$
  with resolvidas as (
    select q.id, q.resposta_correta, q.pedrito_escolha
      from public.previsao_perguntas q
     where q.resposta_correta is not null
       and q.pedrito_escolha is not null
       and (p_desde is null or q.resolvida_em >= p_desde)
  )
  select
    (select count(*) from resolvidas),
    (select count(*) from resolvidas where pedrito_escolha = resposta_correta),
    (select round(100.0 * count(*) filter (where p.correta is true)
                        / nullif(count(*), 0), 1)
       from public.previsoes p where p.pergunta_id in (select id from resolvidas)),
    (select count(distinct p.user_id)
       from public.previsoes p where p.pergunta_id in (select id from resolvidas));
$fn$;

grant execute on function public.previsao_pedrito_vs_comunidade(date) to authenticated;
