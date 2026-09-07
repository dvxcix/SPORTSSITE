import type { Page } from 'playwright-core'

type MgmPrice = {
  americanOdds?: number | null
}

type MgmOption = {
  name?: { value?: string | null } | string | null
  status?: string | null
  price?: MgmPrice | null
}

type MgmMarket = {
  name?: { value?: string | null } | string | null
  status?: string | null
  options?: MgmOption[] | null
}

export type MgmFixture = {
  id?: string | number | null
  name?: { value?: string | null } | string | null
  startDate?: string | null
  optionMarkets?: MgmMarket[] | null
}

export type MgmHrScrape = {
  sportsbook: 'BetMGM'
  scraped_at: string
  url: string
  market: 'Batter home runs'
  threshold: '1+' | '2+'
  outcome_count: number
  outcomes: Array<{
    player_name: string
    avg_hr_per_game: null
    odds: string
  }>
}

function textValue(value: { value?: string | null } | string | null | undefined): string {
  if (typeof value === 'string') return value.trim()
  return String(value?.value ?? '').trim()
}

function parseMarketIdentity(marketName: string, optionName: string): { player: string; threshold: '1+' | '2+' } | null {
  const explicit = /^(.*?)\s+to hit\s+([12])\+\s+home runs?$/i.exec(marketName)
  if (explicit) return { player: explicit[1].trim(), threshold: explicit[2] === '2' ? '2+' : '1+' }

  const conventional = /^(.*?):\s*home runs?$/i.exec(marketName)
  if (!conventional) return null
  const over = /^over\s+([01])\.5$/i.exec(optionName)
  if (!over) return null
  return { player: conventional[1].trim(), threshold: over[1] === '1' ? '2+' : '1+' }
}

export function parseMgmHrFixture(fixture: MgmFixture, scrapedAt = new Date().toISOString()): MgmHrScrape[] {
  const byThreshold = new Map<'1+' | '2+', Map<string, { player_name: string; avg_hr_per_game: null; odds: string }>>([
    ['1+', new Map()],
    ['2+', new Map()],
  ])

  for (const market of fixture.optionMarkets ?? []) {
    if (market.status && market.status !== 'Visible') continue
    const marketName = textValue(market.name)
    if (!/home runs?/i.test(marketName)) continue

    for (const option of market.options ?? []) {
      if (option.status && option.status !== 'Visible') continue
      const identity = parseMarketIdentity(marketName, textValue(option.name))
      const americanOdds = option.price?.americanOdds
      if (!identity || typeof americanOdds !== 'number' || !Number.isFinite(americanOdds)) continue
      const key = identity.player.toLowerCase()
      byThreshold.get(identity.threshold)!.set(key, {
        player_name: identity.player,
        avg_hr_per_game: null,
        odds: americanOdds > 0 ? `+${americanOdds}` : String(americanOdds),
      })
    }
  }

  return (['1+', '2+'] as const).flatMap(threshold => {
    const outcomes = Array.from(byThreshold.get(threshold)!.values())
    return outcomes.length ? [{
      sportsbook: 'BetMGM' as const,
      scraped_at: scrapedAt,
      url: 'https://www.nc.betmgm.com/en/sports/baseball-23/betting/usa-9/mlb-75',
      market: 'Batter home runs' as const,
      threshold,
      outcome_count: outcomes.length,
      outcomes,
    }] : []
  })
}

function dateRangeAround(gameDate: string): { from: string; to: string } {
  const center = new Date(gameDate)
  const centerMs = Number.isFinite(center.getTime()) ? center.getTime() : Date.now()
  return {
    from: new Date(centerMs - 12 * 60 * 60 * 1_000).toISOString(),
    to: new Date(centerMs + 12 * 60 * 60 * 1_000).toISOString(),
  }
}

export async function scrapeMgmCdsGame(
  page: Page,
  game: { awayTeam: string; homeTeam: string; gameDate: string },
): Promise<{ fixtureId: string; fixtureName: string; scrapes: MgmHrScrape[] }> {
  const listingUrl = 'https://www.nc.betmgm.com/en/sports/baseball-23/betting/usa-9/mlb-75'
  const accessResponse = page.waitForResponse(response => {
    const url = response.url()
    return url.includes('/cds-api/offer-grouping/') && new URL(url).searchParams.has('x-bwin-accessid')
  }, { timeout: 20_000 }).catch(() => null)

  await page.goto(listingUrl, { waitUntil: 'domcontentloaded' })
  const response = await accessResponse
  const accessId = response ? new URL(response.url()).searchParams.get('x-bwin-accessid') : null
  if (!accessId) throw new Error('BetMGM public feed access id was not observed')

  const { from, to } = dateRangeAround(game.gameDate)
  const params = new URLSearchParams({
    'x-bwin-accessid': accessId,
    lang: 'en-us',
    country: 'US',
    usercountry: 'US',
    state: 'Latest',
    fixtureTypes: 'Standard',
    sportIds: '23',
    competitionIds: '75',
    from,
    to,
    offerMapping: 'All',
    sortBy: 'StartDate',
  })

  const result = await page.evaluate(async ({ requestUrl, awayTeam, homeTeam, gameDate }) => {
    const response = await fetch(requestUrl, { credentials: 'include' })
    if (!response.ok) return { error: `BetMGM fixtures feed returned ${response.status}` }
    const payload = await response.json()
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : []
    const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    const wantedAway = norm(awayTeam)
    const wantedHome = norm(homeTeam)
    const wantedStart = new Date(gameDate).getTime()
    const candidates = fixtures.filter((fixture: any) => {
      const fixtureName = norm(typeof fixture?.name === 'string' ? fixture.name : fixture?.name?.value ?? '')
      return fixtureName.includes(wantedAway) && fixtureName.includes(wantedHome)
    }).sort((left: any, right: any) => {
      const leftDelta = Math.abs(new Date(left?.startDate ?? 0).getTime() - wantedStart)
      const rightDelta = Math.abs(new Date(right?.startDate ?? 0).getTime() - wantedStart)
      return leftDelta - rightDelta
    })
    const fixture = candidates[0]
    if (!fixture) return { error: `BetMGM fixture not found for ${awayTeam} at ${homeTeam}` }
    return {
      fixture: {
        id: fixture.id,
        name: fixture.name,
        startDate: fixture.startDate,
        optionMarkets: (Array.isArray(fixture.optionMarkets) ? fixture.optionMarkets : []).map((market: any) => ({
          name: market?.name,
          status: market?.status,
          options: (Array.isArray(market?.options) ? market.options : []).map((option: any) => ({
            name: option?.name,
            status: option?.status,
            price: { americanOdds: option?.price?.americanOdds },
          })),
        })),
      },
    }
  }, {
    requestUrl: `https://www.nc.betmgm.com/cds-api/bettingoffer/fixtures?${params}`,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    gameDate: game.gameDate,
  })

  if ('error' in result) throw new Error(result.error)
  const fixture = result.fixture as MgmFixture
  const scrapes = parseMgmHrFixture(fixture)
  if (!scrapes.some(scrape => scrape.threshold === '1+')) {
    throw new Error('BetMGM fixture has no visible 1+ home-run prices')
  }

  return {
    fixtureId: String(fixture.id ?? ''),
    fixtureName: textValue(fixture.name),
    scrapes,
  }
}
