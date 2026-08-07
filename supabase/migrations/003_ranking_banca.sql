-- ───────────────────────────────────────────────────────────────────────────
-- 003 · RANKING MENSAL DE BANCA COM PRÉMIO  (roadmap 10)
--
-- Correr no SQL Editor do Supabase depois da 001 e da 002.
--
-- Duas decisões que condicionam tudo o que está aqui:
--
-- 1. Ordena-se por ROI, nunca por lucro absoluto. Um ranking por euros
--    ganhos premeia quem aposta mais alto, que é exatamente o comportamento
--    que uma comunidade de tips não deve incentivar. ROI premeia quem
--    escolhe melhor, independentemente do tamanho da banca.
--
-- 2. A tabela banca_apostas é privada e continua privada. O ranking sai de
--    uma função security definer que devolve apenas agregados — nunca uma
--    aposta individual, nunca um valor em euros. O que se mostra é a taxa,
--    a contagem e o lucro em unidades.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. OPT-OUT ────────────────────────────────────────────────────────────
-- O ranking mostra só username e percentagens, mas a performance de aposta
-- de alguém é dele. Quem não quiser aparecer, sai sem perder o resto do Hub.

alter table public.membros
  add column if not exists ranking_oculto boolean not null default false;


-- ─── 2. CONFIGURAÇÃO E PRÉMIO ──────────────────────────────────────────────

create table if not exists public.ranking_config (
  id                integer primary key default 1 check (id = 1),
  ativo             boolean not null default true,

  premio_titulo     text,
  premio_descricao  text,

  -- Sem mínimo, ganha sempre quem fez uma aposta a 3.00 e acertou. O mínimo
  -- é o que separa um ranking de um sorteio.
  min_apostas       integer not null default 10 check (min_apostas >= 1),
  -- Quantos lugares o Hub mostra. Não é o mesmo que quantos premeia.
  lugares           integer not null default 20 check (lugares between 3 and 100),

  regras            text,
  atualizado_em     timestamptz not null default now()
);

insert into public.ranking_config (id, premio_titulo, premio_descricao, regras)
values (
  1,
  'Prémio do mês',
  'Define o prémio em Admin › Ranking antes de divulgar a competição.',
  'Ordena por ROI do mês. Conta apenas apostas já resolvidas. É preciso um mínimo de apostas resolvidas para entrar na tabela. Empates desempatam pelo maior número de apostas resolvidas.'
)
on conflict (id) do nothing;

alter table public.ranking_config enable row level security;

drop policy if exists "ranking config leitura" on public.ranking_config;
create policy "ranking config leitura"
  on public.ranking_config for select
  using (true);

drop policy if exists "ranking config escrita admin" on public.ranking_config;
create policy "ranking config escrita admin"
  on public.ranking_config for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );


-- ─── 3. HISTÓRICO DE VENCEDORES ────────────────────────────────────────────
-- O mês fecha e os números continuam a mexer se alguém resolver uma aposta
-- atrasada. Guardar o vencedor congela o resultado no momento em que foi
-- anunciado — a alternativa é o quadro de honra mudar sozinho.

create table if not exists public.ranking_vencedores (
  id            uuid primary key default gen_random_uuid(),
  -- Sempre o dia 1 do mês em causa.
  mes           date not null,
  posicao       integer not null default 1 check (posicao >= 1),

  user_id       uuid references auth.users(id) on delete set null,
  username      text not null,          -- congelado: o membro pode mudá-lo depois

  roi           numeric(8,2),
  lucro_unidades numeric(10,2),
  apostas       integer,

  premio        text,
  entregue      boolean not null default false,
  nota          text,
  created_at    timestamptz not null default now(),

  unique (mes, posicao)
);

create index if not exists ranking_vencedores_mes_idx
  on public.ranking_vencedores (mes desc, posicao);

alter table public.ranking_vencedores enable row level security;

drop policy if exists "vencedores leitura" on public.ranking_vencedores;
create policy "vencedores leitura"
  on public.ranking_vencedores for select
  using (true);

drop policy if exists "vencedores escrita admin" on public.ranking_vencedores;
create policy "vencedores escrita admin"
  on public.ranking_vencedores for all
  using (
    exists (
      select 1 from public.membros m
      where m.id = auth.uid() and 'Administrador' = any (m.badges)
    )
  );


