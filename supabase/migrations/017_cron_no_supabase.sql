-- 017 — O agendador muda-se para dentro do Supabase.
--
-- Os crons estavam no vercel.json. No plano Hobby da Vercel isso nao serve:
-- sao no maximo dois e so correm uma vez por dia, e um placar ao vivo que se
-- actualiza uma vez por dia nao e um placar ao vivo.
--
-- O pg_cron corre dentro da base de dados, sem esse limite. Continua a ser a
-- funcao da Vercel a fazer o trabalho — e la que esta o codigo que fala com a
-- ESPN, ja escrito e testado — mas quem carrega no botao passa a ser o
-- Postgres, de dois em dois minutos.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ─── 1. ONDE VIVEM OS SEGREDOS ─────────────────────────────────────────────

-- Schema proprio, de proposito: o `public` esta exposto pelo PostgREST, e o
-- CRON_SECRET numa tabela do `public` seria um segredo a um GET de distancia.
-- O `privado` nunca e servido pela API.
create schema if not exists privado;

revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.config (
  chave text primary key,
  valor text not null
);

alter table privado.config enable row level security;
-- Sem politicas nenhumas: so o superuser e as funcoes security definer leem.

-- ─── 2. O DISPARO ──────────────────────────────────────────────────────────

-- Um so ponto de saida para os dois crons. Se o URL ainda nao estiver
-- configurado, nao faz nada e nao rebenta — o agendamento pode existir antes
-- de o site ter dominio.
create or replace function privado.chamar_api(p_caminho text)
returns void
language plpgsql security definer set search_path = privado, extensions, public as $fn$
declare
  v_base    text;
  v_segredo text;
begin
  select valor into v_base    from privado.config where chave = 'site_url';
  select valor into v_segredo from privado.config where chave = 'cron_secret';

  if v_base is null or btrim(v_base) = '' then
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_base, '/') || p_caminho,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_segredo, '')
    ),
    body    := '{}'::jsonb,
    -- Generoso de proposito: a varredura das ~140 competicoes demora alguns
    -- segundos, e um timeout curto matava-a a meio de cada vez.
    timeout_milliseconds := 55000
  );
end;
$fn$;

-- ─── 3. LIGAR E DESLIGAR ───────────────────────────────────────────────────

-- Chamada uma vez, com o dominio do site. Fica aqui em vez de os valores
-- estarem escritos na migracao porque o CRON_SECRET nao pode ir para o git.
create or replace function privado.cron_configurar(p_site_url text, p_cron_secret text)
returns void
language plpgsql security definer set search_path = privado, extensions, public as $fn$
begin
  insert into privado.config (chave, valor) values ('site_url', p_site_url)
    on conflict (chave) do update set valor = excluded.valor;
  insert into privado.config (chave, valor) values ('cron_secret', coalesce(p_cron_secret, ''))
    on conflict (chave) do update set valor = excluded.valor;

  -- Desagendar antes de agendar: correr esta funcao duas vezes nao pode
  -- deixar dois jobs a varrer a ESPN em paralelo.
  perform cron.unschedule(jobid) from cron.job
   where jobname in ('placar_refresh', 'batalha_resolver');

  perform cron.schedule(
    'placar_refresh', '*/2 * * * *',
    $sql$select privado.chamar_api('/api/placar/refresh')$sql$
  );

  -- A resolucao dos boletins nao precisa de mais do que de hora a hora: um
  -- jogo demora noventa minutos e o ranking do dia fecha ao fim do dia.
  perform cron.schedule(
    'batalha_resolver', '20 * * * *',
    $sql$select privado.chamar_api('/api/batalha/resolver')$sql$
  );
end;
$fn$;
