import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import type { PaintGame, PaintRoster } from '../src/lib/nbaPaint.ts'
import { nbaNormalizeFirstBook, type NbaFirstBookBoard } from '../src/lib/scrapers/nbaFirstBookQuotes.ts'
import * as quotes from '../src/lib/scrapers/nbaFirstBookQuotes.ts'
import * as paint from '../src/lib/nbaPaint.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as propQuotes from '../src/lib/scrapers/nbaBookPropQuotes.ts'

const { JSDOM } = createRequire(import.meta.url)('jsdom')

const now = Date.parse('2026-10-24T11:00:00Z')
const game: PaintGame = { id: 21717953, date: '2026-10-24', season: 2026, status: 'Scheduled', status_state: 'scheduled', period: 0, datetime: '2026-10-25T01:00:00Z', home_team_score: 0, visitor_team_score: 0,
  visitor_team: { id: 19, name: 'Pelicans', full_name: 'New Orleans Pelicans', abbreviation: 'NOP' }, home_team: { id: 8, name: 'Nuggets', full_name: 'Denver Nuggets', abbreviation: 'DEN' } }
const player: PaintRoster = { id: 42, first_name: 'Alpha', last_name: 'Diallo', team: game.visitor_team, position: 'F' }
const input = { game, roster: [player] }
const board = (changes: Partial<NbaFirstBookBoard> = {}): NbaFirstBookBoard => ({ away: 'NO Pelicans', home: 'DEN Nuggets', dateLabel: 'Today', timeLabel: '7:00PM', timeZone: 'America/Los_Angeles', observedAt: new Date(now).toISOString(), market: '1st Point', expanded: true, rows: [{ name: 'Alpha Diallo', odds: '+1060' }], ...changes })
const relativeBoard = (at: number, minutes: number, changes: Partial<NbaFirstBookBoard> = {}) => board({ dateLabel: '', timeLabel: '', timeZone: 'UTC', observedAt: new Date(at).toISOString(), countdown: { minutes, observedAt: new Date(at).toISOString() }, market: 'First field goal scorer', ...changes })

test('observed DK 1st Point and MGM First FG remain distinct exact affirmative contracts', () => {
  const dk = nbaNormalizeFirstBook('draftkings', input, board(), now)
  const mgm = nbaNormalizeFirstBook('betmgm', input, board({ away: 'New Orleans Pelicans', home: 'Denver Nuggets', timeLabel: '4:59PM', market: 'First field goal scorer', rows: [{ name: 'Alpha Diallo', odds: '+900' }] }), now)
  assert.equal(dk.complete, true); assert.equal(mgm.complete, true)
  assert.equal(dk.clockMismatch, true); assert.equal(mgm.clockMismatch, true)
  assert.equal(dk.props[0].prop_type, 'first_score'); assert.equal(mgm.props[0].prop_type, 'first_field_goal')
  assert.equal(dk.props[0].line_value, '0.5'); assert.equal(dk.props[0].market.type, 'over_under')
  assert.equal(dk.props[0].market.over_odds, 1060); assert.equal(mgm.props[0].market.over_odds, 900)
  assert.equal(dk.props[0].market.under_odds, undefined); assert.equal(dk.props[0].updated_at, board().observedAt)
  assert.equal(dk.props[0].opening, undefined); assert.notEqual(dk.props[0].id, mgm.props[0].id)
})

test('same pair on wrong day, reversed teams or a different winning event is withheld', () => {
  for (const changes of [{ dateLabel: 'Tomorrow' }, { dateLabel: '13/24' }, { dateLabel: '10/32' }, { away: 'DEN Nuggets', home: 'NO Pelicans' }, { market: 'First field goal scorer' }, { dateLabel: '' }, { timeLabel: '' }, { timeZone: 'invalid' }]) {
    const result = nbaNormalizeFirstBook('draftkings', input, board(changes), now)
    assert.equal(result.status, 'identity-mismatch'); assert.deepEqual(result.props, [])
  }
})

test('identity diagnostics distinguish exact rejection branches without changing withheld outcomes', () => {
  const cases: [Partial<NbaFirstBookBoard>, string][] = [
    [{ observedAt: 'invalid' }, 'invalid-observation-clock'],
    [{ observedAt: new Date(now + 30001).toISOString() }, 'future-observation'],
    [{ observedAt: new Date(now - 300001).toISOString() }, 'expired-observation'],
    [{ timeZone: 'invalid' }, 'invalid-time-zone'],
    [{ timeLabel: '8pm private-source-url' }, 'invalid-time-label'],
    [{ dateLabel: 'private-source-url' }, 'invalid-date-label'],
    [{ dateLabel: 'Tomorrow' }, 'wrong-date'],
    [{ away: 'private-source-url' }, 'away-team'],
    [{ home: 'private-source-url' }, 'home-team'],
    [{ market: 'private-source-url' }, 'wrong-market'],
  ]
  for (const [changes, reason] of cases) {
    const result = nbaNormalizeFirstBook('draftkings', input, board(changes), now)
    assert.equal(result.status, 'identity-mismatch'); assert.equal(result.complete, false)
    assert.deepEqual(result.props, []); assert.deepEqual(result.identity, { reason })
    assert.equal(JSON.stringify(result).includes('private-source-url'), false)
  }
  const invalidGame = { ...input, game: { ...game, datetime: null, status: 'Scheduled' } }
  assert.deepEqual(nbaNormalizeFirstBook('draftkings', invalidGame, board(), now).identity, { reason: 'invalid-tipoff' })
  assert.equal(nbaNormalizeFirstBook('draftkings', input, board(), now).identity, undefined)
})

test('identity diagnostic sanitizer only retains fixed codes and bounded counts', () => {
  assert.deepEqual(quotes.nbaFirstBookIdentityDiagnostic({ reason: 'ambiguous-league-event', candidates: 250, validCandidates: 2, url: 'private-source-url', player: 'private-player' }), { reason: 'ambiguous-league-event', candidates: 200, validCandidates: 2 })
  assert.equal(quotes.nbaFirstBookIdentityDiagnostic({ reason: 'private-source-url' }), undefined)
  assert.deepEqual(quotes.nbaFirstBookIdentityDiagnostic({ reason: 'wrong-date', candidates: -1, validCandidates: NaN }), { reason: 'wrong-date' })
})

test('revalidation diagnostics preserve original countdown clocks and distinguish exact failed guards', () => {
  const at = Date.parse(game.datetime!) - 22.5 * 60_000
  const value = (minutes: number, clock = at): quotes.NbaBookIdentity => ({ away: 'NO Pelicans', home: 'DEN Nuggets', dateLabel: '', timeLabel: '', timeZone: 'America/Los_Angeles', countdown: { minutes, observedAt: new Date(clock).toISOString() } })
  const prior = value(22), current = value(21, at + 60_000)
  assert.equal(quotes.nbaBookIdentityRevalidation(input, prior, current, at + 60_000), null)
  assert.deepEqual(quotes.nbaBookIdentityRevalidation(input, prior, value(18, at + 60_000), at + 60_000), {
    phase: 'comparison', reason: 'countdown-interval-changed', canonicalTip: new Date(game.datetime!).toISOString(),
    priorCountdown: { minutes: 22, readAt: prior.countdown!.observedAt }, currentCountdown: { minutes: 18, readAt: current.countdown!.observedAt },
  })
  for (const [next, reason, field] of [
    [null, 'missing-identity'], [{ ...current, home: 'Wrong team' }, 'identity-changed', 'home'],
    [{ ...current, countdown: undefined }, 'clock-mode-changed'], [value(23, at + 60_000), 'countdown-increased'],
    [value(21, at - 1), 'countdown-clock-reversed'],
  ] as const) {
    const result = quotes.nbaBookIdentityRevalidation(input, prior, next, at + 60_000)!
    assert.equal(result.phase, 'comparison'); assert.equal(result.reason, reason); assert.equal(result.field, field)
    assert.equal(quotes.nbaSameBookIdentity(input, prior, next, at + 60_000), false)
  }
  assert.equal(quotes.nbaBookIdentityRevalidation(input, value(10), current, at + 60_000)?.reason, 'countdown-increased')
  assert.equal(quotes.nbaBookIdentityRevalidation(input, value(10), value(9, at + 60_000), at + 60_000), null, 'an earlier source tip remains a valid, stricter pregame boundary')
  assert.equal(quotes.nbaBookIdentityRevalidation(input, value(0), value(0, at + 60_000), at + 60_000)?.phase, 'prior')
})

