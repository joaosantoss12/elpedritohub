-- ───────────────────────────────────────────────────────────────────────────
-- 007 · LEDGER DE EPCOINS  (gamificação · fundação)
--
-- Correr no SQL Editor do Supabase depois da 006.
--
-- Hoje os EPCoins são um inteiro em membros.epcoins que qualquer sítio soma à
-- vontade. Isso chega para mostrar um número no perfil e não chega para mais
-- nada: não se sabe de onde veio, não se reverte, e dois cliques rápidos no
-- mesmo botão creditam duas vezes.
--
-- Três decisões que condicionam tudo o que vem a seguir:
--
-- 1. O saldo passa a ser derivado, não escrito. A verdade é a soma do ledger;
--    membros.epcoins fica como cache mantida por trigger, para as páginas que
--    já a lêem continuarem a funcionar sem alterações.
--
-- 2. Todo o crédito tem chave de idempotência. "streak:2026-09-01:<uid>" só
--    entra uma vez, aconteça o que acontecer ao lado do cliente.
--
-- 3. O cliente nunca escreve no ledger. Não há policy de insert para
--    authenticated — só funções security definer é que creditam, e cada uma
--    valida a sua própria regra. Sem isto, os EPCoins valem zero no minuto
--    em que alguém abrir a consola do browser.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. TABELA DE REGRAS ───────────────────────────────────────────────────
-- Quanto vale cada acção fica em dados, não em código, para o Pedrito poder
-- afinar a economia no Admin sem deploy. Uma economia de moedas afina-se
-- muitas vezes nas primeiras semanas.

create table if not exists public.epc_regras (
  chave         text primary key,
  descricao     text not null,
  valor         integer not null default 0,
  valor_vip     integer,                       -- null = igual ao valor base
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into public.epc_regras (chave, descricao, valor, valor_vip) values
  ('login_streak',      'Por dia de streak de login (multiplica pelo nº de dias)',      1,   5),
  ('previsao_feita',    'Fazer uma previsão gratuita',                                   2,   2),
  ('previsao_certa',    'Acertar uma previsão',                                         10,  15),
  ('previsao_perfeita', 'Acertar o boletim completo do dia',                            50,  75),
  ('mensagem_sala',     'Primeira mensagem do dia numa sala de jogo',                    3,   3),
  ('drop_reclamado',    'Reclamar um EPC DROP ao vivo',                                 25,  25),
  ('missao_concluida',  'Concluir uma missão semanal (valor base; cada missão ajusta)', 30,  30),
  ('spin_diario',       'Roda diária promocional (valor base do prémio)',                5,   5),
  ('referral_registo',  'Amigo convidado confirma a conta',                            100, 100),
  ('voto_mvp',          'Votar no MVP de um jogo',                                       2,   2)
on conflict (chave) do nothing;

alter table public.epc_regras enable row level security;

drop policy if exists "epc regras leitura" on public.epc_regras;
create policy "epc regras leitura"
  on public.epc_regras for select using (true);

drop policy if exists "epc regras escrita admin" on public.epc_regras;
create policy "epc regras escrita admin"
  on public.epc_regras for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


-- ─── 2. O LEDGER ───────────────────────────────────────────────────────────
-- Append-only por convenção e por policy: não há update nem delete para
-- ninguém, nem para administradores. Corrigir um erro faz-se com um
-- movimento de sinal contrário, que fica no extrato. É assim que um extrato
-- se mantém auditável.

create table if not exists public.epc_movimentos (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- Positivo credita, negativo debita. Um só campo evita o clássico bug de
  -- somar um débito por engano.
  valor       integer not null check (valor <> 0),

  -- Chave em epc_regras quando aplicável; texto livre para ajustes manuais.
  motivo      text not null,
  -- Para onde apontar quando se quiser explicar o movimento ao membro:
  -- id de previsão, de drop, de missão, de compra na loja.
  referencia  text,
  descricao   text,

  -- A rede de segurança contra duplicados. Nulo é permitido para os ajustes
  -- manuais do Admin, que são raros e intencionais.
  idem_key    text unique,

  created_at  timestamptz not null default now()
);

create index if not exists epc_mov_user_idx
  on public.epc_movimentos (user_id, created_at desc);

alter table public.epc_movimentos enable row level security;

-- Cada um vê o seu extrato; o administrador vê todos.
drop policy if exists "epc mov leitura propria" on public.epc_movimentos;
create policy "epc mov leitura propria"
  on public.epc_movimentos for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.membros m
                where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );

-- Repare-se na ausência: não há policy de insert, update ou delete. É de
-- propósito. Quem escreve são as funções security definer da secção 4.


-- ─── 3. CACHE DO SALDO ─────────────────────────────────────────────────────
-- membros.epcoins passa a ser mantido pelo trigger. As páginas que já o lêem
-- (Perfil, Admin, Suporte) não precisam de saber que o ledger existe.

create or replace function public.epc_sync_saldo()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.membros
     set epcoins = greatest(0, coalesce(epcoins, 0) + new.valor)
   where id = new.user_id;
  return new;
end;
$fn$;

drop trigger if exists epc_mov_sync on public.epc_movimentos;
create trigger epc_mov_sync
  after insert on public.epc_movimentos
  for each row execute function public.epc_sync_saldo();


