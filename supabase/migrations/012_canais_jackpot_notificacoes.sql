-- ═══════════════════════════════════════════════════════════════════════════
-- 012 — CANAIS POR CLUBE, JACKPOT DE EPCOINS E NOTIFICAÇÕES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fecha as três peças que faltavam da lista de retenção.
--
-- Sobre o jackpot, e porque é que está desenhado assim: o pote é feito de
-- EPCoins, que não têm valor monetário nem se convertem em dinheiro ou em
-- saldo de aposta. Mais importante do que isso — **os bilhetes não se
-- compram**. Ganham-se a participar de graça, e não há forma de trocar
-- EPCoins por bilhetes. Isso tira do sorteio a contrapartida que o
-- transformaria noutra coisa: quem participa não arrisca nada, porque nada
-- deu para entrar. Se um dia se quiser pôr prémios reais no pote, essa parte
-- tem de ser desenhada de acordo com a legislação aplicável, e não é uma
-- alteração de valores nesta tabela.

-- ─── 1. QUEM É ADMIN ───────────────────────────────────────────────────────
-- A 005 criou `e_vip` pela mesma razão que esta existe: a regra de "isto é um
-- administrador" estava espalhada por meia dúzia de políticas, e cada cópia é
-- uma oportunidade de divergir.

create or replace function public.e_admin(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.membros m
     where m.id = p_uid
       and 'Administrador' = any (coalesce(m.badges, '{}'))
  );
$fn$;

grant execute on function public.e_admin(uuid) to authenticated;

-- Quem pode escrever no chat. Banidos e silenciados ficam de fora — a tabela
-- `membros` já guarda os dois estados, mas até agora só o frontend é que os
-- respeitava, o que é o mesmo que não os respeitar.
create or replace function public.pode_falar(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.membros m
     where m.id = p_uid
       and coalesce(m.is_banned, false) = false
       and (m.chat_timeout_until is null or m.chat_timeout_until < now())
  );
$fn$;

grant execute on function public.pode_falar(uuid) to authenticated;


-- ─── 2. NOTIFICAÇÕES ───────────────────────────────────────────────────────
-- Uma notificação é sempre consequência de um facto que já aconteceu: uma
-- missão que ficou completa, uma previsão que saiu certa, um jackpot ganho.
-- Não há aqui nada que empurre o membro a voltar "porque sim" — isso seria
-- barulho, e barulho ensina a ignorar o sino.

create table if not exists public.notificacoes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       text not null,
  titulo     text not null,
  corpo      text,
  -- Para onde levar quem clicar. Caminho interno, nunca URL absoluto.
  url        text,
  lida       boolean not null default false,
  created_at timestamptz not null default now(),

  -- Mesma ideia do livro de movimentos: repetir a chave não duplica o aviso.
  idem_key   text unique
);

create index if not exists notificacoes_user_idx
  on public.notificacoes (user_id, lida, created_at desc);

alter table public.notificacoes enable row level security;

drop policy if exists "notificacoes leitura propria" on public.notificacoes;
create policy "notificacoes leitura propria" on public.notificacoes
  for select to authenticated
  using (user_id = auth.uid());

-- Marcar como lida é a única coisa que o dono pode alterar. O `with check`
-- impede que a linha mude de dono pelo caminho.
drop policy if exists "notificacoes marcar lida" on public.notificacoes;
create policy "notificacoes marcar lida" on public.notificacoes
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notificacoes apaga propria" on public.notificacoes;
create policy "notificacoes apaga propria" on public.notificacoes
  for delete to authenticated
  using (user_id = auth.uid());

