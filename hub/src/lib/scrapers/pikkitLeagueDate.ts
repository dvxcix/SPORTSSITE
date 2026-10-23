import type { Page, Request, Response } from 'playwright-core'

type LeagueDates = { current: string; filters: { value: string; label: string }[] }
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const validDate = (value: unknown): value is string => typeof value === 'string' && datePattern.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

export function pikkitLeagueDates(value: unknown): LeagueDates | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<LeagueDates>
  if (!validDate(row.current) || !Array.isArray(row.filters) || row.filters.length > 366) return null
  const filters = row.filters.filter(item => item && validDate(item.value) && typeof item.label === 'string' && item.label.trim().length > 0 && item.label.length <= 80)
  if (filters.length !== row.filters.length || !filters.some(item => item.value === row.current) || new Set(filters.map(item => item.value)).size !== filters.length) return null
  return { current: row.current, filters: filters.map(item => ({ value: item.value, label: item.label.trim() })) }
}

function leagueResponse(url: string, path: string, league: string, date?: string) {
  try {
    const value = new URL(url)
    return value.origin === 'https://prod-website.pikkit.app' && value.pathname === path
      && value.searchParams.get('league')?.toLowerCase() === league.toLowerCase()
      && (date === undefined || value.searchParams.get('date') === date)
  } catch { return false }
}

/** Attach before league navigation. Dates come from the source's filter response. */
export function observePikkitLeagueDates(page: Page, league = 'nba') {
  let active = true, dates: LeagueDates | null = null
  let ready!: (value: LeagueDates | null) => void
  const responseReady = new Promise<LeagueDates | null>(resolve => { ready = resolve })
  const requests = new Set<Request>()
  const request = (value: Request) => {
    if (active && leagueResponse(value.url(), '/league/filters', league)) requests.add(value)
  }
  const response = (value: Response) => {
    if (!active || value.status() !== 200 || !requests.has(value.request())) return
    void value.json().then(payload => {
      if (!active) return
      dates = pikkitLeagueDates(payload)
      if (dates) ready(dates)
    }).catch(() => undefined)
  }
  page.on('request', request); page.on('response', response)
  return {
    async selectDate(date: string): Promise<boolean> {
      if (!active || !validDate(date)) return false
      let timer: ReturnType<typeof setTimeout> | undefined
      const known = dates ?? await Promise.race([responseReady, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 7000) })]).finally(() => clearTimeout(timer))
      if (!active || !known) return false
      const targetIndex = known.filters.findIndex(item => item.value === date)
      if (targetIndex < 0) return false
      if (known.current === date) return true
      const target = known.filters[targetIndex]
      const direction = targetIndex > known.filters.findIndex(item => item.value === known.current) ? 'date-forward' : 'date-back'
      const today = await page.evaluate(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      })
      const label = page.getByText(date === today ? 'Today' : target.label, { exact: true }).filter({ visible: true })
      // Source date arrows shift the seven-label window by three days.
      for (let advances = 0; active && advances <= 2; advances++) {
        if (await label.count() === 1) {
          const loaded = page.waitForResponse(value => value.status() === 200 && leagueResponse(value.url(), '/league/events', league, date), { timeout: 7000 }).then(() => true, () => false)
          try { await label.click({ timeout: 2000 }) } catch { return false }
          const complete = await loaded
          return active && complete
        }
        if (advances === 2) break
        const arrow = page.getByRole('button', { name: direction, exact: true })
        if (await arrow.count() !== 1 || !await arrow.isEnabled()) return false
        await arrow.click({ timeout: 2000 })
        await label.waitFor({ state: 'visible', timeout: 500 }).catch(() => undefined)
      }
      return false
    },
    dispose() {
      active = false; ready(null)
      requests.clear()
      page.off('request', request); page.off('response', response)
    },
  }
}
