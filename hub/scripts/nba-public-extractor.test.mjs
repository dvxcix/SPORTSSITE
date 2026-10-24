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
function fixture({ categories = catalog, delay = 0, initial = 0, zeros = false, blank = [], malformed = [], ignored = [], hidden = false, title = 'Player Props', initialDelay = 0, holdPrior = false, unknown = false, firstBasketGroups = null, groupDelay = 0, ignoreGroups = [] } = {}) {
  const dom = new JSDOM('<body></body>', { url: 'https://app.pikkit.com/event/verified-nba-event' })
  const document = dom.window.document, calls = [], groupClicks = []
  const expandedGroups = new Set([Object.keys(firstBasketGroups ?? {})[0] ?? 'First Field Goal'])
  let groupReadyAt = Infinity, pendingGroup = null
  let now = 1800000000000, active = categories[initial][0], displayed = active, readyAt = now + initialDelay, loading = initialDelay > 0
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  function row(name, count, expanded = false) {
    return `<div class="row"><div class="header"><p>${escape(name)}</p><div><p>${escape(count)}</p><button aria-label="${expanded ? 'collapse' : 'expand'}-button"></button></div></div>${expanded ? '<div><p>Yes</p><p>9,999 Picks</p><p>Odds for this market are not available yet</p><p>Receive alert when market opens</p></div>' : ''}</div>`
  }
  function render() {
    const label = categories.find(([value]) => value === displayed)[1]
    let rows = (loading && !holdPrior) || blank.includes(displayed) ? '' : row(`Player One ${label}`, zeros ? '' : '1,234 Picks', true) + row(`Player Two ${label}`, zeros ? '' : '1 Pick') + (malformed.includes(displayed) ? row(`Player Three ${label}`, 'not a count') : '')
    if (displayed === 'first_basket' && firstBasketGroups && (!loading || holdPrior)) rows = Object.entries(firstBasketGroups).map(([name, outcomes]) => {
      const expanded = expandedGroups.has(name)
      const body = outcomes === 'empty' ? '<p>Odds for this market are not available yet</p><div><p>Receive alert when market opens</p><div><input type="checkbox"></div></div>' : outcomes === 'missing' ? '' : outcomes.map(([player, count]) => `<div><div><p>${escape(player)}</p><p>${escape(count)}</p></div><div><button>+1000</button><span>Unrelated odds detail</span></div></div>`).join('')
      return `<div><div><p>${name}</p><div><p>9,999 Picks</p><button aria-label="${expanded ? 'collapse' : 'expand'}-button"></button></div></div>${expanded ? `<div>${body}</div>` : ''}</div>`
    }).join('')
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
  document.addEventListener('click', event => {
    const button = event.target.closest('button[aria-label="expand-button"],button[aria-label="collapse-button"]')
    if (!button) return
    const name = button.parentElement.parentElement.firstElementChild.textContent
    groupClicks.push(name)
    if (ignoreGroups.includes(name)) return
    if (button.getAttribute('aria-label') === 'collapse-button') expandedGroups.delete(name)
    else if (groupDelay) { pendingGroup = name; groupReadyAt = now + groupDelay }
    else expandedGroups.add(name)
    render()
  })
  render()
  const loaded = { exports: {} }
  new Function('module', 'exports', 'document', 'location', 'getComputedStyle', 'Event', 'Date', 'setTimeout', compiled)(loaded, loaded.exports, document, dom.window.location, dom.window.getComputedStyle.bind(dom.window), dom.window.Event, Clock, (callback, ms) => {
    now += ms
    if (loading && now >= readyAt) { loading = false; displayed = active; render() }
    if (pendingGroup && now >= groupReadyAt) { expandedGroups.add(pendingGroup); pendingGroup = null; render() }
    callback()
  })
  return { run: loaded.exports.runNbaPikkitScrape, calls, groupClicks, elapsed: () => now - 1800000000000, close: () => dom.window.close() }
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

test('First Basket expands only the collapsed group and captures exact nested player contracts, never totals', async () => {
  const browser = fixture({ firstBasketGroups: {
    'First Field Goal': [['Player One', '7 Picks'], ['Player Two', '']],
    'First Basket (Incl. FT)': [['Player One', '11 Picks'], ['Player Three', '1 Pick']],
  }, groupDelay: 2000 })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    assert.deepEqual(browser.groupClicks, ['First Basket (Incl. FT)'])
    assert.deepEqual(result.props['First Basket'], {
      'Player One First Basket (Incl. FT)': 11,
      'Player One First Field Goal': 7,
      'Player Three First Basket (Incl. FT)': 1,
      'Player Two First Field Goal': 0,
    })
    assert.equal(result.marketStates.find(state => state.label === 'First Basket').rows, 4)
    assert.equal(Object.values(result.props['First Basket']).includes(9999), false)
  } finally { browser.close() }
})

test('both explicitly unavailable First Basket group bodies prove an empty category without player zeros', async () => {
  const browser = fixture({ firstBasketGroups: { 'First Field Goal': 'empty', 'First Basket (Incl. FT)': 'empty' } })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    const state = result.marketStates.find(state => state.label === 'First Basket')
    assert.equal(state.status, 'empty'); assert.equal(state.rows, 0)
    assert.deepEqual(result.props['First Basket'], {})
    assert.deepEqual(browser.groupClicks, ['First Basket (Incl. FT)'])
  } finally { browser.close() }
})

