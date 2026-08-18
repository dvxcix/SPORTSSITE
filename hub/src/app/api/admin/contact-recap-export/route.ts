import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDailyContactRecap } from '@/lib/dailyContactRecap'
import { renderContactRecapGif } from '@/lib/contactRecapGif'

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
  try {
    const recap = await getDailyContactRecap(date)
    const body = await renderContactRecapGif(kind === 'near' ? recap.nearHomeRuns : recap.homeRuns)
    return new NextResponse(new Uint8Array(body), { headers: {
      'Content-Type': 'image/gif',
      'Content-Disposition': `attachment; filename="slipsurge-${date}-${kind === 'near' ? 'near-home-runs' : 'home-runs'}.gif"`,
      'Cache-Control': 'private, no-store',
    } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not render the GIF.' }, { status: 400 })
  }
}
