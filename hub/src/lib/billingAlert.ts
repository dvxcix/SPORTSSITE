import type { SupabaseClient } from '@supabase/supabase-js'
import { postAlert } from '@/lib/discord'
import { brandedEmailHtml, sendEmail } from '@/lib/email'

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
  const { data: admins } = await admin.from('users').select('email').eq('account_type', 'admin')
  const recipients = (admins ?? []).map(a => a.email).filter((email): email is string => Boolean(email))
  if (!recipients.length) return

  const text = `${params.email ?? params.userId} (user ${params.userId}) had tier_cancel_at_period_end already set to true, and just got charged for ${params.planTier} anyway (membership ${params.membershipId ?? 'unknown'}). Likely needs a manual refund in Whop — check their membership history there directly.`

  const sent = await sendEmail({
    to: recipients,
    subject: 'Member charged after cancelling — may need a refund',
    text,
    html: brandedEmailHtml({
      eyebrow: 'Billing alert',
      heading: 'A payment needs review',
      preheader: 'A member may have been charged after cancelling.',
      bodyHtml: `<p style="margin:0 0 14px;">A payment landed after this member had already asked to cancel.</p><div style="padding:14px 16px;border:1px solid #4A2629;border-radius:12px;background:#1A1012;color:#FCA5A5;text-align:left;"><strong>${escapeHtml(params.email ?? params.userId)}</strong><br />Plan: ${escapeHtml(params.planTier)}<br />Membership: ${escapeHtml(params.membershipId ?? 'unknown')}</div><p style="margin:14px 0 0;">Review the membership history before issuing a refund or changing access.</p>`,
      ctaLabel: 'Open admin panel',
      ctaUrl: 'https://www.slipsurge.com/admin',
    }),
  })
  if (!sent) console.error('[billing] unexpected-charge email was not delivered to Resend')
}
