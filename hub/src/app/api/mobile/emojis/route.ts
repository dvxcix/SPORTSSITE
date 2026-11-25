import { NextResponse } from 'next/server'
import { EMOJI_CATEGORIES } from '@/lib/emojiCatalog'
import { nativeAnonymousClient } from '@/lib/nativeSocial'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
  if (account?.error) return account.error
  const client = account?.supabase ?? nativeAnonymousClient()
  const values = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('custom_emojis').select('code,image_url,category:custom_emoji_categories(name)')
      .order('code').range(offset, offset + 499)
    if (error) return NextResponse.json({ error: 'Custom emoji could not be loaded' }, { status: 503, headers })
    values.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  return NextResponse.json({ emojis: values, standard: EMOJI_CATEGORIES }, { headers })
}
