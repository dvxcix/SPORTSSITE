import { NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'

export const dynamic = 'force-dynamic'
export async function GET() {
  const gate = await requireNflAccess()
  if (gate.error && ![401, 403].includes(gate.error.status)) return gate.error
  return NextResponse.json({ allowed: !gate.error }, { headers: { 'Cache-Control': 'private, no-store' } })
}
