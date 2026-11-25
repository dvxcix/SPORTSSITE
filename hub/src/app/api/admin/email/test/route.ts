import { NextResponse } from 'next/server'
import { brandedEmailHtml, sendEmailWithResult } from '@/lib/email'
import { writeAdminAudit } from '@/lib/adminAudit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const nativeHeaders = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const native = request.headers.has('authorization')
  let to: string, actorId: string, idempotencyKey: string
  if (native) {
    const actor = await adminDecisionActor(request)
    if (actor.error) return actor.error
    if (!actor.user.email) return NextResponse.json({ error: 'Your account has no email address' }, { status: 400, headers: nativeHeaders })
    const key = request.headers.get('idempotency-key') ?? ''
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) {
      return NextResponse.json({ error: 'Confirm the test send again' }, { status: 400, headers: nativeHeaders })
    }
    to = actor.user.email
    actorId = actor.user.id
    idempotencyKey = `admin-email-test/${actorId}/${key.toLowerCase()}`
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
    if (profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    to = user.email
    actorId = user.id
    idempotencyKey = `admin-email-test/${crypto.randomUUID()}`
  }

  const result = await sendEmailWithResult({
    to,
    subject: 'SlipSurge email delivery test',
    text: 'Your SlipSurge email provider, sender domain, and shared branded template are working.',
    idempotencyKey,
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
  await writeAdminAudit(createAdminClient(), { actorUserId: actorId, action: 'email.test_sent', targetType: 'email_provider', details: { success: result.ok, provider_status: result.status }, request })
  if (native) return result.ok ? NextResponse.json({ ok: true }, { headers: nativeHeaders })
    : NextResponse.json({ error: 'The provider couldn’t confirm the test email' }, { status: 502, headers: nativeHeaders })
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error || 'Test email failed' }, { status: 502 })
}
