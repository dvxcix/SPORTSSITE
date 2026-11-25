import { NextResponse } from 'next/server'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
const reportStatus = ['pending', 'actioned', 'dismissed']
const reportTypes = ['post', 'user', 'comment', 'blog', 'event', 'page']
const applicationStatus = ['pending', 'approved', 'rejected']
const deletionStatus = ['pending', 'reviewing', 'scheduled', 'blocked', 'canceled', 'completed']

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return respond({ error: 'Sign in required' }, 401)
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { admin, user } = actor
  const input = new URL(request.url).searchParams
  const queue = input.get('queue'), status = input.get('status'), kind = input.get('kind'), page = Number(input.get('page') ?? '0')
  if (!Number.isInteger(page) || page < 0 || page > 200 || kind && !reportTypes.includes(kind)) return respond({ error: 'Invalid filters' }, 400)
  const limit = 40, from = page * limit, to = from + limit

  if (queue === 'reports' && (!status || reportStatus.includes(status))) {
    let query = admin.from('reports').select('id,target_type,target_id,status,reason,details,reviewed_at,resolution_note,created_at,person:users!reports_reporter_id_fkey(username,display_name,avatar_url)')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    if (status) query = query.eq('status', status)
    if (kind) query = query.eq('target_type', kind)
    const { data, error } = await query
    if (error) return respond({ error: 'Reports could not be loaded' }, 503)
    const rows = data.slice(0, limit)
    const postIds = rows.filter(row => row.target_type === 'post').map(row => row.target_id)
    const commentIds = rows.filter(row => row.target_type === 'comment').map(row => row.target_id)
    const [{ data: comments }, { data: profiles }] = await Promise.all([
      commentIds.length ? admin.from('comments').select('id,post_id,content').in('id', commentIds) : { data: [] },
      rows.some(row => row.target_type === 'user') ? admin.from('users').select('id,username,display_name').in('id', rows.filter(row => row.target_type === 'user').map(row => row.target_id)) : { data: [] },
    ])
    for (const item of comments ?? []) postIds.push(item.post_id)
    const { data: posts } = postIds.length ? await admin.from('posts').select('id,content').in('id', [...new Set(postIds)])
      .or(`visibility.neq.private,author_id.eq.${user.id}`) : { data: [] }
    const result = rows.map(row => {
      const comment = row.target_type === 'comment' ? comments?.find(item => item.id === row.target_id) : undefined
      const post = posts?.find(item => item.id === (comment?.post_id ?? row.target_id))
      const profile = row.target_type === 'user' ? profiles?.find(item => item.id === row.target_id) : undefined
      return { ...row, preview: post ? (comment?.content ?? post.content)?.slice(0, 180) ?? null : profile?.display_name ?? profile?.username ?? null,
        linked_post_id: post?.id ?? null, linked_username: profile?.username ?? null }
    })
    return respond({ rows: result, hasMore: data.length > limit })
  }

  if (queue === 'applications' && (!status || applicationStatus.includes(status))) {
    let query = admin.from('creator_applications').select('id,user_id,status,why_creator,rejection_reason,created_at,reviewed_at,person:users!creator_applications_user_id_fkey(username,display_name,avatar_url)')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return respond({ error: 'Applications could not be loaded' }, 503)
    return respond({ rows: data.slice(0, limit), hasMore: data.length > limit })
  }

  if (queue === 'deletions' && (!status || deletionStatus.includes(status))) {
    let query = admin.from('account_deletion_requests').select('id,status,reason,requested_at,scheduled_for,resolution_note,person:users!account_deletion_requests_user_id_fkey(username,display_name,email,tier,account_type,creator_commerce_status)')
      .order('requested_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return respond({ error: 'Deletion requests could not be loaded' }, 503)
    return respond({ rows: data.slice(0, limit), hasMore: data.length > limit })
  }
  return respond({ error: 'Invalid queue or status' }, 400)
}
