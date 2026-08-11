import { NextResponse } from 'next/server'
import { brandedEmailHtml, sendEmailWithResult } from '@/lib/email'
import { writeAdminAudit } from '@/lib/adminAudit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await sendEmailWithResult({
    to: user.email,
    subject: 'SlipSurge email delivery test',
    text: 'Your SlipSurge email provider, sender domain, and shared branded template are working.',
    idempotencyKey: `admin-email-test/${crypto.randomUUID()}`,
    tags: [{ name: 'category', value: 'admin_test' }],
    html: brandedEmailHtml({
      eyebrow: 'Delivery test',
      heading: 'Your email system is connected',
      preheader: 'SlipSurge email delivery test',
      bodyHtml: '<p style="margin:0;">This message confirms the Resend API, sender domain, and production SlipSurge template are working together.</p>',
      ctaLabel: 'Open email operations',
      ctaUrl: 'https://www.slipsurge.com/admin/settings/email',
    }),
  })
  await writeAdminAudit(createAdminClient(), { actorUserId: user.id, action: 'email.test_sent', targetType: 'email_provider', details: { success: result.ok, provider_status: result.status }, request })
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error || 'Test email failed' }, { status: 502 })
}
