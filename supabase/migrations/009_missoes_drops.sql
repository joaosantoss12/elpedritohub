-- ───────────────────────────────────────────────────────────────────────────
-- 009 · MISSÕES SEMANAIS E EPC DROPS
--
-- Correr depois da 008.
--
-- As missões respondem à pergunta "porque é que volto amanhã?" e os drops à
-- pergunta "porque é que fico os 90 minutos?". São mecânicas diferentes com
-- a mesma exigência técnica: não podem ser accionadas pelo cliente.
--
-- Um botão que diz ao servidor "conclui-me a missão" é uma missão que se
-- conclui sozinha. Por isso o progresso não é escrito pelo frontend: é um
-- efeito lateral das funções que já validam o que aconteceu (responder a uma
-- previsão, escrever numa sala, reclamar um drop).
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. CHAVE DO PERÍODO ───────────────────────────────────────────────────
-- A semana ISO em texto ('2026-W36'). Fica numa função para o mesmo formato
-- ser usado em todo o lado — misturar formatos aqui parte o histórico.

create or replace function public.epc_periodo(p_periodo text)
returns text
language sql stable set search_path = public as $fn$
  select case p_periodo
           when 'diaria'  then to_char((now() at time zone 'Europe/Lisbon')::date, 'YYYY-MM-DD')
           when 'semanal' then to_char((now() at time zone 'Europe/Lisbon')::date, 'IYYY"-W"IW')
           when 'mensal'  then to_char((now() at time zone 'Europe/Lisbon')::date, 'YYYY-MM')
           else 'sempre'
         end;
$fn$;


-- ─── 2. DEFINIÇÃO DAS MISSÕES ──────────────────────────────────────────────

