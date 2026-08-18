import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDailyContactRecap } from '@/lib/dailyContactRecap'
import { enrichContactRecapMarkets } from '@/lib/contactRecapMarkets'
import { renderContactRecap, type ContactRecapExportFormat } from '@/lib/contactRecapGif'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  return data?.account_type === 'admin' ? null : NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET(request: Request) {
  const authError = await requireAdmin()
  if (authError) return authError
  const url = new URL(request.url)
  const date = url.searchParams.get('date') ?? ''
  const kind = url.searchParams.get('kind') === 'near' ? 'near' : 'hr'
  const format: ContactRecapExportFormat = url.searchParams.get('format') === 'gif' ? 'gif' : 'mp4'
  const startedAt = Date.now()
  try {
    console.info('[contact-recap-export] started', { date, kind, format })
    const recap = await getDailyContactRecap(date)
    const selected = kind === 'near' ? recap.nearHomeRuns : recap.homeRuns
    const events = await enrichContactRecapMarkets(date, selected)
    console.info('[contact-recap-export] data ready', { date, kind, format, events: events.length, elapsedMs: Date.now() - startedAt })
    const body = await renderContactRecap(events, format)
    const label = kind === 'near' ? 'near-home-runs' : 'home-runs'
    console.info('[contact-recap-export] completed', { date, kind, format, events: events.length, bytes: body.length, elapsedMs: Date.now() - startedAt })
    return new NextResponse(new Uint8Array(body), { headers: {
      'Content-Type': format === 'mp4' ? 'video/mp4' : 'image/gif',
      'Content-Disposition': `attachment; filename="slipsurge-${date}-${label}.${format}"`,
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) {
    console.error('[contact-recap-export] render failed', { date, kind, format, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not render the contact recap.' }, { status: 400 })
  }
}