test('revalidation diagnostic sanitizer never forwards source data or invalid clocks', () => {
  const safe = { phase: 'current', reason: 'countdown-tipoff-mismatch', canonicalTip: game.datetime, priorCountdown: { minutes: 22, readAt: new Date(now).toISOString() }, currentCountdown: { minutes: 21, readAt: new Date(now + 60_000).toISOString() } }
  assert.deepEqual(quotes.nbaBookRevalidationDiagnostic({ ...safe, url: 'private-source-url', member: 'private-member', field: 'private-source-url' }), { ...safe, canonicalTip: new Date(game.datetime!).toISOString() })
  assert.equal(quotes.nbaBookRevalidationDiagnostic({ ...safe, reason: 'private-source-url' }), undefined)
  assert.equal(quotes.nbaBookRevalidationDiagnostic({ ...safe, phase: 'private-source-url' }), undefined)
  assert.equal(quotes.nbaBookRevalidationDiagnostic({ ...safe, phase: ['current'] }), undefined)
  const invalid = quotes.nbaBookRevalidationDiagnostic({ ...safe, canonicalTip: 'private-source-url', priorCountdown: { minutes: 60, readAt: new Date(now).toISOString() }, currentCountdown: { minutes: 21, readAt: 'private-source-url' } })!
  assert.equal(invalid.canonicalTip, null); assert.equal(invalid.priorCountdown, null); assert.equal(invalid.currentCountdown, null)
})



test('collector reports league ambiguity separately from a single rejected visible board', async () => {
  const source = readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const scenario of ['league', 'single-board', 'duplicate-board'] as const) {
    let closed = 0, eventNavigation = 0
    const page = { setDefaultTimeout: () => {}, route: async () => {}, goto: async () => { eventNavigation++ } }
    const imports: Record<string, unknown> = {
      'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (g: PaintGame) => modes.nbaPregameOpen(g, now) },
      './nbaFirstBookQuotes': { ...quotes, nbaNormalizeFirstBook: (...args: Parameters<typeof nbaNormalizeFirstBook>) => nbaNormalizeFirstBook(args[0], args[1], args[2], now) },
      './nbaFirstBookDom': {}, './nbaMgmProps': {}, './nbaBookPropQuotes': propQuotes,
      '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture', openSession: async () => ({ page, close: async () => { closed++ } }) },
    }
    const links = [1, 2].map(id => `https://www.nc.betmgm.com/en/sports/events/new-orleans-pelicans-denver-nuggets-${id}`)
    const boards = scenario === 'single-board' ? [board({ dateLabel: 'Tomorrow' })] : [board(), board()]
    const target = { exports: {} as typeof import('../src/lib/scrapers/nbaFirstBooks.ts') }
    class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
    new Function('require', 'module', 'exports', 'Date', 'links', 'boards', `${code}\nmgmLeagueLinks = async () => links; dkBoards = async () => boards;`)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock, links, boards)
    const result = await target.exports.collectNbaFirstBooks(scenario === 'league' ? 'betmgm' : 'draftkings', [input], now + 60_000)
    assert.equal(result.games[0].status, 'identity-mismatch'); assert.equal(result.complete, false)
    assert.deepEqual(result.games[0].props, []); assert.equal(closed, 1); assert.equal(eventNavigation, 0)
    assert.deepEqual(result.games[0].identity, scenario === 'league' ? { reason: 'ambiguous-league-event', candidates: 2 } : scenario === 'single-board' ? { reason: 'wrong-date' } : { reason: 'ambiguous-board', candidates: 2, validCandidates: 2 })
    assert.equal(JSON.stringify(result).includes('https://'), false)
  }
})


test('minute countdowns stay bound to their actual DOM clock and close at the earliest possible book tip', () => {
  const at = Date.parse(game.datetime!) - 22.5 * 60_000
  const countdown = (minutes: number, clock = at) => board({ dateLabel: '', timeLabel: '', observedAt: new Date(clock).toISOString(), countdown: { minutes, observedAt: new Date(clock).toISOString() }, market: 'First field goal scorer' })
  const initial = countdown(22), next = countdown(21, at + 60_000)
  const accepted = nbaNormalizeFirstBook('betmgm', input, next, at + 60_000)
  assert.equal(accepted.complete, true); assert.equal(accepted.props[0].updated_at, next.observedAt)
  assert.equal(quotes.nbaSameBookIdentity(input, initial, next, at + 60_000), true)
  for (const change of [{ away: 'Wrong team' }, { home: 'Wrong team' }, { dateLabel: 'Tomorrow' }, { timeZone: 'invalid' }]) assert.equal(nbaNormalizeFirstBook('betmgm', input, { ...next, ...change }, at + 60_000).complete, false)
  assert.equal(quotes.nbaSameBookIdentity(input, initial, countdown(23, at + 60_000), at + 60_000), false)
  const earlier = nbaNormalizeFirstBook('betmgm', input, countdown(10), at)
  assert.equal(earlier.complete, true); assert.equal(earlier.clockMismatch, true)
  assert.equal(nbaNormalizeFirstBook('betmgm', input, countdown(0), at).status, 'closed')
  assert.equal(nbaNormalizeFirstBook('betmgm', input, countdown(1), at).status, 'closed')
  assert.equal(nbaNormalizeFirstBook('betmgm', input, { ...initial, observedAt: new Date(at + 21 * 60_000).toISOString() }, at + 21 * 60_000).complete, false, 'a later quote timestamp cannot restart an old countdown')
  const ending = countdown(2, Date.parse(game.datetime!) - 90_000)
  assert.equal(nbaNormalizeFirstBook('betmgm', input, ending, Date.parse(game.datetime!) - 30_000).status, 'closed', 'close on the earliest possible source interval before canonical tip')
  assert.equal(nbaNormalizeFirstBook('betmgm', input, ending, Date.parse(game.datetime!)).status, 'closed')
  for (const [title, market] of Object.entries(propQuotes.MGM_MILESTONE_PANELS)) {
    const target = ['double_double', 'triple_double'].includes(market) ? '0.5' : market === 'blocks' ? 'O/U 0.5' : '15+'
    const frame = propQuotes.nbaNormalizeBookProp(input, { ...next, title, target, selectedTarget: target, expanded: true, transitioned: true, rows: [{ name: 'Alpha Diallo', side: market === 'blocks' ? 'Over' : 'Yes', odds: '+400', unavailable: false }] }, at + 60_000)
    assert.equal(frame?.complete, true, title); assert.equal(frame?.props[0].updated_at, next.observedAt)
  }
})

test('observed later MGM countdowns identify the same calendar event without moving canonical tip', () => {
  for (const [readAt, tip, minutes] of [
    ['2026-10-25T20:57:00Z', '2026-10-25T21:00:00Z', 12],
    ['2026-10-25T21:57:00Z', '2026-10-25T22:00:00Z', 12],
    ['2026-10-25T22:48:00Z', '2026-10-25T23:00:00Z', 21],
  ] as const) {
    const at = Date.parse(readAt), currentInput = { ...input, game: { ...game, datetime: tip } }
    const prior = relativeBoard(at, minutes), next = relativeBoard(at + 60_000, minutes - 1)
    const result = nbaNormalizeFirstBook('betmgm', currentInput, prior, at)
    assert.equal(result.complete, true); assert.equal(result.clockMismatch, true)
    assert.equal(result.props[0].market.over_odds, 1060); assert.equal(result.props[0].updated_at, new Date(at).toISOString())
    assert.equal(quotes.nbaBookIdentityRevalidation(currentInput, prior, next, at + 60_000), null)
    for (const delta of [0, 1]) {
      const closedAt = Date.parse(tip) + delta
      const closed = nbaNormalizeFirstBook('betmgm', currentInput, relativeBoard(closedAt, 10), closedAt)
      assert.equal(closed.status, 'closed'); assert.deepEqual(closed.props, [])
    }
  }
})

test('both countdown interval endpoints must establish the canonical date across midnight and year rollover', () => {
  const at = Date.parse('2026-12-31T23:58:00Z'), currentInput = { ...input, game: { ...game, datetime: '2027-01-01T00:03:00Z' } }
  const nextDay = relativeBoard(at, 5)
  assert.equal(nbaNormalizeFirstBook('betmgm', currentInput, nextDay, at).complete, true)
  assert.equal(nbaNormalizeFirstBook('betmgm', currentInput, { ...nextDay, dateLabel: 'Tomorrow' }, at).complete, true)
  assert.equal(nbaNormalizeFirstBook('betmgm', currentInput, { ...nextDay, dateLabel: 'Today' }, at).identity?.reason, 'wrong-date')
  const straddles = { ...currentInput, game: { ...game, datetime: '2027-01-01T00:00:00Z' } }
  assert.equal(nbaNormalizeFirstBook('betmgm', straddles, relativeBoard(at, 2), at).identity?.reason, 'wrong-date', 'earliest date cannot be guessed from the latest date')
  const wrongDay = { ...currentInput, game: { ...game, datetime: '2026-12-31T23:59:00Z' } }
  assert.equal(nbaNormalizeFirstBook('betmgm', wrongDay, nextDay, at).identity?.reason, 'wrong-date')
  const staleLabel = { ...nextDay, dateLabel: 'Tomorrow', observedAt: '2027-01-01T00:00:30Z' }
  assert.equal(nbaNormalizeFirstBook('betmgm', currentInput, staleLabel, Date.parse(staleLabel.observedAt)).complete, true, 'relative date labels use the original DOM calendar, not a later quote timestamp')
})

