import { GET as estimate } from '@/app/the-paint/estimate/route'
import { GET as results } from '@/app/the-paint/results/route'
import { GET as publicActivity } from '@/app/the-paint/public/route'
import { GET as divergence } from '@/app/the-paint/divergence/route'
import { GET as lineups } from '@/app/the-paint/lineups/route'
import { GET as intelligence } from '@/app/the-paint/intelligence/route'
import { GET as shots } from '@/app/the-paint/shots/route'
import { GET as scouting } from '@/app/the-paint/scouting/route'
import { GET as tracking } from '@/app/the-paint/tracking/route'
import { NextRequest, NextResponse } from 'next/server'
import { GET as firstBasket } from '@/app/the-paint/first-basket/route'
import { GET as firstBasketOdds } from '@/app/the-paint/first-basket/odds/route'
import { GET as slateEdge } from '@/app/the-paint/slate/route'
import { getNativeCourtCheatsheets } from '@/lib/nativeCourtCheatsheets'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const { error } = await requireNativeAccount(request)
  if (error) return error
  switch (request.nextUrl.searchParams.get('tool')) {
    case 'first-basket': return firstBasket(request)
    case 'first-basket-odds': return firstBasketOdds(request)
    case 'slate-edge': return slateEdge(request)
    case 'cheatsheets': return getNativeCourtCheatsheets(request)
    case 'intelligence': return intelligence(request)
    case 'lineups': return lineups(request)
    case 'shots': return shots(request)
    case 'scouting': return scouting(request)
    case 'tracking': return tracking(request)
    case 'divergence': return divergence(request)
    case 'public': return publicActivity(request)
    case 'results': return results(request)
    case 'estimate': return estimate(request)
    default: return NextResponse.json({ error: 'Unknown Court tool' }, { status: 400 })
  }
}
