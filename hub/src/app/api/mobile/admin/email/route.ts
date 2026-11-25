import { NextResponse } from 'next/server'
import { adminEmailPreview } from '@/lib/adminEmailPreviews'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const template = new URL(request.url).searchParams.get('template')
  if (template !== null) {
    if (!['welcome', 'notification', 'security', 'billing'].includes(template)) return reply({ error: 'Choose a valid preview' }, 400)
    return reply({ html: adminEmailPreview(template) })
  }

  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const attempts = actor.admin.from('notification_delivery_attempts')
  const count = (status: string) => attempts.select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', status).gte('attempted_at', cutoff)
  const [sent, failed, webhookFailures, recent] = await Promise.all([
    count('sent'), count('failed'),
    actor.admin.from('provider_webhook_events').select('id', { count: 'exact', head: true })
      .eq('provider', 'resend').eq('status', 'failed').gte('received_at', cutoff),
    attempts.select('id,status,provider_status,provider_message_id,provider_event,error,attempted_at').eq('channel', 'email')
      .order('attempted_at', { ascending: false }).order('id', { ascending: false }).limit(40),
  ])
  if (recent.error) return reply({ error: 'Email delivery history couldn’t load' }, 503)
  return reply({
    configuration: {
      api: Boolean(process.env.EMAIL_RESEND_API_KEY || process.env.RESEND_API_KEY),
      domain: Boolean(process.env.EMAIL_RESEND_EMAIL_DOMAIN || process.env.RESEND_EMAIL_DOMAIN),
      webhooks: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      authTemplates: process.env.SUPABASE_AUTH_EMAILS_BRANDED === 'true',
    },
    counts: { sent: sent.count, failed: failed.count, webhookFailures: webhookFailures.count },
    recent: (recent.data ?? []).map(row => ({ id: row.id, status: row.status, providerStatus: row.provider_status,
      providerMessage: row.provider_message_id?.slice(0, 12) ?? null, providerEvent: row.provider_event,
      hasError: Boolean(row.error), attemptedAt: row.attempted_at })),
  })
}