test('countdown date and overlap use absolute time through both DST clock changes', () => {
  for (const [readAt, tip] of [
    ['2026-11-01T05:58:00Z', '2026-11-01T06:03:00Z'],
    ['2027-03-14T06:58:00Z', '2027-03-14T07:03:00Z'],
  ]) {
    const at = Date.parse(readAt), currentInput = { ...input, game: { ...game, datetime: tip } }
    const prior = relativeBoard(at, 12, { timeZone: 'America/New_York' }), current = relativeBoard(at + 120_000, 10, { timeZone: 'America/New_York' })
    assert.equal(nbaNormalizeFirstBook('betmgm', currentInput, prior, at).complete, true)
    assert.equal(quotes.nbaBookIdentityRevalidation(currentInput, prior, current, at + 120_000), null)
    assert.equal(nbaNormalizeFirstBook('betmgm', currentInput, current, Date.parse(tip)).status, 'closed')
  }
})

test('the original earlier source boundary cannot be restarted by a later overlapping countdown', () => {
  const at = Date.parse(game.datetime!) - 10 * 60_000, prior = relativeBoard(at, 3), current = relativeBoard(at + 60_000, 3)
  assert.equal(nbaNormalizeFirstBook('betmgm', input, prior, at + 119_999).complete, true)
  assert.equal(nbaNormalizeFirstBook('betmgm', input, prior, at + 120_000).status, 'closed')
  const later = at + 150_000
  assert.equal(nbaNormalizeFirstBook('betmgm', input, current, later).complete, true, 'the later clock alone would still be open')
  const result = quotes.nbaBookIdentityRevalidation(input, prior, current, later)!
  assert.equal(result.phase, 'prior'); assert.equal(result.reason, 'closed')
  assert.equal(result.priorCountdown!.readAt, new Date(at).toISOString())
  assert.equal(nbaNormalizeFirstBook('betmgm', input, { ...prior, observedAt: new Date(later).toISOString() }, later).status, 'closed')
})

test('nonoverlapping countdown intervals reject drift even with nonincreasing minutes and forward clocks', () => {
  const at = Date.parse(game.datetime!) - 20 * 60_000, prior = relativeBoard(at, 12)
  for (const current of [relativeBoard(at + 180_000, 12), relativeBoard(at + 60_000, 8)]) {
    const checkedAt = Date.parse(current.observedAt)
    assert.equal(nbaNormalizeFirstBook('betmgm', input, current, checkedAt).complete, true, 'each date/clock alone is a valid pregame observation')
    const result = quotes.nbaBookIdentityRevalidation(input, prior, current, checkedAt)!
    assert.equal(result.phase, 'comparison'); assert.equal(result.reason, 'countdown-interval-changed')
    assert.equal(result.priorCountdown!.readAt, prior.countdown!.observedAt)
  }
  assert.equal(quotes.nbaBookIdentityRevalidation(input, prior, relativeBoard(at + 60_000, 11), at + 60_000), null)
})

test('relative-date identity does not loosen observation freshness, mixed clocks or numeric bounds', () => {
  const at = Date.parse(game.datetime!) - 20 * 60_000, valid = relativeBoard(at, 12)
  const cases: [Partial<NbaFirstBookBoard>, string][] = [
    [{ observedAt: new Date(at + 30_001).toISOString() }, 'future-observation'],
    [{ observedAt: new Date(at - 300_001).toISOString() }, 'expired-observation'],
    [{ countdown: { minutes: 12, observedAt: 'invalid' } }, 'invalid-observation-clock'],
    [{ countdown: { minutes: 12, observedAt: new Date(at + 30_001).toISOString() } }, 'invalid-observation-clock'],
    [{ countdown: { minutes: 12, observedAt: new Date(at - 300_001).toISOString() } }, 'invalid-observation-clock'],
    [{ timeLabel: '1:00 AM' }, 'invalid-time-label'],
    ...[-1, 60, 12.5, NaN].map(minutes => [{ countdown: { minutes, observedAt: valid.observedAt } }, 'invalid-time-label'] as [Partial<NbaFirstBookBoard>, string]),
  ]
  for (const [changes, reason] of cases) {
    const result = nbaNormalizeFirstBook('betmgm', input, { ...valid, ...changes }, at)
    assert.equal(result.identity?.reason, reason); assert.deepEqual(result.props, [])
  }
})

test('MGM countdown reader accepts only the exact single visible event-time text and records its original read time', () => {
  const f = domFixture('<span class="breadcrumb-title">NBA</span><ms-scoreboard-participant><div class="participant-name-value">Pelicans</div></ms-scoreboard-participant><ms-scoreboard-participant><div class="participant-name-value">Nuggets</div></ms-scoreboard-participant><div class="event-time">Starting in<span>22 min</span></div><div hidden class="event-time">Starting in99 min</div>')
  try {
    const before = Date.now(), value = f.readers.readMgmFirstIdentity()!, after = Date.now()
    assert.equal(value.countdown?.minutes, 22); assert.ok(Date.parse(value.countdown!.observedAt) >= before && Date.parse(value.countdown!.observedAt) <= after)
    const clock = f.dom.window.document.querySelector('.event-time')!
    clock.innerHTML = '<span class="date">Starting in</span><span class="time">22 min</span>'
    assert.equal(f.readers.readMgmFirstIdentity()!.countdown?.minutes, 22); assert.equal(f.readers.readMgmFirstIdentity()!.dateLabel, ''); assert.equal(f.readers.readMgmFirstIdentity()!.timeLabel, '')
    for (const text of ['Starting in2 hours', 'Starting in22 min promotional text', 'Other event Starting in22 min']) { clock.textContent = text; assert.equal(f.readers.readMgmFirstIdentity()!.countdown, undefined) }
    const duplicate = clock.cloneNode(true); f.dom.window.document.body.append(duplicate); assert.equal(f.readers.readMgmFirstIdentity(), null)
  } finally { f.dom.window.close() }
})


test('Tomorrow date matching uses the visible browser calendar across year rollover', () => {
  const at = Date.parse('2026-12-31T20:00:00Z'), next = { ...game, date: '2027-01-01', datetime: '2027-01-02T01:00:00Z' }
  const result = nbaNormalizeFirstBook('draftkings', { ...input, game: next }, board({ dateLabel: 'Tomorrow', observedAt: new Date(at).toISOString() }), at)
  assert.equal(result.complete, true)
  assert.equal(nbaNormalizeFirstBook('draftkings', { ...input, game: next }, board({ dateLabel: 'Today', observedAt: new Date(at).toISOString() }), at).status, 'identity-mismatch')
})

test('canonical tip and an earlier sportsbook clock each close observation without relabeling live odds', () => {
  for (const time of ['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z']) {
    const at = Date.parse(time)
    const result = nbaNormalizeFirstBook('betmgm', input, board({ market: 'First field goal scorer', timeLabel: '4:59PM', observedAt: time }), at)
    assert.equal(result.status, 'closed'); assert.deepEqual(result.props, [])
  }
  const at = Date.parse('2026-10-25T00:59:59Z')
  const result = nbaNormalizeFirstBook('draftkings', input, board({ observedAt: new Date(at).toISOString() }), at + 1000)
  assert.equal(result.status, 'closed'); assert.deepEqual(result.props, [])
})

test('only uniquely resolved canonical game-roster players are accepted, including verified display aliases', () => {
  const sarr = { ...player, id: 1028028405, first_name: 'Alexandre', last_name: 'Sarr' }
  assert.equal(nbaNormalizeFirstBook('draftkings', { game, roster: [sarr] }, board({ rows: [{ name: 'Alex Sarr', odds: '+700' }] }), now).props[0].player_id, sarr.id)
  for (const roster of [[{ ...player, team: { ...game.home_team, id: 99 } }], [player, { ...player, id: 43 }]]) {
    const result = nbaNormalizeFirstBook('draftkings', { game, roster }, board(), now)
    assert.equal(result.complete, false); assert.equal(result.unmatched, 1); assert.deepEqual(result.props, [])
  }
})

test('verified Joshua Giddey alias is pinned to Josh Giddey ID and still rejects ambiguous or off-roster players', () => {
  const giddey = { ...player, id: 17896065, first_name: 'Josh', last_name: 'Giddey' }
  const value = board({ market: 'First field goal scorer', rows: [{ name: 'Joshua Giddey', odds: '+825' }] })
  const accepted = nbaNormalizeFirstBook('betmgm', { game, roster: [giddey] }, value, now)
  assert.equal(accepted.complete, true); assert.equal(accepted.props[0].player_id, giddey.id); assert.equal(accepted.props[0].market.over_odds, 825)
  for (const roster of [[{ ...giddey, id: 1 }], [{ ...giddey, first_name: 'James' }], [giddey, { ...giddey, id: 2, first_name: 'Joshua' }]]) {
    assert.deepEqual(nbaNormalizeFirstBook('betmgm', { game, roster }, value, now).props, [])
  }
})