create table if not exists public.missoes (
  id            uuid primary key default gen_random_uuid(),
  chave         text not null unique,
  titulo        text not null,
  descricao     text,

  -- O evento que faz a missão avançar. Tem de ser um dos que as funções da
  -- secção 4 emitem, senão a missão nunca sai do zero.
  evento        text not null
                check (evento in ('previsao_feita', 'previsao_certa', 'mensagem_sala',
                                  'sala_visitada', 'login', 'drop_reclamado', 'voto_mvp')),
  alvo          integer not null default 1 check (alvo between 1 and 500),
  recompensa    integer not null default 30 check (recompensa >= 0),

  periodo       text not null default 'semanal'
                check (periodo in ('diaria', 'semanal', 'mensal', 'sempre')),
  ordem         integer not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into public.missoes (chave, titulo, descricao, evento, alvo, recompensa, periodo, ordem) values
  ('semana_previsoes_5', 'Faz 5 previsões',        'Cinco previsões gratuitas esta semana.',        'previsao_feita', 5,  40, 'semanal', 1),
  ('semana_acertos_3',   'Acerta 3 previsões',     'Três previsões certas esta semana.',            'previsao_certa', 3,  80, 'semanal', 2),
  ('semana_salas_3',     'Participa em 3 salas',   'Entra em três Salas de Jogo diferentes.',       'sala_visitada',  3,  50, 'semanal', 3),
  ('semana_chat_10',     'Fala com a malta',       'Dez mensagens nas salas esta semana.',          'mensagem_sala', 10,  30, 'semanal', 4),
  ('streak_7',           'Streak de 7 dias',       'Entra no Hub sete dias seguidos.',              'login',          7, 100, 'semanal', 5),
  ('dia_previsao_1',     'Previsão do dia',        'Faz pelo menos uma previsão hoje.',             'previsao_feita', 1,  10, 'diaria',  6)
on conflict (chave) do nothing;

alter table public.missoes enable row level security;

drop policy if exists "missoes leitura" on public.missoes;
create policy "missoes leitura"
  on public.missoes for select using (ativo or auth.uid() is not null);

drop policy if exists "missoes escrita admin" on public.missoes;
create policy "missoes escrita admin"
  on public.missoes for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


-- ─── 3. PROGRESSO ──────────────────────────────────────────────────────────

create table if not exists public.missao_progresso (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  missao_id     uuid not null references public.missoes(id) on delete cascade,
  -- Congela o período a que este progresso pertence. Sem isto, mudar a
  -- semana obrigava a apagar linhas — e perdia-se o histórico.
  periodo_chave text not null,

  progresso     integer not null default 0,
  concluida_em  timestamptz,
  resgatada_em  timestamptz,

  -- Eventos já contados, para os que precisam de ser únicos (visitar a mesma
  -- sala três vezes não são três salas).
  marcas        text[] not null default '{}',

  unique (user_id, missao_id, periodo_chave)
);

create index if not exists missao_prog_user_idx
  on public.missao_progresso (user_id, periodo_chave);

alter table public.missao_progresso enable row level security;

drop policy if exists "missao progresso leitura" on public.missao_progresso;
create policy "missao progresso leitura"
  on public.missao_progresso for select using (auth.uid() = user_id);

-- Sem insert/update para o cliente: só a função da secção 4 escreve aqui.


-- ─── 4. REGISTAR EVENTO ────────────────────────────────────────────────────

-- Faz avançar todas as missões activas que escutam este evento.
--
-- p_marca serve para eventos que só contam uma vez por objecto: passar o
-- evento_id da sala faz "participa em 3 salas" contar salas e não mensagens.
-- Quando é nulo, cada chamada conta como uma unidade.
--
-- Não é chamável pelo cliente. É invocada pelas funções que já validaram que
-- a acção aconteceu mesmo.
create or replace function public.missao_registar(
  p_user_id uuid,
  p_evento  text,
  p_marca   text default null,
  p_qtd     integer default 1
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  m       record;
  v_chave text;
  v_prog  public.missao_progresso%rowtype;
begin
  for m in select * from public.missoes where ativo and evento = p_evento loop
    v_chave := public.epc_periodo(m.periodo);

    insert into public.missao_progresso (user_id, missao_id, periodo_chave)
    values (p_user_id, m.id, v_chave)
    on conflict (user_id, missao_id, periodo_chave) do nothing;

    select * into v_prog from public.missao_progresso
     where user_id = p_user_id and missao_id = m.id and periodo_chave = v_chave
     for update;

    -- Já concluída neste período: nada a fazer.
    if v_prog.concluida_em is not null then
      continue;
    end if;

    -- Evento com marca já contada: também não.
    if p_marca is not null and p_marca = any (v_prog.marcas) then
      continue;
    end if;

    update public.missao_progresso
       set progresso    = least(m.alvo, progresso + greatest(1, coalesce(p_qtd, 1))),
           marcas       = case when p_marca is null then marcas
                               else array_append(marcas, p_marca) end,
           concluida_em = case
             when least(m.alvo, progresso + greatest(1, coalesce(p_qtd, 1))) >= m.alvo
             then now() else null end
     where id = v_prog.id;
  end loop;
end;
$fn$;

revoke all on function public.missao_registar(uuid, text, text, integer) from public;
revoke all on function public.missao_registar(uuid, text, text, integer) from authenticated;


-- ─── 5. LER E RESGATAR ─────────────────────────────────────────────────────

-- As missões do período actual com o progresso do próprio já resolvido.
create or replace function public.missoes_do_membro()
returns table (
  id           uuid,
  titulo       text,
  descricao    text,
  periodo      text,
  alvo         integer,
  recompensa   integer,
  progresso    integer,
  concluida    boolean,
  resgatada    boolean
)
language sql stable security definer set search_path = public as $fn$
  select m.id, m.titulo, m.descricao, m.periodo, m.alvo, m.recompensa,
         coalesce(p.progresso, 0),
         p.concluida_em is not null,
         p.resgatada_em is not null
    from public.missoes m
    left join public.missao_progresso p
           on p.missao_id = m.id
          and p.user_id = auth.uid()
          and p.periodo_chave = public.epc_periodo(m.periodo)
   where m.ativo
   order by m.ordem, m.titulo;
$fn$;

grant execute on function public.missoes_do_membro() to authenticated;


-- Resgate. A recompensa só sai daqui, e só uma vez por período.
create or replace function public.missao_resgatar(p_missao_id uuid)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  m        record;
  v_chave  text;
  v_prog   public.missao_progresso%rowtype;
  v_saldo  integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select * into m from public.missoes where id = p_missao_id and ativo;
  if m.id is null then
    raise exception 'MISSAO_INEXISTENTE';
  end if;

  v_chave := public.epc_periodo(m.periodo);

  select * into v_prog from public.missao_progresso
   where user_id = v_uid and missao_id = m.id and periodo_chave = v_chave
   for update;

  if v_prog.id is null or v_prog.concluida_em is null then
    raise exception 'MISSAO_POR_CONCLUIR';
  end if;
  if v_prog.resgatada_em is not null then
    raise exception 'MISSAO_JA_RESGATADA';
  end if;

  update public.missao_progresso set resgatada_em = now() where id = v_prog.id;

  v_saldo := public.epc_creditar(
    v_uid, m.recompensa, 'missao_concluida', m.chave,
    'Missão: ' || m.titulo,
    'missao:' || m.chave || ':' || v_chave || ':' || v_uid::text
  );
  return v_saldo;
end;
$fn$;

grant execute on function public.missao_resgatar(uuid) to authenticated;


-- ─── 6. EPC DROPS ──────────────────────────────────────────────────────────
-- Uma janela curta durante um jogo em que quem estiver mesmo na sala reclama
-- moedas. O valor está na janela ser curta e não anunciada — é isso que faz
-- ficar em vez de voltar mais tarde.

create table if not exists public.drops (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null default 'EPC DROP',
  -- Preso a um jogo: só aparece a quem estiver nessa sala. Nulo = Hub inteiro.
  evento_id   text,
  jogo_label  text,

  valor       integer not null default 25 check (valor between 1 and 5000),
  abre_em     timestamptz not null default now(),
  -- A janela. O check impede o drop de 24 horas, que deixaria de ser um drop.
  fecha_em    timestamptz not null,

  criado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),

  check (fecha_em > abre_em and fecha_em <= abre_em + interval '10 minutes')
);

create index if not exists drops_janela_idx on public.drops (fecha_em desc);

alter table public.drops enable row level security;

-- Só se vê o drop enquanto está aberto. Listar drops futuros era anunciá-los.
drop policy if exists "drops leitura" on public.drops;
create policy "drops leitura"
  on public.drops for select
  using (
    (auth.uid() is not null and now() between abre_em and fecha_em)
    or exists (select 1 from public.membros m
                where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );

drop policy if exists "drops escrita admin" on public.drops;
create policy "drops escrita admin"
  on public.drops for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


create table if not exists public.drop_reclamacoes (
  drop_id    uuid not null references public.drops(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drop_id, user_id)
);

alter table public.drop_reclamacoes enable row level security;

drop policy if exists "drop reclamacoes leitura" on public.drop_reclamacoes;
create policy "drop reclamacoes leitura"
  on public.drop_reclamacoes for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.membros m
                where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


-- Reclamar. A janela é verificada com o relógio do servidor — é o único que
-- não se muda a partir do cliente.
create or replace function public.drop_reclamar(p_drop_id uuid)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  d       record;
  v_saldo integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select * into d from public.drops where id = p_drop_id;
  if d.id is null then
    raise exception 'DROP_INEXISTENTE';
  end if;
  if now() < d.abre_em or now() > d.fecha_em then
    raise exception 'DROP_FORA_DA_JANELA';
  end if;

  insert into public.drop_reclamacoes (drop_id, user_id)
  values (p_drop_id, v_uid)
  on conflict do nothing;

  v_saldo := public.epc_creditar(
    v_uid, d.valor, 'drop_reclamado', p_drop_id::text,
    d.titulo,
    'drop:' || p_drop_id::text || ':' || v_uid::text
  );

  perform public.missao_registar(v_uid, 'drop_reclamado', p_drop_id::text);
  return v_saldo;
end;
$fn$;

grant execute on function public.drop_reclamar(uuid) to authenticated;


-- O drop aberto agora, se existir, e se o próprio já o reclamou.
create or replace function public.drop_ativo(p_evento_id text default null)
returns table (
  id          uuid,
  titulo      text,
  valor       integer,
  fecha_em    timestamptz,
  jogo_label  text,
  reclamado   boolean
)
language sql stable security definer set search_path = public as $fn$
  select d.id, d.titulo, d.valor, d.fecha_em, d.jogo_label,
         exists (select 1 from public.drop_reclamacoes r
                  where r.drop_id = d.id and r.user_id = auth.uid())
    from public.drops d
   where now() between d.abre_em and d.fecha_em
     and (d.evento_id is null or d.evento_id = p_evento_id)
   order by d.fecha_em
   limit 1;
$fn$;

grant execute on function public.drop_ativo(text) to authenticated;


-- ─── 7. ACTIVIDADE NAS SALAS ───────────────────────────────────────────────
-- O chat das salas já existe (005) e escreve directamente na tabela. Em vez
-- de mudar esse caminho, regista-se a actividade por uma função à parte que
-- o frontend chama depois de enviar. O pior caso de uma falha aqui é não
-- contar a missão — nunca perder a mensagem.
--
-- O crédito é da primeira mensagem do dia, não de cada mensagem: pagar por
-- mensagem paga o spam.
create or replace function public.sala_registar_atividade(
  p_evento_id text,
  p_escreveu  boolean default true
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_hoje text := to_char((now() at time zone 'Europe/Lisbon')::date, 'YYYY-MM-DD');
begin
  if v_uid is null then
    return;
  end if;

  perform public.missao_registar(v_uid, 'sala_visitada', p_evento_id);

  if p_escreveu then
    perform public.missao_registar(v_uid, 'mensagem_sala');
    perform public.epc_creditar(
      v_uid,
      greatest(coalesce(public.epc_valor_regra('mensagem_sala', v_uid), 0), 1),
      'mensagem_sala', p_evento_id,
      'Primeira mensagem do dia',
      'msg:' || v_uid::text || ':' || v_hoje
    );
  end if;
end;
$fn$;

grant execute on function public.sala_registar_atividade(text, boolean) to authenticated;


-- ─── 8. LIGAR AS MISSÕES ÀS PREVISÕES ──────────────────────────────────────
-- A 008 já criou estas funções; aqui acrescenta-se-lhes o efeito nas missões,
-- sem mexer no resto do corpo.

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
  v_nova     boolean;
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

  if not exists (
    select 1 from jsonb_array_elements(v_opcoes) o where o->>'chave' = p_escolha
  ) then
    raise exception 'ESCOLHA_INVALIDA';
  end if;

  v_nova := not exists (
    select 1 from public.previsoes
     where pergunta_id = p_pergunta_id and user_id = v_uid
  );

  select m.username into v_username from public.membros m where m.id = v_uid;

  insert into public.previsoes (pergunta_id, user_id, username, escolha)
  values (p_pergunta_id, v_uid, coalesce(v_username, 'membro'), p_escolha)
  on conflict (pergunta_id, user_id)
  do update set escolha = excluded.escolha, created_at = now();

  -- Mudar de escolha não conta como previsão nova, nem para as moedas nem
  -- para a missão.
  if v_nova then
    v_valor := coalesce(public.epc_valor_regra('previsao_feita', v_uid), 0);
    if v_valor > 0 then
      perform public.epc_creditar(
        v_uid, v_valor, 'previsao_feita', p_pergunta_id::text,
        'Previsão registada',
        'prev:' || p_pergunta_id::text || ':' || v_uid::text
      );
    end if;
    perform public.missao_registar(v_uid, 'previsao_feita');
  end if;
end;
$fn$;

grant execute on function public.previsao_responder(uuid, text) to authenticated;
