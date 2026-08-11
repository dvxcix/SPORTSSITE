import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { brandedEmailHtml, sendEmail } from '@/lib/email'

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

  const rate = await consumeServerRateLimit(user.id, 'welcome_email', 3, 24 * 60 * 60)
  if (!rate.available || !rate.allowed) return NextResponse.json({ ok: true, skipped: 'rate limited' })

  const sent = await sendEmail({
    to: user.email,
    subject: "You're in — welcome to SlipSurge",
    text: "You're in! Follow real graded cappers, post your own picks, and check live scores and stats — all in one place. Head back to slipsurge.com to get started.",
    html: brandedEmailHtml({
      eyebrow: 'Welcome to SlipSurge',
      heading: "You're in 🎉",
      preheader: 'Your SlipSurge account is ready.',
      bodyHtml: '<p style="margin:0 0 14px;">Your account is ready. Start by following trusted cappers, posting your picks, and opening the live research tools.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align:left;"><tr><td style="padding:8px 0;color:#D8DEE8;">🏆&nbsp;&nbsp;Follow real, graded track records</td></tr><tr><td style="padding:8px 0;color:#D8DEE8;">🎯&nbsp;&nbsp;Post your first pick or parlay</td></tr><tr><td style="padding:8px 0;color:#D8DEE8;">📊&nbsp;&nbsp;Explore live scores and research tools</td></tr></table>',
      ctaLabel: 'Go to your feed',
      ctaUrl: 'https://www.slipsurge.com/feed',
      footerHtml: '<p style="margin:0;font-size:11px;line-height:1.6;color:#687181;">Questions? Reply to this email or contact support@slipsurge.com.</p>',
    }),
  })
  if (!sent) console.error('[notify-welcome] welcome email was not delivered to Resend')

  return NextResponse.json({ ok: true })
}
