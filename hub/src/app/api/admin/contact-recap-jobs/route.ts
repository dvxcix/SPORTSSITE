import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processContactRecapExportJob } from '@/lib/contactRecapExportQueue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }), user: null }
  const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (data?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const admin = createAdminClient()
  const { data, error } = await admin.from('contact_recap_export_jobs')
    .select('id,recap_date,kind,format,aspect,status,progress,stage,filename,content_type,byte_size,attempt_count,error,created_at,updated_at,completed_at,expires_at')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error || !auth.user) return auth.error
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  const kind = body?.kind === 'near' ? 'near' : body?.kind === 'hr' ? 'hr' : null
  const format = body?.format === 'gif' ? 'gif' : body?.format === 'mp4' ? 'mp4' : null
  const aspect = body?.aspect === 'square' || body?.aspect === 'vertical' || body?.aspect === 'landscape' ? body.aspect : null
  if (!date || !kind || !format || !aspect) return NextResponse.json({ error: 'A valid date, kind, format, and aspect are required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: job, error: insertError } = await admin.from('contact_recap_export_jobs').insert({
    created_by: auth.user.id,
    recap_date: date,
    kind,
    format,
    aspect,
  }).select('id').single()
  if (insertError || !job) return NextResponse.json({ error: insertError?.message ?? 'Could not queue export.' }, { status: 500 })

  after(async () => { await processContactRecapExportJob(job.id) })
  return NextResponse.json({ id: job.id }, { status: 202 })
}
