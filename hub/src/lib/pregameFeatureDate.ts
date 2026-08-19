// Shared historical-feature boundary. A board for targetDate can use every
// completed event before that date, but never an event from targetDate itself.
export function priorPregameDate(targetDate: string): string {
  const value = new Date(`${targetDate}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

export function isStrictlyPregameDate(rowDate: string, targetDate: string): boolean {
  return rowDate < targetDate
}
