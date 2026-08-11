import { createAdminClient } from '@/lib/supabase/admin'
import { openSession } from '@/lib/browserbase'
import { brandedEmailHtml, sendEmail } from '@/lib/email'
import { postAlert } from '@/lib/discord'

// scrape-pikkit's per-game "game link not found ... check the persisted
// context is still signed in" error is a GUESS, not a confirmed diagnosis —
// it fires whenever the game just isn't listed on the page yet, which also
// happens for a totally normal reason (no games have started yet, or every
// game already finished for the night and Pikkit hasn't posted tomorrow's
// slate). Confirmed live: at 10pm with every game finished, a signed-in
// context still returned this same error for every game, because the page
// legitimately had nothing to click into — not because the login expired.
//
// So the sweep handler only calls this when EVERY game in the sweep failed
// with that exact error (see scrape-pikkit's GET) — one game missing a
// listing is normal noise, but a genuinely logged-out session fails ALL of
// them the same way, which is a strong enough signal to justify spending a
// whole extra Browserbase session confirming it directly.
export const PIKKIT_SIGNED_OUT_ERROR = 'check the persisted context is still signed in'

const ALERT_DEBOUNCE_KEY = 'pikkit_auth_alert_sent_at'
const IMPORT_ALERT_DEBOUNCE_KEY = 'pikkit_import_alert_sent_at'

type PikkitAuthState = 'signed-in' | 'signed-out' | 'unknown'

async function getAdminRecipients() {
  const admin = createAdminClient()
  const { data: admins } = await admin.from('users').select('email').eq('account_type', 'admin')
  return {
    admin,
    recipients: (admins ?? []).map(a => a.email).filter((email): email is string => Boolean(email)),
  }
}

// Directly inspects the persisted context's session instead of inferring
// login state from a scraper's inability to find a game — the dashboard
// sidebar always renders "Your Bets" once actually signed in; a signed-out
// session bounces to a sign-in screen that never shows it.
async function isPikkitSignedIn(contextId: string): Promise<boolean> {
  const bb = await openSession({ contextId })
  try {
    await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
    await bb.page.waitForTimeout(2500)
    const bodyText = await bb.page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
    return bodyText.includes('Your Bets')
  } finally {
    await bb.close()
  }
}

async function sendAuthAlert(): Promise<void> {
  const { admin, recipients } = await getAdminRecipients()
  if (!recipients.length) {
    console.error('[pikkitAuth] no admin emails found — cannot send auth-failure alert')
  }

  const text = 'Pikkit has signed out of the persisted Browserbase context — scrape-pikkit will keep failing until it\'s manually re-authenticated.'
  const instructions = 'Sign in again from /admin (call GET /api/admin/pikkit-context while signed in as admin), open the returned Live View URL, log into Pikkit by hand, then update PIKKIT_CONTEXT_ID in Vercel to the new context id and redeploy.'

  const [sent] = await Promise.all([
    recipients.length ? sendEmail({
      to: recipients,
      subject: 'Pikkit scraper signed out: action needed',
      text: `${text}\n\n${instructions}`,
      html: brandedEmailHtml({
        eyebrow: 'Importer alert',
        heading: 'Pikkit needs to be reconnected',
        preheader: 'The persisted Pikkit session has signed out.',
        bodyHtml: '<p style="margin:0 0 14px;">The persisted Browserbase session is signed out, so Pikkit imports will remain paused until an admin reconnects it.</p><div style="padding:14px 16px;border:1px solid #2B3940;border-radius:12px;background:#0C1519;color:#C9F9FF;text-align:left;">Create a fresh context from the admin panel, sign in through Live View, then replace <strong>PIKKIT_CONTEXT_ID</strong> in Vercel and redeploy.</div>',
        ctaLabel: 'Open admin panel',
        ctaUrl: 'https://www.slipsurge.com/admin',
      }),
      tags: [{ name: 'alert', value: 'pikkit-auth' }],
    }) : Promise.resolve(true),
    postAlert(admin, 'pipeline_health', {
      embeds: [{
        title: 'Pikkit scraper signed out',
        description: 'The persisted Browserbase session is no longer authenticated. Pikkit pick imports are paused until an admin reconnects the account.',
        color: 0xFF4D4D,
      }],
    }),
  ])
  if (!sent) console.error('[pikkitAuth] auth-failure email was not delivered to Resend')
}

