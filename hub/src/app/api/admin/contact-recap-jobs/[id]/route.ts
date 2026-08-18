import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processContactRecapExportJob } from '@/lib/contactRecapExportQueue'

const BUCKET = 'contact-recap-exports'
export const runtime = 'nodejs'
export const maxDuration = 800

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  return data?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

async function loadJob(id: string) {
  const admin = createAdminClient()
  return admin.from('contact_recap_export_jobs')
    .select('id,recap_date,kind,format,aspect,status,progress,stage,workflow_run_id,storage_path,filename,content_type,byte_size,attempt_count,error,created_at,updated_at,completed_at,expires_at')
    .eq('id', id)
    .single()
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError
  const { id } = await params
  const { data: job, error } = await loadJob(id)
  if (error || !job) return NextResponse.json({ error: 'Export not found.' }, { status: 404 })
  let downloadUrl: string | null = null
  if (job.status === 'completed' && job.storage_path && new Date(job.expires_at).getTime() > Date.now()) {
    const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(job.storage_path, 15 * 60, { download: job.filename ?? true })
    downloadUrl = data?.signedUrl ?? null
  }
  return NextResponse.json({ job, downloadUrl }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError
  const { id } = await params
  const { data: job, error } = await loadJob(id)
  if (error || !job) return NextResponse.json({ error: 'Export not found.' }, { status: 404 })
  if (job.status === 'queued' || job.status === 'running' || job.status === 'retrying') {
    return NextResponse.json({ error: 'This export is already running.' }, { status: 409 })
  }
  const admin = createAdminClient()
  const { error: resetError } = await admin.from('contact_recap_export_jobs').update({
    status: 'queued', progress: 0, stage: 'Queued again', attempt_count: 0,
    error: null, started_at: null, completed_at: null, updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 })
  after(async () => { await processContactRecapExportJob(id) })
  return NextResponse.json({ id }, { status: 202 })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError
  const { id } = await params
  const { data: job } = await loadJob(id)
  const admin = createAdminClient()
  if (job?.storage_path) await admin.storage.from(BUCKET).remove([job.storage_path])
  await admin.from('contact_recap_export_jobs').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
