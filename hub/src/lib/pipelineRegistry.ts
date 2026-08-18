export type PipelineDefinition = {
  name: string
  label: string
  schedule: string
  staleAfterMinutes: number
  area: 'Odds' | 'MLB data' | 'NFL data' | 'Alerts' | 'Billing' | 'Picks' | 'Maintenance'
}

const everyMinute = 4
const everyTwoMinutes = 7
const everyFiveMinutes = 12
const everyFifteenMinutes = 35
const everyThirtyMinutes = 70
const daily = 1_560

export const TRACKED_PIPELINES: PipelineDefinition[] = [
  { name: 'bdl-odds', label: 'Live odds capture', schedule: 'Every minute', staleAfterMinutes: everyMinute, area: 'Odds' },
  { name: 'dispatch-scrapes', label: 'Lineup scrape dispatcher', schedule: 'Every 2 minutes', staleAfterMinutes: everyTwoMinutes, area: 'Odds' },
  { name: 'scrape-fanduel', label: 'FanDuel gap markets', schedule: 'Scheduled and lineup-triggered', staleAfterMinutes: 600, area: 'Odds' },
  { name: 'poll-pikkit-picks', label: 'Pikkit pick import', schedule: 'Every 30 minutes', staleAfterMinutes: everyThirtyMinutes, area: 'Picks' },
  { name: 'grade-live-picks', label: 'Live pick grading', schedule: 'Every 2 minutes', staleAfterMinutes: everyTwoMinutes, area: 'Picks' },
  { name: 'settle-picks', label: 'Daily pick settlement', schedule: 'Daily', staleAfterMinutes: daily, area: 'Picks' },
  { name: 'lineup-confirmed', label: 'Confirmed lineups', schedule: 'Every 5 minutes', staleAfterMinutes: everyFiveMinutes, area: 'MLB data' },
  { name: 'hr-alerts', label: 'Home run alerts', schedule: 'Every minute', staleAfterMinutes: everyMinute, area: 'Alerts' },
  { name: 'near-hr-alerts', label: 'Near home run alerts', schedule: 'Every minute', staleAfterMinutes: everyMinute, area: 'Alerts' },
  { name: 'slate-drop', label: 'Daily slate alert', schedule: 'Daily', staleAfterMinutes: daily, area: 'Alerts' },
  { name: 'mlb-sync-bio', label: 'MLB player biographies', schedule: 'Every 15 minutes', staleAfterMinutes: everyFifteenMinutes, area: 'MLB data' },
  { name: 'mlb-sync-season-stats', label: 'MLB season statistics', schedule: 'Every 15 minutes', staleAfterMinutes: everyFifteenMinutes, area: 'MLB data' },
  { name: 'mlb-sync-career-stats', label: 'MLB career statistics', schedule: 'Every 15 minutes', staleAfterMinutes: everyFifteenMinutes, area: 'MLB data' },
  { name: 'savant-sync-tier-a', label: 'Savant core metrics', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-bat-tracking', label: 'Savant bat tracking', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-batted-ball', label: 'Savant batted-ball metrics', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-swing-take', label: 'Savant swing and take', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-swing-timing', label: 'Savant swing timing', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-batting-stance', label: 'Savant batting stance', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-swing-path', label: 'Savant swing path', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-hr-details', label: 'Savant home run detail', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-pitch-arsenal-stats', label: 'Pitch arsenal statistics', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-pitch-arsenal-details', label: 'Pitch arsenal detail', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-pitch-log', label: 'Pitch logs', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'pitch-log-freshness-check', label: 'Pitch-log freshness check', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'savant-sync-affinity', label: 'Pitch affinity metrics', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'dugout-statcast-precompute', label: 'Dugout Statcast cache', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'dugout-matchup-edge-precompute', label: 'Dugout matchup cache', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'dugout-pitchlog-stat-precompute', label: 'Dugout pitch-log cache', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'dugout-season-avg-precompute', label: 'Dugout season-average cache', schedule: 'Daily', staleAfterMinutes: daily, area: 'MLB data' },
  { name: 'nfl-sync-teams', label: 'NFL teams', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'nfl-sync-players', label: 'NFL players', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'nfl-sync-schedule', label: 'NFL schedule', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'nfl-sync-player-stats', label: 'NFL player statistics', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'nfl-sync-ngs', label: 'NFL Next Gen Stats', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'nfl-sync-pbp', label: 'NFL play-by-play', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'nfl-compute-dvp', label: 'NFL defense vs position', schedule: 'Daily', staleAfterMinutes: daily, area: 'NFL data' },
  { name: 'whop-reconcile', label: 'Whop plan reconciliation', schedule: 'Every 15 minutes', staleAfterMinutes: everyFifteenMinutes, area: 'Billing' },
  { name: 'whop-addon-reconcile', label: 'Whop add-on reconciliation', schedule: 'Every 15 minutes', staleAfterMinutes: everyFifteenMinutes, area: 'Billing' },
  { name: 'replay-operational-retries', label: 'External delivery replay', schedule: 'Every 5 minutes', staleAfterMinutes: everyFiveMinutes, area: 'Maintenance' },
  { name: 'process-contact-recap-exports', label: 'Contact recap exports', schedule: 'Every minute', staleAfterMinutes: 5, area: 'Maintenance' },
  { name: 'prune-notifications', label: 'Notification and telemetry retention', schedule: 'Daily', staleAfterMinutes: daily, area: 'Maintenance' },
  { name: 'archive-stale-watchlist', label: 'Watchlist archive', schedule: 'Daily', staleAfterMinutes: daily, area: 'Maintenance' },
]
