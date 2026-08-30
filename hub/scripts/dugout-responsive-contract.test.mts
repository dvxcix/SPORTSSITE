import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { applyDugoutViewPreset, buildDugoutMarketTimeline } from '../src/lib/dugoutPresentation.ts'
import { computeDugoutMomentum, seriesTrend, type DugoutMomentumInputRow, type DugoutMomentumWindow } from '../src/lib/dugoutMomentum.ts'
import { isHistoricalDugoutDate } from '../src/lib/dugoutBoardDate.ts'

const source = readFileSync(new URL('../src/components/dugout/DugoutClient.tsx', import.meta.url), 'utf8')
const parkSource = readFileSync(new URL('../src/components/dugout/GameWeatherCard.tsx', import.meta.url), 'utf8')
const pageStyles = readFileSync(new URL('../src/app/dugout/dugout-page.module.css', import.meta.url), 'utf8')
const scoreRingSource = readFileSync(new URL('../src/components/ui/MechanicsScoreRing.tsx', import.meta.url), 'utf8')
const scoreLabelSource = readFileSync(new URL('../src/components/ui/SlipSurgeScoreLabel.tsx', import.meta.url), 'utf8')
const modalSurfaceSource = readFileSync(new URL('../src/components/ui/ModalSurface.tsx', import.meta.url), 'utf8')
const watchlistSource = readFileSync(new URL('../src/components/dugout/WatchlistPanel.tsx', import.meta.url), 'utf8')
const picksSource = readFileSync(new URL('../src/components/dugout/MyPicksPanel.tsx', import.meta.url), 'utf8')
const matrixSource = readFileSync(new URL('../src/components/dugout/CustomMatrixPanel.tsx', import.meta.url), 'utf8')
const utilityDockSource = readFileSync(new URL('../src/components/layout/UtilityDock.tsx', import.meta.url), 'utf8')
const globalStyles = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const statcastPrecomputeSource = readFileSync(new URL('../src/lib/dugoutStatcastPrecompute.ts', import.meta.url), 'utf8')
const matchupEdgePrecomputeSource = readFileSync(new URL('../src/lib/dugoutMatchupEdgePrecompute.ts', import.meta.url), 'utf8')
const mechanicsCacheSource = readFileSync(new URL('../src/lib/hrMechanicsCache.ts', import.meta.url), 'utf8')

test('Dugout workspace fluidly fills ultrawide displays', () => {
  const pageRule = pageStyles.match(/\.page\{([^}]*)\}/)?.[1] ?? ''
  assert.match(pageRule, /width:100%/)
  assert.match(pageRule, /max-width:none/)
  assert.match(pageRule, /min-width:0/)
  assert.doesNotMatch(pageRule, /1920px/)
})

function momentumRow(scores: [number, number, number, number], paperSpeeds: [number, number, number, number]): DugoutMomentumInputRow {
  const windows = ['l10', 'l5', 'l3', 'l1'] as const
  const mechanics_windows = {} as DugoutMomentumInputRow['mechanics_windows']
  const paper_inputs_by_window = {} as DugoutMomentumInputRow['paper_inputs_by_window']
  windows.forEach((window, index) => {
    mechanics_windows[window] = { index: scores[index] }
    paper_inputs_by_window[window] = {
      matchup_edge: null, s_brl: null, s_spd: 70, r_spd: paperSpeeds[index], platoon_ops: null,
      s_pa: null, s_sq: null, r_sq: null, s_hh: null, s_ev: null,
      s_timing: null, r_timing: null, recent_pitch_count: 40,
    }
  })
  return {
    mechanics_windows,
    paper_inputs_by_window,
    paper_windows: {} as Partial<Record<DugoutMomentumWindow, number | null>>,
    paper_percentile_windows: {} as Partial<Record<DugoutMomentumWindow, number | null>>,
    momentum: { direction: 'unknown', score: null, slipsurgeTrend: null, paperTrend: null, level: 0, label: 'No trend' },
  }
}

