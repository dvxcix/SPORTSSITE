const HOUR = 60 * 60 * 1000

export type PikkitCaptureDecision = {
  due: boolean
  slotHours: number | null
  targetAt: string | null
  reason: string
}

function easternWeekday(timestamp: number): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short',
  }).format(new Date(timestamp))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label)
}

// Pick counts are contextual checkpoints, not live-play odds. Capture only
// the moments that materially change the pregame read instead of repeatedly
// downloading an authenticated app between them.
export function pikkitCaptureDecision(
  sport: 'mlb' | 'nfl',
  kickoffMs: number,
  lastCapturedMs: number | null,
  nowMs = Date.now(),
): PikkitCaptureDecision {
  if (!Number.isFinite(kickoffMs) || kickoffMs <= nowMs) {
    return { due: false, slotHours: null, targetAt: null, reason: 'started-or-invalid' }
  }

  const weekday = easternWeekday(kickoffMs)
  const slots = sport === 'mlb'
    ? [10, 4]
    : weekday === 4
      ? [30, 10, 4, 1] // Thursday: Wednesday + game-day tightening.
      : weekday === 0
        ? [42, 20, 8, 3, 1] // Sunday: Friday, Saturday, then Sunday.
        : weekday === 1
          ? [28, 8, 3, 1] // Monday: Sunday + game day.
          : [28, 8, 3, 1]

  const due = slots
    .map(slotHours => ({ slotHours, targetMs: kickoffMs - slotHours * HOUR }))
    .filter(slot => nowMs >= slot.targetMs && (!lastCapturedMs || lastCapturedMs < slot.targetMs))
    .at(-1)

  if (!due) return { due: false, slotHours: null, targetAt: null, reason: 'fresh-for-current-slot' }
  return {
    due: true,
    slotHours: due.slotHours,
    targetAt: new Date(due.targetMs).toISOString(),
    reason: `t-${due.slotHours}h`,
  }
}

