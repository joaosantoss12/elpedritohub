-- ═══════════════════════════════════════════════════════════════════════════
-- EPC PERSONAL DESK — Fusão do Hub com o conceito
-- Executar no SQL Editor do Supabase antes de fazer deploy do frontend.
-- Idempotente: pode ser corrido mais do que uma vez sem estragar dados.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. RAIO-X EPC — histórico auditado de tips por vertical
--    Alimenta a Home (substitui os 0,00€) e o Passaporte do Expert.
--    Preenchido no Admin › Raio-X. Modelo desenhado para, mais tarde,
--    receber sync automático do Telegram sem alterar o schema.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.raiox_tips (
  id             uuid primary key default gen_random_uuid(),

  -- Origem (auditoria: hora + odd + resultado, sem edição posterior)
  vertical       text not null default 'futebol',   -- futebol | tenis | escadinha | footmillion
  canal          text not null default 'publico',   -- publico | vip
  publicado_em   timestamptz not null default now(),

  -- Conteúdo do boletim
  evento         text not null,                     -- "Benfica vs Porto"
  competicao     text,                              -- "Liga Portugal"
  pick           text not null,                     -- "Over 2.5 golos"
  odd            numeric(6,2) not null check (odd >= 1),
  stake          numeric(5,2) not null default 1 check (stake > 0),  -- unidades

  -- Resultado (nulo enquanto pendente)
  resultado      text not null default 'pendente'
                 check (resultado in ('pendente', 'green', 'red', 'void')),
  resolvido_em   timestamptz,

  -- Rastreio de origem, para a futura integração Telegram
  telegram_channel_id text,
  telegram_message_id bigint,

  created_at     timestamptz not null default now()
);

create index if not exists raiox_tips_publicado_idx  on public.raiox_tips (publicado_em desc);
create index if not exists raiox_tips_vertical_idx   on public.raiox_tips (vertical, publicado_em desc);
create index if not exists raiox_tips_resultado_idx  on public.raiox_tips (resultado);

-- Evita duplicados quando o sync do Telegram entrar
create unique index if not exists raiox_tips_telegram_uniq
  on public.raiox_tips (telegram_channel_id, telegram_message_id)
  where telegram_message_id is not null;

-- Carimba resolvido_em automaticamente quando sai de pendente
create or replace function public.raiox_touch_resolvido()
returns trigger language plpgsql as $$
begin
  if new.resultado <> 'pendente' and old.resultado = 'pendente' then
    new.resolvido_em := now();
  elsif new.resultado = 'pendente' then
    new.resolvido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists raiox_tips_resolvido on public.raiox_tips;
create trigger raiox_tips_resolvido
  before update on public.raiox_tips
  for each row execute function public.raiox_touch_resolvido();

alter table public.raiox_tips enable row level security;

-- Leitura pública: é prova social, tem de ser visível antes do login.
drop policy if exists "raiox leitura publica" on public.raiox_tips;
create policy "raiox leitura publica"
  on public.raiox_tips for select
  using (true);

-- Escrita apenas para administradores.
drop policy if exists "raiox escrita admin" on public.raiox_tips;
create policy "raiox escrita admin"
  on public.raiox_tips for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  )
  with check (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 2. PASSAPORTE DO MEMBRO — perfil de risco e saldo do simulador
-- ───────────────────────────────────────────────────────────────────────────

alter table public.membros
  add column if not exists perfil_risco text default 'equilibrado'
    check (perfil_risco in ('conservador', 'equilibrado', 'agressivo')),
  add column if not exists vertical_preferida text,
  add column if not exists saldo_simulador numeric(12,2) not null default 1000,
  add column if not exists passaporte_criado_em timestamptz default now();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. SIMULADOR DE BANCA — substitui o Casino
--    Apostas em papel com moedas EPC. Sem jogo de casa: o resultado vem
--    sempre de um evento real resolvido por um admin, nunca de RNG.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.simulador_apostas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  tipo          text not null default 'simples' check (tipo in ('simples', 'multipla')),
  selecoes      jsonb not null,          -- [{ evento, pick, odd, vertical, raiox_tip_id }]
  odd_total     numeric(10,2) not null check (odd_total >= 1),
  stake         numeric(12,2) not null check (stake > 0),

  estado        text not null default 'pendente'
                check (estado in ('pendente', 'ganha', 'perdida', 'anulada')),
  retorno       numeric(12,2) not null default 0,

  created_at    timestamptz not null default now(),
  resolvido_em  timestamptz
);

