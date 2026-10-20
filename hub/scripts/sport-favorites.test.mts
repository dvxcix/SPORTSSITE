import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as favorites from '../src/lib/sportFavorites.ts'
import { hasNbaAccess } from '../src/lib/nbaAccessPolicy.ts'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const mlb = { mlb_id: 123, name: 'Baseball Player', team: 'ATL' }
const nfl = { sport: 'nfl' as const, player_id: '00-0033873', name: 'Football Player', team: 'KC', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png', team_logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png' }
const nba = { sport: 'nba' as const, player_id: '123', name: 'Basketball Player', team: 'ATL', headshot: null, team_logo: null }
const nflTeam = { key: 'NFL:ATL', sport: 'nfl' as const, id: 'ATL', abbr: 'ATL', name: 'Atlanta Falcons', logo: null, href: '/nfl/teams/ATL' }
const nbaTeam = { key: 'NBA:1', sport: 'nba' as const, id: '1', abbr: 'ATL', name: 'Atlanta Hawks', logo: null, href: '/nba/teams/1' }
const catalog = [...favorites.MLB_FAVORITE_TEAMS, nflTeam, nbaTeam]

test('legacy MLB storage and identity are preserved alongside collision-safe NFL/NBA players', () => {
  const parsed = favorites.normalizeFavoritePlayers([mlb, nfl, nba, mlb, { sport: 'nba', player_id: '../bad', name: 'Invalid' }])
  assert.deepEqual(parsed[0], mlb)
  assert.deepEqual(parsed.map(favorites.favoritePlayerKey), ['mlb:123', 'nfl:00-0033873', 'nba:123'])
  assert.deepEqual(parsed.map(favorites.favoritePlayerHref), ['/players/123', '/nfl/players/00-0033873', '/nba/players/123'])
  assert.equal(favorites.favoritePlayerImages(favorites.normalizeFavoritePlayers([{ ...nba, headshot: 'https://tracker.example/image.png' }])[0]).headshot, null)
})

test('team league collisions and historical raw storage remain separate', () => {
  assert.equal(favorites.resolveFavoriteTeam('ATL', catalog)?.key, 'MLB:ATL')
  assert.equal(favorites.resolveFavoriteTeam('ATL', catalog, ['NFL'])?.key, 'NFL:ATL')
  assert.equal(favorites.resolveFavoriteTeam('MLB:ATL', catalog, ['NFL'])?.key, 'MLB:ATL')
  assert.equal(favorites.resolveFavoriteTeam('MLB:ATL', catalog)?.href, '/mlb/teams/144')
  assert.equal(favorites.resolveFavoriteTeam('NFL:ATL', catalog)?.key, 'NFL:ATL')
  assert.deepEqual(favorites.toggleFavoriteTeam(nflTeam, ['ATL'], catalog), ['ATL', 'NFL:ATL'])
  assert.deepEqual(favorites.toggleFavoriteTeam(nflTeam, ['ATL', 'NFL:ATL'], catalog), ['ATL'])
  assert.deepEqual(favorites.normalizeFavoriteTeams(['NYY', 'MLB:ATL', 'NFL:ATL', 'NBA:1']), ['NYY', 'MLB:ATL', 'NFL:ATL', 'NBA:1'])
})

test('non-entitled edits preserve stored NBA choices without adding new ones', () => {
  const existing = { favorite_teams: ['ATL', 'NBA:1'], favorite_players: [mlb, nba] }
  const update = favorites.favoriteUpdates({ teams: ['NFL:ATL', 'NBA:2'], players: [nfl, { ...nba, player_id: '999' }] }, existing, false)
  assert.deepEqual(update.favorite_teams, ['NFL:ATL', 'NBA:1'])
  assert.deepEqual(update.favorite_players?.map(favorites.favoritePlayerKey), ['nba:123', 'nfl:00-0033873'])
  assert.deepEqual(favorites.favoriteUpdates({ teams: ['NYY'] }, existing, true), { favorite_teams: ['NYY'] })
  assert.deepEqual(favorites.normalizeFavoritePlayers([mlb, nba], false), [mlb])
})

