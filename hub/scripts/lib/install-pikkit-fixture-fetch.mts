import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type PikkitFixtureRow = {
  game_date: string
  game_key: string
  player_name: string
  prop_type: string
  picks: number
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
  const rows = fixturePaths.flatMap(fixturePath =>
    JSON.parse(readFileSync(fixturePath, 'utf8')) as PikkitFixtureRow[])
  const nativeFetch = globalThis.fetch

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input))

    if (!url.pathname.endsWith('/rest/v1/pikkit_public_picks')) {
      return nativeFetch(input, init)
    }

    const dateFilter = url.searchParams.get('game_date')
    const date = dateFilter?.startsWith('eq.') ? dateFilter.slice(3) : null
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
