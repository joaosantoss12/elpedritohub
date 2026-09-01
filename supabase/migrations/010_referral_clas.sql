-- ───────────────────────────────────────────────────────────────────────────
-- 010 · CONVITES E CLÃS
--
-- Correr depois da 009.
--
-- NOTA DE ÂMBITO — ler antes de mexer:
-- O sistema de convites aqui é *interno*. Recompensa quem traz alguém para o
-- Hub com EPCoins, e nada mais. Não conhece casas de apostas, não conhece
-- registos externos, não conhece FTDs.
--
-- Ligar recompensas a registos ou primeiros depósitos numa casa parceira é
-- outra coisa: cai nas regras de afiliados, publicidade e jogo responsável
-- aplicáveis em Portugal, e tem de ser desenhado à parte, com essas regras à
-- frente. Se um dia isso for feito, faz-se numa tabela nova — não se estica
-- esta. É por isso que 'origem' abaixo não tem um valor para casas externas.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. CÓDIGO DE CONVITE ──────────────────────────────────────────────────

-- O valor do lado do convidado ainda não existe na 007 (que só semeou o do
-- padrinho). Fica aqui, junto da funcionalidade que o usa.
insert into public.epc_regras (chave, descricao, valor, valor_vip) values
  ('referral_bonus', 'Entrar no Hub por convite de outro membro', 75, 75)
on conflict (chave) do nothing;


create table if not exists public.referral_codigos (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  codigo     text not null unique,
  created_at timestamptz not null default now()
);

alter table public.referral_codigos enable row level security;

-- Qualquer membro autenticado precisa de conseguir ler o código de outro para
-- o poder usar. O código não é um segredo — serve para ser partilhado.
drop policy if exists "referral codigos leitura" on public.referral_codigos;
create policy "referral codigos leitura"
  on public.referral_codigos for select using (auth.uid() is not null);


create table if not exists public.referral_conversoes (
  -- Um convidado tem um padrinho e só um, para sempre. A PK trata disso.
  convidado_id uuid primary key references auth.users(id) on delete cascade,
  padrinho_id  uuid not null references auth.users(id) on delete cascade,
  origem       text not null default 'hub' check (origem in ('hub')),
  created_at   timestamptz not null default now(),

  check (convidado_id <> padrinho_id)
);

create index if not exists referral_padrinho_idx
  on public.referral_conversoes (padrinho_id);

alter table public.referral_conversoes enable row level security;

drop policy if exists "referral conversoes leitura" on public.referral_conversoes;
create policy "referral conversoes leitura"
  on public.referral_conversoes for select
  using (auth.uid() = padrinho_id or auth.uid() = convidado_id);


-- O código do próprio, criado à primeira chamada.
create or replace function public.referral_meu_codigo()
returns text
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_codigo text;
  v_base   text;
  i        integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select codigo into v_codigo from public.referral_codigos where user_id = v_uid;
  if v_codigo is not null then
    return v_codigo;
  end if;

  -- Base legível a partir do username; o sufixo resolve as colisões.
  select upper(regexp_replace(coalesce(m.username, 'EPC'), '[^a-zA-Z0-9]', '', 'g'))
    into v_base from public.membros m where m.id = v_uid;
  v_base := left(coalesce(nullif(v_base, ''), 'EPC'), 8);

  loop
    v_codigo := v_base || lpad((floor(random() * 1000))::int::text, 3, '0');
    begin
      insert into public.referral_codigos (user_id, codigo) values (v_uid, v_codigo);
      return v_codigo;
    exception when unique_violation then
      i := i + 1;
      if i > 12 then
        raise exception 'CODIGO_INDISPONIVEL';
      end if;
    end;
  end loop;
end;
$fn$;

grant execute on function public.referral_meu_codigo() to authenticated;


-- Usar um código. Chamado uma vez, pelo convidado, depois do registo.
create or replace function public.referral_usar(p_codigo text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid       uuid := auth.uid();
  v_padrinho  uuid;
  v_criado_em timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  if exists (select 1 from public.referral_conversoes where convidado_id = v_uid) then
    raise exception 'CONVITE_JA_USADO';
  end if;

  select user_id into v_padrinho
    from public.referral_codigos
   where upper(codigo) = upper(trim(p_codigo));

  if v_padrinho is null then
    raise exception 'CODIGO_INVALIDO';
  end if;
  if v_padrinho = v_uid then
    raise exception 'CODIGO_PROPRIO';
  end if;

  -- Janela de 7 dias após o registo. Sem isto, um código podia ser usado por
  -- contas antigas e o convite deixava de significar "trouxe alguém novo".
  select created_at into v_criado_em from auth.users where id = v_uid;
  if v_criado_em is not null and v_criado_em < now() - interval '7 days' then
    raise exception 'CONVITE_FORA_DE_PRAZO';
  end if;

  insert into public.referral_conversoes (convidado_id, padrinho_id)
  values (v_uid, v_padrinho);

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
end;
$fn$;

grant execute on function public.referral_usar(text) to authenticated;


create or replace function public.referral_resumo()
returns table (codigo text, convidados integer)
language sql stable security definer set search_path = public as $fn$
  select public.referral_meu_codigo(),
         (select count(*)::int from public.referral_conversoes
           where padrinho_id = auth.uid());
$fn$;

grant execute on function public.referral_resumo() to authenticated;


-- ─── 2. CLÃS ───────────────────────────────────────────────────────────────
-- Grupos pequenos (5 a 20). O limite não é técnico: um clã de 200 é um chat
-- geral com outro nome e deixa de ter a pressão de grupo que o torna útil.

create table if not exists public.clas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique check (length(trim(nome)) between 3 and 32),
  tag          text not null unique check (tag ~ '^[A-Z0-9]{2,5}$'),
  descricao    text check (length(descricao) <= 240),
  dono_id      uuid not null references auth.users(id) on delete cascade,
  aberto       boolean not null default true,
  max_membros  integer not null default 20 check (max_membros between 5 and 20),
  created_at   timestamptz not null default now()
);

