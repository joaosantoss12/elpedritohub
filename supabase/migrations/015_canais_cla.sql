-- 015 — Os canais passam a ser da comunidade e dos clas.
--
-- A 012 semeou canais por clube (FC Porto, Benfica, Sporting, NBA...). Foi um
-- palpite errado: o Hub nao e um forum de adeptos, e os canais ficaram vazios
-- porque ninguem os pediu. O que existe mesmo no produto sao clas — pessoas
-- que ja se agruparam por vontade propria — e a conversa geral.
--
-- A partir daqui ha exactamente dois tipos de canal:
--   * o geral, aberto a todos os membros;
--   * um canal por cla, visivel so para quem esta la dentro.
--
-- O canal do cla nao se cria a mao: nasce e morre com o cla, por trigger. Um
-- cla sem canal seria um cla mudo, e um canal sem cla seria um fantasma que
-- ninguem consegue apagar.

-- ─── 1. LIGACAO AO CLA ──────────────────────────────────────────────────────

alter table public.comunidade_canais
  add column if not exists cla_id uuid references public.clas(id) on delete cascade;

-- Um cla, um canal. Sem isto um bug no trigger enchia a lista de duplicados.
create unique index if not exists comunidade_canais_cla_idx
  on public.comunidade_canais (cla_id) where cla_id is not null;

-- ─── 2. LIMPEZA DOS CANAIS DE CLUBE ────────────────────────────────────────

-- As mensagens vao atras por cascade. Sao canais semeados que nunca chegaram
-- a ter uso real; nao ha historico que valha a pena preservar.
delete from public.comunidade_canais
 where slug in ('fc-porto', 'benfica', 'sporting', 'champions', 'nba');

-- ─── 3. O CANAL GERAL ──────────────────────────────────────────────────────

insert into public.comunidade_canais (slug, nome, descricao, icone, ordem, requer_vip)
values ('geral', 'Geral', 'A conversa do Hub. Toda a gente entra.', '💬', 0, false)
on conflict (slug) do update
   set nome = excluded.nome,
       descricao = excluded.descricao,
       icone = excluded.icone,
       ordem = excluded.ordem,
       ativo = true;

-- ─── 4. UM CANAL POR CLA, AUTOMATICO ───────────────────────────────────────

create or replace function public.cla_sincronizar_canal()
returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.comunidade_canais (slug, nome, descricao, icone, ordem, cla_id)
    values (
      'cla-' || new.id::text,
      new.nome,
      coalesce(new.descricao, 'O canal privado do cla ' || new.nome || '.'),
      '🛡️',
      100,
      new.id
    )
    on conflict (slug) do nothing;

  elsif tg_op = 'UPDATE' then
    -- O canal segue o nome do cla: se o dono renomeia, a lista nao fica a
    -- mostrar o nome antigo.
    update public.comunidade_canais
       set nome = new.nome,
           descricao = coalesce(new.descricao, descricao)
     where cla_id = new.id;
  end if;

  return new;
end;
$fn$;

drop trigger if exists clas_canal_sync on public.clas;
create trigger clas_canal_sync
  after insert or update of nome, descricao on public.clas
  for each row execute function public.cla_sincronizar_canal();

-- Os clas que ja existiam antes desta migracao tambem levam canal.
insert into public.comunidade_canais (slug, nome, descricao, icone, ordem, cla_id)
select 'cla-' || c.id::text,
       c.nome,
       coalesce(c.descricao, 'O canal privado do cla ' || c.nome || '.'),
       '🛡️',
       100,
       c.id
  from public.clas c
 where not exists (select 1 from public.comunidade_canais k where k.cla_id = c.id)
on conflict (slug) do nothing;

-- ─── 5. QUEM VE O QUE ──────────────────────────────────────────────────────

-- Predicado unico, para as tres politicas nao poderem divergir entre si.
create or replace function public.pode_ver_canal(p_canal_id uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
      from public.comunidade_canais c
     where c.id = p_canal_id
       and c.ativo
       and (c.requer_vip = false or public.e_vip(p_user))
       and (
         c.cla_id is null
         -- Um canal de cla e privado: so entra quem esta la dentro. E a razao
         -- de o cla poder falar de estrategia sem ser lido pelo Hub inteiro.
         or exists (
           select 1 from public.cla_membros m
            where m.cla_id = c.cla_id and m.user_id = p_user
         )
       )
  );
$fn$;

grant execute on function public.pode_ver_canal(uuid, uuid) to authenticated;

-- A lista de canais deixa de mostrar canais de clas alheios.
drop policy if exists "canais leitura" on public.comunidade_canais;
create policy "canais leitura" on public.comunidade_canais
  for select to authenticated
  using (
    ativo = true
    and (
      cla_id is null
      or exists (
        select 1 from public.cla_membros m
         where m.cla_id = comunidade_canais.cla_id and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists "comunidade le" on public.comunidade_mensagens;
create policy "comunidade le" on public.comunidade_mensagens
  for select to authenticated
  using (public.pode_ver_canal(canal_id, auth.uid()));

drop policy if exists "comunidade escreve" on public.comunidade_mensagens;
create policy "comunidade escreve" on public.comunidade_mensagens
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.pode_falar(auth.uid())
    and public.pode_ver_canal(canal_id, auth.uid())
  );
