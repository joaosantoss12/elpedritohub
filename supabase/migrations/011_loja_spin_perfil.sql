-- ───────────────────────────────────────────────────────────────────────────
-- 011 · LOJA, RODA DIÁRIA E PERFIL PÚBLICO
--
-- Correr depois da 010.
--
-- NOTA DE ÂMBITO — a roda diária:
-- É promocional e nada mais. Não exige depósito, não exige aposta, não se
-- compra, não se joga duas vezes, e o que dá são benefícios internos do Hub
-- (EPCoins, badges) que não se convertem em dinheiro nem em saldo de aposta.
-- Vive fora do casino, e assim deve ficar: se um dia alguém puser aqui um
-- custo de entrada ou um prémio convertível, deixa de ser isto e passa a ser
-- outra coisa, com outras regras.
--
-- O mesmo princípio vale para a loja: as EPCoins entram por actividade
-- gratuita e saem por merchandising, conteúdo e cosméticos. Nunca ao contrário.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. CATÁLOGO ───────────────────────────────────────────────────────────

create table if not exists public.loja_itens (
  id          uuid primary key default gen_random_uuid(),
  chave       text not null unique,
  tipo        text not null
              check (tipo in ('badge', 'avatar', 'moldura', 'merch', 'desconto',
                              'experiencia', 'conteudo')),
  nome        text not null,
  descricao   text,
  preco       integer not null check (preco >= 0),
  imagem_url  text,

  -- Nulo = sem limite. Os cosméticos são infinitos; um hoodie não é.
  stock       integer check (stock >= 0),
  -- Cosméticos compram-se uma vez; um desconto pode repetir-se.
  unico       boolean not null default true,
  requer_vip  boolean not null default false,

  -- O que precisa de acção humana (enviar um hoodie, marcar uma call) fica
  -- pendente até o admin marcar como entregue.
  entrega_manual boolean not null default false,

  ativo       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.loja_itens (chave, tipo, nome, descricao, preco, unico, entrega_manual, ordem) values
  ('badge_veterano',  'badge',       'Badge Veterano',     'Mostra que estás cá desde cedo.',               300,  true,  false, 1),
  ('badge_analista',  'badge',       'Badge Analista',     'Para quem acerta mais do que a média.',         600,  true,  false, 2),
  ('moldura_bronze',  'moldura',     'Moldura Bronze',     'Contorno do avatar em bronze.',                 250,  true,  false, 3),
  ('moldura_mate',    'moldura',     'Moldura Mate',       'Contorno discreto, castanho mate.',             450,  true,  false, 4),
  ('conteudo_raiox',  'conteudo',    'Raio-X extra',       'Desbloqueia uma análise extra do Pedrito.',     400,  false, false, 5),
  ('merch_tshirt',    'merch',       'T-shirt El Pedrito', 'Envio combinado por mensagem depois da troca.', 2500, false, true,  6),
  ('exp_call',        'experiencia', 'Call com o Pedrito', 'Quinze minutos, um a um. Marcação manual.',     5000, false, true,  7)
on conflict (chave) do nothing;

alter table public.loja_itens enable row level security;

drop policy if exists "loja itens leitura" on public.loja_itens;
create policy "loja itens leitura"
  on public.loja_itens for select using (ativo or auth.uid() is not null);

drop policy if exists "loja itens admin" on public.loja_itens;
create policy "loja itens admin"
  on public.loja_itens for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


create table if not exists public.loja_compras (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    uuid not null references public.loja_itens(id) on delete restrict,
  preco_pago integer not null,
  estado     text not null default 'entregue'
             check (estado in ('entregue', 'pendente', 'cancelada')),
  nota       text,
  created_at timestamptz not null default now()
);

create index if not exists loja_compras_user_idx
  on public.loja_compras (user_id, created_at desc);

alter table public.loja_compras enable row level security;

drop policy if exists "loja compras leitura" on public.loja_compras;
create policy "loja compras leitura"
  on public.loja_compras for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.membros m
                where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );

-- O admin precisa de marcar entregas; o membro não escreve aqui de todo.
drop policy if exists "loja compras admin" on public.loja_compras;
create policy "loja compras admin"
  on public.loja_compras for update
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


