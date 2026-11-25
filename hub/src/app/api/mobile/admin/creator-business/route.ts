import { NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { getCreatorOperations } from '@/lib/creatorOperations'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return reply({ error: 'Sign in required' }, 401)
  const actor = await creatorAdminAuth(request)
  if ('error' in actor) return reply({ error: actor.error }, actor.status)
  try {
    const [operation, promotions] = await Promise.all([
      getCreatorOperations(actor.admin),
      actor.admin.from('creator_storefronts').select('creator_id,name,logo_url,featured,featured_rank,creator:users!creator_storefronts_creator_id_fkey(username)')
        .eq('status', 'published').order('featured_rank').order('creator_id').limit(200),
    ])
    if (promotions.error) throw promotions.error
    return reply({ ...operation, promotions: promotions.data ?? [] })
  } catch {
    return reply({ error: 'Creator operations could not be loaded' }, 503)
  }
}
