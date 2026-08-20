import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { enrichContactRecapMarkets } from '@/lib/contactRecapMarkets'
import { renderContactAlertMedia, type ContactAlertMedia } from '@/lib/contactRecapGif'
import { postAlertAttachmentChecked } from '@/lib/discord'
import { PLATFORM_URL } from '@/lib/platform'
import type { DailyContactEvent } from '@/lib/contactRecapTypes'

const BUCKET = 'contact-recap-exports'
const OPERATION = 'contact_alert_media'
const STALE_RUNNING_MINUTES = 8

type ContactAlertPayload = {
  event: DailyContactEvent
  storagePath?: string
  filename?: string
  contentType?: 'image/gif'
  width?: number
  height?: number
}

type ContactAlertJob = {
  id: string
  payload: ContactAlertPayload
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  attempts: number
  max_attempts: number
  dedupe_key: string
}

export function contactAlertEventKey(event: DailyContactEvent) {
  if (event.kind === 'home_run') return `hr:${event.gamePk}:${event.atBatIndex}`
  return `near_hr:${event.gamePk}:${event.batterId}:${event.atBatIndex}:${event.pitchNumber}`
}

function cleanKey(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '-')
}

export async function enqueueContactAlert(event: DailyContactEvent, source = 'cron') {
  const admin = createAdminClient()
  const [enriched] = await enrichContactRecapMarkets(event.gameDate, [event])
  const eventKey = contactAlertEventKey(enriched)
  const dedupeKey = `contact-alert:${eventKey}`
  const { data: existing } = await admin.from('operational_retry_queue').select('id,status').eq('dedupe_key', dedupeKey)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing) {
    if (existing.status === 'failed') {
      await admin.from('operational_retry_queue').update({
        status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(),
        last_error: `Requeued by ${source}`, updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
    return { id: existing.id as string, eventKey, created: false, status: existing.status as string }
  }

  const row = {
    provider: 'discord', operation: OPERATION, payload: { event: enriched },
    status: 'pending', attempts: 0, max_attempts: 5, next_attempt_at: new Date().toISOString(),
    last_error: null, dedupe_key: dedupeKey, updated_at: new Date().toISOString(),
  }
  const { data, error } = await admin.from('operational_retry_queue').insert(row).select('id,status').single()
  if (error?.code === '23505') {
    const { data: raced, error: racedError } = await admin.from('operational_retry_queue').select('id,status').eq('dedupe_key', dedupeKey).maybeSingle()
    if (racedError || !raced) throw racedError ?? new Error('Contact alert dedupe race could not be resolved')
    return { id: raced.id as string, eventKey, created: false, status: raced.status as string }
  }
  if (error) throw error
  return { id: data.id as string, eventKey, created: true, status: data.status as string }
}

function resultLabel(event: DailyContactEvent) {
  if (event.kind === 'home_run') return event.isGrandSlam ? 'Grand Slam' : `${Math.max(1, event.rbi)}-run home run`
  return event.result.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function alertPayload(event: DailyContactEvent, media: ContactAlertMedia) {
  const metricBits = [
    event.exitVelocity != null ? `${event.exitVelocity.toFixed(1)} mph` : null,
    event.distance != null ? `${Math.round(event.distance)} ft` : null,
    event.launchAngle != null ? `${Math.round(event.launchAngle)} deg` : null,
    event.pitchType ? `${event.pitchType}${event.pitchSpeed != null ? ` at ${event.pitchSpeed.toFixed(1)} mph` : ''}` : null,
  ].filter(Boolean)
  const marketBits = (event.marketContext?.primary ?? []).slice(0, 4).map(quote => `${quote.bookLabel} ${quote.odds > 0 ? '+' : ''}${quote.odds}`)
  return {
    embeds: [{
      title: `${event.kind === 'home_run' ? 'HOME RUN' : 'NEAR HOME RUN'} - ${event.batterName}`,
      description: [
        `${event.batterTeam} - ${event.half === 'bottom' ? 'Bot' : 'Top'} ${event.inning ?? '-'} - off ${event.pitcherName}`,
        `${resultLabel(event)}${metricBits.length ? ` - ${metricBits.join(' - ')}` : ''}`,
        marketBits.length ? `${event.marketContext?.primaryLabel}: ${marketBits.join(' | ')}` : null,
        media.animated ? 'Animated official flight - pregame prices frozen before first pitch' : 'Verified static flight receipt - animation fallback used',
      ].filter(Boolean).join('\n'),
      url: `${PLATFORM_URL}/spray-charts?date=${event.gameDate}&gamePk=${event.gamePk}`,
      color: event.kind === 'home_run' ? 0xA3FF3F : 0xFF9F43,
      image: { url: `attachment://${media.filename}` },
      footer: { text: `SlipSurge - ${event.game.venueName} - ${media.width}x${media.height}` },
      timestamp: event.eventTime ?? undefined,
    }],
  }
}

async function claimJob(jobId: string): Promise<ContactAlertJob | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('operational_retry_queue').update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('provider', 'discord').eq('operation', OPERATION).eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString()).select('id,payload,status,attempts,max_attempts,dedupe_key').maybeSingle()
  if (error) throw error
  return data as ContactAlertJob | null
}

async function storedMedia(payload: ContactAlertPayload): Promise<ContactAlertMedia | null> {
  if (!payload.storagePath || !payload.filename || payload.contentType !== 'image/gif') return null
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).download(payload.storagePath)
  if (error || !data) return null
  const body = Buffer.from(await data.arrayBuffer())
  return { body, filename: payload.filename, contentType: 'image/gif', width: payload.width ?? 960, height: payload.height ?? 540, animated: true }
}

