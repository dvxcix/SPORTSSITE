// One explicit switch controls the 2026–27 MLB retirement. Re-enable only
// after completing the off-season reactivation checklist and its safeguards.
export const MLB_HIBERNATING = true

// These jobs are MLB-only. Shared NFL/NBA jobs must never be added here.
const MLB_ONLY_CRON_JOBS = new Set([
  'bdl-odds', 'lineup-confirmed', 'hr-alerts', 'near-hr-alerts', 'slate-drop',
  'mlb-sync-bio', 'mlb-sync-season-stats', 'mlb-sync-career-stats',
  'savant-sync-tier-a', 'savant-sync-bat-tracking', 'savant-sync-batted-ball',
  'savant-sync-swing-take', 'savant-sync-swing-timing', 'savant-sync-batting-stance',
  'savant-sync-swing-path', 'savant-sync-hr-details', 'savant-sync-pitch-arsenal-stats',
  'savant-sync-pitch-arsenal-details', 'savant-sync-pitch-log', 'pitch-log-freshness-check',
  'statcast-integrity-check', 'savant-sync-affinity', 'dugout-statcast-precompute',
  'dugout-matchup-edge-precompute', 'dugout-pitchlog-stat-precompute',
  'dugout-season-avg-precompute', 'research-mechanics-precompute',
  'scrape-fanduel', 'scrape-mgm', 'dispatch-scrapes', 'poll-pikkit-picks', 'scrape-pikkit',
  'market-dna-maintenance', 'process-contact-alerts', 'process-contact-recap-exports',
])

export function isMlbCronPaused(jobName: string): boolean {
  return MLB_HIBERNATING && MLB_ONLY_CRON_JOBS.has(jobName)
}

export function mlbPausedResponse(status = 200): Response {
  return Response.json({ ok: status < 400, paused: true, reason: 'MLB off-season' }, { status })
}
