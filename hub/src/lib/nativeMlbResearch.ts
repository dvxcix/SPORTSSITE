import type { GameMechanicsResult, MechanicsWindow } from '@/lib/hrMechanics'

export function nativeMlbResearchSelection(input: URLSearchParams) {
  const date = input.get('date') ?? ''
  const game = input.get('game') ?? ''
  const rawWindow = input.get('window') ?? '5'
  const day = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date ||
      !/^[1-9]\d{0,9}$/.test(game) || !['1', '3', '5', '10'].includes(rawWindow) ||
      input.getAll('date').length !== 1 || input.getAll('game').length !== 1 || input.getAll('window').length > 1) return null
  return { date, game: Number(game), window: Number(rawWindow) as MechanicsWindow }
}

export function observedMlbMechanics(
  row: { computed_at: string; payload: GameMechanicsResult } | null,
  expected: { date: string; game: number; window: MechanicsWindow },
  cutoff: string,
  now = Date.now(),
) {
  const observed = Date.parse(row?.computed_at ?? '')
  const start = Date.parse(cutoff)
  const model = row?.payload
  if (!Number.isFinite(observed) || !Number.isFinite(start) || observed >= start || observed > now ||
      model?.gamePk !== expected.game || model.gameDate !== expected.date || model.window !== expected.window ||
      (model.sourceThroughDate != null && model.sourceThroughDate >= expected.date) || !Array.isArray(model.players)) return null
  return model
}