test('form battery combines full SlipSurge and Paper Score trajectories relative to the game', () => {
  const charging = momentumRow([35, 48, 66, 82], [64, 70, 77, 84])
  const steady = momentumRow([55, 55, 55, 55], [74, 74, 74, 74])
  const cooling = momentumRow([84, 68, 49, 31], [84, 78, 69, 61])
  const pool = [charging, steady, cooling]
  computeDugoutMomentum(pool)

  assert.equal(charging.momentum.direction, 'up')
  assert.equal(charging.momentum.level, 1)
  assert.equal(cooling.momentum.direction, 'down')
  assert.equal(cooling.momentum.level, 1)
  assert.equal(steady.momentum.direction, 'steady')
  assert.ok(charging.momentum.slipsurgeTrend! > 0)
  assert.ok(charging.momentum.paperTrend! > 0)
  assert.ok(cooling.momentum.slipsurgeTrend! < 0)
  assert.ok(cooling.momentum.paperTrend! < 0)
  assert.ok(seriesTrend([10, null, 30, 40])! > 0)
})

test('player rows expose an animated accessible form battery without adding a saved column', () => {
  assert.ok(source.includes('dg-momentum-battery'))
  assert.ok(source.includes('Form battery:'))
  assert.ok(source.includes("['FORM BATTERY', 'L10-to-L1 trajectory."))
  assert.match(globalStyles, /\.dg-momentum-battery\.is-up \.dg-momentum-battery-fill\{bottom:1px/)
  assert.match(globalStyles, /\.dg-momentum-battery\.is-down \.dg-momentum-battery-fill\{top:1px/)
  assert.match(globalStyles, /@media\(prefers-reduced-motion:reduce\)/)
  assert.equal(source.includes("key: 'momentum'"), false)
})

test('historical Batter Charge inputs are immutable while missing rows may backfill', () => {
  assert.equal(isHistoricalDugoutDate('2026-08-24', '2026-08-25'), true)
  assert.equal(isHistoricalDugoutDate('2026-08-25', '2026-08-25'), false)
  assert.equal(isHistoricalDugoutDate('2026-08-26', '2026-08-25'), false)
  assert.match(statcastPrecomputeSource, /ignoreDuplicates: historical/)
  assert.match(statcastPrecomputeSource, /existingKeys\.has/)
  assert.match(matchupEdgePrecomputeSource, /ignoreDuplicates: historical/)
  assert.match(matchupEdgePrecomputeSource, /existingKeys\.has/)
  assert.match(mechanicsCacheSource, /historicalSnapshot\) return \{ results: historicalSnapshot, cache: 'hit' \}/)
  assert.match(mechanicsCacheSource, /ignoreDuplicates: historical/)
})

test('Daily Recap reuses the Batter Charge calculation and shared visual treatment', () => {
  const recapStart = source.indexOf('export function DailyRecapTable')
  const recapEnd = source.indexOf('export default function DugoutClient', recapStart)
  const recapSource = source.slice(recapStart, recapEnd > recapStart ? recapEnd : undefined)
  assert.ok(recapSource.includes('computeDugoutMomentum(pool)'))
  assert.ok(recapSource.includes('<BatterRowEl'))
  assert.ok(globalStyles.includes('.dg-momentum-battery'))
})

test('Daily Recap has a responsive market scrubber and never doubles Statcast window labels', () => {
  const recapStart = source.indexOf('export function DailyRecapTable')
  const recapEnd = source.indexOf('export default function DugoutClient', recapStart)
  const recapSource = source.slice(recapStart, recapEnd > recapStart ? recapEnd : undefined)
  assert.ok(recapSource.includes('Daily Recap market story'))
  assert.ok(recapSource.includes('Scrub Daily Recap market captures'))
  assert.ok(recapSource.includes('/api/odds-terminal?'))
  assert.ok(recapSource.includes('withDugoutTimelinePrices'))
  assert.ok(recapSource.includes('const displayRows = useMemo(() =>'))
  assert.match(recapSource, /\.daily-recap-board-scroll \.dugout-window-toggle i\{display:none\}/)
  assert.match(recapSource, /\.daily-recap-board-scroll \.dugout-window-toggle button span\{display:none\}/)
  assert.match(recapSource, /\.daily-recap-board-scroll \.dugout-window-toggle button i\{display:inline/)
})

test('temporary presets preserve a member custom order and never reveal hidden columns', () => {
  const customized = [
    { key: 'hits', group: 'props' },
    { key: 'index', group: 'mechanics' },
    { key: 'hr', group: 'hr' },
    { key: 'picks', group: 'picks' },
  ]
  assert.deepEqual(applyDugoutViewPreset(customized, 'all'), customized)
  assert.deepEqual(applyDugoutViewPreset(customized, 'market').map(column => column.key), ['hits', 'hr', 'picks'])
  assert.deepEqual(applyDugoutViewPreset(customized, 'props').map(column => column.key), ['hits', 'picks'])
  assert.equal(applyDugoutViewPreset(customized, 'market').some(column => column.key === 'fhr'), false)
})

test('market timeline rebuilds real compact deltas without synthetic points', () => {
  const timeline = buildDugoutMarketTimeline([
    { captured_at: '2026-08-25T12:00:00Z', prop_map: { p1: { name: 'Player One', fhr: { fanduel: '+1500' }, sa: { fanduel: 500 } } } },
    { captured_at: '2026-08-25T12:10:00Z', prop_map: { p1: { name: 'Player One', singles: { fanduel: -115 }, doubles: { fanduel: 380 }, triples: { fanduel: 4500 }, stolen_bases: { fanduel: 550 }, stolen_bases2: { fanduel: 2200 }, hits: { fanduel: -200 }, hits2: { fanduel: 280 }, runs: { fanduel: 120 }, runs2: { fanduel: 950 } } } },
    { captured_at: '2026-08-25T12:20:00Z', prop_map: { p1: { name: 'Player One', sa: { fanduel: 450, betmgm: 475 }, hits: { fanduel: -220 }, tb5: { fanduel: 1700 } }, p2: { name: 'Player Two', fhr: { fanduel: 2200 } } } },
  ])
  assert.equal(timeline.length, 3)
  assert.equal(timeline[0].players.get('player one')?.fhr?.fanduel, 1500)
  assert.equal(timeline[1].players.get('player one')?.singles?.fanduel, -115)
  assert.equal(timeline[1].players.get('player one')?.doubles?.fanduel, 380)
  assert.equal(timeline[1].players.get('player one')?.triples?.fanduel, 4500)
  assert.equal(timeline[1].players.get('player one')?.stolen_bases?.fanduel, 550)
  assert.equal(timeline[1].players.get('player one')?.stolen_bases2?.fanduel, 2200)
  assert.equal(timeline[1].players.get('player one')?.hits?.fanduel, -200)
  assert.equal(timeline[1].players.get('player one')?.hits2?.fanduel, 280)
  assert.equal(timeline[1].players.get('player one')?.runs?.fanduel, 120)
  assert.equal(timeline[1].players.get('player one')?.runs2?.fanduel, 950)
  assert.equal(timeline[2].players.get('player one')?.fhr?.fanduel, 1500)
  assert.equal(timeline[2].players.get('player one')?.hits?.fanduel, -220)
  assert.equal(timeline[2].players.get('player one')?.sa?.fanduel, 450)
  assert.equal(timeline[2].players.get('player one')?.sa?.betmgm, 475)
  assert.equal(timeline[2].players.get('player one')?.tb5?.fanduel, 1700)
  assert.equal(timeline[2].players.get('player two')?.fhr?.fanduel, 2200)
})

test('single, extra-base, stolen-base, hit, and run cells follow the selected market capture', () => {
  const mappings = [
    ["'singles'", 'sngFd_open', 'sng_fd'],
    ["'doubles'", 'dblFd_open', 'dbl_fd'],
    ["'triples'", 'triFd_open', 'tri_fd'],
    ["'stolen_bases'", 'sb_open', 'sb_fd'],
    ["'stolen_bases2'", 'sb2_open', 'sb2_fd'],
    ["'hits'", 'hits_open', 'hits_fd'],
    ["'hits2'", 'hits2_open', 'hits2_fd'],
    ["'runs'", 'runs_open', 'runs_fd'],
    ["'runs2'", 'runs2_open', 'runs2_fd'],
  ] as const

  for (const [market, opener, field] of mappings) {
    assert.ok(source.includes(`price(${market}, row.${opener}, row.${field})`), `${field} does not follow Market Story`)
  }
})

test('The Dugout implements all 14 responsive product requirements', () => {
  const requirements = [
    ['1 unified command and game navigation', ['dugout-command-bar', 'Previous game', 'All Games', 'dugout-game-picker-filters', 'Columns', 'Tools']],
    ['2 temporary presets and group navigation', ["['signal', 'market', 'power', 'props', 'all', 'custom']", 'dugout-group-nav', "['core', 'CORE'", "['pitch-fit', 'PITCH FIT'"]],
    ['3 market-cell grammar and book states', ['dg-market-cell', 'data-book-state', 'data-market-move', 'dg-market-open', "bookSpread <= 0.015 ? 'agreement'", "bookSpread >= 0.04 ? 'disagreement'"]],
    ['4 responsive player inspector', ['aria-label="Player inspector sections"', "['matchup', 'contact', 'park']", "'Park Projection'", 'onPrevious', 'onNext']],
    ['5 player identity and quick scores', ['size={34}', 'dg-player-name', 'dg-player-signal-row', '<small>MKT</small>', '<small>CON</small>', '<small>FIT</small>']],
    ['6 readable density and mobile targets', ['dg-player-name{font-size:13px', 'font-variant-numeric:tabular-nums', 'min-height:44px', 'density-comfortable']],
    ['7 concise glossary', ['Open glossary', 'Board glossary', 'Quick definitions only', "['SLIPSURGE SCORE', 'The selected window’s SlipSurge batter score.']"]],
    ['8 game intelligence strip', ['dugout-intelligence-strip', 'GameWeatherSummary', 'GAME STATUS', 'HR + TEAM WIN', 'BOOK DISAGREEMENT', 'NO HOME RUN', 'YOUR SAVED READS']],
    ['9 collapsible team summaries', ['dg-team-collapse', 'toggleTeamCollapsed', 'prefix="Top" compact', 'MOST ADVERTISED', 'MOST HIDDEN', 'LINEUP']],
    ['10 desktop and mobile minimaps', ['dugout-desktop-minimap', 'dugout-board-nav', "(['start', 'home', 'away', 'end'] as const)", 'dugout-board-progress']],
    ['11 persistent two-to-four player comparison', ['slice(0, 4)', 'previous.slice(-3)', 'dugout-compare-tray', "(['l1', 'l3', 'l5', 'l10'] as const)", 'PROJECTED BATTED BALL', 'PITCH FIT']],
    ['12 multi-market timeline', ['MARKET STORY', 'dugout-timeline-phases', "label: 'OPEN'", "label: '9AM'", "label: 'NOON'", "label: 'LINEUP'", "label: 'CURRENT'", 'withTimelinePrices', 'timelineRow.sa_mgm']],
    ['13 restored workspace state', ['ss:dugout-view-v1:', 'ss:dugout-active-game:', 'collapsedTeams', 'inspectorTab', 'compareOpen', 'activeGroup']],
    ['14 explicit responsive layout contracts', ['@media(max-width:640px)', '@media(min-width:641px) and (max-width:900px)', '@media(min-width:901px) and (max-width:1250px)']],
  ] as const

  for (const [requirement, markers] of requirements) {
    for (const marker of markers) assert.ok(source.includes(marker), `${requirement}: missing ${marker}`)
  }
})

test('team banners do not duplicate the board controls', () => {
  assert.equal(source.split('{modeButtons}').length - 1, 1)
})

test('each team banner can change the shared Statcast window without touching saved columns', () => {
  assert.ok(source.includes('className="dg-team-window-control"'))
  assert.ok(source.includes('ariaLabel={`${abbr} Statcast data window`}'))
  assert.ok(source.includes('value={statcastWindow}'))
  assert.ok(source.includes('onChange={onStatcastWindowChange}'))
  assert.ok(source.includes('aria-pressed={value === w}'))
  assert.match(source, /\.dugout-window-toggle\.is-team-header\{[^}]*min-height:36px/)
  assert.match(source, /\.dg-team-window-control\{width:100%\}/)
  assert.equal(source.includes("key: 'statcast-window'"), false)
})

test('presets never write member column preferences', () => {
  const start = source.indexOf('const renderedDugoutColumns')
  const end = source.indexOf('const [marketHistory', start)
  const presetImplementation = source.slice(start, end)
  assert.ok(start > 0 && end > start)
  assert.equal(presetImplementation.includes('saveColumnPrefs'), false)
  assert.equal(presetImplementation.includes('setColumnPrefsState'), false)
})

test('mobile composition stays singular, dock-safe, and readable', () => {
  assert.match(source, /\.dugout-command-navigation,\.dugout-command-matchup\{display:none\}/)
  assert.match(source, /\.dugout-jump-menu\{display:none!important\}/)
  assert.match(source, /\.dg-player-drilldown-portal\{align-items:flex-end;justify-content:stretch/)
  assert.match(source, /height:calc\(100dvh - max\(8px,env\(safe-area-inset-top\)\)\)/)
  assert.match(source, /padding:12px 12px max\(20px,env\(safe-area-inset-bottom\)\)/)
  assert.match(source, /\.dg-team-name\{[^}]*text-overflow:ellipsis/)
})

test('player analysis is a true accessible modal instead of a shrinking side rail', () => {
  assert.ok(source.includes("import { createPortal } from 'react-dom'"))
  assert.ok(source.includes('dg-player-drilldown-backdrop'))
  assert.ok(source.includes('role="dialog"'))
  assert.ok(source.includes('aria-modal="true"'))
  assert.ok(source.includes("document.body.style.overflow = 'hidden'"))
  assert.ok(source.includes("document.body.classList.add('ss-modal-open')"))
  assert.ok(source.includes("document.body.classList.remove('ss-modal-open')"))
  assert.ok(source.includes('createPortal(dialog, portalHost)'))
  assert.ok(source.includes('trapDialogFocus'))
  assert.ok(source.includes("dialogRef.current?.scrollTo({ top: 0"))
  assert.match(source, /\.dugout-board-enter\.has-inspector\{padding-right:0\}/)
  assert.match(source, /\.dg-player-drilldown-portal\{position:fixed;inset:0;z-index:1700/)
  assert.match(source, /\.dg-player-drilldown-portal>\.dg-player-drilldown\{position:relative/)
  assert.match(source, /width:min\(1180px,calc\(100vw - 48px\)\)/)
})

test('game intelligence and lineup navigation explain themselves visually', () => {
  assert.ok(source.includes('Lineup quick jump'))
  assert.ok(source.includes('Select a batter to move directly to their row.'))
  assert.ok(source.includes('SlipSurge Score ${Math.round(score)}'))
  assert.ok(source.includes('Jump to player row'))
  assert.match(source, /\.dugout-intelligence-strip\{[^}]*grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/)
  assert.ok(source.includes('<small>STARTING MATCHUP</small>'))
  assert.ok(source.includes('<small>HR + TEAM WIN</small>'))
  assert.ok(source.includes('<small>YOUR SAVED READS</small>'))
  assert.ok(source.includes('className="dugout-intel-matchup"'))
  assert.match(source, /grid-template-areas:"weather state" "matchup saved"/)
  assert.match(source, /\.dugout-market-snapshot\{position:fixed;left:50%;bottom:calc\(max\(10px,env\(safe-area-inset-bottom,0px\)\) \+ 70px\)/)
  assert.match(source, /body:has\(\.dugout-market-snapshot\) \.ss-utility-dock\{bottom:calc\(var\(--mobile-dock-clearance\) \+ 48px\)\}/)
  assert.match(source, /\.dugout-intel-team-ml,\.dugout-intel-book,\.dugout-intel-window,\.dugout-intel-nohr\{display:none!important\}/)
})

test('touch foldables retain the complete mobile Dugout and shell behavior when unfolded', () => {
  const foldQuery = '(max-width:1024px) and (any-pointer:coarse)'
  assert.ok(source.includes(`@media(max-width:640px),${foldQuery}`))
  assert.ok(parkSource.includes(`@media(max-width:640px),${foldQuery}`))
  assert.ok(utilityDockSource.includes('(max-width: 1024px) and (any-pointer: coarse)'))
  assert.ok(globalStyles.includes('@media (max-width: 1024px) and (any-pointer: coarse)'))
  assert.ok(globalStyles.includes('.ss-mobile-dock.md\\:hidden'))
  assert.ok(globalStyles.includes('.ss-site-sidebar.-translate-x-full'))
  assert.ok(globalStyles.includes('.ss-site-topbar .md\\:hidden'))
})

test('comparison and park surfaces use deliberate high-contrast heat treatments', () => {
  assert.ok(source.includes('function comparisonHeat'))
  assert.ok(source.includes('dugout-compare-heat-grid'))
  assert.ok(source.includes('comparedRows.map'))
  assert.ok(source.includes('data-family="score"'))
  assert.ok(source.includes('data-family="market"'))
  assert.ok(source.includes('data-family="matchup"'))
  assert.ok(source.includes('data-family="contact"'))
  assert.ok(source.includes('data-family="projection"'))
  assert.match(source, /\.dugout-compare-card\{[^}]*min-width:280px/)
  assert.match(source, /\.dugout-compare-heat-grid strong\{[^}]*font-size:18px/)
  assert.match(source, /grid-auto-columns:min\(86vw,360px\)/)
  assert.ok(parkSource.includes('dugout-park-card'))
  assert.ok(parkSource.includes('dugout-weather-metrics'))
  assert.ok(parkSource.includes('color:#f8fafc'))
})

test('comparison and team signals expose the real sportsbook context', () => {
  assert.ok(source.includes("const HR_BOOK_META = ["))
  assert.ok(source.includes("{ vendor: 'fanduel', label: 'FanDuel' }"))
  assert.ok(source.includes('FIRST HOME RUN'))
  assert.ok(source.includes('ANYTIME HOME RUN'))
  assert.ok(source.includes('dugout-compare-book-strip'))
  assert.ok(source.includes('className={offer.primary ? \'is-primary\' : undefined}'))
  assert.ok(source.includes("selectHrBookOffer(advertised, 'shortest')"))
  assert.ok(source.includes("selectHrBookOffer(hidden, 'longest')"))
  assert.ok(source.includes('<BookLogo vendor={summary.advertisedOffer.vendor}'))
  assert.ok(source.includes('<BookLogo vendor={summary.hiddenOffer.vendor}'))
  assert.equal(source.includes('<small>HR LEAD</small>'), false)
})

test('market cells use one movement indicator and a readable opening-price label', () => {
  assert.ok(source.includes('<span>OPEN</span>'))
  assert.ok(source.includes('aria-label={`Opening price ${oStr(openOdds)}`}'))
  assert.match(source, /\.dg-market-open\{[^}]*color:#b8c3d4[^}]*font-size:7\.5px/)
  assert.doesNotMatch(source, /td\[data-market-move=shorter\]::after/)
  assert.doesNotMatch(source, /td\[data-market-move=longer\]::after/)
})

test('RBI and total-base markets switch between HR ratios and raw FanDuel odds without changing columns', () => {
  assert.ok(source.includes("export type DugoutRelatedMarketDisplay = 'ratio' | 'odds'"))
  assert.ok(source.includes('className="dugout-related-market-control"'))
  assert.ok(source.includes('HR Ratios'))
  assert.ok(source.includes('Raw Odds'))
  assert.ok(source.includes('<BookLogo vendor="fanduel" size={14} />'))
  assert.ok(source.includes("relatedMarketDisplay === 'ratio' ? f2(ratio) : undefined"))
  assert.ok(source.includes("RELATED('1+ RBI', 'sa_div_rbi', 'rbi_fd'"))
  assert.ok(source.includes("RELATED('5+ TB', 'sa_div_tb5', 'tb5_fd'"))
  assert.ok(source.includes("RELATED('2+ HR', 'sa_div_hr2', 'hr2_fd'"))
  assert.ok(source.includes('relatedMarketDisplay={relatedMarketDisplay}'))
  assert.ok(source.includes('compareOpen, relatedMarketDisplay'))
})

test('glossary terms cannot overlap their definitions at desktop or mobile widths', () => {
  assert.match(source, /grid-template-columns:minmax\(142px,\.78fr\) minmax\(0,1\.22fr\)/)
  assert.match(source, /\.dugout-glossary p\{min-width:0[^}]*overflow-wrap:anywhere/)
  assert.match(source, /\.dugout-glossary>div>span\{grid-template-columns:minmax\(0,1fr\);gap:7px/)
  assert.ok(source.includes("if (event.key === 'Escape') setShowGlossary(false)"))
  assert.ok(source.includes("document.body.classList.add('ss-modal-open')"))
  assert.ok(source.includes('aria-labelledby="dugout-glossary-title"'))
  assert.ok(source.includes('aria-describedby="dugout-glossary-description"'))
})

test('public scoring surfaces use SlipSurge Score branding instead of Index', () => {
  assert.ok(source.includes('SlipSurgeScoreLabel'))
  assert.ok(source.includes("mechanics_index: 'SlipSurge Score'"))
  assert.equal(source.includes('TOP INDEX'), false)
  assert.equal(source.includes('>INDEX<'), false)
  assert.ok(scoreRingSource.includes("label = 'SlipSurge Score'"))
  assert.ok(scoreRingSource.includes('src="/logo.png"'))
  assert.ok(scoreLabelSource.includes('SlipSurgeScoreLabel'))
  assert.ok(scoreLabelSource.includes('src="/logo.png"'))
})

test('every secondary Dugout overlay follows the same accessible modal contract', () => {
  assert.ok(modalSurfaceSource.includes("import { createPortal } from 'react-dom'"))
  assert.ok(modalSurfaceSource.includes('role="dialog"'))
  assert.ok(modalSurfaceSource.includes('aria-modal="true"'))
  assert.ok(modalSurfaceSource.includes("document.body.style.overflow = 'hidden'"))
  assert.ok(modalSurfaceSource.includes("document.body.classList.add('ss-modal-open')"))
  assert.ok(modalSurfaceSource.includes("event.key !== 'Escape'"))
  assert.ok(modalSurfaceSource.includes("event.key !== 'Tab'"))
  assert.ok(modalSurfaceSource.includes("'[data-modal-autofocus]'"))
  assert.ok(modalSurfaceSource.includes('activeElement?.focus'))
  assert.ok(modalSurfaceSource.includes("position: 'fixed', inset: 0, display: 'flex'"))
  assert.ok(modalSurfaceSource.includes("style={{ outline: 'none', ...panelStyle }}"))
  assert.ok(watchlistSource.includes('<ModalSurface'))
  assert.ok(picksSource.includes('<ModalSurface'))
  assert.ok(matrixSource.includes('<ModalSurface'))
  assert.ok((source.match(/<ModalSurface/g) ?? []).length >= 5)
})

test('the Dugout tools popover has explicit state, dismissal, and ownership', () => {
  assert.ok(source.includes('aria-controls={toolsPopoverId}'))
  assert.ok(source.includes('id={toolsPopoverId}'))
  assert.ok(source.includes("document.addEventListener('pointerdown', dismissTools)"))
  assert.ok(source.includes("if (event.key === 'Escape') setShowTools(false)"))
  assert.ok(source.includes("setViewPreset(preset); setShowTools(false)"))
})
