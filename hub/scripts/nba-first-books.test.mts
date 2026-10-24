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

const { JSDOM } = createRequire(import.meta.url)('jsdom')

const now = Date.parse('2026-10-24T11:00:00Z')
const game: PaintGame = { id: 21717953, date: '2026-10-24', season: 2026, status: 'Scheduled', status_state: 'scheduled', period: 0, datetime: '2026-10-25T01:00:00Z', home_team_score: 0, visitor_team_score: 0,
  visitor_team: { id: 19, name: 'Pelicans', full_name: 'New Orleans Pelicans', abbreviation: 'NOP' }, home_team: { id: 8, name: 'Nuggets', full_name: 'Denver Nuggets', abbreviation: 'DEN' } }
const player: PaintRoster = { id: 42, first_name: 'Alpha', last_name: 'Diallo', team: game.visitor_team, position: 'F' }
const input = { game, roster: [player] }
const board = (changes: Partial<NbaFirstBookBoard> = {}): NbaFirstBookBoard => ({ away: 'NO Pelicans', home: 'DEN Nuggets', dateLabel: 'Today', timeLabel: '7:00PM', timeZone: 'America/Los_Angeles', observedAt: new Date(now).toISOString(), market: '1st Point', expanded: true, rows: [{ name: 'Alpha Diallo', odds: '+1060' }], ...changes })

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
  let opened = 0, closed = 0
  const imports: Record<string, unknown> = {
    'server-only': {}, '../nbaPaint': paint, '../nbaOddsMode': modes, './nbaFirstBookQuotes': quotes, './nbaFirstBookDom': {},
    '../browserbase': { BETMGM_PROXY_DOMAIN_PATTERN: 'fixture-mgm', openSession: async (options: Record<string, unknown>) => {
      opened++; assert.equal(options.timeoutSeconds, 300); assert.equal(options.solveCaptchas, false); assert.equal(options.contextId, undefined)
      assert.equal(options.requestTimeoutMs, 20_000)
      return { page: { setDefaultTimeout: () => {}, route: async () => {}, goto: async () => { throw new Error('fixture network failure') } }, close: async () => { closed++ } }
    } },
  }
  const target = { exports: {} }, code = ts.transpileModule(readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  new Function('require', 'module', 'exports', 'Date', code)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock)
  const collector = target.exports as typeof import('../src/lib/scrapers/nbaFirstBooks.ts')
  const result = await collector.collectNbaFirstBooks('draftkings', [input])
  assert.equal(opened, 1); assert.equal(closed, 1); assert.equal(result.complete, false)
  assert.deepEqual(result.games[0].props, []); assert.equal(result.games[0].status, 'error')
  assert.deepEqual(result.errors, [{ code: 'navigation-failed' }]); assert.equal(JSON.stringify(result).includes('fixture network failure'), false)
  await collector.collectNbaFirstBooks('draftkings', [{ ...input, game: { ...game, status_state: 'final' } }])
  assert.equal(opened, 1)
  const expired = await collector.collectNbaFirstBooks('draftkings', [input], now + 19_999)
  assert.equal(opened, 1); assert.equal(expired.games[0].status, 'deadline')
  await assert.rejects(collector.collectNbaFirstBooks('draftkings', [input, { ...input, game: { ...game, id: 999 } }]), /Invalid NBA capture slate/)
  assert.equal(opened, 1)
})

test('MGM navigation selects All before locating First FG, expands its scoped Show More and fails on absent market layout', async () => {
  const source = readFileSync(new URL('../src/lib/scrapers/nbaFirstBooks.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  async function scenario(layout = true) {
    const calls: string[] = []
    let all = false, expanded = false, more = false
    const metadata = { away: 'Pelicans', home: 'Nuggets', dateLabel: 'Today', timeLabel: '4:59 PM', timeZone: 'America/Los_Angeles' }
    const readers = { readMgmFirstIdentity: function identity() {}, readMgmFirstRows: function rows() {} }
    const imports: Record<string, unknown> = { 'server-only': {}, '../browserbase': {}, '../nbaPaint': paint, '../nbaOddsMode': modes, './nbaFirstBookQuotes': quotes, './nbaFirstBookDom': readers }
    const target = { exports: {} }
    const run = new Function('require', 'module', 'exports', `${code}\nreturn mgmBoard`)((name: string) => imports[name], target, target.exports) as (page: unknown, url: string, deadline: number) => Promise<NbaFirstBookBoard>
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
    return { run: () => run(page, 'https://www.nc.betmgm.com/en/sports/events/observed-link-123', Date.now() + 10_000), calls }
  }
  const valid = await scenario(), captured = await valid.run()
  assert.deepEqual(valid.calls, ['navigate', 'all', 'first', 'more']); assert.equal(captured.expanded, true)
  assert.deepEqual(captured.rows, [{ name: 'Alpha Diallo', odds: '+900' }])
  const missing = await scenario(false)
  await assert.rejects(missing.run(), /layout-unavailable/); assert.deepEqual(missing.calls, ['navigate', 'all'])
})
