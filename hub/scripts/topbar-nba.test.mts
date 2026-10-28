import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { hasNbaAccess } from '../src/lib/nbaAccessPolicy.ts'
import { PRODUCT_EXPERIENCE_ROUTES } from '../src/lib/productExperienceAudit.ts'

const player = { id: 447, name: 'Karl-Anthony Towns', position: 'C', teamId: 20, teamName: 'New York Knicks', headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3136195.png', teamLogo: 'https://a.espncdn.com/i/teamlogos/nba/500/ny.png' }
const team = { id: 20, name: 'New York Knicks', abbr: 'NYK', logo: player.teamLogo }

async function quickSearch(role: string, nbaResponse: Promise<{ players: typeof player[]; teams: typeof team[] }> = Promise.resolve({ players: [player], teams: [team] }), tier = 'free', granted: string | null = null) {
  const source = await readFile(new URL('../src/components/layout/TopBar.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const effects: (() => (() => void) | void)[] = [], timers: (() => Promise<void>)[] = []
  const results: { nbaPlayers: typeof player[]; nbaTeams: typeof team[] }[] = []
  const requests: { url: string; signal: AbortSignal; cache?: RequestCache }[] = []
  const databaseSignals: AbortSignal[] = []
  let stateIndex = 0
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'or', 'limit', 'ilike', 'eq', 'order', 'in']) query[method] = () => query
  query.abortSignal = (signal: AbortSignal) => { databaseSignals.push(signal); return Promise.resolve({ data: [] }) }
  const emptyModule = new Proxy({}, { get: () => () => null })
  const imports: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => { const index = stateIndex++, value = index === 0 ? 'Towns' : initial && typeof initial === 'object' && 'owner' in initial && 'ids' in initial ? { owner: undefined, ids: [] } : typeof initial === 'function' ? initial() : initial; return [value, (next: unknown) => { if (next && typeof next === 'object' && 'nbaPlayers' in next) results.push(next as typeof results[number]) }] },
      useRef: (value: unknown) => ({ current: value }), useEffect: (effect: typeof effects[number]) => effects.push(effect), useMemo: (callback: () => unknown) => callback(),
    },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'next/navigation': { useRouter: () => ({ push: () => null }) },
    '@/context/AuthContext': { useAuth: () => ({ user: null, profile: { account_type: role, tier, admin_granted_tier: granted }, loading: false }) },
    '@/lib/supabase/client': { createClient: () => ({ from: () => query }) },
    '@/lib/emoji': { useCustomEmojis: () => [] },
    '@slipsurge/core/tiers': { effectiveTier: () => 'free', hasFullAccessOverride: () => false },
    '@/lib/nbaAccessPolicy': { hasNbaAccess },
  }
  const mod = { exports: {} as { TopBar: (props: Record<string, unknown>) => unknown } }
  const fetcher = async (url: string, options: { signal: AbortSignal; cache?: RequestCache }) => {
    requests.push({ url, ...options })
    return { ok: true, json: async () => url.startsWith('/api/search/nba?') ? nbaResponse : { players: [], teams: [] } }
  }
  new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', compiled)((name: string) => imports[name] ?? emptyModule, mod, mod.exports, fetcher, (callback: () => Promise<void>) => { timers.push(callback); return timers.length }, () => null)
  mod.exports.TopBar({})
  const effect = effects.find(candidate => candidate.toString().includes('/api/search/nba'))
  assert.ok(effect, 'TopBar must run its gated NBA search effect')
  const cleanup = effect()
  assert.equal(typeof cleanup, 'function')
  return { run: timers[0], cleanup: cleanup!, results, requests, databaseSignals }
}

test('TopBar requests NBA identities only with trusted Ultimate or admin access', async () => {
  for (const [role,tier,granted,allowed] of [
    ['user','free',null,false], ['creator','advanced',null,false], ['beta','free',null,false],
    ['admin','free',null,true], ['user','ultimate',null,true], ['user','free','ultimate',true],
  ] as const) {
    const search = await quickSearch(role,undefined,tier,granted)
    await search.run()
    const request = search.requests.find(item => item.url.startsWith('/api/search/nba?'))
    assert.equal(Boolean(request), allowed)
    assert.equal(search.results.at(-1)?.nbaPlayers.length, allowed ? 1 : 0)
    if (request) { assert.equal(request.cache, 'no-store'); assert.deepEqual(search.results.at(-1)?.nbaPlayers[0], player); assert.deepEqual(search.results.at(-1)?.nbaTeams[0], team) }
    search.cleanup()
  }
})

test('TopBar caps NBA preview and aborts both sports and social requests on stale query cleanup', async () => {
  const complete = await quickSearch('admin', Promise.resolve({ players: Array.from({ length: 8 }, () => player), teams: Array.from({ length: 5 }, () => team) }))
  await complete.run()
  assert.equal(complete.results.at(-1)?.nbaPlayers.length, 3)
  assert.equal(complete.results.at(-1)?.nbaTeams.length, 2)
  complete.cleanup()
  assert.ok(complete.requests.every(request => request.signal.aborted))
  assert.equal(complete.databaseSignals.length, 3)
  assert.ok(complete.databaseSignals.every(signal => signal.aborted))
  let resolve!: (value: { players: typeof player[]; teams: typeof team[] }) => void
  const pending = await quickSearch('admin', new Promise(done => { resolve = done }))
  const running = pending.run()
  pending.cleanup()
  resolve({ players: [player], teams: [team] })
  await running
  assert.ok(pending.results.every(result => result.nbaPlayers.length === 0 && result.nbaTeams.length === 0), 'a late response must not repopulate stale identities')
})

test('NBA quick results retain images, exact entity links and visible role guards', async () => {
  const source = await readFile(new URL('../src/components/layout/TopBar.tsx', import.meta.url), 'utf8')
  assert.ok(source.includes('nbaAccess && quickResults.nbaTeams.map'))
  assert.ok(source.includes('nbaAccess && quickResults.nbaPlayers.map'))
  assert.ok(source.includes('goTo(`/nba/teams/${team.id}`)'))
  assert.ok(source.includes('goTo(`/nba/players/${player.id}`)'))
  assert.ok(source.includes('headshot={player.headshot} teamLogo={player.teamLogo}'))
  assert.ok(source.includes('logo={team.logo} name={team.name}'))
})

test('admin audit registry includes both gated NBA entity surfaces without duplicate rows', () => {
  for (const path of ['/nba/players/[id]', '/nba/teams/[id]']) {
    const rows = PRODUCT_EXPERIENCE_ROUTES.filter(route => route.route === path)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].family, 'Identity & sports entities')
    assert.ok(rows[0].label.includes('Ultimate'))
  }
})
