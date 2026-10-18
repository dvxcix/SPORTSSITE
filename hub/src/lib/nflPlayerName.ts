/** Name fallback only: retain team/ID checks at every join to avoid collisions. */
export function normalizeNflPlayerName(value: string | null | undefined) {
  const normalized = String(value ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
  return ({ hollywoodbrown: 'marquisebrown', cambynum: 'camrynbynum' } as Record<string, string>)[normalized] ?? normalized
}
