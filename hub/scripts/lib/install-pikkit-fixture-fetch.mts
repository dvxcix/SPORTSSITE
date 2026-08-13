import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type PikkitFixtureRow = {
  game_date: string
  game_key: string
  player_name: string
  prop_type?: string
  picks?: number
  picks_by_market?: Record<string, number>
}

const configuredFixturePaths = process.env.HR_INTEL_PIKKIT_FIXTURE
  ?.split(';')
  .map(value => value.trim())
  .filter(Boolean) ?? []

const fixtureDirectories = [
  resolve(process.cwd(), '.hr-intel-cache'),
  resolve(process.cwd(), '..', '.hr-intel-cache'),
  resolve(process.cwd(), '..', '..', '..', '.hr-intel-cache'),
]
const discoveredFixturePaths = fixtureDirectories
  .filter(directory => existsSync(directory))
  .flatMap(directory => readdirSync(directory)
    .filter(name => /^pikkit-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => resolve(directory, name)))
const fixturePaths = [...new Set(configuredFixturePaths.length ? configuredFixturePaths : discoveredFixturePaths)]

if (fixturePaths.length) {
  const fixtureRows = fixturePaths.flatMap(fixturePath =>
    JSON.parse(readFileSync(fixturePath, 'utf8')) as PikkitFixtureRow[])
  const rows = fixtureRows.flatMap(row => row.picks_by_market
    ? Object.entries(row.picks_by_market).map(([prop_type, picks]) => ({
        game_date: row.game_date,
        game_key: row.game_key,
        player_name: row.player_name,
        prop_type,
        picks,
      }))
    : row.prop_type && row.picks != null
      ? [{ ...row, prop_type: row.prop_type, picks: row.picks }]
      : [])
  const nativeFetch = globalThis.fetch

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input))

    if (!url.pathname.endsWith('/rest/v1/pikkit_public_picks')) {
      return nativeFetch(input, init)
    }

    const dateFilter = url.searchParams.get('game_date')
    const date = dateFilter?.startsWith('eq.') ? dateFilter.slice(3) : null
    // Fixtures are date-scoped snapshots, not a replacement for the entire
    // production table. Previously, the presence of any fixture caused every
    // Pikkit request to be intercepted. A date absent from the fixture set
    // therefore looked like a valid empty-picks board and silently poisoned
    // historical calibration. Only intercept dates represented by a fixture;
    // all other requests must use the real configured data source.
    if (!date || !rows.some(row => row.game_date === date)) {
      return nativeFetch(input, init)
    }
    const rangeHeader = new Headers(init?.headers ?? request?.headers).get('range')
    const match = rangeHeader?.match(/^(\d+)-(\d+)$/)
    const start = match ? Number(match[1]) : 0
    const end = match ? Number(match[2]) : rows.length - 1
    const filtered = date ? rows.filter(row => row.game_date === date) : rows
    const page = filtered.slice(start, end + 1)

    return new Response(JSON.stringify(page), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-range': `${start}-${Math.max(start, start + page.length - 1)}/${filtered.length}`,
      },
    })
  }
}