test('direct Ron Holland quotes preserve distinct First Score and First FG contracts and exact roster guards', () => {
  const holland={...player,id:1028026508,first_name:'Ronald',last_name:'Holland II'}
  for(const name of ['Ron Holland','Ron Holland II'])for(const book of ['draftkings','betmgm'] as const){
    const value=board({market:book==='betmgm'?'First field goal scorer':'1st Point',rows:[{name,odds:'+1700'}]})
    const result=nbaNormalizeFirstBook(book,{game,roster:[holland]},value,now)
    assert.equal(result.complete,true);assert.equal(result.unmatched,0)
    assert.equal(result.props[0].player_id,holland.id);assert.equal(result.props[0].prop_type,book==='betmgm'?'first_field_goal':'first_score')
    assert.equal(result.props[0].market.over_odds,1700);assert.equal(result.props[0].updated_at,value.observedAt);assert.equal(result.props[0].opening,undefined)
    for(const roster of [[],[{...holland,id:999}],[{...holland,first_name:'Other'}],[{...holland,team:{...game.home_team,id:999}}],[holland,{...holland,id:999,first_name:'Ron'}]]){
      const rejected=nbaNormalizeFirstBook(book,{game,roster},value,now)
      assert.deepEqual(rejected.props,[]);assert.equal(rejected.unmatched,1);assert.equal(rejected.complete,false)
    }
  }
})

test('partial, unexpanded, malformed and absent boards never claim complete or an authoritative empty market', () => {
  for (const changes of [{ expanded: false }, { rows: [...board().rows, { name: 'Unverified Player', odds: '+900' }] }]) {
    const result = nbaNormalizeFirstBook('draftkings', input, board(changes), now)
    assert.equal(result.status, 'partial'); assert.equal(result.complete, false); assert.equal(result.props.length, 1)
  }
  for (const rows of [[], [{ name: 'Alpha Diallo', odds: 'suspended' }], [{ name: 'Alpha Diallo', odds: '+99' }]]) {
    const result = nbaNormalizeFirstBook('draftkings', input, board({ rows }), now)
    assert.equal(result.status, 'unavailable'); assert.equal(result.complete, false); assert.deepEqual(result.props, [])
  }
})

test('duplicate contradictory prices are withheld and stale/future captures cannot refresh a quote', () => {
  const result = nbaNormalizeFirstBook('draftkings', input, board({ rows: [...board().rows, { name: 'Alpha Diallo', odds: '+1070' }] }), now)
  assert.equal(result.complete, false); assert.equal(result.unmatched, 1); assert.deepEqual(result.props, [])
  for (const at of [now - 300001, now + 30001]) {
    assert.deepEqual(nbaNormalizeFirstBook('draftkings', input, board({ observedAt: new Date(at).toISOString() }), now).props, [])
  }
})

function domFixture(html: string) {
  const dom = new JSDOM(html), target = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBookDom.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'document', 'getComputedStyle', code)(target, target.exports, dom.window.document, dom.window.getComputedStyle.bind(dom.window))
  return { dom, readers: target.exports as typeof import('../src/lib/scrapers/nbaFirstBookDom.ts') }
}
const dkRow = (name: string, price: string, disabled = false) => `<div data-testid="market-label"><p class="cb-market__label--truncate-strings">${name}</p></div><button ${disabled ? 'disabled' : ''}><span data-testid="button-odds-market-board">${price}</span></button>`
const dkCard = (title: string, rows: string, tail = '') => `<div class="cb-non-collapsible"><div class="cb-title__left-team"><span class="cb-title__team-name">NO Pelicans</span></div><div class="cb-title__right-team"><span class="cb-title__team-name">DEN Nuggets</span></div><span class="cb-title__day-time">Today 7:00 PM</span><div data-testid="market-template"><span class="cb-market__label-name__text">${title}</span>${rows}</div>${tail}</div>`

test('DK DOM reader keeps names paired to immediate price buttons in only the exact market/card', () => {
  const fixture = domFixture(dkCard('1st Points Scorer', dkRow('Alpha Diallo', '+1060') + dkRow('Jamal Murray', '+397', true)) + dkCard('First 3 Pointer', dkRow('Wrong Contract', '+900')) + `<div hidden>${dkCard('1st Points Scorer', dkRow('Hidden Player', '+999'))}</div>`)
  try {
    const boards = fixture.readers.readDkFirstBoards()
    assert.equal(boards.length, 1); assert.equal(boards[0].dateLabel, 'Today'); assert.equal(boards[0].timeLabel, '7:00 PM')
    assert.deepEqual(boards[0].rows, [{ name: 'Alpha Diallo', odds: '+1060' }, { name: 'Jamal Murray', odds: '' }]); assert.equal(boards[0].expanded, true)
    fixture.dom.window.document.querySelector('.cb-non-collapsible')!.insertAdjacentHTML('beforeend', '<button>Show More</button>')
    assert.equal(fixture.readers.readDkFirstBoards()[0].expanded, false)
  } finally { fixture.dom.window.close() }
})

test('MGM DOM reader scopes to expanded exact panel and excludes hit-rate/statistic content', () => {
  const row = '<div class="attribute-key"><span class="goal-scorer-player-name">Alpha Diallo</span><span>Hit Rate: 0%</span></div><ms-option><div class="name">Alpha Diallo</div><div class="option-value"><ms-font-resizer>+900</ms-font-resizer></div></ms-option>'
  const fixture = domFixture(`<div id="first" aria-hidden="false">${row}<ms-option-panel-bottom-action><div class="show-more-less-button"><span>Show More</span><span aria-hidden="true">›</span></div></ms-option-panel-bottom-action></div><div id="other" aria-hidden="false">${row.replaceAll('+900', '+999')}</div>`)
  try {
    assert.deepEqual(fixture.readers.readMgmFirstRows('first'), { rows: [{ name: 'Alpha Diallo', odds: '+900' }], expanded: false })
    fixture.dom.window.document.querySelector('#first .show-more-less-button span')!.textContent = 'Show Less'
    assert.equal(fixture.readers.readMgmFirstRows('first').expanded, true)
    fixture.dom.window.document.querySelector('#first')!.setAttribute('aria-hidden', 'true')
    assert.deepEqual(fixture.readers.readMgmFirstRows('first'), { rows: [], expanded: false })
  } finally { fixture.dom.window.close() }
})

test('MGM identity is scoped to its NBA scoreboard and visible date, not odds rows or hidden duplicate layouts', () => {
  const fixture = domFixture('<span class="breadcrumb-title">NBA</span><ms-scoreboard-participant><div class="participant-name-value">Pelicans</div></ms-scoreboard-participant><ms-scoreboard-participant><div class="participant-name-value">Nuggets</div></ms-scoreboard-participant><div class="event-time"><span class="date">Today</span><span class="time">4:59 PM</span></div><div hidden><ms-scoreboard-participant><div class="participant-name-value">Wrong team</div></ms-scoreboard-participant></div><div class="six-pack-player-name">Unrelated odds row</div>')
  try {
    const metadata = fixture.readers.readMgmFirstIdentity()!
    assert.equal(metadata.away, 'Pelicans'); assert.equal(metadata.home, 'Nuggets'); assert.equal(metadata.timeLabel, '4:59 PM')
    const result = nbaNormalizeFirstBook('betmgm', input, board({ ...metadata, timeZone: 'America/Los_Angeles', market: 'First field goal scorer' }), now)
    assert.equal(result.complete, true)
    fixture.dom.window.document.querySelector('.breadcrumb-title')!.textContent = 'NCAA'
    assert.equal(fixture.readers.readMgmFirstIdentity(), null)
  } finally { fixture.dom.window.close() }
})

test('cloud session is fresh, CAPTCHA solving disabled, capped at 300 seconds and released on navigation failure', async () => {
  let opened = 0, closed = 0, releaseFails = false
  const imports: Record<string, unknown> = {
    'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (game: paint.PaintGame) => modes.nbaPregameOpen(game, now) }, './nbaFirstBookQuotes': quotes, './nbaFirstBookDom': {}, './nbaMgmProps': {}, './nbaBookPropQuotes': propQuotes,
    '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture-mgm', openSession: async (options: Record<string, unknown>) => {
      opened++; assert.equal(options.timeoutSeconds, 300); assert.equal(options.solveCaptchas, false); assert.equal(options.contextId, undefined)
      assert.equal(options.requestTimeoutMs, 20_000); assert.equal(options.verifyRelease, true)
      return { page: { setDefaultTimeout: () => {}, route: async () => {}, goto: async () => { throw new Error('fixture network failure') } }, close: async () => { closed++; if (releaseFails) throw new Error('private cleanup credential') } }
    } },
  }
  const target = { exports: {} }, code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  new Function('require', 'module', 'exports', 'Date', code)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock)
  const collector = target.exports as typeof import('../src/lib/scrapers/nbaFirstBooks.ts')
  const result = await collector.collectNbaFirstBooks('draftkings', [input])
  assert.equal(opened, 1); assert.equal(closed, 1); assert.equal(result.complete, false)
  assert.deepEqual(result.games[0].props, []); assert.equal(result.games[0].status, 'error')
  assert.deepEqual(result.errors, [{ code: 'navigation-failed', stage: 'league-navigation', reason: 'network' }]); assert.equal(JSON.stringify(result).includes('fixture network failure'), false)
  await collector.collectNbaFirstBooks('draftkings', [{ ...input, game: { ...game, status_state: 'final' } }])
  assert.equal(opened, 1)
  releaseFails = true
  const failure = await collector.collectNbaFirstBooks('draftkings', [input])
  assert.equal(opened, 2); assert.equal(closed, 2); assert.equal(failure.complete, false)
  assert.deepEqual(failure.errors, [{ code: 'navigation-failed', stage: 'league-navigation', reason: 'network' }, { code: 'session-unavailable', stage: 'session-release', reason: 'unknown' }])
  assert.equal(JSON.stringify(failure).includes('private cleanup'), false)
  const expired = await collector.collectNbaFirstBooks('draftkings', [input], now + 19_999)
  assert.equal(opened, 2); assert.equal(expired.games[0].status, 'deadline')
  await assert.rejects(collector.collectNbaFirstBooks('draftkings', [input, { ...input, game: { ...game, id: 999 } }]), /Invalid NBA capture slate/)
  assert.equal(opened, 2)
})

