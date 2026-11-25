import { NextResponse } from 'next/server'
import { GET as listMatrices, POST as createMatrix } from '@/app/api/nfl-matrices/route'
import { PATCH as updateMatrix, DELETE as deleteMatrix } from '@/app/api/nfl-matrices/[id]/route'
import { POST as importCode } from '@/app/api/nfl-matrices/import/route'
import { GET as listCommunity, POST as publishMatrix } from '@/app/api/nfl-matrix-marketplace/route'
import { POST as importCommunity } from '@/app/api/nfl-matrix-marketplace/[id]/import/route'
import { isAccountId } from '@/lib/blocks'
import { requireNflAccess } from '@/lib/nflAccess'
import { NFL_MATRIX_BOOKS, NFL_MATRIX_FIELDS, NFL_MATRIX_PROP_TYPES } from '@/lib/nflMatrix'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const invalid = () => NextResponse.json({ error: 'Unknown Matrix action' }, { status: 400, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  switch (new URL(request.url).searchParams.get('view')) {
    case 'mine': return listMatrices()
    case 'community': return listCommunity()
    case 'catalog': {
      const gate = await requireNflAccess()
      if (gate.error) return gate.error
      if (gate.userId !== account.userId) return invalid()
      return NextResponse.json({ fields: NFL_MATRIX_FIELDS, books: NFL_MATRIX_BOOKS,
        markets: NFL_MATRIX_PROP_TYPES.map(([value, title]) => ({ value, title })) }, { headers })
    }
    default: return invalid()
  }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const query = new URL(request.url).searchParams
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

export async function PATCH(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const id = new URL(request.url).searchParams.get('id')
  return id && isAccountId(id) ? updateMatrix(request, { params: Promise.resolve({ id }) }) : invalid()
}

export async function DELETE(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const id = new URL(request.url).searchParams.get('id')
  return id && isAccountId(id) ? deleteMatrix(request, { params: Promise.resolve({ id }) }) : invalid()
}
