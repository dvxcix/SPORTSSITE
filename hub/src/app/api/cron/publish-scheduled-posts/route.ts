import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export const maxDuration = 30
export const revalidate = 0

async function run(request: Request) {
  const authError = requireCronAuth(request); if (authError) return authError
  const admin = createAdminClient()
  let query = admin.from('creator_scheduled_posts').select('id,group_id,creator_id,content,post_type,sport,visibility,media_urls,attempts').eq('status', 'scheduled').lte('scheduled_for', new Date().toISOString()).order('scheduled_for').limit(50)
  if (MLB_HIBERNATING) query = query.or('sport.is.null,sport.not.ilike.MLB')
  const { data: due, error } = await query
  if (error) return safeApiError('publish-scheduled-posts', error)
  let published = 0; let failed = 0
  for (const item of due ?? []) {
    const { data: claimed, error: claimError } = await admin.from('creator_scheduled_posts').update({ status: 'publishing', attempts: item.attempts + 1 }).eq('id', item.id).eq('status', 'scheduled').select('id').maybeSingle()
    if (claimError) return safeApiError('publish-scheduled-posts-claim', claimError)
    if (!claimed) continue
    // Legacy unbound premium drafts stay blocked; a member community supplies the access rule.
    if (item.visibility === 'premium' && !item.group_id) {
      const { error: blockError } = await admin.from('creator_scheduled_posts').update({ status: 'failed', last_error: 'Choose a member community before publishing premium content.' }).eq('id', item.id).eq('status', 'publishing')
      if (blockError) return safeApiError('publish-scheduled-posts-access', blockError)
      failed += 1; continue
    }
    const { data: post, error: postError } = await admin.from('posts').insert({ author_id: item.creator_id, group_id: item.group_id || null, content: item.content, post_type: item.post_type, sport: item.sport, visibility: item.group_id ? 'public' : item.visibility, media_urls: item.media_urls ?? [], pick_data: null }).select('id').single()
    if (postError || !post) {
      failed += 1
      const { error: retryError } = await admin.from('creator_scheduled_posts').update({ status: item.attempts + 1 >= 5 ? 'failed' : 'scheduled', last_error: 'Publication failed. Retry queued.' }).eq('id', item.id).eq('status', 'publishing')
      if (retryError) return safeApiError('publish-scheduled-posts-retry', retryError)
      continue
    }
    published += 1
    const { error: finalizeError } = await admin.from('creator_scheduled_posts').update({ status: 'published', published_post_id: post.id, last_error: null }).eq('id', item.id).eq('status', 'publishing')
    if (finalizeError) return safeApiError('publish-scheduled-posts-finalize', finalizeError)
  }
  return NextResponse.json({ ok: failed === 0, due: due?.length ?? 0, published, failed }, { status: failed ? 503 : 200 })
}

export const GET = withPipelineHealth('publish-scheduled-posts', run)
