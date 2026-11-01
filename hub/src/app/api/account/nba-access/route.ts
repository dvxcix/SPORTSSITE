import { NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'

export const dynamic = 'force-dynamic'

// Only return an access decision; the underlying membership and grant fields
// stay server-side. Authentication failures and denials never expose a profile.
export async function GET() {
  const gate = await requirePaintAccess()
  if (gate.error && ![401, 403].includes(gate.error.status)) {
    gate.error.headers.set('Cache-Control', 'private, no-store')
    return gate.error
  }
  return NextResponse.json({ allowed: !gate.error }, { headers: { 'Cache-Control': 'private, no-store' } })
}
