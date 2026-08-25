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
    ['8 game intelligence strip', ['dugout-intelligence-strip', 'GameWeatherSummary', 'GAME STATE', 'TEAM ML SIGNAL', 'BOOK DISAGREEMENT', 'NO HR + MOVE', 'SAVED SIGNALS']],
    ['9 collapsible team summaries', ['dg-team-collapse', 'toggleTeamCollapsed', 'prefix="Top" compact', 'HR LEAD', 'LINEUP']],
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
  assert.match(source, /inset:auto 6px var\(--mobile-dock-clearance\) 6px/)
  assert.match(source, /\.dg-team-name\{[^}]*text-overflow:ellipsis/)
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
