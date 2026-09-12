'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { useAuth } from '@/context/AuthContext'
import { TrendingUp, Image as ImageIcon, X, BarChart2, Plus, Globe, Users, ChevronDown, MessageCircle, Microscope, EyeOff } from 'lucide-react'
import { PickComposer, type ComposedPick } from './PickComposer'
import { combineOdds, calcPayout, fmtUsd } from '@slipsurge/core/parlayCalc'
import { Tooltip } from '@/components/ui/tooltip-card'
import { notifyMentions } from '@/lib/mentions'
import { EmojiPicker } from './EmojiPicker'
import { GifPicker } from './GifPicker'
import { sportLogoUrl } from '@/lib/sportLogos'
import { MentionInput } from './MentionInput'
import { MemberAvatar } from './MemberAvatar'
import { SafeImage } from '@/components/ui/SafeImage'
import Link from 'next/link'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'CFB', 'CBB']

interface FeedComposerProps {
  onPost?: () => void
  groupId?: string
  pageId?: string
}

export function FeedComposer({ onPost, groupId, pageId }: FeedComposerProps) {
  const { user, profile } = useAuth()
  const [content, setContent] = useState('')
  const [composerMode, setComposerMode] = useState<'take' | 'pick' | 'poll' | 'research'>('take')
  const [showPickForm, setShowPickForm] = useState(false)
  const [showPollForm, setShowPollForm] = useState(false)
  const [sport, setSport] = useState('MLB')
  const [legs, setLegs] = useState<ComposedPick[]>([])
  const [wager, setWager] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollDuration, setPollDuration] = useState('24')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public')
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [isSpoiler, setIsSpoiler] = useState(false)
  const [sportOpen, setSportOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const sportMenuRef = useRef<HTMLDivElement>(null)
  const visibilityMenuRef = useRef<HTMLDivElement>(null)

  function activateMode(mode: 'take' | 'pick' | 'poll' | 'research') {
    setComposerMode(mode)
    setShowPickForm(mode === 'pick')
    setShowPollForm(mode === 'poll')
    if (mode !== 'pick') { setLegs([]); setWager('') }
  }

  useEffect(() => {
    if (!sportOpen && !visibilityOpen) return
    function dismissMenus(event: MouseEvent) {
      const target = event.target as Node
      if (!sportMenuRef.current?.contains(target)) setSportOpen(false)
      if (!visibilityMenuRef.current?.contains(target)) setVisibilityOpen(false)
    }
    function dismissWithKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSportOpen(false)
        setVisibilityOpen(false)
      }
    }
    document.addEventListener('mousedown', dismissMenus)
    document.addEventListener('keydown', dismissWithKeyboard)
    return () => {
      document.removeEventListener('mousedown', dismissMenus)
      document.removeEventListener('keydown', dismissWithKeyboard)
    }
  }, [sportOpen, visibilityOpen])

  async function uploadImage(file: File) {
    if (!user) return
    setError('')
    setUploadingImage(true)
    try {
      const result = await uploadMedia(file, 'posts')
      if ('error' in result) { setError(result.error); return }
      setImageUrl(result.publicUrl)
    } catch {
      setError('Image upload failed. Try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  function insertAtCursor(insertion: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? content.length
    const end = el?.selectionEnd ?? content.length
    const next = content.slice(0, start) + insertion + content.slice(end)
    setContent(next)
    // Restore focus + caret position after the inserted text — without
    // this the cursor jumps to the end of the textarea on every insert.
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  if (!user || !profile) {
    return (
      <div className="ss-feed-composer ss-feed-composer-signed-out">
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>
          <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
          {' '}to post picks and join the conversation
        </p>
      </div>
    )
  }

  async function handlePost() {
    const validPoll = showPollForm && pollOptions.filter(option => option.trim()).length >= 2
    const validPick = showPickForm && legs.length > 0
    if ((!content.trim() && !imageUrl && !validPoll && !validPick) || !user) return
    setPosting(true)
    setError('')

    try {

    const hasPick = showPickForm && legs.length > 0
    const wagerNum = parseFloat(wager)
    const hasWager = !isNaN(wagerNum) && wagerNum > 0

    // Picks/parlays go through a server route instead of a direct client
    // insert — it re-validates every leg against its league's live status
    // before allowing the post to exist at all. A client-side-only check
    // here would just be UX, not enforcement (trivially bypassed from
    // devtools), and "real graded records" doesn't mean anything if a pick
    // can be posted after the game's already started.
    if (hasPick) {
      const res = await fetch('/api/posts/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          legs,
          sport: legs[0]?.sport,
          wager: hasWager ? wagerNum : null,
          imageUrl: imageUrl || null,
          visibility,
          groupId: groupId ?? null,
          pageId: pageId ?? null,
          isSpoiler,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Failed to post. Try again.')
        setPosting(false)
        return
      }
      if (data?.picksTracked === false) {
        setError('Posted, but your pick couldn’t be tracked for grading — it won’t show a result.')
      }
      setContent(''); setLegs([]); setWager(''); setImageUrl(''); setIsSpoiler(false)
      setShowPickForm(false); setComposerMode('take'); setPosting(false)
      onPost?.()
      return
    }

    let pollData = null
    if (showPollForm && pollOptions.filter(o => o.trim()).length >= 2) {
      const opts = pollOptions.filter(o => o.trim())
      pollData = {
        options: opts.map(o => ({ text: o.trim(), votes: 0 })),
        ends_at: new Date(Date.now() + parseInt(pollDuration) * 60 * 60 * 1000).toISOString(),
      }
    }

    const { data: post, error: err } = await supabase.from('posts').insert({
      author_id: user.id,
      content: content.trim(),
      post_type: pollData ? 'poll' : composerMode === 'research' ? 'analysis' : 'text',
      sport: sport || null,
      pick_data: null,
      poll_data: pollData,
      media_urls: imageUrl ? [imageUrl] : [],
      visibility,
      group_id: groupId ?? null,
      page_id: pageId ?? null,
      is_spoiler: isSpoiler,
    }).select('id').single()

    if (err) {
      setError('Failed to post. Please try again.')
      setPosting(false)
      return
    }

    await notifyMentions(supabase, user.id, content, `/posts/${post.id}`, post.id, 'a post')

    setContent('')
    setPollOptions(['', ''])
    setImageUrl('')
    setIsSpoiler(false)
    setShowPollForm(false)
    setComposerMode('take')
    setPosting(false)
    onPost?.()
    } catch {
      setError('Failed to post. Try again.')
      setPosting(false)
    }
  }

  const charLimit = 500
  const remaining = charLimit - content.length
  return (
    <div className="ss-feed-composer">
      <div className="ss-feed-composer-layout">
        <MemberAvatar src={profile.avatar_url} name={profile.display_name || profile.username || 'Member'} size={40}
          ringStyle={profile.avatar_ring_style} ringColor={profile.avatar_ring_color} />

        <div className="ss-feed-composer-main">
          <div className="ss-composer-modes" role="tablist" aria-label="Post type">
            {([
              { key: 'take', label: 'Take', icon: <MessageCircle size={13} /> },
              { key: 'pick', label: 'Pick', icon: <TrendingUp size={13} /> },
              { key: 'poll', label: 'Poll', icon: <BarChart2 size={13} /> },
              { key: 'research', label: 'Research', icon: <Microscope size={13} /> },
            ] as const).map(option => (
              <button key={option.key} type="button" role="tab" aria-selected={composerMode === option.key}
                className={composerMode === option.key ? 'is-active' : ''}
                onClick={() => activateMode(option.key)}>{option.icon}<span>{option.label}</span></button>
            ))}
          </div>
          <MentionInput
            ref={textareaRef}
            value={content}
            onValueChange={setContent}
            currentUserId={user.id}
            placeholder={composerMode === 'pick' ? 'Add your read on this pick…' : composerMode === 'poll' ? 'Ask the community…' : composerMode === 'research' ? 'Share the signal, chart, or board context…' : 'What are you seeing?'}
            maxLength={charLimit}
            rows={content.length > 80 ? 3 : 2}
            style={{
              width: '100%', background: 'transparent',
              color: 'var(--text-1)', fontSize: 15, lineHeight: 1.55,
              border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'inherit', caretColor: 'var(--accent)',
            }}
          />

          {/* The structured pick flow owns its sport selector while open. */}
          {!showPickForm && (
            <div className="ss-composer-sport-wrap" ref={sportMenuRef}>
              <button type="button" className="ss-composer-sport-trigger" aria-expanded={sportOpen} onClick={() => setSportOpen(value => !value)}>
                {sportLogoUrl(sport) ? <SafeImage src={sportLogoUrl(sport)} alt="" /> : null}
                <span>{sport}</span><ChevronDown size={12} />
              </button>
              {sportOpen ? (
                <div className="ss-composer-sport-menu" role="menu" aria-label="Choose a sport">
                  {SPORTS.map(option => {
                    const logo = sportLogoUrl(option)
                    return <button key={option} type="button" role="menuitemradio" aria-checked={sport === option} onClick={() => { setSport(option); setSportOpen(false) }}>
                      {logo ? <SafeImage src={logo} alt="" /> : <span className="ss-composer-sport-fallback">{option.slice(0, 1)}</span>}
                      <span>{option}</span>{sport === option ? <span className="ss-composer-sport-check">✓</span> : null}
                    </button>
                  })}
                </div>
              ) : null}
            </div>
          )}

          {/* Structured pick form with same-sport and same-book parlay legs. */}
          {showPickForm && (
            <>
              <PickComposer
                legs={legs}
                onAddLeg={l => setLegs(prev => [...prev, l])}
                onRemoveLeg={i => setLegs(prev => prev.filter((_, j) => j !== i))}
                onClose={() => { setShowPickForm(false); setLegs([]); setWager('') }}
              />
              {legs.length > 0 && (
                <div className="ss-composer-wager">
                  <label>Wager <span>optional</span></label>
                  <i>$</i>
                  <input
                    type="number" min="0" step="1" value={wager}
                    onChange={e => setWager(e.target.value)}
                    placeholder="0.00"
                    className="ss-composer-wager-input"
                  />
                  {(() => {
                    const wagerNum = parseFloat(wager)
                    if (isNaN(wagerNum) || wagerNum <= 0) return null
                    const combined = legs.length > 1 ? combineOdds(legs.map(l => l.odds ?? 0)) : (legs[0].odds ?? 0)
                    const { profit } = calcPayout(wagerNum, combined)
                    return <span className="ss-composer-payout">To win <strong>{fmtUsd(profit)}</strong></span>
                  })()}
                </div>
              )}
            </>
          )}

          {/* Poll form */}
          {showPollForm && (
            <div className="ss-composer-poll">
              <div className="ss-composer-poll-head">
                <span><BarChart2 size={13}/> Poll</span>
                <button type="button" onClick={() => setShowPollForm(false)} aria-label="Close poll">
                  <X size={14} />
                </button>
              </div>
              <div className="ss-composer-poll-options">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="ss-composer-poll-option">
                    <input value={opt} onChange={e => setPollOptions(opts => opts.map((o, j) => j === i ? e.target.value : o))}
                      placeholder={`Option ${i + 1}`} className="ss-input" />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions(opts => opts.filter((_, j) => j !== i))}
                        className="ss-composer-poll-remove" aria-label={`Remove option ${i + 1}`}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button type="button" onClick={() => setPollOptions(opts => [...opts, ''])}
                    className="ss-composer-poll-add">
                    <Plus size={12} /> Add option
                  </button>
                )}
                <div className="ss-composer-poll-duration">
                  <span>Duration</span>
                  {['1', '6', '24', '48', '72'].map(h => (
                    <button key={h} type="button" aria-pressed={pollDuration === h} onClick={() => setPollDuration(h)}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Image preview */}
          {(imageUrl || uploadingImage) && (
            <div className="ss-composer-media-preview">
              {uploadingImage ? (
                <div className="ss-composer-media-loading">
                  Uploading…
                </div>
              ) : (
                <>
                  <SafeImage src={imageUrl} alt="" className="ss-composer-media-image" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="ss-composer-media-remove"
                    aria-label="Remove image"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="ss-composer-error">{error}</p>
          )}

          {/* Action bar — button labels ("Pick"/"Poll"/"Photo") hide below
              sm and flexWrap is a safety net, since Pick+Poll+Photo+emoji
              on the left plus Public+Post on the right doesn't fit on one
              line under ~360px with labels shown, and used to just push
              Post off the right edge of the screen with no wrap. */}
          <div className="ss-feed-composer-actions">
            <div className="ss-feed-composer-tools">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }}
              />
              <ComposerBtn
                icon={<ImageIcon size={14} />}
                label="Photo"
                active={!!imageUrl || uploadingImage}
                onClick={() => imageInputRef.current?.click()}
              />
              <EmojiPicker onSelect={insertAtCursor} />
              <GifPicker onSelect={setImageUrl} />
              <button type="button" className="ss-composer-spoiler" data-active={isSpoiler} aria-pressed={isSpoiler} onClick={() => setIsSpoiler(value => !value)}>
                <EyeOff size={14}/><span>Spoiler</span>
              </button>
            </div>
            <div className="ss-feed-composer-submit">
              <div className="ss-composer-visibility" ref={visibilityMenuRef}>
                <button
                  type="button"
                  onClick={() => setVisibilityOpen(v => !v)}
                  className="ss-composer-visibility-trigger"
                >
                  {visibility === 'public' ? <Globe size={11} /> : <Users size={11} />}
                  <span className="hidden sm:inline">{visibility === 'public' ? 'Public' : 'Followers'}</span>
                  <ChevronDown size={11} />
                </button>
                {visibilityOpen && (
                  <div className="ss-composer-visibility-menu">
                    {([
                      { key: 'public' as const, icon: <Globe size={12} />, label: 'Public', desc: 'Anyone can see this' },
                      { key: 'followers' as const, icon: <Users size={12} />, label: 'Followers', desc: 'Only your followers' },
                    ]).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => { setVisibility(opt.key); setVisibilityOpen(false) }}
                        data-active={visibility === opt.key}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {content.length > 400 && (
                <span className="ss-composer-count" data-low={remaining < 50}>{remaining}</span>
              )}
              {(() => {
                const pickIncomplete = showPickForm && legs.length === 0
                const pollIncomplete = showPollForm && pollOptions.filter(option => option.trim()).length < 2
                const hasPayload = !!content.trim() || !!imageUrl || (showPickForm && legs.length > 0) || (showPollForm && !pollIncomplete)
                const disabled = !hasPayload || posting || uploadingImage || pickIncomplete || pollIncomplete
                const button = (
                  <button type="button" onClick={handlePost} disabled={disabled} className="ss-composer-post-button">
                    {posting ? 'Posting…' : 'Post'}
                  </button>
                )
                return pickIncomplete ? <Tooltip content="Finish selecting a player and market first">{button}</Tooltip> : button
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComposerBtn({ icon, label, active, activeColor, activeFg, onClick }: {
  icon: React.ReactNode; label?: string; active?: boolean
  activeColor?: string; activeFg?: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="ss-composer-tool" style={{
      background: active ? (activeColor ?? 'var(--surface-3)') : undefined,
      color: active ? (activeFg ?? 'var(--text-1)') : undefined,
    }}
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = active ? (activeFg ?? 'var(--text-1)') : 'var(--text-3)'; }}>
      {icon}
      {/* Label text hides below sm — Pick/Poll/Photo with full text plus
          Public+Post didn't fit one row under ~360px. */}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}
