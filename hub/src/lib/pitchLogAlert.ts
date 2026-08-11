import type { SupabaseClient } from '@supabase/supabase-js'
import { postAlert } from '@/lib/discord'

// Same debounce shape as pikkitAuth.ts's checkPikkitAuthAndAlert — a
// key/value row in site_settings, set when an alert goes out and cleared
// the moment things catch up, so an ongoing outage pages once (not once per
// cron run) and the next real outage still alerts fresh.
const ALERT_DEBOUNCE_KEY = 'pitch_log_stale_alert_sent_at'

// A 1-day lag is completely normal — savant-sync-pitch-log only ever
// processes up to yesterday, and today's own run may not have caught up to
// that yet. This only fires once the gap is genuinely stuck, not just
// "hasn't run yet today."
const STALE_THRESHOLD_DAYS = 2

async function sendStalenessAlertEmail(admin: SupabaseClient, latestDate: string, expectedDate: string, staleDays: number) {
  const apiKey = process.env.EMAIL_RESEND_API_KEY
  if (!apiKey) {
    console.error('[pitchLogAlert] EMAIL_RESEND_API_KEY not configured — cannot send staleness alert')
    return
  }
  const fromDomain = process.env.EMAIL_RESEND_EMAIL_DOMAIN || 'slipsurge.com'

  const { data: admins } = await admin.from('users').select('email').eq('account_type', 'admin')
  const recipients = (admins ?? []).map(a => a.email).filter(Boolean)
  if (!recipients.length) {
    console.error('[pitchLogAlert] no admin emails found — cannot send staleness alert')
    return
  }

  const text = `player_pitch_log is ${staleDays} days behind — latest data is ${latestDate}, expected through ${expectedDate}. Last N Starts, the Statcast section, and the Paper/matchup-edge score are all computed off this table, so they're currently showing stale numbers for real games that have already happened.`
  const instructions = `The daily savant-sync-pitch-log cron has its own multi-day recheck/retry logic and hasn't caught up on its own — check Vercel's runtime logs for that route, and see hub/scripts/diagnose-pitch-log-gap.mjs for a script that replicates the sync directly against production and reports exactly where it fails (a prior incident traced this to Savant treating Vercel's serverless IPs differently than a normal connection).`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `SlipSurge <team@${fromDomain}>`,
      to: recipients,
      subject: `Pitch log data is ${staleDays} days stale — action needed`,
      text: `${text}\n\n${instructions}`,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#111;"><p>${text}</p><p>${instructions}</p></div>`,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(e => {
    console.error('[pitchLogAlert] Resend send failed', { type: e instanceof Error ? e.name : typeof e })
    return null
  })
  if (res && !res.ok) console.error('[pitchLogAlert] Resend send failed', { status: res.status })
}

// Called at the end of every savant-sync-pitch-log run, after it's had its
// own shot at self-healing via the recheck window. `latestPitchLogDate` is
// this run's actual max(game_date) in player_pitch_log; `expectedDate` is
// the same `end` (daysAgoET(1)) the sync cron itself targets — comparing
// against the sync's own notion of "should be caught up through" instead of
// literal today avoids false alarms from the completely normal 1-day lag.
export async function checkPitchLogFreshnessAndAlert(admin: SupabaseClient, latestPitchLogDate: string | null, expectedDate: string) {
  const staleDays = latestPitchLogDate
    ? Math.round((Date.parse(expectedDate) - Date.parse(latestPitchLogDate)) / 86400000)
    : Infinity

  if (staleDays < STALE_THRESHOLD_DAYS) {
    await admin.from('site_settings').delete().eq('key', ALERT_DEBOUNCE_KEY)
    return
  }

  const { data: existing } = await admin.from('site_settings').select('value').eq('key', ALERT_DEBOUNCE_KEY).maybeSingle()
  if (existing?.value) return // already alerted for this ongoing gap

  const latestLabel = latestPitchLogDate ?? 'no data at all'
  await Promise.all([
    sendStalenessAlertEmail(admin, latestLabel, expectedDate, staleDays),
    postAlert(admin, 'pipeline_health', {
      embeds: [{
        title: `⚠️ Pitch log data is ${staleDays} days stale`,
        description: `Latest: **${latestLabel}** — expected through **${expectedDate}**.\nLast N Starts, Statcast, and Paper/matchup-edge are all affected.`,
        color: 0xFF4D4D,
      }],
    }),
  ])
  await admin.from('site_settings').upsert([{ key: ALERT_DEBOUNCE_KEY, value: new Date().toISOString() }])
}
