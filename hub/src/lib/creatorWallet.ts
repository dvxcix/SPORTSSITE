/** Safe, display-only financial data. Never serialize the provider's ledger/KYC object. */
export type CreatorBalance = { currency: string; available: number; pending: number; reserved: number }
export type CreatorPayout = { id: string; amount: string; net: string | null; fee: string | null; markup: string | null; feePaidBy: string | null; currency: string; status: string; createdAt: string; arrival: string | null }
export type CreatorWallet = { balances: CreatorBalance[] | null; payouts: CreatorPayout[] | null; nextCursor: string | null; checkedAt: string; canPayout: boolean; state: string; balanceError: boolean; historyError: boolean }
export type CreatorWalletSession = { accountId: string; token: string; expiresAt: string; intent: 'withdraw' | 'verification' }
export type CreatorRevenueEvent = { id: string; event_type: string; created_at: string; amount: number | null; currency: string | null; status: string | null }

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const currencyCode = (value: unknown) => typeof value === 'string' && /^[a-z]{3}$/.test(value) ? value : null
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
const decimal = (value: unknown) => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) <= Number.MAX_SAFE_INTEGER ? value : null

export function walletBalances(value: unknown, accountId: string): CreatorBalance[] {
  const ledger = record(value)
  if (record(ledger.owner).id !== accountId || !Array.isArray(ledger.balances)) throw new Error('Invalid creator ledger')
  const currencies = new Set<string>()
  return ledger.balances.map((entry: unknown) => {
    const row = record(entry), currency = currencyCode(row.currency)
    if (!currency || currencies.has(currency) || ![row.balance, row.pending_balance, row.reserve_balance].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER)) throw new Error('Invalid ledger balance')
    currencies.add(currency)
    return { currency, available: row.balance as number, pending: row.pending_balance as number, reserved: row.reserve_balance as number }
  })
}

export function walletPayouts(value: unknown): { payouts: CreatorPayout[]; nextCursor: string | null } {
  const payload = record(value), page = record(payload.page_info)
  if (!Array.isArray(payload.data) || typeof page.has_next_page !== 'boolean') throw new Error('Invalid payout history')
  const payouts = payload.data.map((entry: unknown) => {
    const row = record(entry), currency = currencyCode(row.currency), amount = decimal(row.amount), createdAt = date(row.created_at)
    if (typeof row.id !== 'string' || !/^wdrl_[a-zA-Z0-9]+$/.test(row.id) || !currency || amount === null || !createdAt || typeof row.status !== 'string' || !['requested', 'in_review', 'processing', 'completed', 'reversed', 'canceled', 'failed', 'denied'].includes(row.status)) throw new Error('Invalid payout')
    return { id: row.id, amount, net: decimal(row.net_amount), fee: decimal(row.fee_amount), markup: decimal(row.markup_fee), feePaidBy: ['self', 'platform'].includes(String(row.fee_paid_by)) ? row.fee_paid_by as string : null, currency, status: row.status, createdAt, arrival: date(row.estimated_arrival) }
  })
  const cursor = page.end_cursor
  if (page.has_next_page && (typeof cursor !== 'string' || !cursor.length || cursor.length > 512)) throw new Error('Invalid payout cursor')
  return { payouts, nextCursor: page.has_next_page ? cursor as string : null }
}

export function creatorRevenue(events: CreatorRevenueEvent[], currency: string, days: 30 | 90, now: number) {
  const today = new Date(now).toISOString().slice(0, 10)
  const midnight = Date.parse(today + 'T00:00:00Z')
  const points = Array.from({ length: days }, (_, index) => ({ date: new Date(midnight - (days - index - 1) * 86400_000).toISOString().slice(0, 10), amount: 0 }))
  const byDay = new Map(points.map(point => [point.date, point]))
  let count = 0
  for (const event of events) {
    if (event.event_type !== 'payment.succeeded' || event.status === 'failed' || event.currency?.toLowerCase() !== currency || event.amount == null || !Number.isFinite(Number(event.amount)) || Number(event.amount) < 0 || !date(event.created_at) || Date.parse(event.created_at) > now) continue
    const point = byDay.get(new Date(event.created_at).toISOString().slice(0, 10))
    if (point) { point.amount += Number(event.amount); count++ }
  }
  return { points, total: points.reduce((sum, point) => sum + point.amount, 0), count }
}
