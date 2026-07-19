import { NextResponse } from 'next/server'
import { getWeatherLabData } from '@/lib/weatherLab'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 900

export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const data = await getWeatherLabData(searchParams.get('date') || undefined)
  return NextResponse.json(data)
}
