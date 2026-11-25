import { NextResponse } from 'next/server'
import { nativeInformationPage } from '@/lib/nativeInformationPages'
import { publicMembershipBilling, publicMembershipFeatures } from '@/lib/publicMembershipComparison'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { sportLogoUrl } from '@/lib/sportLogos'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const page = new URL(request.url).searchParams.get('page') ?? ''
  if (page === 'registration') {
    const headers = { 'Cache-Control': 'private, no-store' }
    const supabase = await createClient()
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'allow_registration').maybeSingle()
    if (error) return NextResponse.json({ error: 'Registration status couldn’t load' }, { status: 503, headers })
    const sports = [...(MLB_HIBERNATING ? [] : ['MLB']), 'NFL', 'NBA', 'NHL', 'MMA', 'Soccer', 'Tennis', 'Golf']
    return NextResponse.json({ open: data?.value !== 'false', sports: sports.map(id => ({ id, logo: sportLogoUrl(id) ?? null })) }, { headers })
  }
  const document = page === 'membership' ? { billing: publicMembershipBilling, features: publicMembershipFeatures } : nativeInformationPage(page)
  if (!document) return NextResponse.json({ error: 'Page unavailable' }, { status: 404 })
  return NextResponse.json(document, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } })
}
