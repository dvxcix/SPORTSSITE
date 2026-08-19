import type { SupabaseClient } from '@supabase/supabase-js'
import { postAlert } from '@/lib/discord'
import { brandedEmailHtml, sendEmail } from '@/lib/email'

const ALERT_KEY = 'statcast_integrity_alert_fingerprint'

export type StatcastIntegrityResult = {
  id: string
  season: number
  through_date: string
  status: 'healthy' | 'warning' | 'failed'
  summary: { failures: number; warnings: number }
  checks: {
    pitch_log?: {
      rows?: number
      games?: number
      fair_balls?: number
      home_runs?: number
      raw_to_typed_gaps?: Record<string, number>
      classification_mismatches?: number
      terminal_events_without_description?: number
      fair_balls_without_event?: number
      source_unavailable_fair_ball_metrics?: Record<string, number>
    }
    game_coverage?: { scheduled_games?: number; scheduled_games_without_pitch_log?: number; games_with_suspiciously_short_pitch_log?: number }
    home_run_enrichment?: {
      canonical_home_runs?: number
      covered_home_runs?: number
      savant_detail_home_runs?: number
      canonical_fallback_home_runs?: number
      missing_detail_events?: number
      inside_the_park_events?: number
    }
    category_freshness?: { tracked_categories?: number; stale_categories?: number }
    official_schedule?: { source_available: boolean; final_games: number; final_games_without_pitch_log: number; missing_game_pks: number[] }
  }
  created_at: string
}

function fingerprint(result: StatcastIntegrityResult) {
  return JSON.stringify({ status: result.status, through: result.through_date, checks: result.checks })
}

async function adminEmails(admin: SupabaseClient) {
  const { data } = await admin.from('users').select('email').eq('account_type', 'admin')
  return (data ?? []).map(row => row.email).filter((email): email is string => Boolean(email))
}

export async function alertOnStatcastIntegrityFailure(admin: SupabaseClient, result: StatcastIntegrityResult) {
  if (result.status !== 'failed') {
    await admin.from('site_settings').delete().eq('key', ALERT_KEY)
    return
  }

  const nextFingerprint = fingerprint(result)
  const { data: existing } = await admin.from('site_settings').select('value').eq('key', ALERT_KEY).maybeSingle()
  if (existing?.value === nextFingerprint) return

  const gameGaps = (result.checks.official_schedule?.final_games_without_pitch_log
    ?? result.checks.game_coverage?.scheduled_games_without_pitch_log) ?? 0
  const staleCategories = result.checks.category_freshness?.stale_categories ?? 0
  const typedGaps = Object.values(result.checks.pitch_log?.raw_to_typed_gaps ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)
  const summary = `${result.summary.failures} integrity failures through ${result.through_date}. Missing completed games: ${gameGaps}. Raw-to-typed field gaps: ${typedGaps}. Stale Statcast categories: ${staleCategories}.`
  const recipients = await adminEmails(admin)

  await Promise.all([
    postAlert(admin, 'pipeline_health', {
      embeds: [{
        title: 'Statcast integrity failure',
        description: `${summary}\nThe canonical event ledger is protected, but affected downstream views require review.`,
        color: 0xFF4D4D,
      }],
    }),
    recipients.length ? sendEmail({
      to: recipients,
      subject: 'Statcast integrity failure detected',
      text: summary,
      html: brandedEmailHtml({
        eyebrow: 'Data integrity',
        heading: 'Statcast needs attention',
        preheader: summary,
        bodyHtml: `<p>${summary}</p><p>The audit checks every completed game, canonical pitch event, source-to-column mapping, classification flag, and Statcast category freshness.</p>`,
        ctaLabel: 'Open pipeline health',
        ctaUrl: 'https://www.slipsurge.com/admin/pipeline-health',
      }),
    }) : Promise.resolve(false),
  ])

  await admin.from('site_settings').upsert([{ key: ALERT_KEY, value: nextFingerprint }])
}
