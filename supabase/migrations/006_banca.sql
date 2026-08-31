-- ───────────────────────────────────────────────────────────────────────────
-- 006 · BANCA PESSOAL — tabela auditada + definições de banca inicial
--
-- Correr no SQL Editor do Supabase depois da 003.
--
-- A tabela banca_apostas já existia (foi criada à mão durante o
-- desenvolvimento). Este ficheiro torna o esquema reproduzível: (re)cria a
-- tabela com `if not exists`, garante as políticas RLS e adiciona
-- `banca_settings`, onde cada membro guarda a banca inicial usada como base
-- da evolução nos gráficos (drill-down all/ano/mês/dia da página Gestão de
-- Banca). Não mexe em dados existentes.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. APOSTAS PESSOAIS ───────────────────────────────────────────────────

create table if not exists public.banca_apostas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  tipo           text not null default 'simples' check (tipo in ('simples', 'multipla')),
  desporto       text not null default 'Futebol',
  equipa_casa    text not null default '',
  equipa_fora    text not null default '',
  mercado        text not null default '',
  odd            numeric(8,2) not null check (odd >= 1),
  valor_apostado numeric(12,2) not null check (valor_apostado >= 0),
  estado         text not null default 'pendente' check (estado in ('pendente', 'ganha', 'perdida')),
  data_aposta    date not null default current_date,

  -- Só preenchido em apostas múltiplas: array de seleções
  -- [{ desporto, equipa_casa, equipa_fora, mercado, odd }].
  selecoes       jsonb,

  created_at     timestamptz not null default now()
);

create index if not exists banca_apostas_user_data_idx
  on public.banca_apostas (user_id, data_aposta);

alter table public.banca_apostas enable row level security;

drop policy if exists "banca apostas do próprio membro" on public.banca_apostas;
create policy "banca apostas do próprio membro"
  on public.banca_apostas for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─── 2. BANCA INICIAL POR MEMBRO ───────────────────────────────────────────
-- Antes vivia no localStorage do browser, o que perdia o valor entre
-- dispositivos. Passa a ser uma linha por membro. Não confundir com
-- membros.saldo_simulador, que é do Simulador e continua separado.

create table if not exists public.banca_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  starting_bankroll numeric(12,2) not null default 0 check (starting_bankroll >= 0),
  currency          text not null default 'EUR',
  updated_at        timestamptz not null default now()
);

alter table public.banca_settings enable row level security;

drop policy if exists "banca settings do próprio membro" on public.banca_settings;
create policy "banca settings do próprio membro"
  on public.banca_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
