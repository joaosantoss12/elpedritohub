// Thin PostgREST helpers for the Telegram VIP tables (subscriptions,
// invite_links, legacy_members). Ported from FOOTMILLION LP (src/lib/supabase.ts).
//
// These tables may live in a DIFFERENT Supabase project than `membros` (the
// GESTAO VIP TELEGRAM BOT project). Set TG_SUPABASE_URL / TG_SUPABASE_KEY to
// point at it; otherwise we fall back to the same project used by the other
// api/ functions (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).

const SUPABASE_URL = process.env.TG_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.TG_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function headers(extra?: Record<string, string>) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

export async function supabaseSelect<T>(
  table: string,
  params: Record<string, string>
): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Supabase select ${table} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T[]>;
}

export async function supabaseInsert<T>(
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert ${table} failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as T[];
  return rows[0];
}

export async function supabaseUpdate(
  table: string,
  match: Record<string, string>,
  patch: Record<string, unknown>
): Promise<void> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(match)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Supabase update ${table} failed: ${res.status} ${await res.text()}`);
  }
}
