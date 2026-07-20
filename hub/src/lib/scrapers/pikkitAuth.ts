import { createAdminClient } from '@/lib/supabase/admin'
import { openSession } from '@/lib/browserbase'

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

async function sendAuthAlertEmail(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[pikkitAuth] RESEND_API_KEY not configured — cannot send auth-failure alert')
    return
  }

  const admin = createAdminClient()
  const { data: admins } = await admin.from('users').select('email').eq('account_type', 'admin')
  const recipients = (admins ?? []).map(a => a.email).filter(Boolean)
  if (!recipients.length) {
    console.error('[pikkitAuth] no admin emails found — cannot send auth-failure alert')
    return
  }

  const text = 'Pikkit has signed out of the persisted Browserbase context — scrape-pikkit will keep failing until it\'s manually re-authenticated.'
  const instructions = 'Sign in again from /admin (call GET /api/admin/pikkit-context while signed in as admin), open the returned Live View URL, log into Pikkit by hand, then update PIKKIT_CONTEXT_ID in Vercel to the new context id and redeploy.'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'SlipSurge <team@slipsurge.com>',
      to: recipients,
      subject: 'Pikkit scraper signed out — action needed',
      text: `${text}\n\n${instructions}`,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#111;"><p>${text}</p><p>${instructions}</p></div>`,
    }),
  }).catch(e => {
    console.error('[pikkitAuth] Resend send threw', e)
    return null
  })
  if (res && !res.ok) console.error('[pikkitAuth] Resend send failed', await res.text().catch(() => ''))
}

// Called from scrape-pikkit's sweep handler only when EVERY game in the
// sweep failed with PIKKIT_SIGNED_OUT_ERROR — confirms whether that's a
// genuine login expiry (real alert, debounced to once per outage) or just
// every game being briefly unlisted (no alert, and clears any stale
// debounce flag so the next real outage alerts fresh).
export async function checkPikkitAuthAndAlert(contextId: string): Promise<void> {
  const admin = createAdminClient()
  let signedIn: boolean
  try {
    signedIn = await isPikkitSignedIn(contextId)
  } catch (e) {
    console.error('[pikkitAuth] sign-in check itself failed, skipping alert', e)
    return
  }

  if (signedIn) {
    await admin.from('site_settings').delete().eq('key', ALERT_DEBOUNCE_KEY)
    return
  }

  const { data: existing } = await admin.from('site_settings').select('value').eq('key', ALERT_DEBOUNCE_KEY).maybeSingle()
  if (existing?.value) return // already alerted for this ongoing outage

  await sendAuthAlertEmail()
  await admin.from('site_settings').upsert([{ key: ALERT_DEBOUNCE_KEY, value: new Date().toISOString() }])
}
