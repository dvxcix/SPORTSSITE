import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 0

// Fired once, right after a new user finishes onboarding (OnboardingFlow's
// finish()) — Supabase Auth's own email templates only cover the auth
// mechanics (confirm/reset/etc.), there's no "welcome, here's how to get
// started" email built in. Sent directly via Resend, independent of
// Supabase's email system, same pattern as notify-password-changed.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[notify-welcome] RESEND_API_KEY not configured')
    return NextResponse.json({ ok: false })
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SlipSurge <team@slipsurge.com>',
        to: [user.email],
        subject: "You're in — welcome to SlipSurge",
        text: "You're in! Follow real graded cappers, post your own picks, and check live scores and stats — all in one place. Head back to slipsurge.com to get started.",
        html: `<table width="100%" cellpadding="0" cellspacing="0" style="background:#06070A;padding:40px 0;font-family:-apple-system,Segoe UI,sans-serif;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#0B0D12;border:1px solid #1A1D24;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 32px 0;text-align:center;">
<img src="https://www.slipsurge.com/logo.png" width="40" height="40" style="display:block;margin:0 auto 12px;" alt="SlipSurge" />
<div style="font-size:18px;font-weight:900;color:#F5F5F5;letter-spacing:-0.02em;">Slip<span style="color:#B4FF4D;">Surge</span></div>
</td></tr>
<tr><td style="padding:28px 32px 8px;text-align:center;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:900;color:#F5F5F5;">You're in 🎉</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#9CA3AF;">Your SlipSurge account is ready. Here's what to do first:</p>
</td></tr>
<tr><td style="padding:16px 32px 8px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:8px 0;font-size:13px;color:#D1D5DB;">🏆&nbsp;&nbsp;Follow a few cappers with real, graded track records</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#D1D5DB;">🎯&nbsp;&nbsp;Post your first pick or parlay to the feed</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#D1D5DB;">📊&nbsp;&nbsp;Check live scores and stat tools for MLB and more</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 32px 8px;text-align:center;">
<a href="https://www.slipsurge.com/feed" style="display:inline-block;background:#B4FF4D;color:#0B1600;font-weight:800;font-size:14px;padding:12px 32px;border-radius:99px;text-decoration:none;">Go to your feed</a>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
<p style="margin:0;font-size:12px;color:#6B7280;">Questions? Just reply, or reach us at support@slipsurge.com.</p>
</td></tr>
</table>
</td></tr>
</table>`,
      }),
    })
    if (!res.ok) console.error('[notify-welcome] Resend send failed', await res.text())
  } catch (e) {
    console.error('[notify-welcome] threw', e)
  }

  return NextResponse.json({ ok: true })
}
