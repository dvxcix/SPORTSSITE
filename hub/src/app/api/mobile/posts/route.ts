import { NextResponse } from 'next/server'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { notifyMentions } from '@/lib/mentions'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'

const headers = { 'Cache-Control': 'private, no-store' }
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const sports = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'CFB', 'CBB']
const durations = [1, 6, 24, 48, 72]

function invalid() {
  return NextResponse.json({ error: 'Check your post and try again' }, { status: 400, headers })
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account

  let value: unknown
  try {
    const json = await request.text()
    if (json.length > 8192) return invalid()
    value = JSON.parse(json)
  } catch {
    return invalid()
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['id', 'content', 'kind', 'sport', 'visibility', 'spoiler', 'poll', 'image'].includes(key))) return invalid()

  const { id, content, kind, sport, visibility, spoiler, poll, image } = value as Record<string, unknown>
  const media = image == null ? null : isOwnedNativeMedia(image, userId, 'posts') ? image : null
  if (image != null && !media) return invalid()
  if (typeof id !== 'string' || !uuid.test(id) || typeof content !== 'string' || content.length > 500 ||
      (kind !== 'text' && kind !== 'analysis' && kind !== 'poll') ||
      (sport !== null && (typeof sport !== 'string' || !sports.includes(sport))) ||
      (visibility !== 'public' && visibility !== 'followers') || typeof spoiler !== 'boolean') return invalid()
  if (sport === 'MLB' && !await canViewMlb(supabase, userId)) {
    return NextResponse.json({ error: 'That sport is unavailable' }, { status: 403, headers })
  }

  let pollData: { options: { text: string; votes: number }[]; ends_at: string } | null = null
  if (kind === 'poll') {
    if (!poll || typeof poll !== 'object' || Array.isArray(poll) ||
        !('options' in poll) || !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 4 ||
        !('duration' in poll) || typeof poll.duration !== 'number' || !durations.includes(poll.duration) ||
        !poll.options.every((option): option is string => typeof option === 'string' && option.trim().length > 0 && option.length <= 80)) {
      return invalid()
    }
    pollData = {
      options: poll.options.map(text => ({ text: text.trim(), votes: 0 })),
      ends_at: new Date(Date.now() + poll.duration * 3600 * 1000).toISOString(),
    }
  } else if ((!content.trim() && !media) || poll != null) return invalid()

  const draft = {
    id, author_id: userId, content: content.trim(), post_type: kind, sport, visibility,
    is_spoiler: spoiler, group_id: null, page_id: null, pick_data: null, poll_data: pollData, media_urls: media ? [media] : [],
  }
  const { data, error } = await supabase.from('posts').insert(draft).select('id').single()
  if (error?.code === '23505') {
    const { data: existing, error: readError } = await supabase.from('posts')
      .select('id,content,post_type,sport,visibility,is_spoiler,group_id,page_id,poll_data,media_urls,created_at')
      .eq('id', id).eq('author_id', userId).maybeSingle()
    if (readError) return NextResponse.json({ error: 'Could not verify the posted draft' }, { status: 503, headers })
    const samePoll = pollData
      ? JSON.stringify(pollData.options.map(option => option.text)) === JSON.stringify(existing?.poll_data?.options?.map((option: { text: string }) => option.text))
        && Math.abs(Date.parse(existing?.poll_data?.ends_at) - Date.parse(existing?.created_at) -
          Number((poll as { duration: number }).duration) * 3600 * 1000) < 60_000
      : !existing?.poll_data
    if (!existing || existing.content !== draft.content || existing.post_type !== kind ||
        existing.sport !== sport || existing.visibility !== visibility || existing.is_spoiler !== spoiler ||
        existing.group_id !== null || existing.page_id !== null || (existing.media_urls?.[0] ?? null) !== media || !samePoll) {
      return NextResponse.json({ error: 'This draft no longer matches the saved post. Check the feed before trying again.' }, { status: 409, headers })
    }
    return NextResponse.json({ id: existing.id }, { headers })
  }
  if (error || !data) return NextResponse.json({ error: 'The post could not be saved' }, { status: 503, headers })

  // Mentions are a best-effort effect of the original insert, never of a retry.
  await notifyMentions(supabase, userId, draft.content, `/posts/${data.id}`, data.id, 'a post').catch(() => undefined)
  return NextResponse.json({ id: data.id }, { status: 201, headers })
}
