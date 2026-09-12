import type { NotificationType } from '@/lib/notify'

export type NotificationDeliverySettings = {
  quiet_hours_enabled?: boolean
  quiet_start?: string
  quiet_end?: string
  timezone?: string
  live_game_priority?: boolean
}

function minuteOfDay(value: string | undefined) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const hour = Number(match[1]); const minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

function localMinute(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    return Number(parts.find(part => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

export function shouldSuppressNotificationDelivery(settings: NotificationDeliverySettings | null | undefined, type: NotificationType, data: Record<string, unknown> | null | undefined, now = new Date()) {
  if (!settings?.quiet_hours_enabled) return false
  const start = minuteOfDay(settings.quiet_start ?? '22:00')
  const end = minuteOfDay(settings.quiet_end ?? '07:00')
  if (start == null || end == null || start === end) return false

  const isGameAlert = type === 'lineup_confirmed' || Boolean(data?.game_pk || data?.game_id || data?.gameId)
  if (settings.live_game_priority !== false && isGameAlert) return false

  const minute = localMinute(now, settings.timezone ?? 'America/New_York')
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}
