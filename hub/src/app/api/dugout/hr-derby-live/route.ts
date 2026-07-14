import { NextResponse } from 'next/server'

export const revalidate = 0

// Proxies Baseball Savant's own live HR Derby feed (the exact endpoint
// https://baseballsavant.mlb.com/hr_derby polls itself, confirmed by
// inspecting its network requests directly) — server-side because Savant
// doesn't reliably allow cross-origin fetches from a browser on a
// different domain, same reason every other Savant/MLB Stats API call in
// this app goes through a route handler instead of client-side fetch.
// Drops the per-swing trajectory polynomials (hit.polynomialX/Y/Z) since
// those only matter for Savant's own 3D animation, not a leaderboard.
export async function GET() {
  try {
    const res = await fetch('https://baseballsavant.mlb.com/derby-data?year=2026', {
      headers: { 'User-Agent': 'SlipSurge/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ status: null, hrs: [] }, { headers: { 'Cache-Control': 'no-store' } })
    const data = await res.json()
    const hrs = (data.hrs ?? []).map((h: any) => ({
      playerId: h.playerId,
      playerName: h.playerName,
      round: h.round,
      hrNumInRound: h.summary?.hrs ?? null,
      exitVelocity: h.result?.computedMetrics?.exitVelocity?.value ?? null,
      distance: h.result?.computedMetrics?.projectedDistance?.value ?? null,
      launchAngle: h.result?.computedMetrics?.launchAngle?.value ?? null,
      time: h.time ?? null,
    }))
    return NextResponse.json({ status: data.status ?? null, hrs }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: null, hrs: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