test('the recorded including-free-throws-first order expands First Field Goal without collapsing existing outcomes', async () => {
  const browser = fixture({ firstBasketGroups: {
    'First Basket (Incl. FT)': [['Bam Adebayo', '1 Pick'], ['Giannis Antetokounmpo', '']],
    'First Field Goal': [['Bam Adebayo', ''], ['Giannis Antetokounmpo', '2 Picks']],
  } })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    assert.deepEqual(browser.groupClicks, ['First Field Goal'])
    assert.deepEqual(result.props['First Basket'], {
      'Bam Adebayo First Basket (Incl. FT)': 1,
      'Bam Adebayo First Field Goal': 0,
      'Giannis Antetokounmpo First Basket (Incl. FT)': 0,
      'Giannis Antetokounmpo First Field Goal': 2,
    })
  } finally { browser.close() }
})

test('an explicitly empty sibling First Basket group does not discard available nested counts', async () => {
  const browser = fixture({ firstBasketGroups: { 'First Field Goal': [['Player One', '3 Picks']], 'First Basket (Incl. FT)': 'empty' } })
  try {
    const result = await browser.run()
    assert.equal(result.complete, true)
    assert.deepEqual(result.props['First Basket'], { 'Player One First Field Goal': 3 })
    assert.equal(result.marketStates.find(state => state.label === 'First Basket').status, 'captured')
  } finally { browser.close() }
})

test('missing or unexpanded First Basket outcomes remain unresolved while verified sibling counts survive', async () => {
  for (const ignoreGroups of [[], ['First Basket (Incl. FT)']]) {
    const browser = fixture({ firstBasketGroups: { 'First Field Goal': [['Player One', '3 Picks']], 'First Basket (Incl. FT)': 'missing' }, ignoreGroups })
    try {
      const result = await browser.run()
      assert.equal(result.complete, false)
      assert.deepEqual(result.props['First Basket'], { 'Player One First Field Goal': 3 })
      const state = result.marketStates.find(state => state.label === 'First Basket')
      assert.equal(state.status, 'unavailable'); assert.equal(state.rows, 1)
      assert.deepEqual(browser.groupClicks, ['First Basket (Incl. FT)'])
    } finally { browser.close() }
  }
})

test('an absent entire First Basket sibling group cannot produce complete coverage', async () => {
  const browser = fixture({ firstBasketGroups: { 'First Field Goal': [['Player One', '3 Picks']] } })
  try {
    const result = await browser.run()
    assert.equal(result.complete, false)
    assert.deepEqual(result.props['First Basket'], { 'Player One First Field Goal': 3 })
    const state = result.marketStates.find(state => state.label === 'First Basket')
    assert.equal(state.status, 'unavailable'); assert.equal(state.rows, 1)
  } finally { browser.close() }
})

test('a single empty group does not prove whole-category absence and malformed nested counts are not zero', async () => {
  const single = fixture({ firstBasketGroups: { 'First Field Goal': 'empty' } })
  try {
    const result = await single.run()
    assert.equal(result.complete, false)
    assert.equal(result.props['First Basket'], undefined)
    assert.equal(result.marketStates.find(state => state.label === 'First Basket').status, 'unavailable')
  } finally { single.close() }
  const malformed = fixture({ firstBasketGroups: { 'First Field Goal': [['Player One', '3 Picks'], ['Player Two', 'Loading']], 'First Basket (Incl. FT)': 'empty' } })
  try {
    const result = await malformed.run()
    assert.equal(result.complete, false)
    assert.deepEqual(result.props['First Basket'], { 'Player One First Field Goal': 3 })
    assert.equal(result.marketStates.find(state => state.label === 'First Basket').status, 'unavailable')
  } finally { malformed.close() }
})
