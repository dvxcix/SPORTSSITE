'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { useMotionValue, motion, useMotionTemplate } from 'motion/react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/lib/notify'
import { notifyMentions } from '@/lib/mentions'
import { useAuth } from '@/context/AuthContext'
import { MessageCircle, Repeat2, TrendingUp, Bookmark, Share2, MoreHorizontal, Flag, Link2, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import type { Post } from '@/lib/supabase/types'
import { ReportModal } from './ReportModal'
import { ShareImageModal } from './ShareImageModal'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { sportLogoUrl } from '@/lib/sportLogos'
import { fmtUsd } from '@/lib/parlayCalc'
import { LinkifiedText } from './LinkifiedText'
import { EmojiPicker } from './EmojiPicker'
import { Tooltip } from '@/components/ui/tooltip-card'
import { useCustomEmojis } from '@/lib/emoji'
import { UserBadges } from './UserBadges'

interface PostCardClientProps {
  post: Post & { author: { id?: string; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean; account_type?: string; pick_record?: { wins: number; losses: number } } }
  index?: number
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function PostCardClient({ post: initialPost, index = 0 }: PostCardClientProps) {
  const { user, profile } = useAuth()
  const [reactionSummary, setReactionSummary] = useState<Record<string, number>>(initialPost.reaction_summary ?? {})
  const [myReactions, setMyReactions] = useState<Set<string>>(new Set(initialPost.user_reacted_emojis ?? []))
  const customEmojis = useCustomEmojis()
  const [bookmarked, setBookmarked] = useState(initialPost.user_bookmarked ?? false)
  const [bookmarkCount, setBookmarkCount] = useState(initialPost.bookmark_count)
  const [reposted, setReposted] = useState(initialPost.user_reposted ?? false)
  const [repostCount, setRepostCount] = useState(initialPost.repost_count)
  const [commentCount, setCommentCount] = useState(initialPost.comment_count)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<{ id: string; content: string; author_id: string; author: { username: string; display_name?: string; avatar_url?: string } | null; created_at: string; updated_at: string }[]>([])
  const [commentText, setCommentText] = useState('')
  const commentInputRef = useRef<HTMLInputElement>(null)
  const [loadedComments, setLoadedComments] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [pollVoted, setPollVoted] = useState<number | null>(initialPost.user_poll_vote ?? null)
  const [pollCounts, setPollCounts] = useState<number[]>(
    (initialPost.poll_data?.options ?? []).map((o: any) => o.votes ?? 0)
  )
  const supabase = createClient()
  // The Supabase client caches/reuses a RealtimeChannel by its topic string
  // — two components subscribing with the SAME name collide (the second
  // .on() call throws "cannot add postgres_changes callbacks... after
  // subscribe()", crashing the page). The same post can now render more
  // than once on a page since reposts were merged into feeds/profiles
  // (original + one repost entry per reposter), so a channel keyed only on
  // post id was no longer safe — this instance id makes it unique per
  // mounted card regardless of how many times the same post appears.
  const instanceId = useId()

  // Live-graded pick_data — the grade-live-picks cron flips a leg to
  // win/loss the moment its stat threshold is crossed, mid-game, not just
  // once the game ends. Subscribing here means anyone with this card open
  // sees the ✓ appear without reloading. The same subscription also keeps
  // engagement counts live: they're seeded from the server-rendered
  // snapshot and never updated again otherwise, so a card left open would
  // keep showing a stale count while OTHER users liked/reposted/commented/
  // bookmarked in the background (visible symptom: opening a post's
  // comments and finding more comments there than the badge showed).
  const [pickData, setPickData] = useState(initialPost.pick_data)
  const [content, setContent] = useState(initialPost.content)
  const [isDeleted, setIsDeleted] = useState(false)
  const [isEditingPost, setIsEditingPost] = useState(false)
  const [editPostText, setEditPostText] = useState(initialPost.content ?? '')
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const post = { ...initialPost, pick_data: pickData, content }
  const isOwnPost = !!user && user.id === post.author_id
  // Edit window matches the "edit within 10 minutes" behavior the rest of
  // the app doesn't otherwise enforce anywhere — delete has no such limit,
  // same as every mainstream social app (X included).
  const canEditPost = isOwnPost && Date.now() - new Date(initialPost.created_at).getTime() < 10 * 60 * 1000

  useEffect(() => {
    const channel = supabase
      .channel(`post-live:${initialPost.id}:${instanceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts', filter: `id=eq.${initialPost.id}` },
        (payload: any) => {
          if (payload.new?.pick_data) setPickData(payload.new.pick_data)
          if (payload.new?.reaction_summary) setReactionSummary(payload.new.reaction_summary)
          if (typeof payload.new?.repost_count === 'number') setRepostCount(payload.new.repost_count)
          if (typeof payload.new?.comment_count === 'number') setCommentCount(payload.new.comment_count)
          if (typeof payload.new?.bookmark_count === 'number') setBookmarkCount(payload.new.bookmark_count)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPost.id])

  // Mouse-following spotlight glow on hover (adapted from Aceternity's
  // CardSpotlight technique — same mask-follows-cursor idea, without its
  // three.js canvas reveal, which isn't worth the bundle weight repeated
  // across every card in a scrolling feed).
  const [isHovering, setIsHovering] = useState(false)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  function handleCardMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  const pickResult = post.pick_data?.result
  const totalPollVotes = pollCounts.reduce((a, b) => a + b, 0)
  const pollEnded = post.poll_data?.ends_at && new Date(post.poll_data.ends_at) < new Date()

  // Was a single hardcoded ❤️ toggle — now any standard or custom emoji,
  // Discord-style: a user can stack multiple different reactions on the
  // same post (👍 AND 🔥 both at once), each toggled independently.
  // reaction_summary itself is kept in sync by a DB trigger (see the
  // realtime subscription above) — this only needs to update the local
  // optimistic view instantly.
  // All three toggles below follow the same shape: apply optimistically,
  // then check the write's actual result — a prior version updated local
  // state unconditionally regardless of whether the insert/delete
  // succeeded, so a failed write (RLS denial, network blip, a duplicate
  // click racing the unique constraint) left the UI showing a state that
  // didn't match the database until the next full reload silently
  // "corrected" it. A duplicate-key error (23505) means the row already
  // existed — the end state already matches what was optimistically
  // assumed — so that's treated as success, not rolled back.
  async function toggleReaction(emoji: string) {
    if (!user) return
    const alreadyReacted = myReactions.has(emoji)
    setMyReactions(prev => {
      const next = new Set(prev)
      if (alreadyReacted) next.delete(emoji); else next.add(emoji)
      return next
    })
    setReactionSummary(prev => {
      const count = (prev[emoji] ?? 0) + (alreadyReacted ? -1 : 1)
      const next = { ...prev }
      if (count <= 0) delete next[emoji]; else next[emoji] = count
      return next
    })
    let error
    if (alreadyReacted) {
      ({ error } = await supabase.from('reactions').delete()
        .match({ user_id: user.id, target_id: post.id, target_type: 'post', emoji }))
    } else {
      ({ error } = await supabase.from('reactions').insert({ user_id: user.id, target_id: post.id, target_type: 'post', emoji }))
      if (!error) {
        // Groups consecutive same-emoji reactions on this post into one
        // notification ("X and 12 others reacted 🔥") instead of a flood
        // of individual rows — see notify_reaction() migration for why
        // this has to be a security-definer RPC rather than a plain
        // insert (grouping needs to read the recipient's own notification
        // rows, which RLS correctly blocks a different user from doing).
        await supabase.rpc('notify_reaction', {
          p_user_id: post.author_id, p_actor_id: user.id, p_post_id: post.id, p_emoji: emoji,
        })
      }
    }
    if (error && error.code !== '23505') {
      setMyReactions(prev => {
        const next = new Set(prev)
        if (alreadyReacted) next.add(emoji); else next.delete(emoji)
        return next
      })
      setReactionSummary(prev => {
        const count = (prev[emoji] ?? 0) + (alreadyReacted ? 1 : -1)
        const next = { ...prev }
        if (count <= 0) delete next[emoji]; else next[emoji] = count
        return next
      })
    }
  }

  async function toggleRepost() {
    if (!user) return
    const wasReposted = reposted
    setReposted(!wasReposted)
    setRepostCount(c => wasReposted ? c - 1 : c + 1)
    let error
    if (wasReposted) {
      ({ error } = await supabase.from('reposts').delete().match({ user_id: user.id, post_id: post.id }))
    } else {
      ({ error } = await supabase.from('reposts').insert({ user_id: user.id, post_id: post.id }))
      if (!error) {
        await notify(supabase, {
          userId: post.author_id, actorId: user.id, type: 'repost',
          message: 'reposted your pick', link: `/posts/${post.id}`, targetId: post.id, targetType: 'post',
        })
      }
    }
    if (error && error.code !== '23505') {
      setReposted(wasReposted)
      setRepostCount(c => wasReposted ? c + 1 : c - 1)
    }
  }

  async function toggleBookmark() {
    if (!user) return
    const wasBookmarked = bookmarked
    setBookmarked(!wasBookmarked)
    setBookmarkCount(c => wasBookmarked ? c - 1 : c + 1)
    const { error } = wasBookmarked
      ? await supabase.from('bookmarks').delete().match({ user_id: user.id, post_id: post.id })
      : await supabase.from('bookmarks').insert({ user_id: user.id, post_id: post.id })
    if (error && error.code !== '23505') {
      setBookmarked(wasBookmarked)
      setBookmarkCount(c => wasBookmarked ? c + 1 : c - 1)
    }
  }

  const [shareModalOpen, setShareModalOpen] = useState(false)

  // Picks/parlays get a real in-app share sheet (preview of the generated
  // PNG + Download/Copy Link/X/Reddit/Text/native-share options) instead of
  // handing off straight to the OS share dialog — see ShareImageModal.
  // Everything else (plain text, polls, image-only posts) has no "card"
  // shape to render into an image, so those keep the original bare-link
  // native-share behavior.
  function share() {
    if (!post.pick_data) {
      navigator.share?.({ url: window.location.origin + '/posts/' + post.id })
      return
    }
    setShareModalOpen(true)
  }

  async function loadComments() {
    if (loadedComments) { setShowComments(v => !v); return }
    const { data } = await supabase
      .from('comments')
      .select('id, content, author_id, created_at, updated_at, author:users(username, display_name, avatar_url)')
      .eq('post_id', post.id)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(20)
    setComments((data as unknown as typeof comments) ?? [])
    setLoadedComments(true)
    setShowComments(true)
  }

  function insertCommentEmoji(insertion: string) {
    const el = commentInputRef.current
    const start = el?.selectionStart ?? commentText.length
    const end = el?.selectionEnd ?? commentText.length
    const next = commentText.slice(0, start) + insertion + commentText.slice(end)
    setCommentText(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  async function submitComment() {
    if (!user || !commentText.trim()) return
    const text = commentText.trim()
    const { data, error } = await supabase.from('comments')
      .insert({ post_id: post.id, author_id: user.id, content: text })
      .select('id, content, author_id, created_at, updated_at, author:users(username, display_name, avatar_url)')
      .single()
    // Only clear the input / fire notifications once the comment actually
    // saved — clearing it unconditionally meant a failed submit silently
    // ate whatever the user had typed.
    if (error || !data) return
    setComments(c => [...c, data as unknown as typeof comments[0]])
    setCommentCount(c => c + 1)
    setCommentText('')
    await notify(supabase, {
      userId: post.author_id, actorId: user.id, type: 'comment',
      message: 'commented on your post', link: `/posts/${post.id}`, targetId: post.id, targetType: 'post',
    })
    await notifyMentions(supabase, user.id, text, `/posts/${post.id}`, post.id, 'a comment')
  }

  function startEditComment(c: typeof comments[0]) {
    setEditingCommentId(c.id)
    setEditText(c.content)
  }

  async function saveEditComment(id: string) {
    const text = editText.trim()
    if (!text) return
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('comments').update({ content: text, updated_at: nowIso }).eq('id', id)
    if (error) return
    setComments(cs => cs.map(c => c.id === id ? { ...c, content: text, updated_at: nowIso } : c))
    setEditingCommentId(null)
  }

  async function deleteComment(id: string) {
    if (!confirm('Delete this comment?')) return
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) return
    setComments(cs => cs.filter(c => c.id !== id))
    setCommentCount(c => Math.max(0, c - 1))
  }

  async function deletePost() {
    if (!confirm('Delete this post? This cannot be undone.')) return
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) { alert('Could not delete post — please try again.'); return }
    setIsDeleted(true)
  }

  function startEditPost() {
    setEditPostText(content ?? '')
    setIsEditingPost(true)
  }

  // Same cursor-preserving insert as the composer's — without restoring
  // focus/caret afterward, every emoji click would jump the cursor to the
  // end of the textarea instead of landing where you clicked.
  function insertAtEditCursor(insertion: string) {
    const el = editTextareaRef.current
    const start = el?.selectionStart ?? editPostText.length
    const end = el?.selectionEnd ?? editPostText.length
    const next = editPostText.slice(0, start) + insertion + editPostText.slice(end)
    setEditPostText(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  async function saveEditPost() {
    const text = editPostText.trim()
    const { error } = await supabase.from('posts').update({ content: text, updated_at: new Date().toISOString() }).eq('id', post.id)
    if (error) { alert('Could not save changes — please try again.'); return }
    setContent(text)
    setIsEditingPost(false)
  }

  async function votePoll(idx: number) {
    if (!user || pollVoted !== null) return
    const prevCounts = pollCounts
    // Optimistic bump — cast_poll_vote recomputes every option's real count
    // from the actual vote rows server-side, so this is just what shows
    // instantly; a concurrent voter elsewhere can't clobber it since the
    // RPC never trusts this client-held snapshot for the real write.
    setPollCounts(pollCounts.map((c, i) => i === idx ? c + 1 : c))
    setPollVoted(idx)
    const { data: finalVote, error } = await supabase.rpc('cast_poll_vote', { p_post_id: post.id, p_option_index: idx })
    if (error) { setPollCounts(prevCounts); setPollVoted(null); return }
    // finalVote reflects whatever's actually recorded for this user (handles
    // the rare case of a vote already existing from another tab/device).
    if (typeof finalVote === 'number' && finalVote !== idx) setPollVoted(finalVote)
  }

  const pickBorderColor = pickResult === 'win' ? 'rgba(46,213,115,0.3)' : pickResult === 'loss' ? 'rgba(255,77,106,0.3)' : 'rgba(255,184,77,0.2)'
  const pickBg = pickResult === 'win' ? 'rgba(46,213,115,0.05)' : pickResult === 'loss' ? 'rgba(255,77,106,0.05)' : 'rgba(255,184,77,0.04)'

  if (isDeleted) return null

  return (
    <>
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          transition: 'border-color 150ms',
          position: 'relative',
        }}
        onMouseMove={handleCardMouseMove}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; setIsHovering(true) }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; setIsHovering(false) }}>
        <motion.div
          style={{
            position: 'absolute', inset: 0, zIndex: 0, borderRadius: 'var(--radius)',
            pointerEvents: 'none', opacity: isHovering ? 1 : 0, transition: 'opacity 300ms',
            background: 'radial-gradient(circle, rgba(180,255,77,0.05), transparent 70%)',
            maskImage: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`,
            WebkitMaskImage: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`,
          }}
        />
        {post.reposted_by && (
          <div style={{ padding: '10px 16px 0', position: 'relative', zIndex: 1 }}>
            <Link
              href={`/profile/${post.reposted_by.username}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              <Repeat2 size={13} style={{ color: 'var(--green)' }} />
              {post.reposted_by.display_name || post.reposted_by.username} reposted
            </Link>
          </div>
        )}
        <div style={{ padding: '14px 16px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {/* Avatar */}
            <Link href={`/profile/${post.author.username}`} style={{ flexShrink: 0 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 900, color: 'var(--text-2)',
                overflow: 'hidden',
              }}>
                {post.author.avatar_url
                  ? <img src={post.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (post.author.display_name || post.author.username)[0].toUpperCase()
                }
              </div>
            </Link>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                  <Link href={`/profile/${post.author.username}`} style={{ fontWeight: 800, color: 'var(--text-1)', fontSize: 14, textDecoration: 'none' }}>
                    {post.author.display_name || post.author.username}
                  </Link>
                  <UserBadges userId={post.author.id} />
                  {post.author.is_verified && (
                    <span style={{ fontSize: 11, color: 'var(--green)' }}>✓</span>
                  )}
                  {post.author.account_type === 'creator' && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99, background: 'rgba(255,184,77,0.12)', color: 'var(--gold)', border: '1px solid rgba(255,184,77,0.25)' }}>PRO</span>
                  )}
                  <Link href={`/profile/${post.author.username}`} style={{ color: 'var(--text-3)', fontSize: 12, textDecoration: 'none' }}>
                    @{post.author.username}
                  </Link>
                  <span style={{ color: 'var(--text-4)', fontSize: 12 }}>·</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12, flexShrink: 0 }}>{timeAgo(post.created_at)}</span>
                </div>

                {/* More menu */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button onClick={() => setShowMenu(v => !v)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: '2px 4px', borderRadius: 6,
                    display: 'flex', alignItems: 'center',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                    <MoreHorizontal size={16} />
                  </button>
                  {showMenu && (
                    <div className="ss-dropdown" style={{ position: 'absolute', right: 0, top: 28, minWidth: 150, zIndex: 30 }}>
                      {isOwnPost && canEditPost && (
                        <button onClick={() => { startEditPost(); setShowMenu(false) }}
                          className="ss-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Pencil size={12} /> Edit post
                        </button>
                      )}
                      {isOwnPost && (
                        <button onClick={() => { deletePost(); setShowMenu(false) }}
                          className="ss-dropdown-item danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Trash2 size={12} /> Delete post
                        </button>
                      )}
                      {!isOwnPost && (
                        <button onClick={() => { setShowReport(true); setShowMenu(false) }}
                          className="ss-dropdown-item danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag size={12} /> Report post
                        </button>
                      )}
                      <button onClick={() => { navigator.clipboard.writeText(window.location.origin + '/posts/' + post.id); setShowMenu(false) }}
                        className="ss-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link2 size={12} /> Copy link
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sport tag — real league logo when we have one (MLB/NFL/NBA/
                  NHL/MMA), text fallback otherwise (e.g. Soccer, which has
                  no single governing-league badge to show). */}
              {post.sport && (
                <Link href={`/hashtag/${post.sport.toLowerCase()}`} style={{ textDecoration: 'none' }}>
                  {sportLogoUrl(post.sport) ? (
                    <span className="sport-tag" style={{ display: 'inline-flex', marginTop: 4, padding: '3px 8px' }}>
                      <img src={sportLogoUrl(post.sport)} alt={post.sport} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                    </span>
                  ) : (
                    <span className="sport-tag" style={{ display: 'inline-block', marginTop: 4 }}>{post.sport}</span>
                  )}
                </Link>
              )}

              {/* Content */}
              {isEditingPost ? (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    ref={editTextareaRef}
                    value={editPostText}
                    onChange={e => setEditPostText(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', minHeight: 70, resize: 'vertical', fontSize: 14, lineHeight: 1.55,
                      color: 'var(--text-1)', background: 'var(--surface-2)', border: '1px solid var(--border-2)',
                      borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, justifyContent: 'space-between' }}>
                    <EmojiPicker onSelect={insertAtEditCursor} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setIsEditingPost(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>
                        Cancel
                      </button>
                      <button onClick={saveEditPost}
                        style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#000' }}>
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              ) : post.content && (
                <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <LinkifiedText text={post.content} />
                </p>
              )}

              {/* Attached image — media_urls has existed on posts for a
                  while but nothing ever rendered it (the composer's Photo
                  button was a no-op until now, so this was effectively
                  unreachable dead data). */}
              {post.media_urls?.[0] && (
                <img
                  src={post.media_urls[0]}
                  alt=""
                  style={{ marginTop: 10, maxWidth: '100%', maxHeight: 420, borderRadius: 12, border: '1px solid var(--border)', display: 'block', objectFit: 'cover' }}
                />
              )}

              {/* Pick card — structured picks (mlb_id + prop_key) render a
                  full player card; older freeform picks (team/line/odds/book
                  text only, no player link) fall back to the simple layout
                  since there's nothing richer to show for them. */}
              {post.pick_data && (
                <div style={{
                  marginTop: 12, borderRadius: 10, border: `1px solid ${pickBorderColor}`,
                  background: pickBg, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <TrendingUp size={13} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', letterSpacing: '0.06em' }}>PICK</span>
                    {post.sport && (
                      sportLogoUrl(post.sport)
                        ? <img src={sportLogoUrl(post.sport)} alt={post.sport} style={{ width: 12, height: 12, objectFit: 'contain' }} />
                        : <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{post.sport}</span>
                    )}
                    {pickResult && pickResult !== 'pending' && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 900, color: pickResult === 'win' ? 'var(--green)' : pickResult === 'loss' ? 'var(--red)' : 'var(--text-3)' }}>
                        {pickResult === 'win' ? '✓ WIN' : pickResult === 'loss' ? '✗ LOSS' : 'PUSH'}
                      </span>
                    )}
                    {(!pickResult || pickResult === 'pending') && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>Pending</span>
                    )}
                  </div>

                  {Array.isArray(post.pick_data.legs) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {post.pick_data.legs.map((leg: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <PlayerAvatar headshot={leg.headshot_url} teamLogo={getTeamLogoUrl(leg.team)} teamAbbr={leg.team} name={leg.player_name} size={30} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{leg.player_name}</p>
                            <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                              {getTeamLogoUrl(leg.team)
                                ? <img src={getTeamLogoUrl(leg.team)} alt={leg.team} style={{ width: 12, height: 12, objectFit: 'contain' }} />
                                : <span>{leg.team}</span>}
                              · {leg.prop_label ?? leg.line}
                            </p>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                            {leg.odds != null ? (Number(leg.odds) > 0 ? `+${leg.odds}` : leg.odds) : '—'}
                          </span>
                          {leg.result && leg.result !== 'pending' && (
                            <span style={{ fontSize: 10, fontWeight: 900, color: leg.result === 'win' ? 'var(--green)' : leg.result === 'loss' ? 'var(--red)' : 'var(--text-3)' }}>
                              {leg.result === 'win' ? '✓' : leg.result === 'loss' ? '✗' : '–'}
                            </span>
                          )}
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, marginTop: 2, borderTop: '1px solid var(--border)' }}>
                        {post.pick_data.book && <BookLogo vendor={post.pick_data.book} size={16} />}
                        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace' }}>
                          {post.pick_data.combined_odds != null ? (Number(post.pick_data.combined_odds) > 0 ? `+${post.pick_data.combined_odds}` : post.pick_data.combined_odds) : ''}
                        </span>
                      </div>
                    </div>
                  ) : post.pick_data.mlb_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PlayerAvatar
                        headshot={post.pick_data.headshot_url}
                        teamLogo={getTeamLogoUrl(post.pick_data.team)}
                        teamAbbr={post.pick_data.team}
                        name={post.pick_data.player_name}
                        size={42}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{post.pick_data.player_name}</p>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>
                          {getTeamLogoUrl(post.pick_data.team)
                            ? <img src={getTeamLogoUrl(post.pick_data.team)} alt={post.pick_data.team ?? ''} style={{ width: 13, height: 13, objectFit: 'contain' }} />
                            : <span>{post.pick_data.team}</span>}
                          · {post.pick_data.prop_label ?? post.pick_data.line}
                        </p>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                          {post.pick_data.odds != null && (
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                              {Number(post.pick_data.odds) > 0 ? `+${post.pick_data.odds}` : post.pick_data.odds}
                            </span>
                          )}
                          {post.pick_data.book && <BookLogo vendor={post.pick_data.book} size={16} />}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{post.pick_data.team}</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{post.pick_data.line}</span>
                        {post.pick_data.odds && <>
                          <span style={{ color: 'var(--border-3)', fontSize: 10 }}>·</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{post.pick_data.odds}</span>
                        </>}
                        {post.pick_data.book && <>
                          <span style={{ color: 'var(--border-3)', fontSize: 10 }}>·</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{post.pick_data.book}</span>
                        </>}
                      </div>
                    </>
                  )}

                  {(post.pick_data.wager_amount != null || post.pick_data.potential_payout != null) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {post.pick_data.wager_amount != null && <span>Wager <strong style={{ color: 'var(--text-1)' }}>{fmtUsd(Number(post.pick_data.wager_amount))}</strong></span>}
                      {post.pick_data.potential_payout != null && <span>To win <strong style={{ color: 'var(--green)' }}>{fmtUsd(Number(post.pick_data.potential_payout) - Number(post.pick_data.wager_amount ?? 0))}</strong></span>}
                    </div>
                  )}
                </div>
              )}

              {/* Poll card */}
              {post.poll_data?.options && (
                <div style={{ marginTop: 12, borderRadius: 10, border: '1px solid rgba(168,85,247,0.2)', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {post.poll_data.options.map((opt: any, i: number) => {
                    const pct = totalPollVotes ? Math.round((pollCounts[i] / totalPollVotes) * 100) : 0
                    const isWinner = pollEnded && pollCounts[i] === Math.max(...pollCounts)
                    const showResults = pollVoted !== null || !!pollEnded
                    return (
                      <button key={i} onClick={() => votePoll(i)}
                        disabled={pollVoted !== null || !!pollEnded || !user}
                        style={{
                          position: 'relative', overflow: 'hidden', textAlign: 'left',
                          borderRadius: 8, padding: '8px 12px',
                          border: `1px solid ${pollVoted === i ? 'var(--purple)' : isWinner ? 'rgba(46,213,115,0.4)' : 'var(--border-2)'}`,
                          background: pollVoted === i ? 'rgba(168,85,247,0.08)' : 'transparent',
                          cursor: pollVoted !== null || !!pollEnded || !user ? 'default' : 'pointer',
                          width: '100%', transition: 'border-color 130ms',
                        }}>
                        {showResults && (
                          <div style={{
                            position: 'absolute', inset: '0', left: 0, right: `${100 - pct}%`,
                            background: pollVoted === i ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
                            transition: 'right 600ms ease',
                          }} />
                        )}
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{opt.text}</span>
                          {showResults && <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{pct}%</span>}
                        </div>
                      </button>
                    )
                  })}
                  <p style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 4 }}>
                    {totalPollVotes} vote{totalPollVotes !== 1 ? 's' : ''} ·{' '}
                    {pollEnded ? 'Poll ended' : `Ends ${new Date(post.poll_data.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </p>
                </div>
              )}

              {/* Reactions — any standard or custom emoji, Discord-style
                  pills with counts, not just a single ❤️ like button.
                  Hovering a pill lazily fetches who reacted with it
                  (ReactionNames below); clicking toggles your own. */}
              {(Object.keys(reactionSummary).length > 0 || user) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 12 }}>
                  {Object.entries(reactionSummary).sort((a, b) => b[1] - a[1]).map(([emoji, count]) => {
                    const mine = myReactions.has(emoji)
                    const custom = emoji.match(/^:([a-z0-9_]+):$/)
                    const customEmoji = custom ? customEmojis.find(e => e.code === custom[1]) : null
                    return (
                      <Tooltip key={emoji} content={<ReactionNames postId={post.id} emoji={emoji} />}>
                        <button
                          onClick={() => toggleReaction(emoji)}
                          disabled={!user}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999,
                            border: `1px solid ${mine ? 'var(--accent)' : 'var(--border)'}`,
                            background: mine ? 'var(--accent-dim)' : 'var(--surface-2)',
                            cursor: user ? 'pointer' : 'default', fontSize: 12,
                          }}>
                          {customEmoji
                            ? <img src={customEmoji.image_url} alt={emoji} style={{ width: 14, height: 14, objectFit: 'contain' }} />
                            : <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
                          }
                          <span style={{ fontWeight: 700, color: mine ? 'var(--accent)' : 'var(--text-2)' }}>{count}</span>
                        </button>
                      </Tooltip>
                    )
                  })}
                  {user && <EmojiPicker onSelect={toggleReaction} />}
                </div>
              )}

              {/* Action bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 8, marginLeft: -6 }}>
                <ActionBtn
                  icon={<MessageCircle size={15} />}
                  label={commentCount > 0 ? String(commentCount) : ''}
                  hoverBg="rgba(77,158,255,0.08)"
                  hoverColor="var(--blue)"
                  onClick={loadComments}
                />
                <ActionBtn
                  icon={<Repeat2 size={15} />}
                  label={repostCount > 0 ? String(repostCount) : ''}
                  active={reposted}
                  activeColor="var(--green)"
                  hoverBg="rgba(46,213,115,0.08)"
                  hoverColor="var(--green)"
                  onClick={toggleRepost}
                />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                  <ActionBtn
                    icon={<Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />}
                    label={bookmarkCount > 0 ? String(bookmarkCount) : ''}
                    active={bookmarked}
                    activeColor="var(--gold)"
                    hoverBg="rgba(255,184,77,0.08)"
                    hoverColor="var(--gold)"
                    onClick={toggleBookmark}
                  />
                  <ActionBtn
                    icon={<Share2 size={15} />}
                    hoverBg="var(--surface-3)"
                    onClick={share}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Comments section */}
        {showComments && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map(c => {
              const isEdited = new Date(c.updated_at).getTime() !== new Date(c.created_at).getTime()
              const isOwn = user?.id === c.author_id
              return (
                <div key={c.id} style={{ display: 'flex', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: 'var(--text-3)' }}>
                    {c.author?.avatar_url
                      ? <img src={c.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (c.author?.display_name || c.author?.username || '?')[0].toUpperCase()
                    }
                  </div>
                  <div style={{
                    flex: 1, borderRadius: 10, padding: '8px 12px',
                    background: isOwn ? 'rgba(77,158,255,0.10)' : 'var(--surface-2)',
                    border: isOwn ? '1px solid rgba(77,158,255,0.25)' : '1px solid transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{c.author?.display_name || c.author?.username}</span>
                      <UserBadges userId={c.author_id} size={12} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {timeAgo(c.created_at)}{isEdited && ` · edited ${timeAgo(c.updated_at)}`}
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        {isOwn ? (
                          <>
                            <button onClick={() => startEditComment(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Edit</button>
                            <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Delete</button>
                          </>
                        ) : user && (
                          <button onClick={() => setReportingCommentId(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Report</button>
                        )}
                      </div>
                    </div>
                    {editingCommentId === c.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), saveEditComment(c.id))}
                          className="ss-input"
                          style={{ flex: 1, fontSize: 13, padding: '5px 10px' }}
                          autoFocus
                        />
                        <button onClick={() => saveEditComment(c.id)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingCommentId(null)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}><LinkifiedText text={c.content} /></p>
                    )}
                  </div>
                </div>
              )
            })}
            {user && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: 'var(--accent)' }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (profile?.display_name || profile?.username || '?')[0].toUpperCase()
                  }
                </div>
                <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    ref={commentInputRef}
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitComment())}
                    placeholder="Write a comment…"
                    className="ss-input"
                    style={{ flex: 1, fontSize: 13, padding: '6px 12px' }}
                  />
                  <EmojiPicker onSelect={insertCommentEmoji} />
                  <button onClick={submitComment} disabled={!commentText.trim()} style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: commentText.trim() ? 'var(--accent)' : 'var(--surface-3)',
                    color: commentText.trim() ? 'var(--accent-fg)' : 'var(--text-3)',
                    border: 'none', cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                  }}>
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.article>

      {showReport && user && (
        <ReportModal targetId={post.id} targetType="post" onClose={() => setShowReport(false)} />
      )}

      {reportingCommentId && user && (
        <ReportModal targetId={reportingCommentId} targetType="comment" onClose={() => setReportingCommentId(null)} />
      )}

      {shareModalOpen && (
        <ShareImageModal postId={post.id} onClose={() => setShareModalOpen(false)} />
      )}

    </>
  )
}

// Tooltip's `content` only actually mounts once the popup becomes visible
// (see tooltip-card.tsx — it's conditionally rendered, not just CSS-hidden),
// so this only fires its fetch on first hover of THIS specific pill, not
// upfront for every emoji on every post in a feed.
function ReactionNames({ postId, emoji }: { postId: string; emoji: string }) {
  const [names, setNames] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.from('reactions')
      .select('user:users(username, display_name)')
      .eq('target_id', postId).eq('target_type', 'post').eq('emoji', emoji)
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return
        setNames((data ?? []).map((r: any) => r.user?.display_name || r.user?.username).filter(Boolean))
      })
    return () => { cancelled = true }
  }, [postId, emoji])

  if (names === null) return <span>Loading…</span>
  if (names.length === 0) return <span>No reactions yet</span>
  const shown = names.slice(0, 8)
  const extra = names.length - shown.length
  return <span>{shown.join(', ')}{extra > 0 ? ` and ${extra} more` : ''} reacted with {emoji}</span>
}

function ActionBtn({ icon, label, active, activeColor, hoverBg, hoverColor, onClick }: {
  icon: React.ReactNode; label?: string; active?: boolean; activeColor?: string
  hoverBg?: string; hoverColor?: string; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 8px', borderRadius: 8, border: 'none',
        background: hovered ? (hoverBg ?? 'var(--surface-3)') : 'transparent',
        color: active ? (activeColor ?? 'var(--accent)') : hovered ? (hoverColor ?? 'var(--text-2)') : 'var(--text-3)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 100ms',
      }}>
      {icon}
      {label && <span>{label}</span>}
    </button>
  )
}