create index if not exists simulador_user_idx on public.simulador_apostas (user_id, created_at desc);
create index if not exists simulador_estado_idx on public.simulador_apostas (estado);

alter table public.simulador_apostas enable row level security;

drop policy if exists "simulador le proprias" on public.simulador_apostas;
create policy "simulador le proprias"
  on public.simulador_apostas for select
  using (auth.uid() = user_id);

drop policy if exists "simulador cria proprias" on public.simulador_apostas;
create policy "simulador cria proprias"
  on public.simulador_apostas for insert
  with check (auth.uid() = user_id);

drop policy if exists "simulador admin total" on public.simulador_apostas;
create policy "simulador admin total"
  on public.simulador_apostas for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );

-- Colocar aposta: desconta o stake do saldo de forma atómica.
-- Evita que o cliente escreva o saldo diretamente.
create or replace function public.simulador_colocar_aposta(
  p_tipo      text,
  p_selecoes  jsonb,
  p_odd_total numeric,
  p_stake     numeric
) returns public.simulador_apostas
language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric;
  v_row   public.simulador_apostas;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida';
  end if;
  if p_stake <= 0 then
    raise exception 'Stake tem de ser positivo';
  end if;

  select saldo_simulador into v_saldo
    from public.membros where id = auth.uid() for update;

  if v_saldo is null then
    raise exception 'Membro não encontrado';
  end if;
  if v_saldo < p_stake then
    raise exception 'Saldo insuficiente';
  end if;

  update public.membros
     set saldo_simulador = saldo_simulador - p_stake
   where id = auth.uid();

  insert into public.simulador_apostas (user_id, tipo, selecoes, odd_total, stake)
  values (auth.uid(), p_tipo, p_selecoes, p_odd_total, p_stake)
  returning * into v_row;

  return v_row;
end;
$$;

-- Resolver aposta: credita o retorno e marca o estado.
-- Chamada pelo job de resolução / admin, nunca pelo membro.
create or replace function public.simulador_resolver_aposta(
  p_aposta_id uuid,
  p_estado    text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row     public.simulador_apostas;
  v_retorno numeric := 0;
begin
  if not exists (
    select 1 from public.membros
     where id = auth.uid() and 'Administrador' = any (badges)
  ) then
    raise exception 'Apenas administradores podem resolver apostas';
  end if;

  select * into v_row from public.simulador_apostas
   where id = p_aposta_id for update;

  if v_row is null then raise exception 'Aposta não encontrada'; end if;
  if v_row.estado <> 'pendente' then raise exception 'Aposta já resolvida'; end if;

  if p_estado = 'ganha' then
    v_retorno := round(v_row.stake * v_row.odd_total, 2);
  elsif p_estado = 'anulada' then
    v_retorno := v_row.stake;                 -- devolve o stake
  elsif p_estado <> 'perdida' then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  update public.simulador_apostas
     set estado = p_estado, retorno = v_retorno, resolvido_em = now()
   where id = p_aposta_id;

  if v_retorno > 0 then
    update public.membros
       set saldo_simulador = saldo_simulador + v_retorno
     where id = v_row.user_id;
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. SALA DE COMANDO — link direto para o canal TV live do Telegram
-- ───────────────────────────────────────────────────────────────────────────

alter table public.livestream_config
  add column if not exists telegram_tv_url text,
  add column if not exists telegram_chat_url text;
