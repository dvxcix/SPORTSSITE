import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { act, createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { nflScorerBadge } from '../src/lib/nflScorerBadges.ts'
import type { NflTouchdownEvent } from '../src/lib/nflTouchdownFeed.ts'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/the-sideline', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
const { createRoot } = await import('react-dom/client')
const noop = () => null
async function compiled<T>(file: string, imports: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8'), target = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', output)((name: string) => {
    if (name in imports) return imports[name]
    assert.ok(['react', 'react/jsx-runtime', 'react-dom', 'lucide-react'].includes(name), name)
    return require(name)
  }, target, target.exports)
  return target.exports as T
}
const { NflTouchdownTracker } = await compiled<typeof import('../src/app/the-sideline/NflTouchdownTracker.tsx')>('../src/app/the-sideline/NflTouchdownTracker.tsx', {
  'next/image': { default: noop }, './touchdownTracker.module.css': { default: {} },
})
const odds = { players: [], capturedAt: '2026-10-25T16:58:00Z', picksCapturedAt: null } as unknown as SidelineOddsBoard
const event = {
  id: 'play1', gameId: 'game1', gameDate: '2026-10-25', playerName: 'Fixture Receiver', team: 'KC', opponent: 'SEA', kind: 'receiving',
  isFirstTdOfGame: true, playerTdNumber: 1, quarter: 1, clock: '8:00', text: 'Fixture Receiver 20 Yd pass', awayScore: 7, homeScore: 0,
  marketQuotes: [{ vendor: 'fanduel', propType: 'anytime_td', line: .5, odds: 220, openingOdds: 250 }],
} as NflTouchdownEvent

test('cold touchdown failure keeps the server board available with unknown totals and polling remains503', async () => {
  let feedReads = 0
  const feed = { getNflTouchdownFeed: async () => { feedReads++; throw new Error('fixture unavailable') } }
  const game = { id: 'game1', gameday: '2026-10-25', season: 2026, away: { abbr: 'KC' }, home: { abbr: 'SEA' } }
  const data = {
    getSidelineGames: async () => ({ games: [game], date: game.gameday, days: [] }),
    getSidelineOddsBundle: async () => ({ odds, gameState: null }), getSidelineTimeline: async () => [],
    getSidelinePregameWeather: async () => 'Clear', getCachedSidelineBoardLens: async () => ({ status: 'ready' }),
    getCachedSidelineCheatsheetLens: async () => ({ status: 'ready' }),
  }
  let boardFeed: NflTouchdownEvent[] | null | undefined, sheetFeed: NflTouchdownEvent[] | null | undefined
  const gate = { requireNflAccess: async () => ({ error: null, isAdmin: false }) }
  const page = await compiled<typeof import('../src/app/the-sideline/page.tsx')>('../src/app/the-sideline/page.tsx', {
    '@/lib/sidelineWire': { packSidelineBoard: (value: unknown) => value }, 'next/navigation': { notFound: () => { throw new Error('Denied') } },
    '@/lib/nflSample': { defaultNflSample: () => 'current', parseNflSample: (value: string) => value, nflSampleReference: () => ({ label: 'Current' }) },
    '@/lib/nflAccess': gate, '@/lib/supabase/authErrors': { AuthTemporarilyUnavailableError: Error },
    './SidelineBoardClient': { SidelineBoardClient: ({ touchdowns }: { touchdowns: NflTouchdownEvent[] | null }) => { boardFeed = touchdowns; return createElement('article', null, 'Current odds +220', createElement(NflTouchdownTracker, { events: touchdowns, onJumpToGame: noop })) } },
    './SidelineResearchClient': { SidelineResearchClient: noop }, './SidelineNavigation': { SidelineNavigation: noop }, './SidelineMatchupLab': { SidelineMatchupLab: noop },
    './SidelineCheatsheets': { SidelineCheatsheets: () => createElement('article', null, 'Cheatsheet odds +220') }, './data': data,
    '@/components/layout/PageState': { PageState: noop }, '@/components/product/ProductPage': { ProductHero: noop, ProductPageShell: noop },
    '@/lib/nflTouchdownFeed': feed, '@/lib/nflPublicResultsServer': { getNflPublicResults: noop },
    '@/lib/nflPregameResearchData': { nflPregameOpen: () => false }, './NflPregameBoundary': { NflPregameBoundary: noop },
    '@/components/sideline/NflScorerBadges': { LiveNflScorerProvider: ({ events, children }: { events: NflTouchdownEvent[] | null; children: ReactNode }) => { sheetFeed = events; return children } },
  })
  const route = await compiled<typeof import('../src/app/the-sideline/market/route.ts')>('../src/app/the-sideline/market/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/sidelineWire': { packSidelineBoard: (value: unknown) => value },
    '@/lib/nflAccess': gate, '../data': data, '@/lib/nflTouchdownFeed': feed,
    '@/lib/nflPublicResultsServer': { getNflPublicResults: noop }, '@/lib/nflPregameResearchData': { nflPregameOpen: () => false },
  })
  const originalError = console.error; console.error = noop
  try {
    const markup = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }))
    assert.equal(boardFeed, null); assert.match(markup, /Current odds \+220/)
    assert.match(markup, /temporarily unavailable/); assert.doesNotMatch(markup, /0 touchdowns|No touchdowns/)
    assert.match(renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ mode: 'cheatsheets' }) })), /Cheatsheet odds \+220/)
    assert.equal(sheetFeed, null)
    for (const suffix of ['', '&touchdowns=1']) {
      const response = await route.GET(new Request(`https://www.slipsurge.com/the-sideline/market?game=game1${suffix}`))
      assert.equal(response.status, 503); assert.equal('touchdowns' in await response.json(), false)
    }
    assert.equal(feedReads, 4)
  } finally { console.error = originalError }
})

