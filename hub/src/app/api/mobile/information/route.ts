import { NextResponse } from 'next/server'
import { nativeInformationPage } from '@/lib/nativeInformationPages'
import { publicMembershipBilling, publicMembershipFeatures } from '@/lib/publicMembershipComparison'

export function GET(request: Request) {
  const page = new URL(request.url).searchParams.get('page') ?? ''
  const document = page === 'membership' ? { billing: publicMembershipBilling, features: publicMembershipFeatures } : nativeInformationPage(page)
  if (!document) return NextResponse.json({ error: 'Page unavailable' }, { status: 404 })
  return NextResponse.json(document, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } })
}
