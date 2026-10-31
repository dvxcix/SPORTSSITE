import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const react = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function fixture({ role = 'admin', signedIn = true, cutoff = '2026-10-28T00:00:00Z', mfa = false, missingAssurance = false, manyFrames = false } = {}) {
  let serviceReads = 0
  const rows = {
    pregame_odds_snapshots: [{ game_pk: '849803', game_date: '2026-10-27', home_abbr: 'TB', away_abbr: 'MIL' }],
    mlb_research_clock: cutoff ? [{ game_pk: '849803', start_at: cutoff }] : [],
    pregame_odds_snapshot_history: [
      { id: 1, game_pk: '849803', game_date: '2026-10-27', captured_at: '2026-10-27T23:00:00Z', prop_map: { p: { name: 'Saved player', hr: { book: 125 } } } },
      { id: 2, game_pk: '849803', game_date: '2026-10-27', captured_at: '2026-10-28T00:01:00Z', prop_map: { p: { name: 'Late player', hr: { book: -600 } } } },
    ],
    mlb_pregame_research: [{ game_pk: '849803', resource: 'board:v1', observed_at: '2026-10-27T23:30:00Z', start_at: cutoff, source: 'capture', payload: { note: 'Saved pregame input' } }],
  }
  if (manyFrames) {
    for (let i = 1; i <= 35; i++) rows.pregame_odds_snapshot_history.push({
      id: 100 + i, game_pk: '849803', game_date: '2026-10-27', captured_at: `2026-10-27T23:${String(i).padStart(2, '0')}:00Z`,
      prop_map: { p: { name: `Later player ${i}`, hr: { book: 100 + i } } },
    })
  }
  const db = { from(table) {
    serviceReads++
    let values = [...rows[table]]
    const chain = {
      select() { return chain }, eq(key, value) { values = values.filter(row => row[key] === value); return chain },
      lt(key, value) { values = values.filter(row => Date.parse(row[key]) < Date.parse(value)); return chain },
      order(key, options = {}) { values.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (options.ascending === false ? -1 : 1)); return chain },
      limit(count) { values = values.slice(0, count); return chain },
      maybeSingle: async () => ({ data: values[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: values, error: null }).then(resolve, reject),
    }
    return chain
  } }
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'u' } : null }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: missingAssurance ? null : { nextLevel: mfa ? 'aal2' : 'aal1', currentLevel: 'aal1' }, error: null }) } },
    from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { account_type: role }, error: null }) }),
  }
  const helpersSource = fs.readFileSync(new URL('../src/lib/mlbArchiveView.ts', import.meta.url), 'utf8')
  const pageSource = fs.readFileSync(new URL('../src/app/admin/mlb-archive/page.tsx', import.meta.url), 'utf8')
  function compile(source, mocks) {
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const fixtureModule = { exports: {} }
    new Function('require', 'module', 'exports', compiled)(id => { if (!(id in mocks)) throw Error(`Unexpected dependency ${id}`); return mocks[id] }, fixtureModule, fixtureModule.exports)
    return fixtureModule.exports
  }
  const helpers = compile(helpersSource, {})
  const page = compile(pageSource, {
    'react/jsx-runtime': require('react/jsx-runtime'), 'next/link': { __esModule: true, default: ({ children, ...props }) => react.createElement('a', props, children) },
    'next/navigation': { notFound: () => { throw Error('not-found') }, redirect: () => { throw Error('redirect') } },
    '@/lib/supabase/server': { createClient: async () => client }, '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/mlbArchiveView': helpers,
  })
  return { page, get reads() { return serviceReads } }
}

test('archive verifies admin and MFA before reading saved data', async () => {
  for (const state of [{ signedIn: false }, { role: 'user' }, { role: 'admin', mfa: true }, { role: 'admin', missingAssurance: true }]) {
    const f = fixture(state)
    await assert.rejects(f.page.default({ searchParams: Promise.resolve({}) }), /redirect|not-found|verification temporarily unavailable/)
    assert.equal(f.reads, 0)
  }
})

test('earliest genuine frame remains available when more than thirty later frames exist', async () => {
  const f = fixture({ manyFrames: true })
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ date: '2026-10-27', game: '849803', frame: '1' }) }))
  assert.match(html, /Saved player/)
  assert.match(html, /2026-10-27T23:00:00Z/)
  assert.match(html, /2026-10-27T23:35:00Z/)
  assert.doesNotMatch(html, /2026-10-27T23:01:00Z/)
  assert.doesNotMatch(html, /Late player|-600/)
  assert.equal((html.match(/<option /g) ?? []).length, 31)
})

test('archive reads only saved pregame frames and leaves missing cutoff unavailable', async () => {
  const f = fixture()
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ date: '2026-10-27', game: '849803' }) }))
  assert.match(html, /Saved player/); assert.match(html, /125/); assert.match(html, /2026-10-27T23:00:00Z/)
  assert.match(html, /Saved pregame input/); assert.doesNotMatch(html, /Late player|-600/)
  const missing = fixture({ cutoff: null })
  const unavailable = renderToStaticMarkup(await missing.page.default({ searchParams: Promise.resolve({ date: '2026-10-27' }) }))
  assert.match(unavailable, /cutoff is unavailable/); assert.doesNotMatch(unavailable, /Saved player|Late player/)
})