test('MGM navigation selects All before locating First FG, expands its scoped Show More and fails on absent market layout', async () => {
  const source = readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  async function scenario(layout = true) {
    const calls: string[] = []
    let all = false, expanded = false, more = false
    const metadata = { away: 'Pelicans', home: 'Nuggets', dateLabel: 'Today', timeLabel: '4:59 PM', timeZone: 'America/Los_Angeles' }
    const readers = { readMgmFirstIdentity: function identity() {}, readMgmFirstRows: function rows() {} }
    const imports: Record<string, unknown> = { 'server-only': {}, '../browserbase': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (game: paint.PaintGame) => modes.nbaPregameOpen(game, now) }, './nbaFirstBookQuotes': { ...quotes, nbaBookIdentityRevalidation: (game: typeof input, prior: quotes.NbaBookIdentity, current: quotes.NbaBookIdentity) => quotes.nbaBookIdentityRevalidation(game, prior, current, now) }, './nbaFirstBookDom': readers, './nbaMgmProps': {}, './nbaBookPropQuotes': propQuotes }
    const target = { exports: {} }
    const run = new Function('require', 'module', 'exports', `${code}\nreturn mgmBoard`)((name: string) => imports[name], target, target.exports) as (page: unknown, url: string, deadline: number, value: typeof input) => Promise<NbaFirstBookBoard>
    const locator = (kind: string) => ({
      first() { return this }, filter() { return this },
      count: async () => kind === 'all' ? 1 : kind === 'marketHeaders' ? Number(all && layout) : kind === 'first' ? Number(all && layout) : kind === 'more' ? Number(!more) : 1,
      isVisible: async () => true, waitFor: async () => {},
      getAttribute: async (name: string) => name === 'aria-controls' ? 'first-panel' : String(expanded),
      click: async () => { calls.push(kind); if (kind === 'all') all = true; if (kind === 'first') expanded = true; if (kind === 'more') more = true },
      getByText: () => locator('more'),
    })
    const page = {
      goto: async () => { calls.push('navigate') }, waitForTimeout: async () => {},
      getByRole: (role: string, options: { name: string; exact: boolean }) => { assert.equal(role, 'button'); assert.deepEqual(options, { name: 'All', exact: true }); return locator('all') },
      locator: (selector: string) => locator(selector === 'button[aria-controls][aria-expanded]' ? 'marketHeaders' : selector === 'button[aria-controls]' ? 'first' : selector === '#first-panel' ? 'panel' : 'other'),
      evaluate: async (fn: unknown) => fn === readers.readMgmFirstIdentity ? metadata : fn === readers.readMgmFirstRows ? { rows: more ? [{ name: 'Alpha Diallo', odds: '+900' }] : [], expanded: more } : false,
    }
    return { run: () => run(page, 'https://www.nc.betmgm.com/en/sports/events/observed-link-123', Date.now() + 10_000, input), calls }
  }
  const valid = await scenario(), captured = await valid.run()
  assert.deepEqual(valid.calls, ['navigate', 'all', 'first', 'more']); assert.equal(captured.expanded, true)
  assert.deepEqual(captured.rows, [{ name: 'Alpha Diallo', odds: '+900' }])
  const missing = await scenario(false)
  await assert.rejects(missing.run(), (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'layout-unavailable' && 'stage' in error && error.stage === 'event-menu')); assert.deepEqual(missing.calls, ['navigate', 'all'])
})

test('one MGM session finishes every First Basket board before bounded regular ladders, even if a ladder fails', async () => {
  const slate = 'ABCDEFGH'.split('').map((letter, index) => ({ game: { ...game, id: 100 + index, home_team: { ...game.home_team, id: 50 + index, name: `Home ${letter}`, full_name: `Denver ${letter}` } }, roster: [player] }))
  const links = slate.map(value => `https://www.nc.betmgm.com/en/sports/events/new-orleans-pelicans-denver-${value.game.home_team.full_name.at(-1)!.toLowerCase()}-${value.game.id}`)
  const first: number[] = [], regular: number[] = [], budgets: number[] = [], savedFirst: number[] = [], savedRegular: number[] = [], revisited: string[] = []
  let releaseSlow!: () => void
  const slowInspection = new Promise<void>(resolve => { releaseSlow = resolve })
  let reclaimedDeadline = 0
  let opened = 0, closed = 0, pages = 0
  const locator = () => ({ first() { return this }, waitFor: async () => {}, count: async () => 1, click: async () => {}, evaluateAll: async () => links })
  const makePage = () => {
    pages++
    return { setDefaultTimeout: () => {}, route: async () => {}, getByRole: locator, locator, close: async () => {}, context: () => ({ newPage: async () => makePage() }) }
  }
  const imports: Record<string, unknown> = {
    'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (game: paint.PaintGame) => modes.nbaPregameOpen(game, now) }, './nbaFirstBookQuotes': { ...quotes, nbaNormalizeFirstBook: (...args: Parameters<typeof nbaNormalizeFirstBook>) => nbaNormalizeFirstBook(args[0], args[1], args[2], now) }, './nbaFirstBookDom': {}, './nbaBookPropQuotes': propQuotes,
    './nbaMgmProps': { collectMgmProps: async (_page: unknown, value: typeof input, deadline: number | (() => number)) => {
      assert.equal(first.length, slate.length, 'a deep ladder must never run ahead of an unvisited First Basket game')
      assert.equal(savedFirst.length, slate.length, 'verified First observations must reach persistence before deep ladders begin')
      regular.push(value.game.id); budgets.push((typeof deadline === 'function' ? deadline() : deadline) - now)
      if (regular.length === slate.length) releaseSlow()
      if (regular.length === 1) {
        await slowInspection
        reclaimedDeadline = (typeof deadline === 'function' ? deadline() : deadline) - now
        throw new Error('slow ladder fixture')
      }
      return { frames: [], coverage: [] }
    } },
    '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture', openSession: async () => { opened++; return { page: makePage(), close: async () => { closed++ } } } },
  }
  const target = { exports: {} }, code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const fakeBoard = async (_page: unknown, url: string) => {
    const index = links.indexOf(url); assert.ok(index >= 0); first.push(slate[index].game.id)
    await Promise.resolve()
    return board({ away: game.visitor_team.full_name, home: slate[index].game.home_team.full_name, market: 'First field goal scorer', timeLabel: '4:59 PM', rows: [{ name: 'Alpha Diallo', odds: '+900' }] })
  }
  new Function('require', 'module', 'exports', 'Date', 'fakeBoard', 'fakeEvent', `${code}\nmgmBoard = fakeBoard; mgmEvent = fakeEvent; openPage = async () => {};`)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock, fakeBoard, async (_page: unknown, url: string) => { revisited.push(url); return {} })
  const collector = target.exports as typeof import('../src/lib/scrapers/nbaFirstBooks.ts')
  const result = await collector.collectNbaFirstBooks('betmgm', slate, now + 220_000, {
    onFirst: async item => { assert.equal(closed, 0); assert.equal(item.props[0].updated_at, board().observedAt); savedFirst.push(item.gameId) },
    onRegular: async (gameId, frames, coverage, observedAt) => { assert.equal(closed, 0); assert.deepEqual(frames, []); assert.deepEqual(coverage, []); assert.equal(observedAt, board().observedAt); savedRegular.push(gameId) },
  })
  assert.equal(opened, 1); assert.equal(closed, 1); assert.equal(pages, 2)
  assert.equal(result.games.length, 8); assert.ok(result.games.every(value => value.complete)); assert.equal(result.complete, false, 'a failed regular ladder must not certify the whole collection')
  assert.equal(regular.length, 8); assert.ok(budgets.every(value => value > 0 && value <= 220_000)); assert.ok(budgets[0] <= 54_000)
  assert.equal(reclaimedDeadline, 220_000, 'an active scan must inherit unused global time once no game is waiting for a worker')
  assert.deepEqual(new Set(regular.slice(0, 2)), new Set(first.slice(-2)), 'regular inspection must reuse both already-loaded final event pages first')
  assert.equal(revisited.length, 6)
  assert.equal(savedFirst.length, 8); assert.equal(savedRegular.length, 7)
  assert.equal(new Set(savedFirst).size, 8); assert.equal(new Set(savedRegular).size, 7)
  assert.equal(result.regularCoverage!.length, Object.keys(propQuotes.MGM_MILESTONE_PANELS).length)
  assert.ok(result.regularCoverage!.every(value => !value.complete))
})

