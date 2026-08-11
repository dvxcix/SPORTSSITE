import type { SupabaseClient } from '@supabase/supabase-js'
import { postAlert } from '@/lib/discord'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] as string))

// Called when a payment/renewal event lands for a user who had already
// asked to cancel (tier_cancel_at_period_end was true going into this
// webhook) — a real, confirmed customer complaint: someone cancels
// (including mid-trial, see whop.ts's isTrialingMembership) and gets
// charged anyway, because the previous version of this webhook treated ANY
// successful payment as "welcome back" and silently cleared the cancel flag
// with no record anything unusual happened. No debounce — this should be
// rare, and each occurrence is a real charge on a real card that may need a
// manual refund, not something to suppress on repeat.
export async function alertUnexpectedChargeAfterCancel(admin: SupabaseClient, params: {
  userId: string; email: string | null; membershipId: string | null; planTier: string
}) {
  console.error('[billing] payment landed on an already-cancelling membership', { planTier: params.planTier })
  await Promise.all([
    sendUnexpectedChargeEmail(admin, params),
    postAlert(admin, 'pipeline_health', {
      embeds: [{
        title: '⚠️ Charged a member who already cancelled',
        description: `${params.email ?? params.userId} was billed for **${params.planTier}** (membership ${params.membershipId ?? 'unknown'}) despite having asked to cancel. May need a manual refund — check Whop's dashboard for this membership.`,
        color: 0xFF4D4D,
      }],
    }),
  ])
}

async function sendUnexpectedChargeEmail(admin: SupabaseClient, params: {
  userId: string; email: string | null; membershipId: string | null; planTier: string
}) {
  const apiKey = process.env.EMAIL_RESEND_API_KEY
  if (!apiKey) {
    console.error('[billing] EMAIL_RESEND_API_KEY not configured — cannot send unexpected-charge alert')
    return
  }
  const fromDomain = process.env.EMAIL_RESEND_EMAIL_DOMAIN || 'slipsurge.com'
  const { data: admins } = await admin.from('users').select('email').eq('account_type', 'admin')
  const recipients = (admins ?? []).map(a => a.email).filter(Boolean)
  if (!recipients.length) return

  const text = `${params.email ?? params.userId} (user ${params.userId}) had tier_cancel_at_period_end already set to true, and just got charged for ${params.planTier} anyway (membership ${params.membershipId ?? 'unknown'}). Likely needs a manual refund in Whop — check their membership history there directly.`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `SlipSurge <team@${fromDomain}>`,
      to: recipients,
      subject: 'Member charged after cancelling — may need a refund',
      text,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#111;"><p>${escapeHtml(text)}</p></div>`,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(e => {
    console.error('[billing] Resend send failed', { type: e instanceof Error ? e.name : typeof e })
    return null
  })
  if (res && !res.ok) console.error('[billing] Resend send failed', { status: res.status })
}
