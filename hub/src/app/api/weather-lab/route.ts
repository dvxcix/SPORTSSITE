import { NextResponse } from 'next/server'
import { getWeatherLabData } from '@/lib/weatherLab'

export const revalidate = 900

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const data = await getWeatherLabData(searchParams.get('date') || undefined)
  return NextResponse.json(data)
}
