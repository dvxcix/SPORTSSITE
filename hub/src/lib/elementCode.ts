import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Unambiguous alphabet — no 0/O or 1/I/L, since these codes get read aloud,
// typed by hand, and pasted between members. Not a security token (nothing
// sensitive is gated behind guessing one), so a small modulo bias from a
// non-power-of-2 alphabet length is an acceptable tradeoff for readability.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomSegment(len: number): string {
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export function generateElementCode(): string {
  return `EL-${randomSegment(4)}-${randomSegment(4)}`
}

// No existing short-code generator anywhere in this codebase (confirmed —
// watchlist/custom-emoji codes are all user-typed, not generated) — this is
// the first, so it has to actually guarantee uniqueness rather than just
// hope the code space (31^8 ≈ 8.5e11) is big enough. Retries with a fresh
// code on a real Postgres unique-violation (23505) instead of trusting
// randomness alone, which is the only way "10,000+ Element Codes, none ever
// collide" holds at real scale.
export async function insertWithUniqueElementCode<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  table: string,
  buildRow: (elementCode: string) => T,
  maxAttempts = 5
): Promise<{ data: Record<string, unknown>; error: null } | { data: null; error: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const elementCode = generateElementCode()
    const { data, error } = await admin.from(table).insert(buildRow(elementCode)).select().single()
    if (!error) return { data, error: null }
    if (error.code !== '23505') return { data: null, error: error.message }
    // 23505 on the element_code unique constraint specifically — regenerate
    // and retry. A collision on any other unique constraint would also come
    // back as 23505, but this table only has the one, so no need to inspect
    // error.details to disambiguate.
  }
  return { data: null, error: 'Could not generate a unique Element Code after several attempts — please try again.' }
}
