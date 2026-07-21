import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Reported live: this has been silently failing for every user since at
  // least 2026-07-13 — the actual Vercel env vars are EMAIL_RESEND_API_KEY /
  // EMAIL_RESEND_EMAIL_DOMAIN, not the plain RESEND_API_KEY this (and the
  // other two Resend-based email routes) read, so the key was never found.
  const apiKey = process.env.EMAIL_RESEND_API_KEY
  if (!apiKey) {
    console.error('[notify-password-changed] EMAIL_RESEND_API_KEY not configured')
    return NextResponse.json({ ok: false })
  }
  const fromDomain = process.env.EMAIL_RESEND_EMAIL_DOMAIN || 'slipsurge.com'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `SlipSurge <team@${fromDomain}>`,
        to: [user.email],
        subject: 'Your SlipSurge password was changed',
        text: 'Your SlipSurge account password was just changed. If this was you, no action is needed. If you did not make this change, contact support@slipsurge.com immediately.',
        html: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#06070A;padding:40px 0;font-family:-apple-system,Segoe UI,sans-serif;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#0B0D12;border:1px solid #1A1D24;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 32px 0;text-align:center;">
<img src="https://www.slipsurge.com/logo.png" width="40" height="40" style="display:block;margin:0 auto 12px;" alt="SlipSurge" />
<div style="font-size:18px;font-weight:900;color:#F5F5F5;letter-spacing:-0.02em;">Slip<span style="color:#B4FF4D;">Surge</span></div>
</td></tr>
<tr><td style="padding:28px 32px 8px;text-align:center;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#F5F5F5;">Your password was changed</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#9CA3AF;">The password on your SlipSurge account was just changed. If this was you, no action is needed.</p>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
<p style="margin:0;font-size:13px;line-height:1.6;color:#F87171;font-weight:700;">Wasn't you? Contact support@slipsurge.com immediately.</p>
</td></tr>
</table>
</td></tr>
</table>`,
      }),
    })
    if (!res.ok) console.error('[notify-password-changed] Resend send failed', await res.text())
  } catch (e) {
    console.error('[notify-password-changed] threw', e)
  }

  // Best-effort — the password change itself already succeeded client-side
  // before this is called, so a failed notification email should never look
  // like a failed password change.
  return NextResponse.json({ ok: true })
}
