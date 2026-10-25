/** MLB-only capture clocks. A delayed status update cannot reopen first pitch. */
type MlbCaptureGame = { gameDate: string; status: string; abstractStatus: string }
export function mlbCaptureOpen(game: MlbCaptureGame | undefined, now = Date.now()) {
  const start = Date.parse(game?.gameDate ?? '')
  return !!game && Number.isFinite(start) && now < start && game.abstractStatus === 'Preview'
    && !!game.status.trim() && !/in progress|final|postpon|cancel|suspend/i.test(game.status)
}

/** A verified pregame observation may finish saving shortly after first pitch.
 * Its actual capture timestamp, never the import timestamp, determines phase. */
export function mlbCaptureObservationValid(game: MlbCaptureGame | undefined, observedAt: unknown, now = Date.now()) {
  const start = Date.parse(game?.gameDate ?? ''), observed = typeof observedAt === 'string' ? Date.parse(observedAt) : NaN
  return !!game && Number.isFinite(start) && Number.isFinite(observed) && observed < start
    && observed <= now + 60_000 && observed >= now - 600_000
    && !!game.status.trim() && !/postpon|cancel|suspend/i.test(game.status)
}
