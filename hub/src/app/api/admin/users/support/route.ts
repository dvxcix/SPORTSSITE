import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, brandedEmailHtml } from '@/lib/email'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { adminId: user.id }
}

// Live-support actions for /admin/users — the goal is a support rep in an
// active chat with a member being able to fix their auth issue in one click
// instead of walking them through the site themselves. Every action here
// generates the exact link Supabase's own auth flow would use
// (auth.admin.generateLink) and emails it via Resend — the same custom-send
// path api/settings/notify-password-changed and api/email/send-notification
// already use instead of Supabase's own mailer (this project routes ALL
// transactional email through Resend, not Supabase's built-in SMTP, which
// is rate-limited and untemplated on the free tier).
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { userId, action, value } = await req.json().catch(() => ({}))
  if (!userId || !action) {
    return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: targetUser, error: getUserErr } = await admin.auth.admin.getUserById(userId)
  if (getUserErr || !targetUser?.user?.email) {
    return NextResponse.json({ error: getUserErr?.message ?? 'User not found' }, { status: 404 })
  }
  const currentEmail = targetUser.user.email

  if (action === 'sendPasswordReset') {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: currentEmail })
    if (error || !link) return NextResponse.json({ error: error?.message ?? 'Failed to generate reset link' }, { status: 500 })
    const sent = await sendEmail({
      to: currentEmail,
      subject: 'Reset your SlipSurge password',
      text: `A SlipSurge team member sent you a password reset link at your request.\n\n${link.properties.action_link}\n\nIf you didn't request this, you can safely ignore it.`,
      html: brandedEmailHtml({
        heading: 'Reset your password',
        bodyHtml: 'A SlipSurge team member sent you this link at your request. Click below to set a new password.',
        ctaLabel: 'Reset password',
        ctaUrl: link.properties.action_link,
        footerHtml: '<p style="margin:0;font-size:12px;color:#6B7280;">Didn\'t request this? You can safely ignore this email.</p>',
      }),
    })
    if (!sent) return NextResponse.json({ error: 'Link generated but the email failed to send' }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'resendVerification') {
    if (targetUser.user.email_confirmed_at) {
      return NextResponse.json({ error: 'This email is already verified' }, { status: 400 })
    }
    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'signup', email: currentEmail, password: crypto.randomUUID() })
    if (error || !link) return NextResponse.json({ error: error?.message ?? 'Failed to generate verification link' }, { status: 500 })
    const sent = await sendEmail({
      to: currentEmail,
      subject: 'Confirm your SlipSurge email',
      text: `Confirm your email to finish setting up your SlipSurge account:\n\n${link.properties.action_link}`,
      html: brandedEmailHtml({
        heading: 'Confirm your email',
        bodyHtml: 'Click below to confirm your email and finish setting up your SlipSurge account.',
        ctaLabel: 'Confirm email',
        ctaUrl: link.properties.action_link,
      }),
    })
    if (!sent) return NextResponse.json({ error: 'Link generated but the email failed to send' }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'changeEmail') {
    const newEmail = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: 'A valid new email is required' }, { status: 400 })
    }
    if (newEmail === currentEmail.toLowerCase()) {
      return NextResponse.json({ error: 'That\'s already this account\'s email' }, { status: 400 })
    }

    // Neither link actually changes anything by itself — Supabase only
    // finalizes the swap once the confirmation flow it's configured for is
    // satisfied (new-address link alone, or both, depending on the
    // project's "Secure email change" setting). Sending both covers either
    // configuration: if only one is required, the other is simply inert.
    const [{ data: newLink, error: newErr }, { data: curLink, error: curErr }] = await Promise.all([
      admin.auth.admin.generateLink({ type: 'email_change_new', email: currentEmail, newEmail }),
      admin.auth.admin.generateLink({ type: 'email_change_current', email: currentEmail, newEmail }),
    ])
    if (newErr || !newLink) return NextResponse.json({ error: newErr?.message ?? 'Failed to generate email-change link' }, { status: 500 })

    const sentNew = await sendEmail({
      to: newEmail,
      subject: 'Confirm your new email for SlipSurge',
      text: `A SlipSurge team member requested this account's email be changed to this address. Click to confirm:\n\n${newLink.properties.action_link}\n\nIf you weren't expecting this, ignore it and nothing will change.`,
      html: brandedEmailHtml({
        heading: 'Confirm your new email',
        bodyHtml: `A SlipSurge team member requested this account's email be changed to this address (from ${currentEmail}). Click below to confirm.`,
        ctaLabel: 'Confirm new email',
        ctaUrl: newLink.properties.action_link,
        footerHtml: '<p style="margin:0;font-size:12px;color:#6B7280;">Weren\'t expecting this? Ignore this email and nothing will change.</p>',
      }),
    })

    // Best-effort security notice to the CURRENT address — same spirit as
    // notify-password-changed, so the real owner has a chance to notice and
    // object if a support change wasn't actually theirs. Not required for
    // the change to work, so its failure doesn't fail the whole action.
    if (!curErr && curLink) {
      await sendEmail({
        to: currentEmail,
        subject: 'Email change requested on your SlipSurge account',
        text: `A SlipSurge team member requested this account's email be changed to ${newEmail}. If this wasn't you, contact support@slipsurge.com immediately. Otherwise, no action is needed here — the new address has its own confirmation link.`,
        html: brandedEmailHtml({
          heading: 'Email change requested',
          bodyHtml: `A SlipSurge team member requested this account's email be changed to <strong style="color:#F5F5F5;">${newEmail}</strong>.`,
          footerHtml: '<p style="margin:0;font-size:13px;color:#F87171;font-weight:700;">Wasn\'t you? Contact support@slipsurge.com immediately.</p>',
        }),
      })
    }

    if (!sentNew) return NextResponse.json({ error: 'Link generated but the email failed to send' }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
