import { NextResponse } from 'next/server'
import { isReportReason } from '@/lib/reportReasons'
import type { SupabaseClient } from '@supabase/supabase-js'
import { POST_WITH_AUTHOR, type FeedPost } from '@/lib/feedQuery'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { notifyMentions } from '@/lib/mentions'
import { notify } from '@/lib/notify'
import { attachUserReactions } from '@/lib/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { isGuestVisible, mobilePost, nativeAnonymousClient } from '@/lib/nativeSocial'

type Context = { params: Promise<{ id: string }> }
type VisiblePost = FeedPost & { group_id?: string | null }
const headers = { 'Cache-Control': 'private, no-store' }
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const problem = (error: string, status: number) => response({ error }, status)
const commentFields = 'id,content,author_id,parent_id,created_at,updated_at,reaction_count,author:users(username,display_name,avatar_url)'

async function visiblePost(client: SupabaseClient, postId: string, userId?: string) {
  const [postResult, blockIds, showMlb] = await Promise.all([
    client.from('posts').select(POST_WITH_AUTHOR).eq('id', postId).maybeSingle(),
    userId ? getBlockedEitherWayIds(client, userId) : [],
    canViewMlb(client, userId),
  ])
  if (postResult.error) throw new Error('Post lookup failed')
  const blocked = new Set(blockIds)
  const post = postResult.data as unknown as VisiblePost | null
  if (!post || !userId && !isGuestVisible(post) || blocked.has(post.author_id) || !showMlb && post.sport?.toUpperCase() === 'MLB') {
    return { post: null, blocked }
  }
  return { post, blocked }
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params
  if (!isAccountId(id)) return problem('Post unavailable', 404)
  try {
    const account = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (account?.error) return account.error
    const client = account?.supabase ?? nativeAnonymousClient()
    const { post, blocked } = await visiblePost(client, id, account?.userId)
    if (!post) return problem('Post unavailable', 404)

    const [rows, reactions, [enriched]] = await Promise.all([
      client.from('comments').select(commentFields).eq('post_id', id)
        .order('created_at', { ascending: true }).order('id').limit(1000),
      account ? client.from('reactions').select('target_id').eq('target_type', 'comment').eq('user_id', account.userId).eq('emoji', '❤️') : null,
      attachUserReactions([post], account?.userId, client, true),
    ])
    if (rows.error || reactions?.error) throw new Error('Comments unavailable')
    const liked = new Set(reactions?.data?.map(item => item.target_id))
    const comments = (rows.data ?? []).filter(item => !blocked.has(item.author_id)).map(item => ({
      id: item.id, text: item.content, authorId: item.author_id, parentId: item.parent_id,
      createdAt: item.created_at, editedAt: item.updated_at, reactionCount: item.reaction_count,
      liked: liked.has(item.id), author: (() => {
        const author = Array.isArray(item.author) ? item.author[0] : item.author
        return author ? { username: author.username, displayName: author.display_name, avatarUrl: author.avatar_url } : null
      })(),
    }))
    return response({ post: mobilePost(enriched), comments })
  } catch {
    return problem('Post is temporarily unavailable', 503)
  }
}