async function mounted(initial: NflTouchdownEvent[] | null) {
  let refresh: ((signal: AbortSignal) => Promise<void>) | undefined
  const polling = { startNflPolling: (callback: typeof refresh) => { refresh = callback; return noop } }
  const { useSidelineMarket } = await compiled<typeof import('../src/app/the-sideline/useSidelineMarket.ts')>('../src/app/the-sideline/useSidelineMarket.ts', {
    '@/lib/sidelineWire': { unpackSidelineBoard: (value: unknown) => value }, '@/lib/nflPolling': polling,
    '@/lib/nflAvailability': { withGameAvailability: (value: unknown) => value },
  })
  const scorers = await compiled<typeof import('../src/components/sideline/NflScorerBadges.tsx')>('../src/components/sideline/NflScorerBadges.tsx', {
    '@/lib/nflScorerBadges': { nflScorerBadge }, '@/lib/nflPolling': polling,
  })
  let snapshot!: ReturnType<typeof useSidelineMarket>
  function Probe() {
    snapshot = useSidelineMarket('game1', odds, null, initial, [])
    return createElement(scorers.NflScorerProvider, { gameId: 'game1', events: snapshot.touchdowns } as Parameters<typeof scorers.NflScorerProvider>[0], createElement('div', null,
      createElement(NflTouchdownTracker, { events: snapshot.touchdowns, onJumpToGame: noop }),
      createElement(scorers.NflScorerBadges, { player: { name: event.playerName, team: 'KC' } }),
    ))
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), savedFetch = globalThis.fetch
  await act(async () => root.render(createElement(Probe)))
  return {
    host, state: () => snapshot,
    open: async () => { await act(async () => (host.querySelector('button') as HTMLButtonElement).click()) },
    poll: async (status: number, payload: unknown) => {
      globalThis.fetch = async () => Response.json(payload, { status })
      await act(async () => {
        if (status >= 400) await assert.rejects(() => refresh!(new AbortController().signal), /refresh failed/)
        else await refresh!(new AbortController().signal)
      })
    },
    close: async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = savedFetch },
  }
}

test('unknown initial scoring renders unavailable, then successful polling restores counts, quotes and badges', async () => {
  const ui = await mounted(null)
  try {
    await ui.open()
    assert.match(document.body.textContent ?? '', /Touchdowns temporarily unavailable/)
    assert.doesNotMatch(document.body.textContent ?? '', /0 touchdowns|No touchdowns|LIVE1|🔥/)
    await ui.poll(503, { error: 'Unavailable' }); assert.equal(ui.state().touchdowns, null)
    await ui.poll(200, { touchdowns: [event] })
    assert.equal(ui.state().touchdowns?.length, 1); assert.equal(ui.state().error, '')
    assert.match(document.body.textContent ?? '', /1 touchdowns/); assert.match(document.body.textContent ?? '', /ATD \+220/)
    assert.ok(ui.host.querySelector('[aria-label="1 touchdown scored in this game"]'))
    assert.doesNotMatch(document.body.textContent ?? '', /temporarily unavailable/)
  } finally { await ui.close() }
})

test('failed scoring poll retains the previous events and exact quote/opening; a verified empty response alone clears them', async () => {
  const ui = await mounted([event])
  try {
    await ui.poll(503, { touchdowns: [] })
    assert.deepEqual(ui.state().touchdowns, [event]); assert.equal(ui.state().current, odds)
    assert.equal(ui.state().touchdowns?.[0].marketQuotes[0].openingOdds, 250)
    await ui.poll(200, { touchdowns: [] })
    assert.deepEqual(ui.state().touchdowns, [])
    await ui.open(); assert.match(document.body.textContent ?? '', /No touchdowns in this view yet/)
    assert.equal(ui.host.querySelector('[aria-label="1 touchdown scored in this game"]'), null)
  } finally { await ui.close() }
})
