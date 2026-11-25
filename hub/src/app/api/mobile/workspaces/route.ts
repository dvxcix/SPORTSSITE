import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { createAdminClient } from '@/lib/supabase/admin'
import { TRACKED_PIPELINES } from '@/lib/pipelineRegistry'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { hasApprovedCreatorAccess } from '@/lib/creator'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const workspace = new URL(request.url).searchParams.get('workspace')
  if (workspace !== 'studio' && workspace !== 'admin') return respond({ error: 'Unknown workspace' }, 400)
  const { supabase, userId } = account
  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('users').select('account_type,display_name,username,creator_commerce_status,follower_count')
    .eq('id', userId).maybeSingle()
  if (error || !profile) return respond({ error: 'Workspace access could not be verified' }, 503)
  if (workspace === 'admin') {
    if (profile.account_type !== 'admin') return respond({ error: 'Admin access required' }, 403)
    const day = new Date(Date.now() - 86_400_000).toISOString()
    const [users, posts, groups, reports, applications, deletions, webhooks, delivery, runs] = await Promise.all([
      admin.from('users').select('id', { head: true, count: 'exact' }),
      admin.from('posts').select('id', { head: true, count: 'exact' }).neq('visibility', 'private'),
      admin.from('groups').select('id', { head: true, count: 'exact' }),
      admin.from('reports').select('id', { head: true, count: 'exact' }).eq('status', 'pending'),
      admin.from('creator_applications').select('id', { head: true, count: 'exact' }).eq('status', 'pending'),
      admin.from('account_deletion_requests').select('id', { head: true, count: 'exact' }).in('status', ['pending', 'reviewing', 'scheduled', 'blocked']),
      admin.from('provider_webhook_events').select('*', { head: true, count: 'exact' }).eq('status', 'failed'),
      admin.from('notification_delivery_attempts').select('*', { head: true, count: 'exact' }).eq('status', 'failed').gte('attempted_at', day),
      admin.from('pipeline_runs').select('job_name,status,started_at').order('started_at', { ascending: false }).limit(400),
    ])
    const count = (result: { error: unknown; count: number | null }) => result.error ? null : result.count
    const pipelines = TRACKED_PIPELINES.map(pipeline => {
      const latest = runs.data?.find(run => run.job_name === pipeline.name)
      const age = latest ? (Date.now() - Date.parse(latest.started_at)) / 60_000 : Infinity
      const timedOut = latest?.status === 'running' && age > Math.min(10, pipeline.staleAfterMinutes)
      return { id: pipeline.name, label: pipeline.label, at: latest?.started_at,
        status: !latest ? 'unknown' : timedOut ? 'timed_out' : latest.status === 'failed' ? 'failed' :
          age > pipeline.staleAfterMinutes ? 'stale' : latest.status }
    })
    return respond({ counts: { users: count(users), posts: count(posts), groups: count(groups) }, pipelines,
      queues: { reports: count(reports), applications: count(applications), deletions: count(deletions), webhooks: count(webhooks), delivery: count(delivery) } })
  }

  const { data: ownedGroup, error: groupError } = await supabase.from('groups').select('id').eq('owner_id', userId).limit(1).maybeSingle()
  if (groupError) return respond({ error: 'Creator Studio could not refresh' }, 503)
  const studioAllowed = Boolean(ownedGroup) || await hasApprovedCreatorAccess(supabase, userId, profile.account_type).catch(() => null)
  if (studioAllowed === null) return respond({ error: 'Creator Studio could not refresh' }, 503)
  if (!studioAllowed) {
    return respond({ error: 'Creator access required' }, 403)
  }
  const [offers, groups, memberships, scheduled, storefront] = await Promise.all([
    supabase.from('creator_products').select('id,title,description,price,currency,status,billing_period_days')
      .eq('creator_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('groups').select('id,name,description,sport,avatar_url,member_count,access_type').eq('owner_id', userId)
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('creator_entitlements').select('id,status,current_period_end').eq('creator_id', userId).limit(1000),
    supabase.from('creator_scheduled_posts').select('id,group_id,content,post_type,visibility,scheduled_for,status,sport,updated_at').eq('creator_id', userId)
      .in('status', ['draft', 'scheduled', 'failed']).order('scheduled_for').limit(50),
    admin.from('creator_storefronts').select('name,status,logo_url').eq('creator_id', userId).maybeSingle(),
  ])
  if ([offers, groups, memberships, scheduled, storefront].some(result => result.error)) return respond({ error: 'Creator Studio could not refresh' }, 503)
  const canShowMlb = !MLB_HIBERNATING || profile.account_type === 'admin'
  const visible = (row: { sport: string | null }) => canShowMlb || row.sport?.trim().toUpperCase() !== 'MLB'
  return respond({ displayName: profile.display_name ?? profile.username, paymentStatus: profile.creator_commerce_status, allowMlb: canShowMlb,
    followers: profile.follower_count, activeMembers: memberships.data?.length === 1000 ? null :
      (memberships.data ?? []).filter(hasCurrentCreatorAccess).length,
    offers: offers.data ?? [], groups: groups.data?.filter(visible) ?? [],
    drafts: scheduled.data?.filter(visible) ?? [], storefront: storefront.data })
}
