import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const compile = file => ts.transpileModule(fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function browserFixture({ labels = ['Same Game Parlay', 'Lasers', 'Moonshots'], ignore = [], empty = [], delay = 0, stalePanel = false, controls = true, retainOldContent = false, initialIndex = 0, revertAfterSelectMs = Infinity } = {}) {
  const dom = new JSDOM('<body></body>', { url: 'https://sportsbook.fanduel.com/baseball/fixture-123456' })
  const document = dom.window.document, calls = []
  let now = 1_000_000, active = labels[initialIndex], displayed = active, readyAt = now, revertAt = Infinity, loading = false
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  function render() {
    document.body.innerHTML = '<main id="main"><h1>Tampa Bay Rays @ Milwaukee Brewers</h1>'
      + labels.map((label, i) => `<div role="${controls ? 'tab' : 'button'}" ${controls ? 'aria-controls="markets"' : ''} aria-selected="${label === active}" aria-label="Tab ${i + 1} of ${labels.length}: ${label}">${label}</div>`).join('')
      + `<div id="markets" aria-busy="${loading && !retainOldContent}">${(!loading || retainOldContent) && !empty.includes(displayed) ? `<div role="button" aria-selected="false" aria-label="${displayed}, Player A, +120 Odds"></div>` : ''}${stalePanel ? '<div style="display:none"><div role="button" aria-selected="false" aria-label="Hidden stale, Player X, +999 Odds"></div></div>' : ''}</div>`
      + (stalePanel ? '<div role="tabpanel" hidden><div role="button" aria-selected="false" aria-label="Prior tab, Player B, +999 Odds"></div><div role="button" aria-expanded="false" aria-label="Prior section"></div></div>' : '') + '</main>'
  }
  document.addEventListener('click', event => {
    const el = event.target.closest('[aria-label^="Tab "]')
    if (!el) return
    const label = el.textContent
    calls.push(label)
    if (ignore.includes(label)) return
    active = label; readyAt = now + delay; revertAt = now + revertAfterSelectMs; loading = delay > 0; if (!loading) displayed = active; render()
  })
  render()
  // The evaluated function owns its clock and timers, just as page.evaluate
  // does. Advancing virtual time also completes a pending SPA render.
  const compiled = { exports: {} }
  new Function('module', 'exports', 'document', 'location', 'getComputedStyle', 'Date', 'setTimeout', compile('lib/scrapers/fanduelScraper.ts'))(compiled, compiled.exports, document, dom.window.location, dom.window.getComputedStyle.bind(dom.window), Clock, (callback, ms) => {
    now += ms
    if (loading && now >= readyAt) { loading = false; displayed = active; render() }
    if (now >= revertAt) { displayed = labels[initialIndex]; revertAt = Infinity; render() }
    callback()
  })
  return { run: compiled.exports.runFanduelScrape, calls, elapsed: () => now - 1_000_000, close: () => dom.window.close() }
}

test('reacquires replaced SPA tab nodes and preserves distinct tab market parsing', async () => {
  const fixture = browserFixture()
  try {
    const result = await fixture.run({ verifyTabs: true, maxDurationMs: 60000 })
    assert.deepEqual(fixture.calls, ['Lasers', 'Moonshots'])
    assert.deepEqual(result.map(row => row.tab_status), ['captured', 'captured', 'captured'])
    for (const row of result) {
      assert.equal(row.outcome_count, 1)
      assert.equal(Object.values(row.sections)[0][0].market_hint, row.active_tab.label)
      assert.equal(Object.values(row.sections)[0][0].odds, '+120')
    }
  } finally { fixture.close() }
})

test('ignored tab click cannot archive the prior tab under a requested specialty label', async () => {
  const fixture = browserFixture({ ignore: ['Lasers'] })
  try {
    const result = await fixture.run({ verifyTabs: true, maxDurationMs: 60000 })
    assert.equal(result[1].tab_status, 'selection-unverified')
    assert.equal(result[1].incomplete, true)
    assert.equal(result[1].outcome_count, 0)
    assert.deepEqual(result[1].sections, {})
    assert.equal(result[2].tab_status, 'captured')
  } finally { fixture.close() }
})

test('preserves the already active tab before attempting other catalog tabs', async () => {
  const fixture = browserFixture({ initialIndex: 1, controls: false, delay: 60000, retainOldContent: true })
  try {
    const result = await fixture.run({ verifyTabs: true, maxDurationMs: 30000 })
    assert.equal(result[0].active_tab.label, 'Lasers')
    assert.equal(result[0].tab_status, 'captured')
    assert.deepEqual(result[0].available_tabs, ['Same Game Parlay', 'Lasers', 'Moonshots'])
    assert.equal(result.slice(1).every(row => row.incomplete), true)
  } finally { fixture.close() }
})

test('waits through delayed loading, while blank content remains an explicit incomplete capture', async () => {
  const delayed = browserFixture({ delay: 3500 })
  try {
    const result = await delayed.run({ verifyTabs: true, maxDurationMs: 60000 })
    assert.equal(result.every(row => row.tab_status === 'captured'), true)
    assert.ok(delayed.elapsed() > 7000)
  } finally { delayed.close() }
  const empty = browserFixture({ empty: ['Lasers'] })
  try {
    const result = await empty.run({ verifyTabs: true, maxDurationMs: 60000 })
    assert.equal(result[1].tab_status, 'content-unavailable')
    assert.equal(result[1].incomplete, true)
    assert.equal(result[2].tab_status, 'captured')
  } finally { empty.close() }
})

test('deadline bounds all waits and explicitly lists tabs that could not be verified', async () => {
  const fixture = browserFixture({ delay: 10000 })
  try {
    const result = await fixture.run({ verifyTabs: true, maxDurationMs: 1200 })
    assert.equal(fixture.elapsed(), 1200)
    assert.equal(result[0].tab_status, 'captured')
    assert.deepEqual(result.slice(1).map(row => row.tab_status), ['deadline', 'deadline'])
    assert.equal(result.slice(1).every(row => row.incomplete && row.outcome_count === 0), true)
  } finally { fixture.close() }
})

test('hidden prior-panel odds cannot satisfy readiness or contaminate the selected panel', async () => {
  for (const controls of [true, false]) {
    const fixture = browserFixture({ empty: ['Lasers'], stalePanel: true, controls })
    try {
    const result = await fixture.run({ verifyTabs: true, maxDurationMs: 60000 })
    assert.equal(result[1].tab_status, 'content-unavailable')
    assert.equal(result[1].outcome_count, 0)
    assert.equal(result[0].outcome_count, 1)
    assert.equal(result[2].outcome_count, 1)
    assert.equal(JSON.stringify(result).includes('Player X'), false)
    assert.equal(JSON.stringify(result).includes('Player B'), false)
    } finally { fixture.close() }
  }
})

test('NFL/default path retains its existing output and timing contract without MLB verification', async () => {
  const fixture = browserFixture({ labels: ['Same Game Parlay', 'Passing'] })
  try {
    const result = await fixture.run({ maxDurationMs: 360000 })
    assert.equal(result.length, 2)
    assert.equal(result.every(row => row.tab_status === undefined && row.incomplete === false), true)
    assert.equal(fixture.elapsed(), 3100)
  } finally { fixture.close() }
})

test('unlinked MAIN waits for prior visible content to change even without a loading indicator', async () => {
  for (const delay of [3500, 60000]) {
    const fixture = browserFixture({ labels: ['Same Game Parlay', 'Lasers'], controls: false, retainOldContent: true, delay })
    try {
      const result = await fixture.run({ verifyTabs: true, maxDurationMs: 30000 })
      assert.equal(result[1].tab_status, delay === 3500 ? 'captured' : 'content-unavailable')
      if (delay === 3500) assert.equal(Object.values(result[1].sections)[0][0].market_hint, 'Lasers')
      else assert.equal(result[1].outcome_count, 0)
    } finally { fixture.close() }
  }
})

test('a late prior-tab render after initial readiness cannot pass the final capture check', async () => {
  const fixture = browserFixture({ labels: ['Same Game Parlay', 'Lasers'], controls: false, revertAfterSelectMs: 2800 })
  try {
    const result = await fixture.run({ verifyTabs: true, maxDurationMs: 30000 })
    assert.equal(result[1].tab_status, 'content-unavailable')
    assert.equal(result[1].outcome_count, 0)
  } finally { fixture.close() }
})

function routeFixture(scrapes, { importOk = true, importBody = { ok: true, rowsImported: 1, rawTabsArchived: 1, rawOutcomesArchived: 1 } } = {}) {
  const calls = [], game = { gamePk: 123, gameKey: 'TB@MIL', homeTeam: 'Milwaukee Brewers', awayTeam: 'Tampa Bay Rays', status: 'Scheduled' }
  const page = { route: async () => {}, goto: async () => {}, getByText: () => ({ first: () => ({ click: async () => {} }) }), waitForTimeout: async () => {}, evaluate: async (_fn, options) => { calls.push({ name: 'extract', options }); return scrapes }, context: () => ({ newPage: async () => page }) }
  const mocks = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null },
    '@slipsurge/core/mlbSchedule': { getTodaysMatchups: async () => [game], isPregame: () => true },
    '@/lib/browserbase': { openSession: async () => ({ page, close: async () => { calls.push({ name: 'close' }) } }) },
    '@/lib/scrapers/fanduelScraper': { runFanduelScrape: () => {} }, '@/lib/scrapers/gameMatch': { findAndClickGame: async () => true, legIndexFor: () => 0 },
    '@/lib/platform': { PLATFORM_URL: 'https://fixture.test' }, '@/lib/balldontlie': { addDaysToDateStr: value => value },
    '@/lib/scrapers/retryMarkets': { missingCoreMarkets: () => [] }, '@/lib/pipelineHealth': { withPipelineHealth: (_key, fn) => fn },
  }
  const fixture = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', 'console', compile('app/api/cron/scrape-fanduel/route.ts'))(id => {
    if (!(id in mocks)) throw Error('Unexpected dependency ' + id)
    return mocks[id]
  }, fixture, fixture.exports, async (_url, init) => { calls.push({ name: 'import', body: JSON.parse(init.body) }); return Response.json(importBody, { status: importOk ? 200 : 502 }) }, { info() {} })
  return { ...fixture.exports, calls }
}
const captured = { active_tab: { label: 'Same Game Parlay' }, tab_status: 'captured', incomplete: false, outcome_count: 1, sections: {} }
test('MLB route imports verified tabs only, reports partial failure and always releases its browser', async () => {
  for (const query of ['?gamePk=123', '?gamePks=123', '']) {
    const fixture = routeFixture([captured, { active_tab: { label: 'Lasers' }, tab_status: 'selection-unverified', incomplete: true, outcome_count: 0 }])
    const response = await fixture.GET(new Request('https://fixture.test/api/cron/scrape-fanduel' + query))
    assert.equal(response.status, 502)
    const body = await response.json(), result = body.result ?? body.results[0]
    assert.equal(result.tabsScraped, 1)
    assert.deepEqual(result.incompleteTabs, [{ label: 'Lasers', status: 'selection-unverified' }])
    assert.deepEqual(fixture.calls.find(call => call.name === 'import').body.json, [captured])
    const options = fixture.calls.find(call => call.name === 'extract').options
    assert.equal(options.verifyTabs, true)
    assert.ok(options.maxDurationMs <= 240000)
    assert.equal(fixture.calls.at(-1).name, 'close')
  }
})

