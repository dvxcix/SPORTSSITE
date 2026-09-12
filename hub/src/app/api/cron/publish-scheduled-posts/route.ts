import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'

export const maxDuration = 30
export const revalidate = 0

async function run(request: Request) {
  const authError = requireCronAuth(request); if (authError) return authError
  const admin = createAdminClient()
  const { data: due, error } = await admin.from('creator_scheduled_posts').select('id,creator_id,content,post_type,sport,visibility,media_urls,attempts').eq('status', 'scheduled').lte('scheduled_for', new Date().toISOString()).order('scheduled_for').limit(50)
  if (error) return safeApiError('publish-scheduled-posts', error)
  let published = 0; let failed = 0
  for (const item of due ?? []) {
    const { data: claimed } = await admin.from('creator_scheduled_posts').update({ status: 'publishing', attempts: item.attempts + 1 }).eq('id', item.id).eq('status', 'scheduled').select('id').maybeSingle()
    if (!claimed) continue
    const { data: post, error: postError } = await admin.from('posts').insert({ author_id: item.creator_id, content: item.content, post_type: item.post_type, sport: item.sport, visibility: item.visibility, media_urls: item.media_urls ?? [], pick_data: null }).select('id').single()
    if (postError || !post) {
      failed += 1
      await admin.from('creator_scheduled_posts').update({ status: item.attempts + 1 >= 5 ? 'failed' : 'scheduled', last_error: 'Publication failed. Retry queued.' }).eq('id', item.id).eq('status', 'publishing')
      continue
    }
    published += 1
    await admin.from('creator_scheduled_posts').update({ status: 'published', published_post_id: post.id, last_error: null }).eq('id', item.id).eq('status', 'publishing')
  }
  return NextResponse.json({ ok: true, due: due?.length ?? 0, published, failed })
}

export const GET = withPipelineHealth('publish-scheduled-posts', run)
