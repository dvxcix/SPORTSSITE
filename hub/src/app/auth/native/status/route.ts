import { NextResponse } from 'next/server'
import { nativeHandoffKey } from '@/lib/nativeAuthHandoff'

export async function GET() {
  return NextResponse.json({ available: Boolean(nativeHandoffKey()) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