test('a wholly unverified event writes no empty archive; a healthy event succeeds and import failures stay failures', async () => {
  for (const [tabs, importOk, expectedStatus, expectedImports] of [[[], true, 502, 0], [[{ tab_status: 'content-unavailable', incomplete: true }], true, 502, 0], [[captured], true, 200, 1], [[captured], false, 502, 1]]) {
    const fixture = routeFixture(tabs, { importOk })
    const response = await fixture.GET(new Request('https://fixture.test/api/cron/scrape-fanduel?gamePk=123'))
    assert.equal(response.status, expectedStatus)
    assert.equal(fixture.calls.filter(call => call.name === 'import').length, expectedImports)
    assert.equal(fixture.calls.at(-1).name, 'close')
  }
})

test('HTTP 200 without positive tab and outcome archive confirmation is a failure', async () => {
  for (const importBody of [null, {}, { ok: true }, { ok: true, rawTabsArchived: 0, rawOutcomesArchived: 1 }, { ok: true, rawTabsArchived: 1, rawOutcomesArchived: 0 }]) {
    const fixture = routeFixture([captured], { importBody })
    const response = await fixture.GET(new Request('https://fixture.test/api/cron/scrape-fanduel?gamePk=123'))
    assert.equal(response.status, 502)
    assert.equal((await response.json()).result.imported.ok, false)
    assert.equal(fixture.calls.at(-1).name, 'close')
  }
})
