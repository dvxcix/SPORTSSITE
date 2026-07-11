import { NextResponse } from 'next/server'
import { getTodaysGames } from '@/lib/mlb-api'

export async function GET() {
  const games = await getTodaysGames()
  return NextResponse.json(games)
}
