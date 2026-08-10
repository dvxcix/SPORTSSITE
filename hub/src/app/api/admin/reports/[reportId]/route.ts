import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAdminAudit } from '@/lib/adminAudit'

export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createAdminClient()
  const { data: operator } = await admin.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (operator?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { reportId } = await context.params
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
