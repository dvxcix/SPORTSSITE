import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAdminAudit } from '@/lib/adminAudit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: operator } = await admin.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (operator?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { requestId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return NextResponse.json({ error: 'Request changed or no longer exists' }, { status: 404 })
  const body = await request.json().catch(() => ({})) as { status?: string; note?: string; scheduledFor?: string }
  const status = String(body.status || '')
  if (!['reviewing', 'blocked', 'scheduled', 'canceled'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const scheduledFor = status === 'scheduled' && body.scheduledFor ? new Date(body.scheduledFor) : null
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return NextResponse.json({ error: 'Invalid schedule date' }, { status: 400 })

  const { data: row, error } = await admin.from('account_deletion_requests').update({
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    scheduled_for: scheduledFor?.toISOString() ?? null,
    canceled_at: status === 'canceled' ? new Date().toISOString() : null,
    resolution_note: String(body.note || '').trim().slice(0, 1000) || null,
  }).eq('id', requestId).in('status', ['pending', 'reviewing', 'blocked'])
    .select('id,user_id,status').maybeSingle()
  if (error) return safeApiError('admin-account-deletion', error)
  if (!row) return NextResponse.json({ error: 'Request changed or no longer exists' }, { status: 409 })

  await writeAdminAudit(admin, {
    actorUserId: user.id,
    action: `account_deletion.${status}`,
    targetType: 'user',
    targetId: row.user_id,
    details: { request_id: row.id, note: body.note || null, scheduled_for: scheduledFor?.toISOString() ?? null },
    request,
  })
  return NextResponse.json({ ok: true })
}
