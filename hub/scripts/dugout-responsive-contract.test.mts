import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { applyDugoutViewPreset, buildDugoutMarketTimeline } from '../src/lib/dugoutPresentation.ts'

const source = readFileSync(new URL('../src/components/dugout/DugoutClient.tsx', import.meta.url), 'utf8')
const parkSource = readFileSync(new URL('../src/components/dugout/GameWeatherCard.tsx', import.meta.url), 'utf8')
const pageStyles = readFileSync(new URL('../src/app/dugout/dugout-page.module.css', import.meta.url), 'utf8')
const scoreRingSource = readFileSync(new URL('../src/components/ui/MechanicsScoreRing.tsx', import.meta.url), 'utf8')
const scoreLabelSource = readFileSync(new URL('../src/components/ui/SlipSurgeScoreLabel.tsx', import.meta.url), 'utf8')

test('Dugout workspace fluidly fills ultrawide displays', () => {
  const pageRule = pageStyles.match(/\.page\{([^}]*)\}/)?.[1] ?? ''
  assert.match(pageRule, /width:100%/)
  assert.match(pageRule, /max-width:none/)
  assert.match(pageRule, /min-width:0/)
  assert.doesNotMatch(pageRule, /1920px/)
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
    { captured_at: '2026-08-25T12:10:00Z', prop_map: { p1: { name: 'Player One', hits: { fanduel: -200 } } } },
    { captured_at: '2026-08-25T12:20:00Z', prop_map: { p1: { name: 'Player One', sa: { fanduel: 450, betmgm: 475 }, tb5: { fanduel: 1700 } }, p2: { name: 'Player Two', fhr: { fanduel: 2200 } } } },
  ])
  assert.equal(timeline.length, 2)
  assert.equal(timeline[0].players.get('player one')?.fhr?.fanduel, 1500)
  assert.equal(timeline[1].players.get('player one')?.fhr?.fanduel, 1500)
  assert.equal(timeline[1].players.get('player one')?.sa?.fanduel, 450)
  assert.equal(timeline[1].players.get('player one')?.sa?.betmgm, 475)
  assert.equal(timeline[1].players.get('player one')?.tb5?.fanduel, 1700)
  assert.equal(timeline[1].players.get('player two')?.fhr?.fanduel, 2200)
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
  assert.match(source, /grid-template-areas:"weather state" "matchup saved" "market market"/)
  assert.match(source, /\.dugout-intel-team-ml,\.dugout-intel-book,\.dugout-intel-window,\.dugout-intel-nohr\{display:none!important\}/)
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
