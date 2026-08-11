import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAdminAudit } from '@/lib/adminAudit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: operator } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (operator?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { applicationId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  if (!['approved', 'rejected'].includes(body.decision)) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  const admin = createAdminClient()
  const { data: application } = await admin.from('creator_applications').select('id,user_id,status').eq('id', applicationId).single()
  if (!application || application.user_id !== body.userId) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (application.status !== 'pending') return NextResponse.json({ error: 'Application has already been reviewed' }, { status: 409 })
  const { error: applicationError } = await admin.from('creator_applications').update({ status: body.decision, rejection_reason: body.decision === 'rejected' ? String(body.reason || '').slice(0, 500) || null : null, reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq('id', applicationId).eq('status', 'pending')
  if (applicationError) return safeApiError('admin-creator-application-decision', applicationError)
  if (body.decision === 'approved') {
    const { error } = await admin.from('users').update({ account_type: 'creator', creator_commerce_status: 'not_started' }).eq('id', application.user_id)
    if (error) {
      await admin.from('creator_applications').update({ status: 'pending', reviewed_at: null, reviewed_by: null }).eq('id', applicationId)
      return safeApiError('admin-creator-promote-user', error)
    }
  }
  await writeAdminAudit(admin, {
    actorUserId: user.id,
    action: `creator.application_${body.decision}`,
    targetType: 'creator_application',
    targetId: applicationId,
    details: { applicant_user_id: application.user_id, reason: body.decision === 'rejected' ? String(body.reason || '').slice(0, 500) : null },
    request,
  })
  return NextResponse.json({ ok: true })
}
