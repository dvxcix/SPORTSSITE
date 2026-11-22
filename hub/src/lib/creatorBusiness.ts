/** A default for new offers only; each saved offer retains its own fee amount. */
export function creatorFeePercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return null
  return value
}

export function creatorFeeAmount(price: number, percentage: number) {
  if (!Number.isFinite(price) || price <= 0 || creatorFeePercentage(percentage) == null) throw new Error('Invalid creator fee')
  return Math.max(0, Math.min(Math.max(0,price - 0.01), Math.round(price * percentage) / 100))
}

export function recentCreatorReceipts(events: Array<{ event_type: string; amount: number | string | null; currency: string | null; status?: string | null }>) {
  const totals: Record<string, number> = {}
  for (const event of events) {
    const amount = Number(event.amount)
    if (event.event_type !== 'payment.succeeded' || event.amount == null || !Number.isFinite(amount) || amount < 0 || event.status === 'failed') continue
    const currency = (event.currency || 'usd').toUpperCase()
    totals[currency] = (totals[currency] || 0) + amount
  }
  return Object.entries(totals).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(' · ') || '—'
}