async function failOrRetry(job: ContactAlertJob, error: unknown) {
  const admin = createAdminClient()
  const attempts = Number(job.attempts ?? 0) + 1
  const exhausted = attempts >= Number(job.max_attempts ?? 5)
  await admin.from('operational_retry_queue').update({
    status: exhausted ? 'failed' : 'pending', attempts,
    last_error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
    next_attempt_at: new Date(Date.now() + Math.min(300_000, 10_000 * 2 ** Math.max(0, attempts - 1))).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', job.id)
}

export async function processContactAlertJob(jobId: string) {
  const job = await claimJob(jobId)
  if (!job) return { processed: false, reason: 'not-ready' }
  const admin = createAdminClient()
  try {
    const event = job.payload.event
    let media = await storedMedia(job.payload)
    if (!media) {
      media = await renderContactAlertMedia(event)
      // The existing private bucket permits GIFs. Static PNG fallback is
      // delivered directly and simply re-rendered if Discord needs a retry.
      if (media.animated) {
        const storagePath = `discord-alerts/${event.gameDate}/${cleanKey(job.dedupe_key)}.gif`
        const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, media.body, {
          contentType: media.contentType, upsert: true, cacheControl: '31536000',
        })
        if (uploadError) throw uploadError
        job.payload = { ...job.payload, storagePath, filename: media.filename, contentType: 'image/gif', width: media.width, height: media.height }
        await admin.from('operational_retry_queue').update({ payload: job.payload, updated_at: new Date().toISOString() }).eq('id', job.id)
      }
    }

    const result = await postAlertAttachmentChecked(admin, event.kind === 'home_run' ? 'hr' : 'near_hr', alertPayload(event, media), media)
    if (!result.ok) throw new Error(result.error ?? 'Discord did not accept the contact alert')
    await admin.from('operational_retry_queue').update({
      status: 'succeeded', attempts: Number(job.attempts ?? 0) + 1, completed_at: new Date().toISOString(),
      last_error: null, response_status: 200, updated_at: new Date().toISOString(),
    }).eq('id', job.id)
    return { processed: true, delivered: true, id: job.id, eventKey: contactAlertEventKey(event), animated: media.animated, discordMessageId: result.messageId }
  } catch (error) {
    await failOrRetry(job, error)
    return { processed: true, delivered: false, id: job.id, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function processNextContactAlertJob() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('operational_retry_queue').select('id').eq('provider', 'discord').eq('operation', OPERATION)
    .eq('status', 'pending').lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at', { ascending: true }).limit(1).maybeSingle()
  if (error) throw error
  if (!data) return { processed: false, reason: 'empty' }
  return processContactAlertJob(data.id as string)
}

export async function recoverStaleContactAlertJobs() {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000).toISOString()
  const { error } = await admin.from('operational_retry_queue').update({
    status: 'pending', next_attempt_at: new Date().toISOString(), last_error: 'Recovered a stale contact-alert claim', updated_at: new Date().toISOString(),
  }).eq('provider', 'discord').eq('operation', OPERATION).eq('status', 'processing').lt('updated_at', cutoff)
  if (error) throw error
}
