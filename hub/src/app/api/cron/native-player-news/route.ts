import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { getFavoriteCatalog } from '@/lib/favoriteCatalog'
import { matchesPlayerNews, playerNewsArtwork, playerNewsLink, type PlayerNews } from '@/lib/nativePlayerNews'
import { playerNewsSources, readPlayerNews, resolvePlayerNewsPortrait } from '@/lib/nativePlayerNewsSource'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 120

type Admin = ReturnType<typeof createAdminClient>
type Preferences = { id: string; favorite_teams: unknown; favorite_players: unknown; favorite_sports: unknown }

function notificationID(event: string, userID: string) {
  const hash = createHash('sha256').update(`player-news:${event}:${userID}`).digest('hex').slice(0, 32)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`
}

async function recipients(admin: Admin) {
  const users: Preferences[] = []
  for (let offset = 0; ; offset += 250) {
    const result = await admin.from('users').select('id,favorite_teams,favorite_players,favorite_sports')
      .contains('notification_settings', { player_news: true }).order('id').range(offset, offset + 249)
      .abortSignal(AbortSignal.timeout(6500))
    if (result.error) throw result.error
    users.push(...result.data)
    if (result.data.length < 250) return users
  }
}

async function publish(admin: Admin, observedAt: string) {
  const { data: pending, error } = await admin.from('native_player_news_outbox')
    .select('source,event_key,event').is('published_at', null).gt('deliver_until', observedAt)
    .order('deliver_until').order('event_key').limit(40).abortSignal(AbortSignal.timeout(6500))
  if (error) throw error
  if (!pending.length) return 0
  const users = await recipients(admin)
  const catalog = users.length ? await getFavoriteCatalog(true) : []
  let published = 0
  for (let index = 0; index < pending.length; index += 5) {
    const batch = pending.slice(index, index + 5)
    const result = await Promise.allSettled(batch.map(async row => {
      const original = row.event as PlayerNews
      const initial = users.filter(user => matchesPlayerNews(original, user, catalog))
      const item = initial.length || users.some(user => Array.isArray(user.favorite_players) && user.favorite_players.length)
        ? await resolvePlayerNewsPortrait(original) : original
      const audience = item === original ? initial : users.filter(user => matchesPlayerNews(item, user, catalog))
      const artwork = playerNewsArtwork(item)
      const notices = audience.map(user => ({
        id: notificationID(row.event_key, user.id), user_id: user.id, type: item.kind,
        message: item.text, link: playerNewsLink(item, catalog),
        data: { avatar_url: artwork?.image, player_news_artwork: artwork, player_name: item.player?.name,
          sport: item.sport, team: item.team.abbr },
      }))
      for (let offset = 0; offset < notices.length; offset += 150) {
        const { error } = await admin.from('notifications').upsert(notices.slice(offset, offset + 150), {
          onConflict: 'id', ignoreDuplicates: true,
        }).abortSignal(AbortSignal.timeout(6500))
        if (error) throw error
      }
      const saved = await admin.from('native_player_news_outbox').update({ published_at: new Date().toISOString() })
        .eq('source', row.source).eq('event_key', row.event_key).is('published_at', null)
        .abortSignal(AbortSignal.timeout(6500))
      if (saved.error) throw saved.error
      return notices.length
    }))
    for (const status of result) {
      if (status.status === 'rejected') throw status.reason
      published += status.value
    }
  }
  return published
}

async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  const admin = createAdminClient()
  const now = Date.now(), observedAt = new Date(now).toISOString()
  const checks = await Promise.allSettled(playerNewsSources.map(async source => {
    const items = await readPlayerNews(source, now)
    const result = await admin.rpc('record_native_player_news', { p_source: source, p_observed_at: observedAt, p_items: items })
      .abortSignal(AbortSignal.timeout(8000))
    if (result.error || !Number.isSafeInteger(result.data)) throw Error('Player news could not be recorded')
    return result.data as number
  }))
  const unavailable = checks.filter(result => result.status === 'rejected').length
  const queued = checks.reduce((sum, result) => sum + (result.status === 'fulfilled' ? result.value : 0), 0)
  try {
    const published = await publish(admin, observedAt)
    // Retain exact keys beyond the source freshness window for safe late retries.
    const pruned = await admin.from('native_player_news_outbox').delete().lt('deliver_until', new Date(now - 7 * 86_400_000).toISOString())
      .abortSignal(AbortSignal.timeout(6500))
    const ok = unavailable === 0 && !pruned.error
    return NextResponse.json({ ok, checked: checks.length, queued, published, unavailable,
      ...(ok ? {} : { reason: 'A player news source or retention check was unavailable' }) }, { status: ok ? 200 : 503 })
  } catch {
    return NextResponse.json({ ok: false, checked: checks.length, queued, unavailable, reason: 'Player news delivery could not finish' }, { status: 503 })
  }
}

export const GET = withPipelineHealth('native-player-news', run)
