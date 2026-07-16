import { NextResponse } from 'next/server'

// Was copy-pasted identically across every cron route — extracted once
// there were enough of them (player-data sync adds several more) that a
// 4th-10th copy stopped making sense.
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