-- ─── 4. CREDITAR E DEBITAR ─────────────────────────────────────────────────

-- Crédito idempotente. Devolve o saldo depois do movimento.
--
-- p_idem_key repetida não é erro: devolve o saldo actual sem creditar outra
-- vez. Quem chama não tem de distinguir "primeira vez" de "repetição", o que
-- evita metade dos bugs deste género de código.
create or replace function public.epc_creditar(
  p_user_id    uuid,
  p_valor      integer,
  p_motivo     text,
  p_referencia text default null,
  p_descricao  text default null,
  p_idem_key   text default null
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo integer;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'epc_creditar: valor tem de ser positivo (recebido %)', p_valor;
  end if;

  insert into public.epc_movimentos (user_id, valor, motivo, referencia, descricao, idem_key)
  values (p_user_id, p_valor, p_motivo, p_referencia, p_descricao, p_idem_key)
  on conflict (idem_key) do nothing;

  select coalesce(epcoins, 0) into v_saldo from public.membros where id = p_user_id;
  return coalesce(v_saldo, 0);
end;
$fn$;

-- Débito. Ao contrário do crédito, falha em voz alta se não houver saldo —
-- quem compra na loja tem de saber que não comprou.
create or replace function public.epc_debitar(
  p_user_id    uuid,
  p_valor      integer,
  p_motivo     text,
  p_referencia text default null,
  p_descricao  text default null,
  p_idem_key   text default null
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_saldo integer;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'epc_debitar: valor tem de ser positivo (recebido %)', p_valor;
  end if;

  -- Bloqueia a linha do membro até ao fim da transacção. Sem isto, dois
  -- pedidos simultâneos passam ambos na verificação de saldo.
  select coalesce(epcoins, 0) into v_saldo
    from public.membros where id = p_user_id for update;

  if v_saldo is null then
    raise exception 'epc_debitar: membro % nao existe', p_user_id;
  end if;
  if v_saldo < p_valor then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  insert into public.epc_movimentos (user_id, valor, motivo, referencia, descricao, idem_key)
  values (p_user_id, -p_valor, p_motivo, p_referencia, p_descricao, p_idem_key)
  on conflict (idem_key) do nothing;

  select coalesce(epcoins, 0) into v_saldo from public.membros where id = p_user_id;
  return v_saldo;
end;
$fn$;

-- Valor configurado de uma acção, já com a variante VIP resolvida.
create or replace function public.epc_valor_regra(p_chave text, p_user_id uuid)
returns integer
language sql stable security definer set search_path = public as $fn$
  select case
           when r.ativo is not true then 0
           when public.e_vip(p_user_id) then coalesce(r.valor_vip, r.valor)
           else r.valor
         end
    from public.epc_regras r
   where r.chave = p_chave;
$fn$;

-- Só o crédito por regra é que fica exposto ao cliente, e mesmo esse não
-- aceita valores: recebe a chave da acção e é o servidor que decide quanto
-- vale. epc_creditar/epc_debitar com valor arbitrário ficam para as outras
-- funções security definer, que correm com os privilégios do dono.
revoke all on function public.epc_creditar(uuid, integer, text, text, text, text) from public;
revoke all on function public.epc_creditar(uuid, integer, text, text, text, text) from authenticated;
revoke all on function public.epc_debitar(uuid, integer, text, text, text, text) from public;
revoke all on function public.epc_debitar(uuid, integer, text, text, text, text) from authenticated;
grant execute on function public.epc_valor_regra(text, uuid) to authenticated;


-- ─── 5. EXTRATO ────────────────────────────────────────────────────────────

-- O extrato do próprio, do mais recente para o mais antigo.
create or replace function public.epc_extrato(p_limite integer default 50)
returns table (
  id         bigint,
  valor      integer,
  motivo     text,
  descricao  text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select m.id, m.valor, m.motivo, m.descricao, m.created_at
    from public.epc_movimentos m
   where m.user_id = auth.uid()
   order by m.created_at desc, m.id desc
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$fn$;

grant execute on function public.epc_extrato(integer) to authenticated;


-- ─── 6. STREAK DIÁRIO ──────────────────────────────────────────────────────
-- Isto vive hoje no AuthContext, do lado do cliente, e por isso é editável
-- por quem souber abrir a consola. Passa para o servidor, com a data a vir do
-- servidor também — senão basta mudar o relógio do computador.

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


-- ─── 7. BACKFILL ───────────────────────────────────────────────────────────
-- O saldo que os membros já têm não pode desaparecer. Entra como um único
-- movimento de abertura, com chave de idempotência para a migração poder ser
-- corrida duas vezes sem duplicar nada.

insert into public.epc_movimentos (user_id, valor, motivo, descricao, idem_key)
select m.id, m.epcoins, 'saldo_inicial',
       'Saldo acumulado antes do extrato existir',
       'abertura:' || m.id::text
  from public.membros m
 where coalesce(m.epcoins, 0) > 0
on conflict (idem_key) do nothing;

-- O trigger da secção 3 somou o backfill por cima do saldo que já lá estava.
-- Reposição: o saldo passa a ser exactamente a soma do ledger, que é o que
-- vai valer de agora em diante.
update public.membros m
   set epcoins = coalesce((
         select sum(v.valor) from public.epc_movimentos v where v.user_id = m.id
       ), 0);
