import { NextResponse } from 'next/server'
import { creatorRevenue } from '@/lib/creatorWallet'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const query = new URL(request.url).searchParams
  const days = query.get('days') ?? '30', currency = query.get('currency') ?? 'usd'
  if (!['30', '90'].includes(days) || !/^[a-z]{3}$/.test(currency)) return respond({ error: 'Invalid revenue filter' }, 400)
  const now = Date.now()
  const { data, error } = await account.supabase.from('creator_commerce_events')
    .select('id,event_type,amount,currency,status,created_at').eq('creator_id', account.userId)
    .gte('created_at', new Date(now - 90 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(1001)
  if (error) return respond({ error: 'Revenue records couldn’t load' }, 503)
  const currencies = [...new Set(data.map(row => typeof row.currency === 'string' ? row.currency.toLowerCase() : '').filter(code => /^[a-z]{3}$/.test(code)))].sort()
  return respond({ ...creatorRevenue(data.slice(0, 1000), currency, days === '90' ? 90 : 30, now), currency, currencies, limited: data.length > 1000 })
}
