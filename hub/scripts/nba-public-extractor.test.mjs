import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript'), { JSDOM } = require('jsdom')
const source = fs.readFileSync(new URL('../src/lib/scrapers/nbaPikkitScraper.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const catalog = [['points', 'Points'], ['rebounds', 'Rebounds'], ['assists', 'Assists'], ['threes', 'Three Pointers'], ['combos', 'Combos'], ['steals', 'Steals'], ['blocks', 'Blocks'], ['double_double', 'Double Double'], ['triple_double', 'Triple Double'], ['turnovers', 'Turnovers'], ['first_basket', 'First Basket']]
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')

// Mirrors the retained gle/yle source component: the name and count are in
// the row header; expanded Yes/odds content is a separate sibling body.
function fixture({ categories = catalog, delay = 0, initial = 0, zeros = false, blank = [], malformed = [], ignored = [], hidden = false, title = 'Player Props', initialDelay = 0, holdPrior = false, unknown = false } = {}) {
  const dom = new JSDOM('<body></body>', { url: 'https://app.pikkit.com/event/verified-nba-event' })
  const document = dom.window.document, calls = []
  let now = 1800000000000, active = categories[initial][0], displayed = active, readyAt = now + initialDelay, loading = initialDelay > 0
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  function row(name, count, expanded = false) {
    return `<div class="row"><div class="header"><p>${escape(name)}</p><div><p>${escape(count)}</p><button aria-label="${expanded ? 'collapse' : 'expand'}-button"></button></div></div>${expanded ? '<div><p>Yes</p><p>9,999 Picks</p><p>Odds for this market are not available yet</p><p>Receive alert when market opens</p></div>' : ''}</div>`
  }
  function render() {
    const label = categories.find(([value]) => value === displayed)[1]
    const rows = (loading && !holdPrior) || blank.includes(displayed) ? '' : row(`Player One ${label}`, zeros ? '' : '1,234 Picks', true) + row(`Player Two ${label}`, zeros ? '' : '1 Pick') + (malformed.includes(displayed) ? row(`Player Three ${label}`, 'not a count') : '')
    const panel = `<section><div><p>${escape(title)}</p><div><select>${categories.map(([value, name]) => `<option value="${value}" ${active === value ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></div></div><div>${rows}</div></section>`
    document.body.innerHTML = `<main><div>Unrelated Player Points</div><div>99,999 Picks</div>${panel}${hidden ? `<div hidden>${panel.replaceAll('Player One', 'Hidden Player')}</div>` : ''}${unknown ? row('Wrong Outside Player', '8,888 Picks') : ''}</main>`
  }
  document.addEventListener('change', event => {
    const value = event.target.value
    calls.push(value)
    if (ignored.includes(value)) return
    active = value; loading = delay > 0; readyAt = now + delay
    if (!loading) displayed = active
    render() // React may replace both the selector and its row nodes.
  })
  render()
  const loaded = { exports: {} }
  new Function('module', 'exports', 'document', 'location', 'getComputedStyle', 'Event', 'Date', 'setTimeout', compiled)(loaded, loaded.exports, document, dom.window.location, dom.window.getComputedStyle.bind(dom.window), dom.window.Event, Clock, (callback, ms) => {
    now += ms
    if (loading && now >= readyAt) { loading = false; displayed = active; render() }
    callback()
  })
  return { run: loaded.exports.runNbaPikkitScrape, calls, elapsed: () => now - 1800000000000, close: () => dom.window.close() }
}

test('visits every real category including Combos and First Basket, reading collapsed headers only', async () => {
  const browser = fixture({ hidden: true, unknown: true })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    assert.equal(result.marketStates.length, 11)
    assert.deepEqual(browser.calls, catalog.slice(1).map(([value]) => value))
    for (const [, label] of catalog) {
      assert.deepEqual(result.props[label], { [`Player One ${label}`]: 1234, [`Player Two ${label}`]: 1 })
      const state = result.marketStates.find(state => state.label === label)
      assert.equal(state.status, 'captured'); assert.equal(state.rows, 2)
      assert.ok(Date.parse(state.observedAt) <= Date.parse(result.capturedAt))
    }
    assert.equal(JSON.stringify(result).includes('9999'), false)
  } finally { browser.close() }
})

test('verified blank count headers are real zeros even when expanded odds are unavailable', async () => {
  const browser = fixture({ zeros: true })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    assert.equal(result.marketStates.every(state => state.status === 'captured' && state.rows === 2), true)
    assert.equal(Object.values(result.props).flatMap(Object.values).length, 22)
    assert.equal(Object.values(result.props).flatMap(Object.values).every(count => count === 0), true)
  } finally { browser.close() }
})

test('waits past the former fixed delay for replacement controls and category content', async () => {
  const browser = fixture({ categories: catalog.slice(0, 3), delay: 3500, initialDelay: 2000, holdPrior: true })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    assert.ok(browser.elapsed() >= 8500)
    assert.deepEqual(Object.keys(result.props.Assists), ['Player One Assists', 'Player Two Assists'])
  } finally { browser.close() }
})

test('an ignored selection never relabels prior headers and valid later categories are still saved', async () => {
  const browser = fixture({ categories: catalog.slice(0, 3), ignored: ['rebounds'] })
  try {
    const result = await browser.run()
    assert.equal(result.complete, false)
    assert.equal(result.props.Rebounds, undefined)
    assert.equal(result.marketStates[1].status, 'unavailable')
    assert.equal(result.marketStates[2].status, 'captured')
    assert.deepEqual(Object.keys(result.props.Assists), ['Player One Assists', 'Player Two Assists'])
  } finally { browser.close() }
})

test('blank categories are unresolved, while verified siblings and malformed-row siblings survive', async () => {
  const browser = fixture({ categories: catalog.slice(0, 3), blank: ['rebounds'], malformed: ['assists'] })
  try {
    const result = await browser.run()
    assert.equal(result.complete, false)
    assert.equal(result.props.Rebounds, undefined)
    assert.deepEqual(result.marketStates.map(state => [state.status, state.rows]), [['captured', 2], ['unavailable', 0], ['unavailable', 2]])
    assert.deepEqual(result.props.Assists, { 'Player One Assists': 1234, 'Player Two Assists': 1 })
  } finally { browser.close() }
})

test('budget bounds all waits and lists unvisited categories without fabricating zero rows', async () => {
  const browser = fixture({ delay: 10000, initial: 2 })
  try {
    const result = await browser.run({ maxDurationMs: 1200 })
    assert.equal(browser.elapsed(), 1200)
    assert.equal(result.complete, false)
    assert.equal(result.marketStates[0].label, 'Assists')
    assert.equal(result.marketStates[0].status, 'captured')
    assert.equal(result.marketStates.slice(1).every(state => state.status === 'deadline' && state.rows === 0), true)
    assert.deepEqual(Object.keys(result.props), ['Assists'])
  } finally { browser.close() }
})

test('a For You selector or unrelated pick text cannot masquerade as Player Props', async () => {
  const browser = fixture({ title: 'Popular Prop Markets', unknown: true })
  try {
    const result = await browser.run({ maxDurationMs: 1000 })
    assert.equal(result.complete, false)
    assert.deepEqual(result.props, {})
    assert.equal(result.diagnostic.reason, 'player-props-control-unavailable')
    assert.equal(browser.elapsed(), 1000)
  } finally { browser.close() }
})
