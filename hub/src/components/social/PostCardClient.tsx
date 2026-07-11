'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Heart, MessageCircle, Repeat2, TrendingUp, Bookmark, Share2, MoreHorizontal, Flag, Link2 } from 'lucide-react'
import Link from 'next/link'
import type { Post } from '@/lib/supabase/types'
import { ReportModal } from './ReportModal'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { fmtUsd } from '@/lib/parlayCalc'

interface PostCardClientProps {
  post: Post & { author: { username: string; display_name?: string; avatar_url?: string; is_verified?: boolean; account_type?: string; pick_record?: { wins: number; losses: number } } }
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

export function PostCardClient({ post }: PostCardClientProps) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(post.user_reacted ?? false)
  const [likeCount, setLikeCount] = useState(post.reaction_count)
  const [bookmarked, setBookmarked] = useState(post.user_bookmarked ?? false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<{ id: string; content: string; author: { username: string; display_name?: string; avatar_url?: string } | null; created_at: string }[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadedComments, setLoadedComments] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [pollVoted, setPollVoted] = useState<number | null>(null)
  const [pollCounts, setPollCounts] = useState<number[]>(
    (post.poll_data?.options ?? []).map((o: any) => o.votes ?? 0)
  )
  const supabase = createClient()

  const pickResult = post.pick_data?.result
  const totalPollVotes = pollCounts.reduce((a, b) => a + b, 0)
  const pollEnded = post.poll_data?.ends_at && new Date(post.poll_data.ends_at) < new Date()

  async function toggleLike() {
    if (!user) return
    if (liked) {
      await supabase.from('reactions').delete()
        .match({ user_id: user.id, target_id: post.id, target_type: 'post', emoji: '❤️' })
      setLikeCount(c => c - 1)
    } else {
      await supabase.from('reactions').insert({ user_id: user.id, target_id: post.id, target_type: 'post', emoji: '❤️' })
      setLikeCount(c => c + 1)
    }
    setLiked(v => !v)
  }

  async function toggleBookmark() {
    if (!user) return
    if (bookmarked) {
      await supabase.from('bookmarks').delete().match({ user_id: user.id, post_id: post.id })
    } else {
      await supabase.from('bookmarks').insert({ user_id: user.id, post_id: post.id })
    }
    setBookmarked(v => !v)
  }

  async function loadComments() {
    if (loadedComments) { setShowComments(v => !v); return }
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, author:users(username, display_name, avatar_url)')
      .eq('post_id', post.id)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(20)
    setComments((data as unknown as typeof comments) ?? [])
    setLoadedComments(true)
    setShowComments(true)
  }

  async function submitComment() {
    if (!user || !commentText.trim()) return
    const { data } = await supabase.from('comments')
      .insert({ post_id: post.id, author_id: user.id, content: commentText.trim() })
      .select('id, content, created_at, author:users(username, display_name, avatar_url)')
      .single()
    if (data) setComments(c => [...c, data as unknown as typeof comments[0]])
    setCommentText('')
  }

  async function votePoll(idx: number) {
    if (!user || pollVoted !== null) return
    const newCounts = pollCounts.map((c, i) => i === idx ? c + 1 : c)
    setPollCounts(newCounts)
    setPollVoted(idx)
    const updatedOptions = (post.poll_data?.options ?? []).map((o: any, i: number) => ({ ...o, votes: newCounts[i] }))
    await supabase.from('posts').update({ poll_data: { ...post.poll_data, options: updatedOptions } }).eq('id', post.id)
  }

  const pickBorderColor = pickResult === 'win' ? 'rgba(46,213,115,0.3)' : pickResult === 'loss' ? 'rgba(255,77,106,0.3)' : 'rgba(255,184,77,0.2)'
  const pickBg = pickResult === 'win' ? 'rgba(46,213,115,0.05)' : pickResult === 'loss' ? 'rgba(255,77,106,0.05)' : 'rgba(255,184,77,0.04)'

  return (
    <>
      <article style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        transition: 'border-color 150ms',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
        <div style={{ padding: '14px 16px' }}>
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
                      <button onClick={() => { setShowReport(true); setShowMenu(false) }}
                        className="ss-dropdown-item danger" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Flag size={12} /> Report post
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(window.location.origin + '/posts/' + post.id); setShowMenu(false) }}
                        className="ss-dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link2 size={12} /> Copy link
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sport tag */}
              {post.sport && (
                <Link href={`/hashtag/${post.sport.toLowerCase()}`} style={{ textDecoration: 'none' }}>
                  <span className="sport-tag" style={{ display: 'inline-block', marginTop: 4 }}>{post.sport}</span>
                </Link>
              )}

              {/* Content */}
              <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {post.content}
              </p>

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
                    {post.sport && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{post.sport}</span>}
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
                            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{leg.team} · {leg.prop_label ?? leg.line}</p>
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
                        <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>{post.pick_data.team} · {post.pick_data.prop_label ?? post.pick_data.line}</p>
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

              {/* Action bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 12, marginLeft: -6 }}>
                <ActionBtn
                  icon={<Heart size={15} fill={liked ? 'currentColor' : 'none'} />}
                  label={likeCount > 0 ? String(likeCount) : ''}
                  active={liked}
                  activeColor="var(--red)"
                  hoverBg="rgba(255,77,106,0.08)"
                  onClick={toggleLike}
                />
                <ActionBtn
                  icon={<MessageCircle size={15} />}
                  label={post.comment_count > 0 ? String(post.comment_count) : ''}
                  hoverBg="rgba(77,158,255,0.08)"
                  hoverColor="var(--blue)"
                  onClick={loadComments}
                />
                <ActionBtn
                  icon={<Repeat2 size={15} />}
                  label={post.repost_count > 0 ? String(post.repost_count) : ''}
                  hoverBg="rgba(46,213,115,0.08)"
                  hoverColor="var(--green)"
                  onClick={() => {}}
                />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                  <ActionBtn
                    icon={<Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} />}
                    active={bookmarked}
                    activeColor="var(--gold)"
                    hoverBg="rgba(255,184,77,0.08)"
                    hoverColor="var(--gold)"
                    onClick={toggleBookmark}
                  />
                  <ActionBtn
                    icon={<Share2 size={15} />}
                    hoverBg="var(--surface-3)"
                    onClick={() => navigator.share?.({ url: window.location.origin + '/posts/' + post.id })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Comments section */}
        {showComments && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: 'var(--text-3)' }}>
                  {c.author?.avatar_url
                    ? <img src={c.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (c.author?.display_name || c.author?.username || '?')[0].toUpperCase()
                  }
                </div>
                <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{c.author?.display_name || c.author?.username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>{c.content}</p>
                </div>
              </div>
            ))}
            {user && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                  <input
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitComment())}
                    placeholder="Write a comment…"
                    className="ss-input"
                    style={{ flex: 1, fontSize: 13, padding: '6px 12px' }}
                  />
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
      </article>

      {showReport && user && (
        <ReportModal targetId={post.id} targetType="post" onClose={() => setShowReport(false)} />
      )}
    </>
  )
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
