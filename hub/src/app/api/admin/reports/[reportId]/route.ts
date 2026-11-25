import { NextResponse } from 'next/server'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'
import { writeAdminAudit } from '@/lib/adminAudit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { admin, user } = actor

  const { reportId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return NextResponse.json({ error: 'Invalid report ID' }, { status: 400 })
  }
  const body = await request.json().catch(() => ({}))
  const status = String(body.status || '')
  if (!['actioned', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid report status' }, { status: 400 })
  }
  const resolutionNote = String(body.resolutionNote || '').trim().slice(0, 1000) || null

  const { data: report, error } = await admin
    .from('reports')
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      resolution_note: resolutionNote,
    })
    .eq('id', reportId)
    .eq('status', 'pending')
    .select('id,target_type,target_id,reason')
    .maybeSingle()

  if (error) return safeApiError('admin-report-decision', error)
  if (!report) return NextResponse.json({ error: 'Report was already reviewed or does not exist' }, { status: 409 })

  await writeAdminAudit(admin, {
    actorUserId: user.id,
    action: `report.${status}`,
    targetType: report.target_type,
    targetId: report.target_id,
    details: { report_id: report.id, reason: report.reason, resolution_note: resolutionNote },
    request,
  })

  return NextResponse.json({ ok: true })
}