-- Sem política de INSERT: quem cria notificações são as funções abaixo.
create or replace function public.notificar(
  p_user_id  uuid,
  p_tipo     text,
  p_titulo   text,
  p_corpo    text default null,
  p_url      text default null,
  p_idem_key text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notificacoes (user_id, tipo, titulo, corpo, url, idem_key)
  values (p_user_id, p_tipo, p_titulo, p_corpo, p_url, p_idem_key)
  on conflict (idem_key) do nothing;
end;
$fn$;

revoke all on function public.notificar(uuid, text, text, text, text, text) from public;
revoke all on function public.notificar(uuid, text, text, text, text, text) from authenticated;

-- Aviso para toda a gente. Só admin, e só para membros activos — mandar
-- notificações a contas banidas é encher a tabela sem ninguém as ler.
create or replace function public.notificacao_broadcast(
  p_tipo   text,
  p_titulo text,
  p_corpo  text default null,
  p_url    text default null
) returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer;
begin
  if not public.e_admin(auth.uid()) then
    raise exception 'notificacao_broadcast: sem permissão';
  end if;

  insert into public.notificacoes (user_id, tipo, titulo, corpo, url, idem_key)
  select m.id, p_tipo, p_titulo, p_corpo, p_url, null
    from public.membros m
   where coalesce(m.is_banned, false) = false;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

grant execute on function public.notificacao_broadcast(text, text, text, text) to authenticated;

create or replace function public.notificacoes_minhas(p_limite integer default 30)
returns setof public.notificacoes
language sql stable security definer set search_path = public as $fn$
  select *
    from public.notificacoes
   where user_id = auth.uid()
   order by created_at desc
   limit least(coalesce(p_limite, 30), 100);
$fn$;

grant execute on function public.notificacoes_minhas(integer) to authenticated;

create or replace function public.notificacoes_marcar_lidas()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare
  v_n integer;
begin
  update public.notificacoes
     set lida = true
   where user_id = auth.uid() and lida = false;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

grant execute on function public.notificacoes_marcar_lidas() to authenticated;


-- ─── 3. OS AVISOS QUE NASCEM SOZINHOS ──────────────────────────────────────
-- Em vez de redefinir as funções da 009 e da 008 só para lhes acrescentar uma
-- linha, os avisos saem de gatilhos sobre o resultado. A vantagem é que
-- valem para qualquer caminho que venha a mexer nestas tabelas, incluindo os
-- que ainda não existem.

create or replace function public.notificar_missao_completa()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_missao public.missoes%rowtype;
begin
  -- Só na transição. Sem isto, cada update depois de concluída repetia.
  if new.concluida_em is null or old.concluida_em is not null then
    return new;
  end if;

  select * into v_missao from public.missoes where id = new.missao_id;
  if not found then
    return new;
  end if;

  perform public.notificar(
    new.user_id,
    'missao',
    'Missão completa: ' || v_missao.titulo,
    'Vai buscar as ' || v_missao.recompensa || ' EPCoins às Recompensas.',
    '/recompensas',
    'missao:' || new.missao_id::text || ':' || new.periodo_chave || ':' || new.user_id::text
  );
  return new;
end;
$fn$;

drop trigger if exists trg_notificar_missao on public.missao_progresso;
create trigger trg_notificar_missao
  after update on public.missao_progresso
  for each row execute function public.notificar_missao_completa();

create or replace function public.notificar_previsao_resolvida()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.correta is null or old.correta is not null then
    return new;
  end if;

  perform public.notificar(
    new.user_id,
    'previsao',
    case when new.correta then 'Acertaste na previsão' else 'Previsão resolvida' end,
    case when new.correta
         then 'As EPCoins já estão na tua conta.'
         else 'Desta vez não foi. Há mais na Arena.'
    end,
    '/arena',
    'prev:' || new.id::text
  );
  return new;
end;
$fn$;

drop trigger if exists trg_notificar_previsao on public.previsoes;
create trigger trg_notificar_previsao
  after update on public.previsoes
  for each row execute function public.notificar_previsao_resolvida();


-- ─── 4. CANAIS POR CLUBE ───────────────────────────────────────────────────
-- As salas por jogo (005) morrem com o apito final. Estes canais são o
-- contrário: existem sempre, e é onde a conversa vive entre jogos.

create table if not exists public.comunidade_canais (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nome       text not null,
  descricao  text,
  -- Emoji ou par de letras. Fica no cliente como está aqui.
  icone      text,
  cor        text,
  ordem      integer not null default 100,
  requer_vip boolean not null default false,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.comunidade_canais enable row level security;

drop policy if exists "canais leitura" on public.comunidade_canais;
create policy "canais leitura" on public.comunidade_canais
  for select to authenticated
  using (ativo = true);

insert into public.comunidade_canais (slug, nome, descricao, icone, ordem, requer_vip) values
  ('fc-porto',  'FC Porto',   'Tudo o que se passa no Dragão.',              '🔵', 10, false),
  ('benfica',   'Benfica',     'A Luz, jogo a jogo.',                        '🔴', 20, false),
  ('sporting',  'Sporting',    'Alvalade, sem filtros.',                     '🟢', 30, false),
  ('champions', 'Champions',   'As noites europeias.',                       '⭐', 40, false),
  ('nba',       'NBA',         'Madrugadas americanas.',                     '🏀', 50, false)
on conflict (slug) do nothing;

create table if not exists public.comunidade_mensagens (
  id         uuid primary key default gen_random_uuid(),
  canal_id   uuid not null references public.comunidade_canais(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Desnormalizado de propósito, como na 005: o chat lê-se muito mais vezes
  -- do que se escreve, e não vale um join por mensagem.
  username   text not null,
  texto      text not null check (length(btrim(texto)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists comunidade_mensagens_canal_idx
  on public.comunidade_mensagens (canal_id, created_at desc);

alter table public.comunidade_mensagens enable row level security;

drop policy if exists "comunidade le" on public.comunidade_mensagens;
create policy "comunidade le" on public.comunidade_mensagens
  for select to authenticated
  using (
    exists (
      select 1 from public.comunidade_canais c
       where c.id = canal_id
         and c.ativo
         and (c.requer_vip = false or public.e_vip(auth.uid()))
    )
  );

-- Escrever exige três coisas: ser o próprio, poder falar (nem banido nem
-- silenciado) e ter acesso ao canal.
drop policy if exists "comunidade escreve" on public.comunidade_mensagens;
create policy "comunidade escreve" on public.comunidade_mensagens
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.pode_falar(auth.uid())
    and exists (
      select 1 from public.comunidade_canais c
       where c.id = canal_id
         and c.ativo
         and (c.requer_vip = false or public.e_vip(auth.uid()))
    )
  );

drop policy if exists "comunidade apaga" on public.comunidade_mensagens;
create policy "comunidade apaga" on public.comunidade_mensagens
  for delete to authenticated
  using (user_id = auth.uid() or public.e_admin(auth.uid()));

do $do$
begin
  alter publication supabase_realtime add table public.comunidade_mensagens;
exception
  when duplicate_object then null;
end;
$do$;

-- Actividade num canal. Mesma regra das salas — paga-se a primeira mensagem
-- do dia, não cada mensagem — e de propósito com **a mesma chave de
-- idempotência**: escrever na sala de um jogo e num canal de clube no mesmo
-- dia continua a ser um crédito, não dois.
create or replace function public.comunidade_registar_mensagem(p_canal_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_hoje text := to_char((now() at time zone 'Europe/Lisbon')::date, 'YYYY-MM-DD');
begin
  if v_uid is null then
    return;
  end if;

  perform public.missao_registar(v_uid, 'mensagem_sala');
  perform public.epc_creditar(
    v_uid,
    greatest(coalesce(public.epc_valor_regra('mensagem_sala', v_uid), 0), 1),
    'mensagem_sala', p_canal_id::text,
    'Primeira mensagem do dia',
    'msg:' || v_uid::text || ':' || v_hoje
  );
end;
$fn$;

grant execute on function public.comunidade_registar_mensagem(uuid) to authenticated;


-- ─── 5. JACKPOT DE EPCOINS ─────────────────────────────────────────────────

create table if not exists public.jackpots (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null default 'EPC Jackpot',
  estado      text not null default 'aberto' check (estado in ('aberto', 'sorteado', 'cancelado')),
  -- O pote cresce sozinho (ver gatilho abaixo). Este valor é o que o
  -- vencedor recebe.
  pote        integer not null default 0,
  sorteia_em  timestamptz not null,
  vencedor_id uuid references auth.users(id) on delete set null,
  sorteado_em timestamptz,
  created_at  timestamptz not null default now()
);

-- Um jackpot aberto de cada vez. É um índice parcial e não uma constraint
-- porque só a linha aberta é que tem de ser única — as sorteadas acumulam-se.
create unique index if not exists jackpots_um_aberto
  on public.jackpots ((estado)) where estado = 'aberto';

alter table public.jackpots enable row level security;

drop policy if exists "jackpots leitura" on public.jackpots;
create policy "jackpots leitura" on public.jackpots
  for select to authenticated using (true);

create table if not exists public.jackpot_bilhetes (
  jackpot_id uuid not null references public.jackpots(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  bilhetes   integer not null default 0 check (bilhetes >= 0),
  primary key (jackpot_id, user_id)
);

alter table public.jackpot_bilhetes enable row level security;

-- Os bilhetes dos outros vêem-se em agregado (quantos participantes, quantos
-- bilhetes no total) pela função `jackpot_atual`. A linha individual é do
-- dono, como as previsões.
drop policy if exists "bilhetes leitura propria" on public.jackpot_bilhetes;
create policy "bilhetes leitura propria" on public.jackpot_bilhetes
  for select to authenticated using (user_id = auth.uid());

-- O pote alimenta-se da actividade da comunidade: 5% de cada EPCoin ganha
-- vai para lá, e cada crédito dá um bilhete a quem o recebeu. Não há forma de
-- comprar bilhetes — é essa a diferença entre isto e um sorteio pago.
--
-- Os movimentos de motivo 'jackpot' e 'admin' ficam de fora: o prémio não
-- pode voltar a engordar o pote seguinte (era uma bola de neve) e os
-- ajustes manuais não são actividade.
create or replace function public.jackpot_alimentar()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_id   uuid;
  v_taxa integer;
begin
  if new.valor <= 0 or new.motivo in ('jackpot', 'admin') then
    return new;
  end if;

  select id into v_id from public.jackpots
   where estado = 'aberto' and sorteia_em > now()
   limit 1;

  if v_id is null then
    return new;
  end if;

  v_taxa := greatest(1, (new.valor * 5) / 100);

  update public.jackpots set pote = pote + v_taxa where id = v_id;

  insert into public.jackpot_bilhetes (jackpot_id, user_id, bilhetes)
  values (v_id, new.user_id, 1)
  on conflict (jackpot_id, user_id)
    do update set bilhetes = public.jackpot_bilhetes.bilhetes + 1;

  return new;
end;
$fn$;

drop trigger if exists trg_jackpot_alimentar on public.epc_movimentos;
create trigger trg_jackpot_alimentar
  after insert on public.epc_movimentos
  for each row execute function public.jackpot_alimentar();

create or replace function public.jackpot_atual()
returns table (
  id             uuid,
  titulo         text,
  pote           integer,
  sorteia_em     timestamptz,
  meus_bilhetes  integer,
  total_bilhetes integer,
  participantes  integer
)
language sql stable security definer set search_path = public as $fn$
  select j.id,
         j.titulo,
         j.pote,
         j.sorteia_em,
         coalesce((select b.bilhetes from public.jackpot_bilhetes b
                    where b.jackpot_id = j.id and b.user_id = auth.uid()), 0),
         coalesce((select sum(b.bilhetes)::integer from public.jackpot_bilhetes b
                    where b.jackpot_id = j.id), 0),
         coalesce((select count(*)::integer from public.jackpot_bilhetes b
                    where b.jackpot_id = j.id and b.bilhetes > 0), 0)
    from public.jackpots j
   where j.estado = 'aberto'
   order by j.created_at desc
   limit 1;
$fn$;

grant execute on function public.jackpot_atual() to authenticated;

create or replace function public.jackpot_vencedores(p_limite integer default 10)
returns table (id uuid, titulo text, pote integer, sorteado_em timestamptz, vencedor text)
language sql stable security definer set search_path = public as $fn$
  select j.id, j.titulo, j.pote, j.sorteado_em, coalesce(m.username, 'membro')
    from public.jackpots j
    left join public.membros m on m.id = j.vencedor_id
   where j.estado = 'sorteado'
   order by j.sorteado_em desc
   limit least(coalesce(p_limite, 10), 50);
$fn$;

grant execute on function public.jackpot_vencedores(integer) to authenticated;

create or replace function public.jackpot_abrir(
  p_titulo     text,
  p_sorteia_em timestamptz,
  p_pote       integer default 0
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
begin
  if not public.e_admin(auth.uid()) then
    raise exception 'jackpot_abrir: sem permissão';
  end if;
  if p_sorteia_em <= now() then
    raise exception 'jackpot_abrir: a data do sorteio tem de ser no futuro';
  end if;

  insert into public.jackpots (titulo, sorteia_em, pote)
  values (coalesce(nullif(btrim(p_titulo), ''), 'EPC Jackpot'), p_sorteia_em, greatest(coalesce(p_pote, 0), 0))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'jackpot_abrir: já existe um jackpot aberto';
end;
$fn$;

grant execute on function public.jackpot_abrir(text, timestamptz, integer) to authenticated;

-- O sorteio. O bilhete é o peso: quem participou mais tem mais hipóteses,
-- mas ninguém tem a certeza — que é o que faz o mecanismo funcionar.
--
-- A escolha é feita no servidor, sobre a soma acumulada dos bilhetes. Não há
-- versão disto que possa correr no cliente.
create or replace function public.jackpot_sortear(p_jackpot_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_j     public.jackpots%rowtype;
  v_total bigint;
  v_alvo  bigint;
  v_venc  uuid;
begin
  if not public.e_admin(auth.uid()) then
    raise exception 'jackpot_sortear: sem permissão';
  end if;

  select * into v_j from public.jackpots where id = p_jackpot_id for update;
  if not found then
    raise exception 'jackpot_sortear: jackpot não encontrado';
  end if;
  if v_j.estado <> 'aberto' then
    raise exception 'jackpot_sortear: este jackpot já foi sorteado';
  end if;

  select coalesce(sum(bilhetes), 0) into v_total
    from public.jackpot_bilhetes where jackpot_id = p_jackpot_id;

  if v_total = 0 then
    raise exception 'jackpot_sortear: ninguém participou';
  end if;

  v_alvo := floor(random() * v_total) + 1;

  select user_id into v_venc from (
    select user_id,
           sum(bilhetes) over (order by user_id rows between unbounded preceding and current row) as acumulado
      from public.jackpot_bilhetes
     where jackpot_id = p_jackpot_id and bilhetes > 0
  ) t
  where t.acumulado >= v_alvo
  order by t.acumulado
  limit 1;

  update public.jackpots
     set estado = 'sorteado', vencedor_id = v_venc, sorteado_em = now()
   where id = p_jackpot_id;

  perform public.epc_creditar(
    v_venc, v_j.pote, 'jackpot', p_jackpot_id::text,
    'Prémio do ' || v_j.titulo,
    'jackpot:' || p_jackpot_id::text
  );

  perform public.notificar(
    v_venc, 'jackpot',
    'Ganhaste o ' || v_j.titulo,
    v_j.pote || ' EPCoins acabaram de entrar na tua conta.',
    '/recompensas',
    'jackpot-vitoria:' || p_jackpot_id::text
  );

  return v_venc;
end;
$fn$;

grant execute on function public.jackpot_sortear(uuid) to authenticated;