async function retainedMgmScenario(failure?: 'allocation' | 'preparation' | 'navigation') {
  const slate = 'ABCD'.split('').map((letter, index) => ({ game: { ...game, id: 100 + index, home_team: { ...game.home_team, id: 50 + index, name: `Home ${letter}`, full_name: `Denver ${letter}` } }, roster: [player] }))
  const links = slate.map(value => `https://www.nc.betmgm.com/en/sports/events/new-orleans-pelicans-denver-${value.game.home_team.full_name.at(-1)!.toLowerCase()}-${value.game.id}`)
  const first: number[] = [], regular: number[] = [], saved: number[] = [], revisited: number[] = []
  const regularPages = new Map<number, number>(), firstPages = new Map<number, number>()
  let opened = 0, closed = 0, pages = 0, allocations = 0, active = 0, maxActive = 0
  const busy = new Set<number>()
  type FixturePage = { id: number; current: number | null }
  async function work<T>(page: FixturePage, operation: () => T): Promise<T> {
    assert.equal(busy.has(page.id), false, 'one physical page must never serve two concurrent games')
    busy.add(page.id); active++; maxActive = Math.max(active, maxActive)
    assert.ok(active <= 2, 'retained pages must not add active navigation or inspection workers')
    try { await new Promise<void>(resolve => setImmediate(resolve)); return operation() }
    finally { busy.delete(page.id); active-- }
  }
  const locator = () => ({ first() { return this }, waitFor: async () => {}, count: async () => 1, click: async () => {}, evaluateAll: async () => links })
  const makePage = () => {
    const value = { id: ++pages, current: null as number | null,
      setDefaultTimeout: () => {}, route: async () => { if (failure === 'preparation' && value.id === 3) throw new Error('private setup failure') },
      getByRole: locator, locator, close: async () => {}, context: () => ({ newPage: async () => {
        allocations++
        if (failure === 'allocation' && allocations === 2) throw new Error('private allocation failure')
        return makePage()
      } }),
    }
    return value
  }
  const imports: Record<string, unknown> = {
    'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (game: paint.PaintGame) => modes.nbaPregameOpen(game, now) },
    './nbaFirstBookQuotes': { ...quotes, nbaNormalizeFirstBook: (...args: Parameters<typeof nbaNormalizeFirstBook>) => nbaNormalizeFirstBook(args[0], args[1], args[2], now) },
    './nbaFirstBookDom': {}, './nbaBookPropQuotes': propQuotes,
    './nbaMgmProps': { collectMgmProps: async (page: FixturePage, value: typeof input) => work(page, () => {
      assert.equal(first.length, slate.length, 'First Basket retains priority for every listed game')
      assert.equal(page.current, value.game.id, 'a retained page must still belong to the exact inspected game')
      assert.notEqual(failure === 'navigation' ? 102 : -1, value.game.id, 'failed First navigation cannot establish a reusable binding')
      regular.push(value.game.id); regularPages.set(value.game.id, page.id)
      return { frames: [], coverage: [] }
    }) },
    '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture', openSession: async () => { opened++; return { page: makePage(), close: async () => { assert.equal(active, 0); closed++ } } } },
  }
  const target = { exports: {} }, code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const fakeBoard = async (page: FixturePage, url: string) => work(page, () => {
    const index = links.indexOf(url); assert.ok(index >= 0)
    const value = slate[index]; first.push(value.game.id)
    if (failure === 'navigation' && value.game.id === 102) { page.current = -1; throw new Error('private failed navigation left unrelated content') }
    page.current = value.game.id; firstPages.set(value.game.id, page.id)
    return board({ away: game.visitor_team.full_name, home: value.game.home_team.full_name, market: 'First field goal scorer', timeLabel: '4:59 PM', rows: [{ name: 'Alpha Diallo', odds: '+900' }] })
  })
  const fakeEvent = async (page: FixturePage, url: string) => work(page, () => {
    const index = links.indexOf(url); assert.ok(index >= 0)
    page.current = slate[index].game.id; revisited.push(page.current); return {}
  })
  new Function('require', 'module', 'exports', 'Date', 'fakeBoard', 'fakeEvent', `${code}\nmgmBoard = fakeBoard; mgmEvent = fakeEvent; openPage = async () => {};`)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock, fakeBoard, fakeEvent)
  const collector = target.exports as typeof import('../src/lib/scrapers/nbaFirstBooks.ts')
  const result = await collector.collectNbaFirstBooks('betmgm', slate, now + 240_000, { onRegular: async gameId => { saved.push(gameId) } })
  assert.equal(opened, 1); assert.equal(closed, 1); assert.equal(maxActive, 2); assert.ok(pages <= 4)
  assert.equal(new Set(regular).size, regular.length); assert.deepEqual(saved, regular)
  assert.equal(JSON.stringify(result).includes('private'), false)
  return { result, pages, firstPages, regularPages, revisited, regular }
}

test('four retained MGM event pages use only two active workers and avoid every second event load', async () => {
  const value = await retainedMgmScenario()
  assert.equal(value.pages, 4); assert.equal(value.result.complete, true)
  assert.equal(value.regular.length, 4); assert.equal(new Set(value.regularPages.values()).size, 4)
  assert.deepEqual(value.regularPages, value.firstPages); assert.deepEqual(value.revisited, [])
})

test('retained-page allocation or setup failure falls back to separate worker pages without concurrent reuse', async () => {
  for (const failure of ['allocation', 'preparation'] as const) {
    const value = await retainedMgmScenario(failure)
    assert.equal(value.result.complete, true); assert.equal(value.regular.length, 4)
    assert.ok(value.revisited.length >= 1, 'fallback must reload any displaced event before regular inspection')
    assert.equal(new Set(value.regularPages.values()).size, 2, 'the fallback owns only the two original worker pages')
  }
})

test('failed First event navigation is excluded from retained inspection while healthy pages remain usable', async () => {
  const value = await retainedMgmScenario('navigation')
  assert.equal(value.result.complete, false); assert.equal(value.regular.length, 3)
  assert.equal(value.result.games.find(item => item.gameId === 102)?.status, 'error')
  assert.ok(value.result.regularCoverage!.filter(scope => scope.gameId === 102).every(scope => !scope.complete))
  assert.equal(value.regularPages.has(102), false); assert.deepEqual(value.revisited, [])
})

type RecoveryScenario = 'timeout' | 'network' | 'challenge' | 'unreadable' | 'hung-check' | 'closed' | 'short-budget' | 'closed-during-check' | 'short-during-check' | 'wrong-identity' | 'closed-after-navigation' | 'navigation-failure' | 'target-closed' | 'identity-failure' | 'first-write-timeout' | 'regular-write-timeout'
async function firstExpansionRecovery(scenario: RecoveryScenario) {
  let clock = now, firstCalls = 0, challengeReads = 0, navigations = 0, inspections = 0, firstWrites = 0, regularWrites = 0, closed = 0
  const deadlines: number[] = [], saved: paint.PaintProp[] = []
  const link = 'https://www.nc.betmgm.com/en/sports/events/new-orleans-pelicans-denver-nuggets-21717953'
  const metadata = { away: 'Pelicans', home: 'Nuggets', dateLabel: 'Today', timeLabel: '4:59 PM', timeZone: 'America/Los_Angeles' }
  const timeout = () => Object.assign(new Error('private source timeout'), { name: 'TimeoutError' })
  const page = { current: 'stale-first-binding', identity: metadata,
    setDefaultTimeout: () => {}, route: async () => {}, close: async () => {},
    evaluate: async () => {
      challengeReads++
      if (scenario === 'unreadable') throw new Error('private unreadable page')
      if (scenario === 'hung-check') return new Promise<boolean>(() => {})
      if (scenario === 'closed-during-check') clock = Date.parse(game.datetime!)
      if (scenario === 'short-during-check') clock = now + 221_000
      return scenario === 'challenge'
    },
  }
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const imports: Record<string, unknown> = {
    'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (value: PaintGame) => modes.nbaPregameOpen(value, clock) },
    './nbaFirstBookQuotes': { ...quotes, nbaNormalizeFirstBook: (...args: Parameters<typeof nbaNormalizeFirstBook>) => nbaNormalizeFirstBook(args[0], args[1], args[2], clock) },
    './nbaFirstBookDom': {}, './nbaBookPropQuotes': propQuotes,
    './nbaMgmProps': { collectMgmProps: async (worker: typeof page, value: typeof input, deadline: () => number) => {
      inspections++; deadlines.push(deadline())
      assert.equal(worker.current, link, 'recovery must navigate again instead of trusting the First page binding')
      const observedAt = new Date(clock).toISOString()
      const frame = propQuotes.nbaNormalizeBookProp(value, { ...worker.identity, observedAt, title: 'Player points', target: '20+', selectedTarget: '20+', expanded: true, transitioned: true, rows: [{ name: 'Alpha Diallo', side: 'Yes', odds: '+400', unavailable: false }] }, clock)
      return frame?.complete ? { frames: [frame], coverage: [{ gameId: value.game.id, market: 'points', complete: true, observedAt, contracts: [frame.contractKey] }] }
        : { frames: [], coverage: propQuotes.nbaUnresolvedBookCoverage(value.game.id, observedAt) }
    } },
    '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture', openSession: async () => ({ page, close: async () => { closed++ } }) },
  }
  const source = readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} as typeof import('../src/lib/scrapers/nbaFirstBooks.ts') }
  const fakeBoard = async (worker: typeof page, url: string, failure: (stage: string, error: Error) => Error) => {
    firstCalls++; assert.equal(url, link)
    if (scenario === 'first-write-timeout') { worker.current = url; return board({ ...metadata, market: 'First field goal scorer' }) }
    if (scenario === 'closed') clock = Date.parse(game.datetime!)
    if (scenario === 'short-budget') clock = now + 221_000
    throw failure(scenario === 'identity-failure' ? 'first-revalidate' : 'first-expand', scenario === 'network' ? new Error('net::ERR_CONNECTION_RESET private source') : scenario === 'target-closed' ? new Error('Target page closed') : scenario === 'identity-failure' ? new Error('layout-unavailable') : timeout())
  }
  const fakeEvent = async (worker: typeof page, url: string, deadline: number) => {
    navigations++; deadlines.push(deadline); assert.equal(url, link)
    if (scenario === 'navigation-failure') throw new Error('Target page closed')
    worker.current = url
    if (scenario === 'wrong-identity') worker.identity = { ...metadata, away: 'Wrong team' }
    if (scenario === 'closed-after-navigation') clock = Date.parse(game.datetime!)
    return worker.identity
  }
  new Function('require', 'module', 'exports', 'Date', 'fakeBoard', 'fakeEvent', 'link', `${code}\nmgmLeagueLinks = async () => [link]; mgmBoard = (page,url) => fakeBoard(page,url,(stage,error) => new CaptureFailure(stage,error)); mgmEvent = fakeEvent;`)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock, fakeBoard, fakeEvent, link)
  const result = await target.exports.collectNbaFirstBooks('betmgm', [input], now + 240_000, {
    onFirst: async () => { firstWrites++; if (scenario === 'first-write-timeout') throw timeout() },
    onRegular: async (_id, frames) => {
      if (!frames.length) return
      regularWrites++; if (scenario === 'regular-write-timeout') throw timeout()
      saved.push(...frames.flatMap(frame => frame.props))
    },
  })
  assert.equal(closed, 1); assert.equal(firstCalls, 1, 'First Basket is never retried')
  assert.equal(result.complete, false, 'independent regular success must not hide the failed First observation')
  assert.ok(deadlines.every(deadline => deadline <= now + 240_000)); assert.equal(JSON.stringify(result).includes('private'), false)
  return { result, challengeReads, navigations, inspections, firstWrites, regularWrites, saved }
}