test('search responses preserve exact league provider IDs and valid imagery', () => {
  const football = favorites.favoriteSearchPlayers('nfl', [{ gsis_id: nfl.player_id, display_name: nfl.name, latest_team: 'KC', headshot: nfl.headshot, team_logo_espn: nfl.team_logo }])
  assert.deepEqual(football, [nfl])
  assert.deepEqual(favorites.favoriteSearchPlayers('nba', [{ id: 123, name: nba.name, teamName: 'ATL' }]), [nba])
  assert.equal(favorites.favoriteSearchPlayers('nba', [null, {}, { id: 'bad' }]).length, 0)
})

async function routeFixture(role: string | null = 'admin', entitlement: { tier?: string; admin_granted_tier?: string; discord_advanced_claimed?: boolean } = {}) {
  let profile = { id: 'owner', account_type: role, ...entitlement, favorite_teams: ['NYY'], favorite_players: [mlb] as favorites.FavoritePlayer[], favorite_sports: ['MLB'] }
  let updates = 0, catalogLoads = 0
  const admin = { from: () => ({ select: () => ({ eq: (_key: string, id: string) => { assert.equal(id, 'owner'); return { maybeSingle: async () => ({ data: profile, error: null }) } } }), update: (value: Partial<typeof profile>) => ({ eq: async (_key: string, id: string) => { assert.equal(id, 'owner'); updates++; profile = { ...profile, ...value }; return { error: null } } }) }) }
  const imports: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number; headers?: Record<string, string> }) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: role === null ? null : 'owner' }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/nbaAccessPolicy': { hasNbaAccess },
    '@/lib/favoriteCatalog': { getFavoriteCatalog: async (nba: boolean) => { catalogLoads++; return catalog.filter(team => nba || team.sport !== 'nba') } },
    '@/lib/sportFavorites': favorites,
    '@/lib/safeApiError': { safeApiError: () => ({ status: 500, body: { error: 'Unavailable' } }) },
  }
  const source = await readFile(new URL('../src/app/api/account/favorites/route.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = { exports: {} as Record<string, (request?: Request) => Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }>> }
  new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
  const patch = (body: unknown) => mod.exports.PATCH(new Request('https://example.com/api/account/favorites', { method: 'PATCH', body: JSON.stringify(body) }))
  return { get: mod.exports.GET, patch, current: () => profile, counts: () => ({ updates, catalogLoads }) }
}

test('favorites API authenticates before reading catalog and enforces NBA visibility/writes', async () => {
  const anonymous = await routeFixture(null)
  assert.equal((await anonymous.get()).status, 401)
  assert.equal((await anonymous.patch({ action: 'add', player: nba })).status, 401)
  assert.deepEqual(anonymous.counts(), { updates: 0, catalogLoads: 0 })
  const member = await routeFixture('user')
  const read = await member.get()
  assert.equal(read.headers['Cache-Control'], 'private, no-store, max-age=0')
  assert.ok(!(read.body.catalog as favorites.FavoriteTeam[]).some(team => team.sport === 'nba'))
  assert.equal((await member.patch({ action: 'add', player: nba })).status, 403)
  assert.equal((await member.patch({ action: 'add', team: 'NBA:1' })).status, 403)
  assert.equal(member.counts().updates, 0)
})

test('favorites API saves/removes exact NFL and NBA IDs while preserving unrelated favorites', async () => {
  const fixture = await routeFixture()
  for (const player of [nfl, nba]) assert.equal((await fixture.patch({ action: 'add', player })).status, 200)
  await fixture.patch({ action: 'add', team: 'NBA:1' })
  await fixture.patch({ action: 'add', team: 'NFL:ATL' })
  assert.deepEqual(fixture.current().favorite_players.map(favorites.favoritePlayerKey), ['mlb:123', 'nfl:00-0033873', 'nba:123'])
  await fixture.patch({ action: 'remove', player: nba })
  assert.deepEqual(fixture.current().favorite_players.map(favorites.favoritePlayerKey), ['mlb:123', 'nfl:00-0033873'])
  assert.deepEqual(fixture.current().favorite_teams, ['NYY', 'NBA:1', 'NFL:ATL'])
  const previous = fixture.current()
  assert.equal((await fixture.patch({ teams: 'bad' })).status, 400)
  assert.deepEqual(fixture.current(), previous)
})

test('paid and admin-granted Ultimate members can save NBA favorites while Advanced cannot', async () => {
  for (const entitlement of [{ tier: 'ultimate' }, { tier: 'free', admin_granted_tier: 'ultimate' }]) {
    const member = await routeFixture('user', entitlement)
    assert.ok(((await member.get()).body.catalog as favorites.FavoriteTeam[]).some(team => team.sport === 'nba'))
    assert.equal((await member.patch({ action: 'add', player: nba })).status, 200)
    assert.equal((await member.patch({ action: 'add', team: 'NBA:1' })).status, 200)
    assert.ok(member.current().favorite_players.some(player => favorites.favoritePlayerKey(player) === 'nba:123'))
  }
  const advanced = await routeFixture('user', { tier: 'free', discord_advanced_claimed: true })
  assert.equal((await advanced.patch({ action: 'add', player: nba })).status, 403)
  assert.equal(advanced.counts().updates, 0)
})

test('favorite entity writes allow eight per league while preserving a full MLB roster', async () => {
  const fixture = await routeFixture()
  const eight = Array.from({ length: 8 }, (_, index) => ({ ...mlb, mlb_id: index + 1 }))
  await fixture.patch({ players: eight })
  assert.equal((await fixture.patch({ action: 'add', player: nba })).status, 200)
  assert.equal((await fixture.patch({ action: 'add', player: nfl })).status, 200)
  assert.deepEqual(fixture.current().favorite_players.slice(0, 8), eight)
  const basketball = Array.from({ length: 8 }, (_, index) => ({ ...nba, player_id: String(index + 1) }))
  await fixture.patch({ players: [...eight, nfl, ...basketball] })
  assert.equal((await fixture.patch({ action: 'add', player: nba })).status, 400)
  assert.deepEqual(fixture.current().favorite_players, [...eight, nfl, ...basketball])
  assert.equal((await fixture.patch({ action: 'add', player: eight[0] })).status, 200)
  assert.deepEqual(fixture.current().favorite_players, [...eight, nfl, ...basketball])
})

test('normalizer keeps eight players from each league and bounds only that league overflow', () => {
  const baseball = Array.from({ length: 9 }, (_, index) => ({ ...mlb, mlb_id: index + 1 }))
  const football = Array.from({ length: 9 }, (_, index) => ({ ...nfl, player_id: `00-00${index}` }))
  const basketball = Array.from({ length: 9 }, (_, index) => ({ ...nba, player_id: String(index + 1) }))
  const values = favorites.normalizeFavoritePlayers([...baseball, ...football, ...basketball])
  assert.equal(values.length, 24)
  assert.deepEqual(values.filter(p => favorites.favoritePlayerSport(p) === 'mlb'), baseball.slice(0, 8))
  assert.deepEqual(values.filter(p => favorites.favoritePlayerSport(p) === 'nfl'), football.slice(0, 8))
  assert.deepEqual(values.filter(p => favorites.favoritePlayerSport(p) === 'nba'), basketball.slice(0, 8))
  assert.equal(favorites.normalizeFavoritePlayers(values, false).length, 16)
})

test('onboarding persists NFL and MLB favorites while NBA follows effective Ultimate or admin', async () => {
  const source = await readFile(new URL('../src/app/api/account/onboarding/route.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [entitlement, allowed] of [[{ account_type: 'admin' }, true], [{ account_type: 'user' }, false], [{ account_type: 'user', tier: 'ultimate' }, true], [{ account_type: 'user', tier: 'free', admin_granted_tier: 'ultimate' }, true]] as const) {
    let saved: Record<string, unknown> | null = null
    const profile = { id: 'owner', ...entitlement, favorite_teams: ['NYY'], favorite_players: [mlb], notification_settings: { dm: true }, interest_settings: {} }
    const imports: Record<string, unknown> = {
      'next/server': { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }), update: (value: Record<string, unknown>) => ({ eq: async () => { saved = value; return { error: null } } }) }) }) },
      '@/lib/nbaAccessPolicy': { hasNbaAccess }, '@/lib/sportFavorites': favorites,
      '@/lib/safeApiError': { safeApiError: () => ({ status: 500 }) },
    }
    const mod = { exports: {} as { POST: (request: Request) => Promise<{ status: number }> } }
    new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
    const result = await mod.exports.POST(new Request('https://example.com/api/account/onboarding', { method: 'POST', body: JSON.stringify({ displayName: 'Owner', teams: ['NYY', 'NFL:ATL', 'NBA:1'], favoritePlayers: [mlb, nfl, nba] }) }))
    assert.equal(result.status, 200)
    assert.ok(saved)
    const values = saved as Record<string, unknown>
    assert.deepEqual(values.favorite_teams, allowed ? ['NYY', 'NFL:ATL', 'NBA:1'] : ['NYY', 'NFL:ATL'])
    assert.deepEqual((values.favorite_players as favorites.FavoritePlayer[]).map(favorites.favoritePlayerKey), allowed ? ['mlb:123', 'nfl:00-0033873', 'nba:123'] : ['mlb:123', 'nfl:00-0033873'])
    assert.equal((values.notification_settings as Record<string, boolean>).dm, true)
    assert.equal(typeof values.onboarding_completed_at, 'string')
  }
})

