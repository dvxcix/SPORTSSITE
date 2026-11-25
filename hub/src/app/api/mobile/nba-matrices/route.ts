import { NextRequest, NextResponse } from 'next/server'
import { GET as listMatrices, POST as createMatrix } from '@/app/api/nba-matrices/route'
import { PATCH as updateMatrix, DELETE as deleteMatrix } from '@/app/api/nba-matrices/[id]/route'
import { GET as evaluate } from '@/app/api/nba-matrices/evaluate/route'
import { POST as importCode } from '@/app/api/nba-matrices/import/route'
import { GET as listCommunity, POST as publishMatrix } from '@/app/api/nba-matrix-marketplace/route'
import { POST as importCommunity } from '@/app/api/nba-matrix-marketplace/[id]/import/route'
import { GET as getTracking } from '@/app/the-paint/tracking/route'
import { isAccountId } from '@/lib/blocks'
import { nbaFirstMarket } from '@/lib/nbaFirstBasketMarkets'
import { NBA_MATRIX_BOOKS, NBA_MATRIX_FIELDS, NBA_MATRIX_PROP_TYPES } from '@/lib/nbaMatrix'
import { PAINT_MARKETS } from '@/lib/nbaPaint'
import { nbaTrackingField } from '@/lib/nbaTracking'
import { requirePaintAccess } from '@/lib/paintAccess'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 120
const headers = { 'Cache-Control': 'private, no-store' }
const invalid = () => NextResponse.json({ error: 'Unknown Matrix action' }, { status: 400, headers })

export async function GET(request: NextRequest) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  switch (request.nextUrl.searchParams.get('view')) {
    case 'mine': return listMatrices()
    case 'community': return listCommunity()
    case 'evaluate': return evaluate(request)
    case 'tracking': {
      const tracking = await getTracking(request)
      if (!tracking.ok) return tracking
      const body = await tracking.json() as { fields?: string[] }
      return NextResponse.json({ fields: (body.fields ?? []).map(field => ({
        category: 'tracking', field, label: nbaTrackingField(field).label,
      })) }, { headers })
    }
    case 'catalog': {
      const gate = await requirePaintAccess()
      if (gate.error) return gate.error
      if (gate.userId !== account.userId) return invalid()
      return NextResponse.json({ fields: NBA_MATRIX_FIELDS, books: NBA_MATRIX_BOOKS,
        markets: NBA_MATRIX_PROP_TYPES.map(([value, title]) => ({ value, title, halfPoint: Boolean(nbaFirstMarket(value)) })),
        scoreMarkets: PAINT_MARKETS.filter(market => !market.key.endsWith('first3min')).map(market => market.key) }, { headers })
    }
    default: return invalid()
  }
}

export async function POST(request: NextRequest) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const query = request.nextUrl.searchParams
  switch (query.get('action')) {
    case 'create': return createMatrix(request)
    case 'import-code': return importCode(request)
    case 'publish': return publishMatrix(request)
    case 'import-listing': {
      const id = query.get('id')
      return id && isAccountId(id) ? importCommunity(request, { params: Promise.resolve({ id }) }) : invalid()
    }
    default: return invalid()
  }
}

export async function PATCH(request: NextRequest) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const id = request.nextUrl.searchParams.get('id')
  return id && isAccountId(id) ? updateMatrix(request, { params: Promise.resolve({ id }) }) : invalid()
}

export async function DELETE(request: NextRequest) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const id = request.nextUrl.searchParams.get('id')
  return id && isAccountId(id) ? deleteMatrix(request, { params: Promise.resolve({ id }) }) : invalid()
}
