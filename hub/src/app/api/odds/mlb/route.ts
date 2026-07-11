import { NextResponse } from 'next/server'
import { getMLBOdds } from '@/lib/odds-api'

export async function GET() {
  const odds = await getMLBOdds()
  return NextResponse.json(odds)
}