test('First expansion timeout or network failure salvages independent regular prices only after fresh navigation', async () => {
  for (const scenario of ['timeout', 'network'] as const) {
    const value = await firstExpansionRecovery(scenario)
    assert.equal(value.challengeReads, 1); assert.equal(value.navigations, 1); assert.equal(value.inspections, 1)
    assert.equal(value.firstWrites, 0); assert.equal(value.regularWrites, 1); assert.equal(value.saved.length, 1)
    assert.equal(value.saved[0].updated_at, new Date(now).toISOString()); assert.equal(value.saved[0].market.odds, 400)
    assert.equal(value.result.games[0].status, 'error'); assert.deepEqual(value.result.games[0].props, [])
    assert.equal(value.result.errors[0].stage, 'first-expand'); assert.equal(value.result.errors[0].reason, scenario)
    assert.ok(value.result.regularCoverage!.every(scope => scope.complete))
  }
})

test('First-only recovery fails closed for challenges, unreadable checks, invalid identity and phase/deadline changes', async () => {
  for (const scenario of ['challenge', 'unreadable', 'hung-check', 'closed', 'short-budget', 'closed-during-check', 'short-during-check', 'target-closed', 'identity-failure'] as const) {
    const value = await firstExpansionRecovery(scenario)
    assert.equal(value.navigations, 0, scenario); assert.equal(value.inspections, 0, scenario); assert.equal(value.regularWrites, 0, scenario)
    assert.ok(value.result.regularCoverage!.every(scope => !scope.complete), scenario)
    if (scenario === 'challenge') assert.ok(value.result.errors.some(error => error.code === 'challenge'))
    if (['closed', 'short-budget', 'target-closed', 'identity-failure'].includes(scenario)) assert.equal(value.challengeReads, 0, scenario)
  }
  for (const scenario of ['wrong-identity', 'closed-after-navigation', 'navigation-failure'] as const) {
    const value = await firstExpansionRecovery(scenario)
    assert.equal(value.navigations, 1); assert.equal(value.regularWrites, 0); assert.deepEqual(value.saved, [])
    assert.ok(value.result.regularCoverage!.every(scope => !scope.complete))
  }
})

test('First and regular persistence timeouts never enter recovery or retry uncertain writes', async () => {
  const first = await firstExpansionRecovery('first-write-timeout')
  assert.equal(first.firstWrites, 1); assert.equal(first.challengeReads, 0); assert.equal(first.navigations, 0); assert.equal(first.regularWrites, 1)
  assert.equal(first.saved.length, 1, 'normal independent regular work still proceeds without retrying the uncertain First write')
  assert.ok(first.result.errors.some(error => error.stage === 'observation-save'))
  const regular = await firstExpansionRecovery('regular-write-timeout')
  assert.equal(regular.firstWrites, 0); assert.equal(regular.navigations, 1); assert.equal(regular.regularWrites, 1); assert.deepEqual(regular.saved, [])
  assert.ok(regular.result.errors.some(error => error.stage === 'observation-save'))
})

test('a recovered regular task crossing tip while another First game runs never starts another navigation', async () => {
  let clock = now, pages = 0, closed = 0
  const near = { ...input, game: { ...game, datetime: new Date(now + 60_000).toISOString() } }
  const later = { ...input, game: { ...game, id: game.id + 1, home_team: { ...game.home_team, id: 9, name: 'Other', full_name: 'Denver Other' } } }
  const links = ['new-orleans-pelicans-denver-nuggets-21717953', 'new-orleans-pelicans-denver-other-21717954'].map(path => `https://www.nc.betmgm.com/en/sports/events/${path}`)
  let releaseLater!: () => void
  const waiting = new Promise<void>(resolve => { releaseLater = resolve })
  const inspected: number[] = [], navigated: string[] = []
  const makePage = () => ({ id: ++pages, setDefaultTimeout: () => {}, route: async () => {}, close: async () => {}, context: () => ({ newPage: async () => makePage() }),
    evaluate: async () => { setImmediate(() => { clock = now + 60_001; releaseLater() }); return false },
  })
  const imports: Record<string, unknown> = {
    'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (value: PaintGame) => modes.nbaPregameOpen(value, clock) },
    './nbaFirstBookQuotes': quotes, './nbaFirstBookDom': {}, './nbaBookPropQuotes': propQuotes,
    './nbaMgmProps': { collectMgmProps: async (_page: unknown, value: typeof input) => { inspected.push(value.game.id); return { frames: [], coverage: [] } } },
    '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture', openSession: async () => ({ page: makePage(), close: async () => { closed++ } }) },
  }
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const fakeBoard = async (_page: unknown, url: string, fail: () => Error) => { if (url === links[0]) throw fail(); await waiting; return null }
  const target = { exports: {} as typeof import('../src/lib/scrapers/nbaFirstBooks.ts') }
  new Function('require', 'module', 'exports', 'Date', 'links', 'fakeBoard', 'navigate', `${code}\nmgmLeagueLinks=async()=>links;mgmBoard=(page,url)=>fakeBoard(page,url,()=>new CaptureFailure('first-expand',Object.assign(new Error('timeout'),{name:'TimeoutError'})));mgmEvent=async(page,url)=>navigate(url);`)((name: string) => imports[name], target, target.exports, Clock, links, fakeBoard, (url: string) => { navigated.push(url) })
  const result = await target.exports.collectNbaFirstBooks('betmgm', [near, later], now + 240_000)
  assert.equal(clock, now + 60_001); assert.equal(closed, 1); assert.equal(pages, 2)
  assert.equal(navigated.includes(links[0]), false); assert.equal(inspected.includes(near.game.id), false)
  assert.deepEqual(inspected, [later.game.id], 'the independent later game still gets its normal turn')
  assert.equal(result.games.find(item => item.gameId === near.game.id)?.status, 'error')
  assert.ok(result.regularCoverage!.filter(scope => scope.gameId === near.game.id).every(scope => !scope.complete))
})

