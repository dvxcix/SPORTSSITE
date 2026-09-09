export type SidelineScheduleDay = { date: string; season: number; week: number; gameType: string }

export function scheduleWeekKey(day: SidelineScheduleDay) {
  return `${day.season}:${day.gameType}:${day.week}`
}

export function scheduledDate(days: SidelineScheduleDay[], requested: string) {
  const dates = [...new Set(days.map(day => day.date))].sort()
  return dates.find(date => date >= requested) ?? dates.at(-1)
}

export function scheduleWeekLabel(day: SidelineScheduleDay) {
  return `${day.season} · ${day.gameType === 'PRE' ? 'Preseason ' : day.gameType === 'REG' ? '' : `${day.gameType} · `}Week ${day.week}`
}
