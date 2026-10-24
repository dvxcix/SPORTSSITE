import { NextResponse } from 'next/server'
import { requirePaintAdmin } from '@/lib/paintAccess'
import { getPaintGame } from '@/lib/nbaPaintData'
import { getNbaPriceAudit, nbaPriceAuditGameAllowed, NbaPriceAuditError } from '@/lib/nbaPriceAudit'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const site = request.headers.get('sec-fetch-site'), origin = request.headers.get('origin')
    const navigation = site === 'none' && request.headers.get('sec-fetch-dest') === 'document' && request.headers.get('sec-fetch-mode') === 'navigate'
    if (!(site === 'same-origin' || navigation) || origin && origin !== url.origin) return privateResponse(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const gate = await requirePaintAdmin()
    if (gate.error) return privateResponse(gate.error)
    const ids = url.searchParams.getAll('game')
    if (ids.length !== 1 || !/^[1-9]\d{0,9}$/.test(ids[0]) || [...url.searchParams.keys()].some(key => key !== 'game')) return privateResponse(NextResponse.json({ error: 'Choose one NBA game' }, { status: 400 }))
    const game = await getPaintGame(Number(ids[0]))
    if (game.id !== Number(ids[0]) || !nbaPriceAuditGameAllowed(game)) return privateResponse(NextResponse.json({ error: 'Choose an upcoming NBA game today or tomorrow' }, { status: 400 }))
    return privateResponse(NextResponse.json(await getNbaPriceAudit(game)))
  } catch (error) {
    return privateResponse(NextResponse.json({ error: 'NBA price audit unavailable', code: error instanceof NbaPriceAuditError ? error.code : 'unavailable' }, { status: error instanceof NbaPriceAuditError ? error.status : 503 }))
  }
}
