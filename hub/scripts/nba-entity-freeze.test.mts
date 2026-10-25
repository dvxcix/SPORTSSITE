import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import * as entities from '../src/lib/nbaEntities.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'

async function page(kind: 'players' | 'teams', loaders: Record<string, unknown>, gate: unknown = {}) {
  const source = await readFile(new URL(`../src/app/nba/${kind}/[id]/page.tsx`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const target = { exports: {} as { default: (props: any) => Promise<any> } }
  const imports: Record<string, unknown> = { 'react/jsx-runtime': jsx, '@/lib/nbaEntities': entities, '@/lib/nbaOddsMode': mode,
    '@/lib/paintAccess': { requirePaintAccess: async () => gate }, 'next/navigation': { notFound: () => { throw new Error('not found') } },
    '@/components/nba/NbaMatchupEntity': { NbaMatchupPlayer: 'saved-player', NbaMatchupTeam: 'saved-team', NbaMatchupUnavailable: 'saved-unavailable' },
    '@/components/nba/NbaAccessFallback': { NbaAccessFallback: 'denied' }, ...loaders }
  new Function('require', 'module', 'exports', output)((name: string) => imports[name] ?? { default: {} }, target, target.exports)
  return target.exports.default
}

for (const kind of ['players', 'teams'] as const) {
  test(`${kind} linked from research retain the parent baseline and never read today's directory`, async () => {
    let directory = 0, boards = 0, seenMode = ''
    const savedBoard = { game: { id: 42 }, players: [{ id: 7, injury: { status: 'Questionable' }, average: { pts: 25 } }] }
    const render = await page(kind, {
      '@/lib/nbaDirectory': { getNbaPlayerEntity: async () => { directory++; return null }, getNbaTeamEntity: async () => { directory++; return null } },
      '@/lib/nbaPaintData': { getPaintGame: async (id: number) => ({ id }), getPaintBoard: async (game: { id: number }, phase: string) => { boards++; seenMode = phase; assert.equal(game.id, 42); return savedBoard } },
    })
    const props = { params: Promise.resolve({ id: '7' }), searchParams: Promise.resolve({ game: '42' }) }
    const before = await render(props)
    assert.equal(before.type, kind === 'players' ? 'saved-player' : 'saved-team'); assert.equal(before.props.board, savedBoard)
    assert.equal(before.props.mode, 'pregame'); assert.equal(directory, 0); assert.equal(boards, 1)
    await render({ ...props, searchParams: Promise.resolve({ game: '42', mode: 'live' }) })
    assert.equal(seenMode, 'live'); assert.equal(directory, 0)
    await assert.rejects(render({ ...props, searchParams: Promise.resolve({ game: 'invalid' }) }), /not found/)
    assert.equal(boards, 2)
  })

  test(`${kind} missing saved inputs and denied access cannot fall through to current data`, async () => {
    let reads = 0
    const sources = {
      '@/lib/nbaDirectory': { getNbaPlayerEntity: async () => { reads++; throw new Error('wrong source') }, getNbaTeamEntity: async () => { reads++; throw new Error('wrong source') } },
      '@/lib/nbaPaintData': { getPaintGame: async () => { reads++; throw new Error('archive unavailable') } },
    }
    const props = { params: Promise.resolve({ id: '7' }), searchParams: Promise.resolve({ game: '42' }) }
    const result = await (await page(kind, sources))(props)
    assert.equal(result.type, 'saved-unavailable'); assert.equal(result.props.game, 42); assert.equal(reads, 1)
    const denied = await (await page(kind, sources, { error: { status: 403 } }))(props)
    assert.equal(denied.type, 'denied'); assert.equal(reads, 1)
  })
}

test('entity links retain their optional matchup anchor without changing standalone directory links', () => {
  assert.equal(entities.nbaEntityGameHref('/nba/players/7', 42), '/nba/players/7?game=42')
  assert.equal(entities.nbaEntityGameHref('/nba/teams/1?mode=live', 42), '/nba/teams/1?mode=live&game=42')
  assert.equal(entities.nbaEntityGameHref('/nba/teams/1'), '/nba/teams/1')
})

test('a matchup team view rejects unrelated league metadata while retaining the actual saved team roster', async () => {
  const source = await readFile(new URL('../src/components/nba/NbaMatchupEntity.tsx', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const target = { exports: {} as Record<string, any> }
  const imports: Record<string, unknown> = {
    'react/jsx-runtime': jsx, 'next/link': 'a', './NbaOddsModeContext': { NbaOddsModeProvider: 'phase' },
    './NbaEntityHistory': { NbaEntityHistory: 'history' }, './NbaTeamRoster': { NbaTeamRoster: 'roster' },
    '@/app/the-paint/PaintVisuals': { TeamLogo: 'logo', PlayerAvatar: 'avatar' },
    '@/lib/nbaModeHref': { nbaModeHref: (href: string) => href }, '@/lib/nbaEntities': entities,
    '@/lib/nbaPaint': { nbaSeason: (season: number) => String(season), nbaTeamLogo: (abbr: string) => abbr },
  }
  new Function('require', 'module', 'exports', output)((name: string) => imports[name] ?? { default: {} }, target, target.exports)
  const teams = [1, 2, 3].map(id => ({ id, abbreviation: `T${id}`, full_name: `Team ${id}` }))
  const saved = { game: { id: 42, date: '2026-10-24', home_team: teams[0], visitor_team: teams[1] }, teams, players: [], sampleSeason: 2026 }
  const unrelated = target.exports.NbaMatchupTeam({ board: saved, teamId: 3, mode: 'pregame' })
  assert.equal(unrelated.type, target.exports.NbaMatchupUnavailable); assert.equal(unrelated.props.game, 42)
  const actual = target.exports.NbaMatchupTeam({ board: saved, teamId: 1, mode: 'pregame' })
  assert.equal(actual.type, 'phase'); assert.equal(actual.props.mode, 'pregame')
})