// Called from scrape-pikkit's sweep handler only when EVERY game in the
// sweep failed with PIKKIT_SIGNED_OUT_ERROR — confirms whether that's a
// genuine login expiry (real alert, debounced to once per outage) or just
// every game being briefly unlisted (no alert, and clears any stale
// debounce flag so the next real outage alerts fresh).
export async function checkPikkitAuthAndAlert(contextId: string): Promise<PikkitAuthState> {
  const admin = createAdminClient()
  let signedIn: boolean
  try {
    signedIn = await isPikkitSignedIn(contextId)
  } catch (e) {
    console.error('[pikkitAuth] sign-in check itself failed, skipping alert', { type: e instanceof Error ? e.name : typeof e })
    return 'unknown'
  }

  if (signedIn) {
    await admin.from('site_settings').delete().eq('key', ALERT_DEBOUNCE_KEY)
    return 'signed-in'
  }

  const { data: existing } = await admin.from('site_settings').select('value').eq('key', ALERT_DEBOUNCE_KEY).maybeSingle()
  if (existing?.value) return 'signed-out' // already alerted for this ongoing outage

  await sendAuthAlert()
  await admin.from('site_settings').upsert([{ key: ALERT_DEBOUNCE_KEY, value: new Date().toISOString() }])
  return 'signed-out'
}

export async function checkPikkitImportHealthAndAlert(params: {
  pregame: number
  failedGamePks: number[]
  accessUnavailable: boolean
}): Promise<void> {
  const { admin, recipients } = await getAdminRecipients()
  const outage = params.failedGamePks.length > 0 || params.accessUnavailable

  if (!outage) {
    await admin.from('site_settings').delete().eq('key', IMPORT_ALERT_DEBOUNCE_KEY)
    return
  }

  const { data: existing } = await admin.from('site_settings').select('value').eq('key', IMPORT_ALERT_DEBOUNCE_KEY).maybeSingle()
  if (existing?.value) return

  const issue = params.accessUnavailable
    ? `Pikkit returned no accessible batting-prop data for all ${params.pregame} pregame matchups.`
    : `${params.failedGamePks.length} of ${params.pregame} Pikkit game imports failed after retry.`
  const games = params.failedGamePks.length ? ` Game IDs: ${params.failedGamePks.join(', ')}.` : ''
  const text = `${issue}${games} Public pick counts may be stale until the next healthy import.`

  const [sent] = await Promise.all([
    recipients.length ? sendEmail({
      to: recipients,
      subject: 'Pikkit pick imports need attention',
      text,
      html: brandedEmailHtml({
        eyebrow: 'Pipeline health',
        heading: 'Pikkit pick imports need attention',
        preheader: 'Public pick counts may be stale.',
        bodyHtml: `<p style="margin:0 0 14px;">${issue}</p><div style="padding:14px 16px;border:1px solid #4A2629;border-radius:12px;background:#1A1012;color:#FCA5A5;text-align:left;">Public pick counts may be stale until a healthy import completes.${games}</div>`,
        ctaLabel: 'Review pipeline health',
        ctaUrl: 'https://www.slipsurge.com/admin/pipeline-health',
      }),
      tags: [{ name: 'alert', value: 'pikkit-import' }],
    }) : Promise.resolve(true),
    postAlert(admin, 'pipeline_health', {
      embeds: [{
        title: 'Pikkit pick imports need attention',
        description: text,
        color: 0xFFB020,
      }],
    }),
  ])

  if (!recipients.length) console.error('[pikkitAuth] no admin emails found — cannot send import-failure alert')
  else if (!sent) console.error('[pikkitAuth] import-failure email was not delivered to Resend')

  await admin.from('site_settings').upsert([{ key: IMPORT_ALERT_DEBOUNCE_KEY, value: new Date().toISOString() }])
}