-- ─── 4. O RANKING ──────────────────────────────────────────────────────────
-- security definer porque tem de ler banca_apostas de toda a gente. O que
-- sai daqui é só agregado: nenhuma linha desta função permite reconstruir
-- uma aposta de outro membro nem saber quanto dinheiro ele tem.

create or replace function public.ranking_banca_mensal(p_mes date default null)
returns table (
  posicao        bigint,
  user_id        uuid,
  username       text,
  roi            numeric,
  lucro_unidades numeric,
  apostas        integer,
  ganhas         integer,
  taxa_acerto    numeric
)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select min_apostas, lugares from public.ranking_config where id = 1
  ),
  janela as (
    select date_trunc('month', coalesce(p_mes, current_date))::date as inicio
  ),
  resolvidas as (
    select
      a.user_id,
      a.valor_apostado,
      case
        when a.estado = 'ganha'   then a.odd * a.valor_apostado - a.valor_apostado
        when a.estado = 'perdida' then -a.valor_apostado
      end as lucro,
      (a.estado = 'ganha')::int as ganha
    from public.banca_apostas a, janela j
    where a.estado in ('ganha', 'perdida')
      and a.data_aposta >= j.inicio
      and a.data_aposta <  (j.inicio + interval '1 month')
      and a.valor_apostado > 0
  ),
  agregado as (
    select
      r.user_id,
      count(*)::int                             as apostas,
      sum(r.ganha)::int                         as ganhas,
      sum(r.lucro)                              as lucro_eur,
      sum(r.valor_apostado)                     as apostado_eur,
      -- Unidade = stake médio do próprio membro. Torna o lucro comparável
      -- entre bancas de tamanhos diferentes sem expor valores em euros.
      sum(r.lucro) / nullif(avg(r.valor_apostado), 0) as lucro_unidades
    from resolvidas r
    group by r.user_id
  ),
  elegiveis as (
    select
      g.user_id,
      m.username,
      round(g.lucro_eur / nullif(g.apostado_eur, 0) * 100, 2) as roi,
      round(g.lucro_unidades, 2)                              as lucro_unidades,
      g.apostas,
      g.ganhas,
      round(g.ganhas::numeric / nullif(g.apostas, 0) * 100, 2) as taxa_acerto
    from agregado g
    join public.membros m on m.id = g.user_id
    cross join cfg
    where coalesce(m.ranking_oculto, false) = false
      and g.apostas >= cfg.min_apostas
  )
  select
    row_number() over (order by e.roi desc nulls last, e.apostas desc, e.username) as posicao,
    e.user_id, e.username, e.roi, e.lucro_unidades, e.apostas, e.ganhas, e.taxa_acerto
  from elegiveis e
  cross join cfg
  order by posicao
  limit (select lugares from cfg);
$$;

revoke all on function public.ranking_banca_mensal(date) from public;
grant execute on function public.ranking_banca_mensal(date) to authenticated;


-- ─── 5. FECHAR O MÊS ───────────────────────────────────────────────────────
-- Corre o ranking e grava as posições em ranking_vencedores. Admin-only.
-- Idempotente: voltar a correr o mesmo mês reescreve o pódio gravado.

create or replace function public.ranking_fechar_mes(
  p_mes      date,
  p_posicoes integer default 3,
  p_premio   text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_mes   date := date_trunc('month', p_mes)::date;
  v_total integer := 0;
begin
  if not exists (
    select 1 from public.membros
     where id = auth.uid() and 'Administrador' = any (badges)
  ) then
    raise exception 'Apenas administradores podem fechar o mês';
  end if;

  -- Não apaga as marcações de entregue de meses anteriores, só deste.
  delete from public.ranking_vencedores where mes = v_mes;

  insert into public.ranking_vencedores
    (mes, posicao, user_id, username, roi, lucro_unidades, apostas, premio)
  select v_mes, r.posicao, r.user_id, r.username, r.roi, r.lucro_unidades, r.apostas, p_premio
  from public.ranking_banca_mensal(v_mes) r
  where r.posicao <= p_posicoes;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.ranking_fechar_mes(date, integer, text) from public;
grant execute on function public.ranking_fechar_mes(date, integer, text) to authenticated;