test('public profile NBA favorites follow viewer effective Ultimate while retaining NFL for every viewer', async () => {
  const source = await readFile(new URL('../src/components/profile/FavoritesSection.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  for (const [viewer, allowed] of [[{ account_type: 'admin' }, true], [{ account_type: 'user' }, false], [{ account_type: 'user', tier: 'ultimate' }, true], [{ account_type: 'user', tier: 'free', admin_granted_tier: 'ultimate' }, true]] as const) {
    const imports: Record<string, unknown> = {
      'react/jsx-runtime': jsxRuntime,
      'next/link': { default: ({ href, className, children }: Record<string, unknown>) => jsxRuntime.jsx('a', { href, className, children }) },
      '@/components/sports/PlayerAvatar': { PlayerAvatar: ({ name }: { name: string }) => jsxRuntime.jsx('span', { 'data-player': name }) },
      '@/components/ui/SafeImage': { SafeImage: (props: Record<string, unknown>) => jsxRuntime.jsx('img', props) },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: viewer }) }) }) }) }) },
      '@/lib/nbaAccessPolicy': { hasNbaAccess }, '@/lib/sportFavorites': favorites,
      '@/lib/favoriteCatalog': { getFavoriteCatalog: async (allowNba: boolean) => catalog.filter(team => allowNba || team.sport !== 'nba') },
    }
    const mod = { exports: {} as { FavoritesSection: (props: Record<string, unknown>) => Promise<React.ReactNode> } }
    new Function('require', 'exports', 'module', compiled)((key: string) => { assert.ok(key in imports, key); return imports[key] }, mod.exports, mod)
    const html = renderToStaticMarkup(await mod.exports.FavoritesSection({ teams: ['NFL:ATL', 'NBA:1'], players: [mlb, nfl, nba] }))
    assert.ok(html.includes('/nfl/players/00-0033873'))
    assert.ok(html.includes('Atlanta Falcons'))
    assert.equal(html.includes('/nba/players/123'), allowed)
    assert.equal(html.includes('Basketball Player'), allowed)
    assert.equal(html.includes('Atlanta Hawks'), allowed)
  }
})
