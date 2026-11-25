import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const bucket = 'contact-recap-exports'
const exportColumns = 'id,recap_date,kind,format,aspect,status,progress,stage,filename,content_type,byte_size,attempt_count,error,created_at,completed_at,expires_at'

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return reply({ error: 'Sign in required' }, 401)
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error

  const exportId = new URL(request.url).searchParams.get('export')
  if (exportId === null) {
    const { data, error } = await actor.admin.from('contact_recap_export_jobs').select(exportColumns)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30)
    if (error) return reply({ error: 'Could not read the Contact Recap export queue' }, 503)
    return reply({ paused: MLB_HIBERNATING, jobs: data ?? [] })
  }

  if (!isAccountId(exportId)) return reply({ error: 'Invalid export' }, 400)
  const { data: job, error } = await actor.admin.from('contact_recap_export_jobs')
    .select('status, format, storage_path, filename, expires_at').eq('id', exportId).maybeSingle()
  if (error) return reply({ error: 'Could not read the Contact Recap export' }, 503)
  if (!job) return reply({ error: 'Export not found' }, 404)
  const expiry = Date.parse(job.expires_at)
  const seconds = Math.min(15 * 60, Math.floor((expiry - Date.now()) / 1000))
  if (job.status !== 'completed' || !job.storage_path || !Number.isFinite(seconds) || seconds < 1) {
    return reply({ error: 'Export is unavailable or expired' }, 409)
  }
  const filename = job.filename ?? `slipsurge-contact-recap.${job.format}`
  const { data, error: signingError } = await actor.admin.storage.from(bucket).createSignedUrl(job.storage_path, seconds, { download: filename })
  if (signingError || !data?.signedUrl) return reply({ error: 'Could not download the Contact Recap export' }, 503)
  return reply({ downloadUrl: data.signedUrl, filename })
}