export async function POST(request: Request, context: Context) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { id } = await context.params
  if (!isAccountId(id)) return problem('Post unavailable', 404)

  try {
    const raw = await request.text()
    if (raw.length > 8192) return problem('Invalid post action', 400)
    let action: Record<string, unknown>
    try { action = JSON.parse(raw) } catch { return problem('Invalid post action', 400) }
    if (!action || Array.isArray(action) || typeof action !== 'object') return problem('Invalid post action', 400)
    const { supabase, userId } = account
    const { post, blocked } = await visiblePost(supabase, id, userId)
    if (!post) return problem('Post unavailable', 404)
    const isPrivate = post.visibility === 'private'
    const link = `/posts/${id}`
    const notifications = { actorId: userId, link, targetId: id, targetType: 'post' }

    switch (action.kind) {
      case 'post-edit':
      case 'post-delete': {
        if (post.author_id !== userId) return problem('Only the author can change this post', 403)
        const current = { id, author_id: userId }
        const content = typeof action.text === 'string' ? action.text.trim() : ''
        if (action.kind === 'post-edit') {
          const editable = Date.parse(post.created_at) + 600_000
          if (!Number.isFinite(editable) || editable <= Date.now()) return problem('This post can no longer be edited', 403)
          if (typeof action.text !== 'string' || content.length > 500 || (!content && post.post_type === 'text' && !post.media_urls?.length)) {
            return problem('Check your post text', 400)
          }
        }
        const result = action.kind === 'post-delete' ? await supabase.from('posts').delete().match(current).select('id')
          : await supabase.from('posts').update({ content, updated_at: new Date().toISOString() }).match(current).select('id')
        if (result.error || result.data?.length !== 1) return problem('Post change could not be saved', 409)
        break
      }
      case 'post-hide':
      case 'author-mute': {
        if (post.author_id === userId) return problem('Use your own post actions', 400)
        const target_type = action.kind === 'post-hide' ? 'post' : 'author'
        const target_id = target_type === 'post' ? id : post.author_id
        const result = await supabase.from('feed_suppressions').insert({ target_type, target_id, user_id: userId })
        if (result.error && result.error.code !== '23505') return problem('Feed preference could not be saved', 503)
        break
      }
      case 'post-report': {
        const details = typeof action.text === 'string' ? action.text.trim() : ''
        if (post.author_id === userId || !isReportReason(action.reason) || details.length > 2000) return problem('Check your report', 400)
        const result = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'post', target_id: id,
          reason: action.reason, details: details || null, status: 'pending' })
        if (result.error) return problem('Report could not be submitted', 503)
        break
      }
      case 'react': {
        const emoji = typeof action.emoji === 'string' ? action.emoji.trim() : ''
        if (!emoji || emoji.length > 32 || typeof action.enabled !== 'boolean') return problem('Invalid reaction', 400)
        const fields = { user_id: userId, target_id: id, target_type: 'post', emoji }
        const mutation = action.enabled
          ? await supabase.from('reactions').insert(fields)
          : await supabase.from('reactions').delete().match(fields)
        if (mutation.error && mutation.error.code !== '23505') return problem('Reaction not saved', 403)
        if (action.enabled && !mutation.error && !isPrivate) {
          const rate = await consumeServerRateLimit(userId, 'reaction_notification', 300, 3600).catch(() => null)
          if (rate?.allowed) {
            await createAdminClient().rpc('notify_reaction_server', { p_actor_id: userId, p_post_id: id, p_emoji: emoji })
          }
        }
        break
      }
      case 'repost':
      case 'bookmark': {
        if (typeof action.enabled !== 'boolean' || action.kind === 'repost' && isPrivate) return problem('Invalid post action', 400)
        const fields = { user_id: userId, post_id: id }
        const table = action.kind === 'bookmark' ? 'bookmarks' : 'reposts'
        const mutation = action.enabled
          ? await supabase.from(table).insert(fields)
          : await supabase.from(table).delete().match(fields)
        if (mutation.error && mutation.error.code !== '23505') return problem('Post action was not saved', 403)
        if (table === 'reposts' && action.enabled && !mutation.error) {
          await notify(supabase, { ...notifications, userId: post.author_id, type: 'repost', message: 'reposted your pick' })
        }
        break
      }
      case 'vote': {
        const option = action.option
        if (!Number.isInteger(option) || Number(option) < 0 || Number(option) >= (post.poll_data?.options.length ?? 0)) {
          return problem('Invalid poll choice', 400)
        }
        const rate = await consumeServerRateLimit(userId, 'poll_vote', 120, 3600)
        if (!rate.available) return problem('Voting is unavailable', 503)
        if (!rate.allowed) return problem('Voting limit reached', 429)
        const { error } = await createAdminClient().rpc('cast_poll_vote_server', { p_post_id: id, p_user_id: userId, p_option_index: option })
        if (error) return problem('Vote could not be recorded', 400)
        break
      }
      case 'comment': {
        const row = typeof action.id === 'string' && isAccountId(action.id) ? action.id : null
        const text = typeof action.text === 'string' ? action.text.trim() : ''
        const parent = typeof action.parent === 'string' && isAccountId(action.parent) ? action.parent : null
        if (!row || !text || text.length > 1000 || action.parent != null && !parent) return problem('Check your comment', 400)
        let recipient = post.author_id
        if (parent) {
          const parentResult = await supabase.from('comments').select('id,author_id').eq('post_id', id).eq('id', parent).maybeSingle()
          if (parentResult.error) return problem('Comment could not be checked', 503)
          if (!parentResult.data || blocked.has(parentResult.data.author_id)) return problem('Comment unavailable', 404)
          recipient = parentResult.data.author_id
        }
        const values = { id: row, post_id: id, author_id: userId, parent_id: parent, content: text }
        const insert = await supabase.from('comments').insert(values)
        if (insert.error?.code === '23505') {
          const check = supabase.from('comments').select('id').eq('id', row).eq('post_id', id).eq('author_id', userId).eq('content', text)
          const match = await (parent ? check.eq('parent_id', parent) : check.is('parent_id', null)).maybeSingle()
          if (match.error || !match.data) return problem('Comment could not be verified', 409)
        } else if (insert.error) {
          return problem('Comment was not saved', 403)
        } else if (!isPrivate) {
          await Promise.allSettled([
            notify(supabase, { ...notifications, userId: recipient, type: 'comment', message: parent ? 'replied to your comment' : 'commented on your post' }),
            notifyMentions(supabase, userId, text, link, id, parent ? 'a reply' : 'a comment', [recipient]),
          ])
        }
        break
      }
      case 'comment-reaction':
      case 'comment-edit':
      case 'comment-delete': {
        const commentId = typeof action.id === 'string' && isAccountId(action.id) ? action.id : null
        if (!commentId) return problem('Invalid comment', 400)
        const original = await supabase.from('comments').select('id,author_id').eq('post_id', id).eq('id', commentId).maybeSingle()
        if (original.error) return problem('Comment could not be checked', 503)
        if (!original.data || blocked.has(original.data.author_id)) return problem('Comment unavailable', 404)
        if (action.kind === 'comment-reaction') {
          if (typeof action.enabled !== 'boolean') return problem('Invalid reaction', 400)
          const fields = { user_id: userId, target_id: commentId, target_type: 'comment', emoji: '❤️' }
          const result = action.enabled ? await supabase.from('reactions').insert(fields)
            : await supabase.from('reactions').delete().match(fields)
          if (result.error && result.error.code !== '23505') return problem('Reaction not saved', 403)
        } else {
          if (original.data.author_id !== userId) return problem('Comment cannot be edited', 403)
          const text = typeof action.text === 'string' ? action.text.trim() : ''
          if (action.kind === 'comment-edit' && (!text || text.length > 1000)) return problem('Check your comment', 400)
          const scope = { id: commentId, post_id: id, author_id: userId }
          const result = action.kind === 'comment-delete' ? await supabase.from('comments').delete().match(scope).select('id')
            : await supabase.from('comments').update({ content: text, updated_at: new Date().toISOString() }).match(scope).select('id')
          if (result.error || result.data?.length !== 1) return problem('Comment could not be changed', 409)
        }
        break
      }
      default: return problem('Invalid post action', 400)
    }
    return response({ ok: true })
  } catch {
    return problem('This action could not be confirmed. Reload the post to check.', 503)
  }
}
