import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { brandedEmailHtml, sendEmail } from '@/lib/email'

export const revalidate = 0

// Supabase Auth has no built-in "your password was changed" email template —
// only Confirm signup / Invite / Magic Link / Change Email / Reset Password /
// Reauthentication exist. An in-app password change from Settings (as
// opposed to the forgot-password flow, which DOES use Reset Password) would
// otherwise notify nobody — including the real owner if an attacker with
// account access changed it. This sends that missing security alert
// directly via Resend's API, independent of Supabase's own email system.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rate = await consumeServerRateLimit(user.id, 'password_alert', 10, 24 * 60 * 60)
  if (!rate.available || !rate.allowed) return NextResponse.json({ ok: true, skipped: 'rate limited' })

  const sent = await sendEmail({
    to: user.email,
    subject: 'Your SlipSurge password was changed',
    text: 'Your SlipSurge account password was just changed. If this was you, no action is needed. If you did not make this change, contact support@slipsurge.com immediately.',
    html: brandedEmailHtml({
      eyebrow: 'Account security',
      heading: 'Your password was changed',
      preheader: 'Security notice for your SlipSurge account.',
      bodyHtml: '<p style="margin:0 0 14px;">The password on your SlipSurge account was just changed. If this was you, no action is needed.</p><div style="padding:14px 16px;border:1px solid #4A2629;border-radius:12px;background:#1A1012;color:#FCA5A5;font-weight:700;">Wasn\'t you? Contact support@slipsurge.com immediately.</div>',
    }),
  })
  if (!sent) console.error('[notify-password-changed] security email was not delivered to Resend')

  // Best-effort — the password change itself already succeeded client-side
  // before this is called, so a failed notification email should never look
  // like a failed password change.
  return NextResponse.json({ ok: true })
}
