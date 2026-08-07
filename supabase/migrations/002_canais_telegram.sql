-- ═══════════════════════════════════════════════════════════════════════════
-- CANAIS DE TELEGRAM — verificação de marca e prova de alcance
-- Plano de Evolução v2 · pontos 1, 5 e 9 do roadmap.
-- Executar no SQL Editor do Supabase depois da 001. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- Uma só tabela serve os três pontos:
--   · ponto 9 — lista pública e verificável dos canais oficiais, e dos perfis
--     falsos já identificados (tipo = 'falso'). É a defesa contra as contas
--     que pedem pagamento por mensagem privada.
--   · ponto 5 — subscritores (alcance) + taxa de visualização (fidelidade),
--     os dois sinais que o Raio-X tem de combinar.
--   · ponto 1 — cadência declarada por canal. Um canal irregular assume-se
--     irregular; esconder o hiato é que gasta confiança.

create table if not exists public.telegram_canais (
  id             uuid primary key default gen_random_uuid(),

  nome           text not null,
  handle         text unique,                -- sem '@'; nulo enquanto não confirmado
  url            text,

  tipo           text not null default 'oficial'
                 check (tipo in ('oficial', 'contacto', 'falso')),
  vertical       text,                       -- futebol | tenis | escadinha | footmillion
  acesso         text not null default 'gratuito'
                 check (acesso in ('gratuito', 'vip', 'contacto')),

  -- Ponto 5 · alcance e fidelidade
  subscritores   integer,
  engagement_min numeric(6,2),               -- taxa de visualização, em %
  engagement_max numeric(6,2),

  -- Ponto 1 · cadência honesta
  cadencia         text,
  cadencia_estavel boolean not null default true,

  nota           text,
  ordem          integer not null default 0,
  ativo          boolean not null default true,

  -- Os números são uma fotografia, não um live feed. Datar evita passar por
  -- atual um valor recolhido há três meses.
  recolhido_em   date,
  atualizado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists telegram_canais_tipo_idx on public.telegram_canais (tipo, ordem);

create or replace function public.telegram_canais_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists telegram_canais_touch on public.telegram_canais;
create trigger telegram_canais_touch
  before update on public.telegram_canais
  for each row execute function public.telegram_canais_touch();

alter table public.telegram_canais enable row level security;

-- Leitura pública e obrigatória: um visitante que ainda não tem conta é
-- exatamente quem mais precisa de saber quais são os canais legítimos.
drop policy if exists "canais leitura publica" on public.telegram_canais;
create policy "canais leitura publica"
  on public.telegram_canais for select
  using (true);

drop policy if exists "canais escrita admin" on public.telegram_canais;
create policy "canais escrita admin"
  on public.telegram_canais for all
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
-- SEED — dados recolhidos a 6 de agosto de 2026 (secção 02 do documento).
--
-- ATENÇÃO: os handles dos quatro canais oficiais ficam a NULL de propósito.
-- O documento nomeia os canais e nomeia contactos oficiais (elpedrito01,
-- elpedritooo, elpedritoren), mas não diz qual handle pertence a qual canal.
-- Numa página anti-fraude, um handle inventado é pior do que handle nenhum:
-- preencher em Admin › Canais antes de divulgar a página.
-- ───────────────────────────────────────────────────────────────────────────

insert into public.telegram_canais
  (nome, handle, url, tipo, vertical, acesso, subscritores,
   engagement_min, engagement_max, cadencia, cadencia_estavel, nota, ordem, recolhido_em)
values
  ('EL PEDRITO EPC', null, null, 'oficial', 'futebol', 'gratuito', 51459,
   2, 6, 'Diária, várias vezes por dia', true,
   'Canal principal. Boletins com odd, valor e resultado — a base do Raio-X.', 1, '2026-08-06'),

  ('EL PEDRITO TÉNIS', null, null, 'oficial', 'tenis', 'gratuito', 7182,
   17, 38, 'Dependente do calendário', true,
   'As pausas acompanham o calendário do circuito e são comunicadas.', 2, '2026-08-06'),

  ('ESCADINHA DO PEDRITO', null, null, 'oficial', 'escadinha', 'gratuito', 2113,
   25, 35, 'Irregular, hiatos de 7 a 10 dias', false,
   'Não é diária. Assumido publicamente em vez de prometido e falhado.', 3, '2026-08-06'),

  ('FOOTMILLION VIP', null, null, 'oficial', 'footmillion', 'vip', 832,
   100, 100, 'Intensa, inclui madrugada', true,
   'Incluído na subscrição do Hub. Os resultados do VIP não se partilham nos grupos grátis.', 4, '2026-08-06')
on conflict (handle) do nothing;

-- Contactos oficiais nomeados no documento. Qualquer contacto privado que não
-- seja um destes deve ser tratado como tentativa de fraude.
insert into public.telegram_canais (nome, handle, url, tipo, acesso, nota, ordem)
values
  ('Contacto oficial', 'elpedrito01',  'https://t.me/elpedrito01',  'contacto', 'contacto', null, 10),
  ('Contacto oficial', 'elpedritooo',  'https://t.me/elpedritooo',  'contacto', 'contacto', null, 11),
  ('Contacto oficial', 'elpedritoren', 'https://t.me/elpedritoren', 'contacto', 'contacto', null, 12)
on conflict (handle) do nothing;

-- Perfis falsos identificados e verificados (secção 04 do documento).
insert into public.telegram_canais
  (nome, handle, url, tipo, acesso, subscritores, nota, ordem, recolhido_em)
values
  ('EL PEDRITO TIPS EPC', 'greenplacard2154', 'https://t.me/greenplacard2154',
   'falso', 'contacto', 1517,
   'Pede mensagem privada para "entrar no grupo VIP". Ativo diariamente.', 20, '2026-08-06'),

  ('EL PEDRITO EFC (Ténis)', 'elpedritotips1', 'https://t.me/elpedritotips1',
   'falso', 'contacto', 424,
   'Já denunciado publicamente pelo canal oficial a 4 de junho. Continua ativo.', 21, '2026-08-06')
on conflict (handle) do nothing;
