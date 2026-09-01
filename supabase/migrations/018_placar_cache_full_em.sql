-- 018 — A cache do placar passa a saber quando foi a ultima varredura completa.
--
-- Varrer as ~140 ligas de 2 em 2 minutos e desperdicio: a esta hora da noite
-- a maior parte nao tem jogo nenhum. A partir daqui a funcao decide sozinha:
--   * de meia em meia hora faz a varredura completa (descobre jogos novos);
--   * nas outras corridas toca so nas ligas "quentes" — as que tem jogo a
--     decorrer ou prestes a comecar — e junta o resultado ao que ja estava.
--
-- `full_em` e o carimbo da ultima varredura completa. `atualizado_em` continua
-- a mudar a cada corrida, por isso nao servia para isto.

alter table public.placar_cache
  add column if not exists full_em timestamptz;
