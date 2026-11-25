import { NextResponse } from 'next/server'
import { GET as matrixList, POST as matrixCreate } from '@/app/api/matrices/route'
import { DELETE as matrixDelete, PATCH as matrixUpdate } from '@/app/api/matrices/[id]/route'
import { POST as importCode } from '@/app/api/matrices/import/route'
import { GET as marketplace, POST as publishListing } from '@/app/api/matrix-marketplace/route'
import { DELETE as removeListing } from '@/app/api/matrix-marketplace/[id]/route'
import { POST as importListing } from '@/app/api/matrix-marketplace/[id]/import/route'
import { isAccountId, isBlockedEitherWay } from '@/lib/blocks'
import { readMarketplaceSnapshot } from '@/lib/matrixMarketplace'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

export const maxDuration = 60
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

async function access(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account
  if (!await canViewMlb(account.supabase, account.userId)) return { error: reply({ error: 'MLB Matrices are unavailable for this account' }, 403) }
  const tier = await requireTier('ultimate')
  if (tier.error) return { error: tier.error }
  return tier.userId === account.userId ? account : { error: reply({ error: 'Sign in required' }, 401) }
}

function scoped(response: Response) {
  const privateHeaders = new Headers(response.headers)
  privateHeaders.set('Cache-Control', headers['Cache-Control'])
  return new Response(response.body, { status: response.status, headers: privateHeaders })
}

export async function GET(request: Request) {
  const account = await access(request)
  if (account.error) return account.error
  const query = new URL(request.url).searchParams
  const op = query.get('op') ?? 'list'
  if (op === 'marketplace') {
    const author = query.get('author')
    if (author !== null && (!isAccountId(author) || query.getAll('author').length !== 1)) {
      return reply({ error: 'Invalid Matrix author' }, 400)
    }
    return scoped(await marketplace(request))
  }
  if (op === 'listing') {
    const id = query.get('id')
    if (!id || !isAccountId(id) || query.getAll('id').length !== 1) return reply({ error: 'Listing not found' }, 404)
    try {
      const admin = createAdminClient()
      const { data, error } = await admin.from('matrix_marketplace_listings')
        .select('id,author_id,title,description,tags,matrix_type,color,snapshot,copy_count')
        .eq('id', id).eq('status', 'published').maybeSingle()
      if (error) throw Error()
      if (!data || (data.author_id !== account.userId && await isBlockedEitherWay(account.supabase, account.userId, data.author_id))) {
        return reply({ error: 'Listing not found' }, 404)
      }
      const snapshot = readMarketplaceSnapshot(data.snapshot)
      if (!snapshot) return reply({ error: 'Listing not found' }, 404)
      const author = await admin.from('users').select('id,username,display_name,avatar_url,is_verified')
        .eq('id', data.author_id).maybeSingle()
      if (author.error) throw Error()
      return reply({ listing: { ...data, snapshot, author: author.data, is_owner: data.author_id === account.userId } })
    } catch {
      return reply({ error: 'Matrix listing is temporarily unavailable' }, 503)
    }
  }
  if (op === 'list') return scoped(await matrixList())
  return reply({ error: 'Choose a valid Matrices view' }, 400)
}

export async function POST(request: Request) {
  const account = await access(request)
  if (account.error) return account.error
  const query = new URL(request.url).searchParams
  const op = query.get('op')
  const raw = await request.text()
  if (raw.length > 150_000) return reply({ error: 'This Matrix is too large' }, 400)
  const adapter = new Request(request.url, { method: 'POST', headers: request.headers, body: raw })
  if (op === 'create') return scoped(await matrixCreate(adapter))
  if (op === 'import-code') return scoped(await importCode(adapter))
  if (op === 'publish') return scoped(await publishListing(adapter))

  const id = query.get('id')
  if (!id || !isAccountId(id)) return reply({ error: 'Matrix or listing not found' }, 404)
  const context = { params: Promise.resolve({ id }) }
  if (op === 'import-listing') return scoped(await importListing(adapter, context))
  if (op === 'remove-listing') return scoped(await removeListing(adapter, context))
  if (op !== 'edit' && op !== 'delete') return reply({ error: 'Choose a valid Matrix change' }, 400)

  const expected = query.get('updatedAt')
  if (!expected || !Number.isFinite(Date.parse(expected))) return reply({ error: 'Reload the saved Matrix before changing it' }, 400)
  const owned = await account.supabase.from('matrices').select('updated_at').eq('id', id).eq('user_id', account.userId).maybeSingle()
  if (owned.error) return reply({ error: 'The Matrix could not be verified' }, 503)
  if (!owned.data) return reply({ error: 'Matrix not found' }, 404)
  if (owned.data.updated_at !== expected) return reply({ error: 'This Matrix changed. Reopen it before saving.' }, 409)
  return scoped(op === 'edit' ? await matrixUpdate(adapter, context) : await matrixDelete(adapter, context))
}
