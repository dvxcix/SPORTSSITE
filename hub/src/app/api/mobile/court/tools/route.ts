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
    default: return NextResponse.json({ error: 'Unknown Court tool' }, { status: 400 })
  }
}
