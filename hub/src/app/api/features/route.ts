import { NextResponse } from 'next/server'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { getFeatureFlagsServer } from '@/lib/featureFlags.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const flags = await getFeatureFlagsServer(Object.values(FEATURE_FLAGS))
  return NextResponse.json({ flags }, { headers: { 'Cache-Control': 'private, no-store' } })
}
