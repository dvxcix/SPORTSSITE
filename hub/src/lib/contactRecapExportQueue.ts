import { createAdminClient } from '@/lib/supabase/admin'
import { getDailyContactRecap } from '@/lib/dailyContactRecap'
import { enrichContactRecapMarkets } from '@/lib/contactRecapMarkets'
import { renderContactRecap, type ContactRecapExportAspect, type ContactRecapExportFormat } from '@/lib/contactRecapGif'

const BUCKET = 'contact-recap-exports'
const MAX_ATTEMPTS = 3

type ExportJob = {
  id: string
  recap_date: string
  kind: 'hr' | 'near'
  format: ContactRecapExportFormat
  aspect: ContactRecapExportAspect
  status: string
  attempt_count: number
}

class PermanentExportError extends Error {}

async function updateJob(id: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from('contact_recap_export_jobs').update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(`Could not update export job: ${error.message}`)
}

export async function recoverStaleContactRecapExports() {
  const now = new Date().toISOString()
  return createAdminClient().from('contact_recap_export_jobs').update({
    status: 'queued',
    progress: 0,
    stage: 'Recovered after an interrupted render',
    updated_at: now,
  }).in('status', ['running', 'retrying']).lt('updated_at', new Date(Date.now() - 15 * 60_000).toISOString())
}

export async function processContactRecapExportJob(jobId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('contact_recap_export_jobs')
    .select('id,recap_date,kind,format,aspect,status,attempt_count')
    .eq('id', jobId)
    .single()
  if (error || !data) return { processed: false, error: 'Export job no longer exists.' }

  const job = data as ExportJob
  if (!['queued', 'retrying'].includes(job.status)) return { processed: false }
  const attempt = Number(job.attempt_count || 0) + 1
  const { data: claimed } = await admin.from('contact_recap_export_jobs').update({
    status: 'running',
    progress: 8,
    stage: attempt > 1 ? `Retry ${attempt} of ${MAX_ATTEMPTS}` : 'Loading recap data',
    attempt_count: attempt,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error: null,
  }).eq('id', jobId).in('status', ['queued', 'retrying']).select('id').maybeSingle()
  if (!claimed) return { processed: false }

  try {
    const recap = await getDailyContactRecap(job.recap_date)
    const selected = job.kind === 'near' ? recap.nearHomeRuns : recap.homeRuns
    if (!selected.length) throw new PermanentExportError(`No ${job.kind === 'near' ? 'near-home-run' : 'home-run'} events are available for this date.`)

    await updateJob(jobId, { progress: 24, stage: 'Freezing pregame market receipts' })
    const events = await enrichContactRecapMarkets(job.recap_date, selected)
    await updateJob(jobId, { progress: 42, stage: `Rendering ${job.format.toUpperCase()} frames` })
    const body = await renderContactRecap(events, job.format, job.aspect)

    await updateJob(jobId, { progress: 88, stage: 'Saving private download' })
    const label = job.kind === 'near' ? 'near-home-runs' : 'home-runs'
    const filename = `slipsurge-${job.recap_date}-${label}-${job.aspect}.${job.format}`
    const storagePath = `${job.recap_date}/${job.id}.${job.format}`
    const contentType = job.format === 'mp4' ? 'video/mp4' : 'image/gif'
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, body, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    })
    if (uploadError) throw new Error(`Could not store export: ${uploadError.message}`)

    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      stage: 'Ready to download',
      storage_path: storagePath,
      filename,
      content_type: contentType,
      byte_size: body.length,
      completed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      error: null,
    })
    return { processed: true, completed: true, filename, bytes: body.length }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Export failed.'
    const fatal = reason instanceof PermanentExportError || attempt >= MAX_ATTEMPTS
    await updateJob(jobId, {
      status: fatal ? 'failed' : 'retrying',
      progress: fatal ? 0 : 12,
      stage: fatal ? 'Export failed' : `Retrying automatically (${attempt}/${MAX_ATTEMPTS})`,
      error: message.slice(0, 2000),
    })
    return { processed: true, completed: false, retrying: !fatal, error: message }
  }
}

export async function processNextContactRecapExport() {
  const { data } = await createAdminClient().from('contact_recap_export_jobs')
    .select('id')
    .in('status', ['queued', 'retrying'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ? processContactRecapExportJob(data.id) : { processed: false }
}