test('observation callbacks cannot extend the collector deadline or expose persistence error details', async () => {
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const imports: Record<string, unknown> = { 'server-only': {}, '../browserbase': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (game: paint.PaintGame) => modes.nbaPregameOpen(game, now) }, './nbaFirstBookQuotes': quotes, './nbaFirstBookDom': {}, './nbaMgmProps': {}, './nbaBookPropQuotes': propQuotes }
  const target = { exports: {} }
  const functions = new Function('require', 'module', 'exports', `${code}\nreturn {deliverObservation, captureFailure}`)((name: string) => imports[name], target, target.exports) as { deliverObservation: (callback: () => Promise<void>, deadline: number) => Promise<void>; captureFailure: (error: unknown, gameId: number) => {code:string;stage?:string;reason?:string} }
  let called = false
  await assert.rejects(functions.deliverObservation(async () => { called = true }, Date.now() - 1))
  assert.equal(called, false)
  await assert.rejects(functions.deliverObservation(() => new Promise<void>(() => {}), Date.now() + 20), (error: unknown) => {
    assert.deepEqual(functions.captureFailure(error, 1), {gameId:1,code:'deadline',stage:'observation-save',reason:'timeout'}); return true
  })
  await assert.rejects(functions.deliverObservation(async () => { throw new Error('private persistence URL token=must-not-leak') }, Date.now() + 1000), (error: unknown) => {
    assert.equal(functions.captureFailure(error,1).stage, 'observation-save'); assert.equal(String(error).includes('must-not-leak'), false); return true
  })
})

test('MGM failures identify the bounded navigation stage without exposing raw errors or URLs', async () => {
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const identity = { ...board(), market: undefined, rows: undefined }, readers = { readMgmFirstIdentity: function identity() {} }
  const imports: Record<string, unknown> = { 'server-only': {}, '../browserbase': {}, '../nbaPaint': paint, '../nbaOddsMode': { ...modes, nbaPregameOpen: (game: paint.PaintGame) => modes.nbaPregameOpen(game, now) }, './nbaFirstBookQuotes': quotes, './nbaFirstBookDom': readers, './nbaMgmProps': {}, './nbaBookPropQuotes': propQuotes }
  const target = { exports: {} }
  const functions = new Function('require', 'module', 'exports', `${code}\nreturn {mgmEvent, captureFailure}`)((name: string) => imports[name], target, target.exports) as { mgmEvent: (page: unknown, url: string, deadline: number) => Promise<unknown>; captureFailure: (error: unknown, gameId: number) => unknown }
  const secret = 'https://private.example/?token=do-not-expose'
  for (const scenario of [
    { stage: 'event-navigation', reason: 'network', fail: 'goto', error: new Error(`page.goto: net::ERR_TUNNEL_CONNECTION_FAILED ${secret}`) },
    { stage: 'event-scoreboard', reason: 'timeout', fail: 'scoreboard', error: Object.assign(new Error(`locator.waitFor: Timeout 15000ms exceeded ${secret}`), { name: 'TimeoutError' }) },
    { stage: 'event-all', reason: 'timeout', fail: 'all', error: Object.assign(new Error(`locator.click: Timeout 3000ms exceeded ${secret}`), { name: 'TimeoutError' }) },
    { stage: 'event-identity', reason: 'evaluation', fail: 'identity', error: new ReferenceError(`unknown binding ${secret}`) },
  ]) {
    const locator = (kind: string) => ({ first() { return this }, filter() { return this }, count: async () => 1,
      waitFor: async (options: { timeout: number }) => { if (kind === 'scoreboard') assert.equal(options.timeout, 35_000); if (scenario.fail === kind) throw scenario.error }, click: async () => {},
    })
    const page = { goto: async () => { if (scenario.fail === 'goto') throw scenario.error }, waitForTimeout: async () => {},
      locator: (selector: string) => locator(selector.includes('scoreboard') ? 'scoreboard' : 'menu'), getByRole: () => locator('all'),
      evaluate: async (fn: unknown) => { if (fn === readers.readMgmFirstIdentity) { if (scenario.fail === 'identity') throw scenario.error; return identity } return false },
    }
    try { await functions.mgmEvent(page, 'https://www.nc.betmgm.com/en/sports/events/observed', Date.now() + 60_000); assert.fail('expected stage failure') }
    catch (error) {
      const failure = functions.captureFailure(error, game.id)
      assert.deepEqual(failure, { gameId: game.id, code: 'navigation-failed', stage: scenario.stage, reason: scenario.reason })
      assert.equal(JSON.stringify(failure).includes(secret), false); assert.equal(String(error).includes(secret), false)
    }
  }
  let waitBudget = 0
  const boundedPage = { goto: async () => {}, waitForTimeout: async () => {}, evaluate: async () => false,
    locator: () => ({ first() { return this }, waitFor: async (options: { timeout: number }) => { waitBudget = options.timeout; throw new Error('bounded fixture') } }),
  }
  await assert.rejects(functions.mgmEvent(boundedPage, 'https://www.nc.betmgm.com/en/sports/events/observed', Date.now() + 500))
  assert.ok(waitBudget > 0 && waitBudget <= 500, 'readiness must still obey the remaining absolute deadline')
})

async function leagueScenario(mode: 'late' | 'network' | 'events-network' | 'repeat' | 'challenge' | 'late-challenge' | 'layout' | 'evaluation', budget=90_000) {
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  let clock=now,attempt=0,linksReads=0,challenge=mode==='challenge'
  const navigations:{url:string;at:number;timeout:number}[]=[]
  class Clock extends Date { constructor(value:string|number=clock){super(value)} static now(){return clock} }
  const imports:Record<string,unknown>={'server-only':{},'../browserbase':{openSession:()=>{assert.fail('discovery retry must not open another session')}},'../nbaPaint':paint,'../nbaOddsMode':modes,'./nbaFirstBookQuotes':quotes,'./nbaFirstBookDom':{},'./nbaMgmProps':{},'./nbaBookPropQuotes':propQuotes}
  const target={exports:{}}
  const functions=new Function('require','module','exports','Date',`${code}\nreturn {mgmLeagueLinks,captureFailure}`)((name:string)=>imports[name],target,target.exports,Clock) as {mgmLeagueLinks:(page:unknown,deadline:number)=>Promise<string[]>;captureFailure:(error:unknown)=>{code:string;stage?:string;reason?:string}}
  const timeout=()=>Object.assign(new Error('private timeout URL token=must-not-leak'),{name:'TimeoutError'})
  const links=['https://www.nc.betmgm.com/en/sports/events/verified-current-link']
  const page={
    goto:async(url:string,options:{timeout:number})=>{attempt++;navigations.push({url,at:clock,timeout:options.timeout});assert.ok(options.timeout<=now+budget-clock);clock+=100;if(mode==='network'&&attempt===1)throw new Error('net::ERR_CONNECTION_RESET private-token')},
    waitForTimeout:async(ms:number)=>{clock+=ms},evaluate:async()=>challenge,
    context:()=>{assert.fail('same existing page must be reused')},
    getByRole:()=>({first(){return this},waitFor:async(options:{timeout:number})=>{if(attempt===1&&['late','repeat'].includes(mode)){clock+=options.timeout;throw timeout()}},count:async()=>attempt===1&&['late','repeat'].includes(mode)?0:1,click:async()=>{if(mode==='events-network'&&attempt===1)throw new Error('network connection reset private-token')}}),
    locator:()=>({first(){return this},waitFor:async(options:{timeout:number})=>{
      assert.ok(options.timeout<=now+budget-clock)
      if(mode==='evaluation')throw new TypeError('private selector failure')
      if(mode==='repeat'||attempt===1&&['late','late-challenge'].includes(mode)){clock+=options.timeout;if(mode==='late-challenge')challenge=true;throw timeout()}
    },evaluateAll:async()=>{linksReads++;return mode==='layout'?[]:links}}),
  }
  try{return{links:await functions.mgmLeagueLinks(page,now+budget),navigations,linksReads,error:null}}
  catch(error){const safe=functions.captureFailure(error);assert.equal(JSON.stringify(safe).includes('private'),false);return{links:[],navigations,linksReads,error:safe}}
}

test('MGM league discovery retries a late loading shell or network failure once in the same page and deadline',async()=>{
  for(const mode of ['late','network','events-network'] as const){
    const value=await leagueScenario(mode)
    assert.equal(value.error,null);assert.equal(value.navigations.length,2);assert.equal(value.linksReads,1)
    assert.equal(new Set(value.navigations.map(item=>item.url)).size,1)
    assert.deepEqual(value.links,['https://www.nc.betmgm.com/en/sports/events/verified-current-link'])
    assert.ok(value.navigations.every(item=>item.at+item.timeout<=now+90_000))
  }
})

test('MGM repeated league timeout remains stage-specific failed coverage and never opens a third attempt',async()=>{
  const value=await leagueScenario('repeat')
  assert.equal(value.navigations.length,2);assert.equal(value.linksReads,0)
  assert.deepEqual(value.error,{code:'navigation-failed',stage:'league-links',reason:'timeout'})
})

test('MGM league retry stops for visible or late challenges, unverified layout, evaluation errors and insufficient time',async()=>{
  for(const mode of ['challenge','late-challenge','layout','evaluation'] as const){
    const value=await leagueScenario(mode)
    assert.equal(value.navigations.length,1);assert.deepEqual(value.links,[])
    assert.equal(value.error?.code,mode.includes('challenge')?'challenge':mode==='layout'?'layout-unavailable':'navigation-failed')
    assert.equal(value.error?.stage,mode==='challenge'?'league-navigation':'league-links')
  }
  const expired=await leagueScenario('late',30_000)
  assert.equal(expired.navigations.length,1);assert.equal(expired.linksReads,0);assert.equal(expired.error?.reason,'timeout')
})