create or replace function public.loja_comprar(p_item_id uuid)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  it      record;
  v_saldo integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;

  select * into it from public.loja_itens where id = p_item_id for update;
  if it.id is null or not it.ativo then
    raise exception 'ITEM_INDISPONIVEL';
  end if;
  if it.requer_vip and not public.e_vip(v_uid) then
    raise exception 'ITEM_SO_VIP';
  end if;
  if it.stock is not null and it.stock <= 0 then
    raise exception 'ITEM_SEM_STOCK';
  end if;
  if it.unico and exists (
    select 1 from public.loja_compras
     where user_id = v_uid and item_id = it.id and estado <> 'cancelada'
  ) then
    raise exception 'ITEM_JA_COMPRADO';
  end if;

  -- O débito é o que pode falhar por saldo. Vai primeiro, para não ficar
  -- uma compra registada sem pagamento.
  v_saldo := public.epc_debitar(
    v_uid, it.preco, 'loja_compra', it.chave, 'Loja: ' || it.nome,
    case when it.unico
         then 'loja:' || it.chave || ':' || v_uid::text
         else 'loja:' || it.chave || ':' || v_uid::text || ':' || gen_random_uuid()::text
    end
  );

  insert into public.loja_compras (user_id, item_id, preco_pago, estado)
  values (v_uid, it.id, it.preco,
          case when it.entrega_manual then 'pendente' else 'entregue' end);

  if it.stock is not null then
    update public.loja_itens set stock = stock - 1 where id = it.id;
  end if;

  -- Badges são entrega imediata: entram no array que o resto da app já lê.
  if it.tipo = 'badge' then
    update public.membros
       set badges = array(select distinct unnest(coalesce(badges, '{}') || it.nome))
     where id = v_uid;
  end if;

  return v_saldo;
end;
$fn$;

grant execute on function public.loja_comprar(uuid) to authenticated;


create or replace function public.loja_catalogo()
returns table (
  id             uuid,
  chave          text,
  tipo           text,
  nome           text,
  descricao      text,
  preco          integer,
  imagem_url     text,
  stock          integer,
  requer_vip     boolean,
  entrega_manual boolean,
  ja_tenho       boolean
)
language sql stable security definer set search_path = public as $fn$
  select i.id, i.chave, i.tipo, i.nome, i.descricao, i.preco, i.imagem_url,
         i.stock, i.requer_vip, i.entrega_manual,
         i.unico and exists (
           select 1 from public.loja_compras c
            where c.item_id = i.id and c.user_id = auth.uid()
              and c.estado <> 'cancelada'
         )
    from public.loja_itens i
   where i.ativo
   order by i.ordem, i.preco;
$fn$;

grant execute on function public.loja_catalogo() to authenticated;


-- ─── 2. RODA DIÁRIA ────────────────────────────────────────────────────────

create table if not exists public.spin_premios (
  id      uuid primary key default gen_random_uuid(),
  rotulo  text not null unique,
  tipo    text not null default 'epcoins' check (tipo in ('epcoins', 'badge', 'nada')),
  valor   integer not null default 0 check (valor >= 0),
  -- Peso relativo, não percentagem: acrescentar um prémio não obriga a
  -- reequilibrar os outros à mão.
  peso    integer not null default 10 check (peso between 1 and 1000),
  cor     text,
  ativo   boolean not null default true,
  ordem   integer not null default 0
);

insert into public.spin_premios (rotulo, tipo, valor, peso, ordem) values
  ('5 EPC',   'epcoins',   5, 260, 1),
  ('10 EPC',  'epcoins',  10, 220, 2),
  ('15 EPC',  'epcoins',  15, 160, 3),
  ('25 EPC',  'epcoins',  25, 110, 4),
  ('50 EPC',  'epcoins',  50,  55, 5),
  ('100 EPC', 'epcoins', 100,  18, 6),
  ('Nada',    'nada',      0, 180, 7)
on conflict (rotulo) do nothing;

alter table public.spin_premios enable row level security;

drop policy if exists "spin premios leitura" on public.spin_premios;
create policy "spin premios leitura"
  on public.spin_premios for select using (ativo);

