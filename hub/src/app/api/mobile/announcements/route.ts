import { NextResponse } from 'next/server'
import { isAccountId } from '@/lib/blocks'
import { nativeAnonymousClient } from '@/lib/nativeSocial'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const bannerFields = 'message,bg_color,text_color,is_active,dismissible,link_url,link_label,updated_at'
const releaseFields = 'id,title,description,how_to_use,screenshot_urls,audience_tier,created_at,updated_at'

export async function GET(request: Request) {
  const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
  if (account?.error) return account.error
  try {
    const bannerRead = nativeAnonymousClient().from('site_banner').select(bannerFields).eq('id', 1).eq('is_active', true).maybeSingle()
    if (!account) {
      const { data, error } = await bannerRead
      return error ? reply({ error: 'Site announcements are unavailable' }, 503) : reply({ banner: data, entries: [] })
    }
    // Select through the same RLS audience and membership gates as the web popup.
    const [banner, entries, dismissals] = await Promise.all([
      bannerRead,
      account.supabase.from('changelog_entries').select(releaseFields).eq('is_active', true)
        .order('created_at', { ascending: true }).order('id', { ascending: true }),
      account.supabase.from('changelog_dismissals').select('entry_id').eq('user_id', account.userId),
    ])
    if (banner.error || entries.error || dismissals.error) return reply({ error: 'Site announcements are unavailable' }, 503)
    const dismissed = new Set((dismissals.data ?? []).map(item => item.entry_id))
    return reply({ banner: banner.data, entries: (entries.data ?? []).filter(entry => !dismissed.has(entry.id)) })
  } catch {
    return reply({ error: 'Site announcements are unavailable' }, 503)
  }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const body: { entryId?: unknown } | null = await request.json().catch(() => null)
  const id = body?.entryId
  if (typeof id !== 'string' || !isAccountId(id)) return reply({ error: 'Choose a valid release' }, 400)
  const access = await account.supabase.from('changelog_entries').select('id').eq('id', id).eq('is_active', true).maybeSingle()
  if (access.error) return reply({ error: 'Release access could not be checked' }, 503)
  if (!access.data) return reply({ error: 'Release is unavailable' }, 404)
  const { error } = await account.supabase.from('changelog_dismissals').upsert({ entry_id: id, user_id: account.userId },
    { onConflict: 'entry_id,user_id', ignoreDuplicates: true })
  if (error) return reply({ error: 'Release dismissal could not be saved' }, 503)
  return reply({ dismissed: id })
}
