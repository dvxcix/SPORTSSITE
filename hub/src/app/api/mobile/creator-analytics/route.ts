import { NextResponse } from 'next/server'
import { nativeCreatorAnalytics } from '@/lib/nativeCreatorAnalytics'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
type Result<Row> = PromiseLike<{ data: Row[] | null; error: unknown }>

async function readWindow<Row>(range: (from: number, through: number) => Result<Row>, maxRows: number) {
  const rows: Row[] = []
  for (let offset = 0; offset < maxRows; offset += 1000) {
    const result = await range(offset, Math.min(maxRows - 1, offset + 999))
    if (result.error || !result.data) throw Error('Creator analytics source failed')
    rows.push(...result.data)
    if (result.data.length < 1000) return { rows, limited: false }
  }
  return { rows, limited: true }
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase: client, userId } = account
  const now = Date.now()
  const current = new Date(now - 30 * 86_400_000).toISOString()
  const comparison = new Date(now - 60 * 86_400_000).toISOString()
  try {
    const [profile, products, members, receipts, visits, posts] = await Promise.all([
      client.from('users').select('follower_count').eq('id', userId).maybeSingle(),
      readWindow((a, b) => client.from('creator_products').select('id,title').eq('creator_id', userId).order('id').range(a, b), 1000),
      readWindow((a, b) => client.from('creator_entitlements').select('status,current_period_end,created_at,updated_at,product_id')
        .eq('creator_id', userId).order('id').range(a, b), 5000),
      readWindow((a, b) => client.from('creator_commerce_events').select('event_type,amount,currency,status,created_at,product_id')
        .eq('creator_id', userId).gte('created_at', comparison).order('created_at', { ascending: false }).order('id').range(a, b), 5000),
      readWindow((a, b) => client.from('creator_funnel_events').select('event_type,product_id,source,created_at')
        .eq('creator_id', userId).gte('created_at', current).order('created_at', { ascending: false }).order('id').range(a, b), 5000),
      readWindow((a, b) => client.from('posts').select('reaction_count,comment_count,repost_count,created_at')
        .eq('author_id', userId).gte('created_at', current).order('created_at', { ascending: false }).order('id').range(a, b), 5000),
    ])
    if (profile.error || !profile.data) throw Error('Creator analytics identity unavailable')
    const analytics = nativeCreatorAnalytics({ followers: profile.data.follower_count ?? 0, products: products.rows, members: members.rows,
      receipts: receipts.rows, visits: visits.rows, posts: posts.rows }, now)
    return reply({ ...analytics, limited: [products, members, receipts, visits, posts].some(source => source.limited) })
  } catch {
    return reply({ error: 'Creator analytics could not be loaded' }, 503)
  }
}