drop policy if exists "spin premios admin" on public.spin_premios;
create policy "spin premios admin"
  on public.spin_premios for all
  using (
    exists (select 1 from public.membros m
             where m.id = auth.uid() and 'Administrador' = any (m.badges))
  );


create table if not exists public.spin_jogadas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Uma por dia. O unique é o que garante a regra, não o frontend.
  dia        date not null,
  premio_id  uuid references public.spin_premios(id) on delete set null,
  rotulo     text,
  valor      integer not null default 0,
  created_at timestamptz not null default now(),

  unique (user_id, dia)
);

alter table public.spin_jogadas enable row level security;

drop policy if exists "spin jogadas leitura" on public.spin_jogadas;
create policy "spin jogadas leitura"
  on public.spin_jogadas for select using (auth.uid() = user_id);


-- Girar. Grátis, uma vez por dia, sorteio feito no servidor.
--
-- O resultado é decidido aqui e só depois animado no cliente. O contrário —
-- o cliente sortear e mandar o resultado — seria um formulário de auto-serviço.
create or replace function public.spin_girar()
returns table (rotulo text, tipo text, valor integer, saldo integer)
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_dia   date := (now() at time zone 'Europe/Lisbon')::date;
  v_total bigint;
  v_pick  bigint;
  p       public.spin_premios%rowtype;
  v_acc   bigint := 0;
  v_saldo integer;
begin
  if v_uid is null then
    raise exception 'Sessao necessaria';
  end if;
  if exists (select 1 from public.spin_jogadas j
              where j.user_id = v_uid and j.dia = v_dia) then
    raise exception 'SPIN_JA_USADO_HOJE';
  end if;

  select coalesce(sum(sp.peso), 0) into v_total from public.spin_premios sp where sp.ativo;
  if v_total = 0 then
    raise exception 'SPIN_SEM_PREMIOS';
  end if;

  v_pick := floor(random() * v_total)::bigint;

  for p in select * from public.spin_premios sp where sp.ativo order by sp.ordem, sp.id loop
    v_acc := v_acc + p.peso;
    exit when v_pick < v_acc;
  end loop;

  insert into public.spin_jogadas (user_id, dia, premio_id, rotulo, valor)
  values (v_uid, v_dia, p.id, p.rotulo, p.valor);

  if p.tipo = 'epcoins' and p.valor > 0 then
    v_saldo := public.epc_creditar(
      v_uid, p.valor, 'spin_diario', p.id::text, 'Roda diária: ' || p.rotulo,
      'spin:' || v_uid::text || ':' || v_dia::text
    );
  else
    if p.tipo = 'badge' then
      update public.membros
         set badges = array(select distinct unnest(coalesce(badges, '{}') || p.rotulo))
       where id = v_uid;
    end if;
    select m.epcoins into v_saldo from public.membros m where m.id = v_uid;
  end if;

  return query select p.rotulo, p.tipo, p.valor, coalesce(v_saldo, 0);
end;
$fn$;

grant execute on function public.spin_girar() to authenticated;


create or replace function public.spin_estado()
returns table (disponivel boolean, ultimo_rotulo text)
language sql stable security definer set search_path = public as $fn$
  select not exists (
           select 1 from public.spin_jogadas j
            where j.user_id = auth.uid()
              and j.dia = (now() at time zone 'Europe/Lisbon')::date
         ),
         (select j.rotulo from public.spin_jogadas j
           where j.user_id = auth.uid()
           order by j.dia desc limit 1);
$fn$;

grant execute on function public.spin_estado() to authenticated;


-- ─── 3. PERFIL PÚBLICO ─────────────────────────────────────────────────────
-- Devolve só o que é razoável ser público: nome, badges, taxa de acerto,
-- clã. Nada de email, plano ou saldo. E respeita 'ranking_oculto', que já
-- existe desde a 003 — quem escolheu não aparecer no ranking não passa a
-- aparecer só porque há uma página nova.

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
  cla_tag      text
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
         c.nome, c.tag
    from alvo a
    cross join p
    -- auth.users em vez de membros: created_at existe lá de certeza.
    left join auth.users u on u.id = a.id
    left join public.cla_membros cm on cm.user_id = a.id
    left join public.clas c on c.id = cm.cla_id;
$fn$;

grant execute on function public.perfil_publico(text) to anon, authenticated;
