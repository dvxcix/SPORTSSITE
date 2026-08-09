export type PipelineDefinition = {
  name: string
  label: string
  schedule: string
  staleAfterMinutes: number
  area: 'Odds' | 'MLB data' | 'Alerts' | 'Billing'
}

export const TRACKED_PIPELINES: PipelineDefinition[] = [
  { name: 'bdl-odds', label: 'Live odds capture', schedule: 'Every minute', staleAfterMinutes: 4, area: 'Odds' },
  { name: 'dispatch-scrapes', label: 'Lineup scrape dispatcher', schedule: 'Every 2 minutes', staleAfterMinutes: 7, area: 'Odds' },
  { name: 'scrape-fanduel', label: 'FanDuel gap markets', schedule: 'Scheduled and lineup-triggered', staleAfterMinutes: 360, area: 'Odds' },
  { name: 'lineup-confirmed', label: 'Confirmed lineups', schedule: 'Every 5 minutes', staleAfterMinutes: 12, area: 'MLB data' },
  { name: 'hr-alerts', label: 'Home run alerts', schedule: 'Every minute', staleAfterMinutes: 4, area: 'Alerts' },
  { name: 'near-hr-alerts', label: 'Near home run alerts', schedule: 'Every minute', staleAfterMinutes: 4, area: 'Alerts' },
  { name: 'dugout-statcast-precompute', label: 'Dugout Statcast cache', schedule: 'Daily', staleAfterMinutes: 1_560, area: 'MLB data' },
  { name: 'dugout-matchup-edge-precompute', label: 'Dugout matchup cache', schedule: 'Daily', staleAfterMinutes: 1_560, area: 'MLB data' },
  { name: 'whop-reconcile', label: 'Whop plan reconciliation', schedule: 'Every 15 minutes', staleAfterMinutes: 35, area: 'Billing' },
  { name: 'whop-addon-reconcile', label: 'Whop add-on reconciliation', schedule: 'Every 15 minutes', staleAfterMinutes: 35, area: 'Billing' },
]
