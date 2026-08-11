import { NextResponse } from 'next/server'
import { getMLBOdds } from '@/lib/odds-api'

export async function GET() {
  const odds = await getMLBOdds().catch(() => [])
  return NextResponse.json(odds, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
  })
}