alter table public.clas enable row level security;

drop policy if exists "clas leitura" on public.clas;
create policy "clas leitura"
  on public.clas for select using (auth.uid() is not null);

-- O dono pode editar o nome, a descrição e se está aberto. Criar e apagar
-- passam pelas funções, para o contador de membros não ficar órfão.
drop policy if exists "clas update dono" on public.clas;
create policy "clas update dono"
  on public.clas for update using (auth.uid() = dono_id);


create table if not exists public.cla_membros (
  cla_id     uuid not null references public.clas(id) on delete cascade,
  -- Um membro pertence a um clã de cada vez: é a PK do user que garante isso.
  user_id    uuid primary key references auth.users(id) on delete cascade,
  papel      text not null default 'membro' check (papel in ('dono', 'membro')),
  created_at timestamptz not null default now()
);

create index if not exists cla_membros_cla_idx on public.cla_membros (cla_id);

alter table public.cla_membros enable row level security;

drop policy if exists "cla membros leitura" on public.cla_membros;
create policy "cla membros leitura"
  on public.cla_membros for select using (auth.uid() is not null);


create or replace function public.cla_criar(
  p_nome      text,
  p_tag       text,
  p_descricao text default null
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

  insert into public.clas (nome, tag, descricao, dono_id)
  values (trim(p_nome), upper(trim(p_tag)), nullif(trim(p_descricao), ''), v_uid)
  returning id into v_id;

  insert into public.cla_membros (cla_id, user_id, papel)
  values (v_id, v_uid, 'dono');

  return v_id;
end;
$fn$;

grant execute on function public.cla_criar(text, text, text) to authenticated;


create or replace function public.cla_entrar(p_cla_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  c      record;
  v_qtd  integer;
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
  if not c.aberto then
    raise exception 'CLA_FECHADO';
  end if;

  select count(*) into v_qtd from public.cla_membros where cla_id = p_cla_id;
  if v_qtd >= c.max_membros then
    raise exception 'CLA_CHEIO';
  end if;

  insert into public.cla_membros (cla_id, user_id) values (p_cla_id, v_uid);
end;
$fn$;

grant execute on function public.cla_entrar(uuid) to authenticated;


-- Sair. O dono a sair dissolve o clã — passar a posse é uma decisão de
-- produto que ainda não foi tomada, e um clã sem dono não tem quem o edite.
create or replace function public.cla_sair()
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select * into v_row from public.cla_membros where user_id = v_uid;
  if v_row.user_id is null then
    return;
  end if;

  if v_row.papel = 'dono' then
    delete from public.clas where id = v_row.cla_id;
  else
    delete from public.cla_membros where user_id = v_uid;
  end if;
end;
$fn$;

grant execute on function public.cla_sair() to authenticated;


-- Ranking dos clãs pelo que os membros ganharam no mês. Usa os movimentos
-- positivos e não o saldo: o saldo desce quando se gasta na loja, e um clã
-- não deve descer no ranking por os membros estarem a usar as moedas.
create or replace function public.cla_ranking(p_limite integer default 30)
returns table (
  cla_id    uuid,
  nome      text,
  tag       text,
  membros   integer,
  pontos    bigint
)
language sql stable security definer set search_path = public as $fn$
  select c.id, c.nome, c.tag,
         count(distinct cm.user_id)::int,
         coalesce(sum(mv.valor), 0)::bigint
    from public.clas c
    join public.cla_membros cm on cm.cla_id = c.id
    left join public.epc_movimentos mv
           on mv.user_id = cm.user_id
          and mv.valor > 0
          and mv.created_at >= date_trunc('month', now() at time zone 'Europe/Lisbon')
   group by c.id, c.nome, c.tag
   order by 5 desc, 4 desc, c.created_at
   limit greatest(1, least(coalesce(p_limite, 30), 100));
$fn$;

grant execute on function public.cla_ranking(integer) to authenticated;


-- O clã do próprio com a lista de membros, para a página não fazer três
-- pedidos para desenhar um cartão.
create or replace function public.cla_detalhe(p_cla_id uuid default null)
returns table (
  cla_id     uuid,
  nome       text,
  tag        text,
  descricao  text,
  aberto     boolean,
  max_membros integer,
  sou_dono   boolean,
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
         c.dono_id = auth.uid(),
         coalesce(m.username, 'membro'), cm.papel, coalesce(m.epcoins, 0)
    from alvo a
    join public.clas c on c.id = a.id
    join public.cla_membros cm on cm.cla_id = c.id
    left join public.membros m on m.id = cm.user_id
   order by cm.papel desc, coalesce(m.epcoins, 0) desc;
$fn$;

grant execute on function public.cla_detalhe(uuid) to authenticated;
