'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { TrendingUp, Image as ImageIcon, X, BarChart2, Plus, Globe } from 'lucide-react'
import { PickComposer, type ComposedPick } from './PickComposer'
import { PROP_META } from '@/lib/watchlist'
import { combineOdds, calcPayout, fmtUsd } from '@/lib/parlayCalc'
import { Tooltip } from '@/components/ui/tooltip-card'
import { notifyMentions } from '@/lib/mentions'
import { EmojiPicker } from './EmojiPicker'
import { sportLogoUrl } from '@/lib/sportLogos'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'CFB', 'CBB']

interface FeedComposerProps {
  onPost?: () => void
  groupId?: string
}

export function FeedComposer({ onPost, groupId }: FeedComposerProps) {
  const { user, profile } = useAuth()
  const [content, setContent] = useState('')
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
  const supabase = createClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  async function uploadImage(file: File) {
    if (!user) return
    setError('')
    setUploadingImage(true)
    try {
      const path = `posts/${user.id}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)
      setImageUrl(publicUrl)
    } catch (e: any) {
      setError(e?.message || 'Image upload failed — please try again.')
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-3)' }}>
          <a href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign in</a>
          {' '}to post picks and join the conversation
        </p>
      </div>
    )
  }

  async function handlePost() {
    if ((!content.trim() && !imageUrl) || !user) return
    setPosting(true)
    setError('')

    const hasPick = showPickForm && legs.length > 0
    const isParlay = legs.length > 1
    // Every leg is only ever added once it has real odds (see canAddLeg in
    // PickComposer), so this is non-null in practice — the type is nullable
    // only because ComposedPick's `odds` field is shared with the display path.
    const oddsList = legs.map(l => l.odds ?? 0)
    const combined = isParlay ? combineOdds(oddsList) : (oddsList[0] ?? null)
    const wagerNum = parseFloat(wager)
    const hasWager = !isNaN(wagerNum) && wagerNum > 0
    const payout = hasPick && combined != null && hasWager ? calcPayout(wagerNum, combined).payout : null

    const legsSummary = legs.map(l => ({
      player_name: l.player_name, team: l.team, mlb_id: l.mlb_id, headshot_url: l.headshot_url,
      prop_key: l.prop_key, prop_label: l.prop_label, line: l.line, odds: l.odds, result: 'pending',
    }))

    const pickData = !hasPick ? null : isParlay
      ? {
          legs: legsSummary,
          book: legs[0].book,
          combined_odds: combined,
          wager_amount: hasWager ? wagerNum : null,
          potential_payout: payout,
          result: 'pending',
        }
      : {
          ...legsSummary[0],
          book: legs[0].book,
          wager_amount: hasWager ? wagerNum : null,
          potential_payout: payout,
          sport: 'MLB',
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
      post_type: pickData ? (isParlay ? 'parlay' : 'pick') : pollData ? 'poll' : 'text',
      sport: hasPick ? 'MLB' : (sport || null),
      game_pk: isParlay ? null : (legs[0]?.game_pk ?? null),
      book: hasPick ? legs[0].book : null,
      combined_odds: hasPick ? combined : null,
      wager_amount: hasWager ? wagerNum : null,
      potential_payout: payout,
      pick_data: pickData,
      poll_data: pollData,
      media_urls: imageUrl ? [imageUrl] : [],
      visibility: 'public',
      group_id: groupId ?? null,
    }).select('id').single()

    if (err) {
      setError('Failed to post. Please try again.')
      setPosting(false)
      return
    }

    // Mirror into the picks table too — this is what the settlement job
    // reads from (game_pk + mlb_id + prop_key), not posts.pick_data. One row
    // per leg, so a parlay grades leg-by-leg the same way a straight pick does.
    if (hasPick) {
      await supabase.from('picks').insert(legs.map(l => ({
        user_id: user.id,
        post_id: post.id,
        sport: 'MLB',
        game_pk: l.game_pk,
        game_date: l.game_date,
        mlb_id: l.mlb_id,
        pick_type: PROP_META[l.prop_key]?.pickType ?? l.prop_key,
        team: l.team,
        player_name: l.player_name,
        line: l.line,
        odds: l.odds,
        book: l.book,
        result: 'pending',
      })))
    }

    await notifyMentions(supabase, user.id, content, `/posts/${post.id}`, post.id, 'a post')

    setContent('')
    setLegs([])
    setWager('')
    setPollOptions(['', ''])
    setImageUrl('')
    setShowPickForm(false)
    setShowPollForm(false)
    setPosting(false)
    onPost?.()
  }

  const charLimit = 500
  const remaining = charLimit - content.length
  const initials = (profile.display_name || profile.username || '?')[0].toUpperCase()

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: 'var(--accent-dim)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 900, color: 'var(--accent)',
        }}>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Drop a pick, take, or hot comment…"
            maxLength={charLimit}
            rows={content.length > 80 ? 3 : 2}
            style={{
              width: '100%', background: 'transparent',
              color: 'var(--text-1)', fontSize: 15, lineHeight: 1.55,
              border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'inherit', caretColor: 'var(--accent)',
            }}
          />

          {/* Sport selector — hidden while adding a structured pick, since
              that flow only pulls real data for MLB right now. */}
          {!showPickForm && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {SPORTS.map(s => {
                const logo = sportLogoUrl(s)
                return (
                  <button key={s} type="button" onClick={() => setSport(s)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    border: `1px solid ${sport === s ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: sport === s ? 'var(--accent-dim)' : 'transparent',
                    color: sport === s ? 'var(--accent)' : 'var(--text-3)',
                    cursor: 'pointer', transition: 'all 130ms',
                  }}>
                    {logo && <img src={logo} alt={s} style={{ width: 12, height: 12, objectFit: 'contain' }} />}
                    {s}
                  </button>
                )
              })}
            </div>
          )}

          {/* Pick form — real player/market search, MLB-only for now since
              that's the sport we have live Dugout data for. Supports adding
              multiple legs from the same book to build a parlay. */}
          {showPickForm && (
            <>
              <PickComposer
                legs={legs}
                onAddLeg={l => setLegs(prev => [...prev, l])}
                onRemoveLeg={i => setLegs(prev => prev.filter((_, j) => j !== i))}
                onClose={() => { setShowPickForm(false); setLegs([]); setWager('') }}
              />
              {legs.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>Wager (optional)</label>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>$</span>
                  <input
                    type="number" min="0" step="1" value={wager}
                    onChange={e => setWager(e.target.value)}
                    placeholder="0.00"
                    style={{ width: 90, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 8px', color: 'var(--text-1)', fontSize: 12, outline: 'none' }}
                  />
                  {(() => {
                    const wagerNum = parseFloat(wager)
                    if (isNaN(wagerNum) || wagerNum <= 0) return null
                    const combined = legs.length > 1 ? combineOdds(legs.map(l => l.odds ?? 0)) : (legs[0].odds ?? 0)
                    const { profit } = calcPayout(wagerNum, combined)
                    return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>To win <strong style={{ color: 'var(--green)' }}>{fmtUsd(profit)}</strong></span>
                  })()}
                </div>
              )}
            </>
          )}

          {/* Poll form */}
          {showPollForm && (
            <div style={{ marginTop: 12, padding: '12px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid rgba(168,85,247,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--purple)' }}>📊 Poll</span>
                <button onClick={() => setShowPollForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6 }}>
                    <input value={opt} onChange={e => setPollOptions(opts => opts.map((o, j) => j === i ? e.target.value : o))}
                      placeholder={`Option ${i + 1}`} className="ss-input" style={{ flex: 1, fontSize: 13 }} />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(opts => opts.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '0 4px' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button onClick={() => setPollOptions(opts => [...opts, ''])}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, padding: '2px 0' }}>
                    <Plus size={12} /> Add option
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Duration:</span>
                  {['1', '6', '24', '48', '72'].map(h => (
                    <button key={h} onClick={() => setPollDuration(h)} style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      border: `1px solid ${pollDuration === h ? 'var(--purple)' : 'var(--border-2)'}`,
                      background: pollDuration === h ? 'rgba(168,85,247,0.1)' : 'transparent',
                      color: pollDuration === h ? 'var(--purple)' : 'var(--text-3)',
                      cursor: 'pointer',
                    }}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Image preview */}
          {(imageUrl || uploadingImage) && (
            <div style={{ position: 'relative', marginTop: 10, width: 'fit-content' }}>
              {uploadingImage ? (
                <div style={{ width: 160, height: 120, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                  Uploading…
                </div>
              ) : (
                <>
                  <img src={imageUrl} alt="" style={{ maxWidth: 260, maxHeight: 220, borderRadius: 10, border: '1px solid var(--border)', display: 'block', objectFit: 'cover' }} />
                  <button
                    onClick={() => setImageUrl('')}
                    style={{
                      position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}
                    aria-label="Remove image"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          )}

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</p>
          )}

          {/* Action bar — button labels ("Pick"/"Poll"/"Photo") hide below
              sm and flexWrap is a safety net, since Pick+Poll+Photo+emoji
              on the left plus Public+Post on the right doesn't fit on one
              line under ~360px with labels shown, and used to just push
              Post off the right edge of the screen with no wrap. */}
          <div className="flex-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <ComposerBtn
                icon={<TrendingUp size={14} />}
                label="Pick"
                active={showPickForm}
                activeColor="rgba(255,184,77,0.12)"
                activeFg="var(--gold)"
                onClick={() => { setShowPickForm(v => !v); setShowPollForm(false) }}
              />
              <ComposerBtn
                icon={<BarChart2 size={14} />}
                label="Poll"
                active={showPollForm}
                activeColor="rgba(168,85,247,0.12)"
                activeFg="var(--purple)"
                onClick={() => { setShowPollForm(v => !v); setShowPickForm(false) }}
              />
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
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)' }}>
                <Globe size={11} /> <span className="hidden sm:inline">Public</span>
              </span>
              {content.length > 400 && (
                <span style={{ fontSize: 11, color: remaining < 50 ? 'var(--red)' : 'var(--text-3)' }}>{remaining}</span>
              )}
              {(() => {
                const pickIncomplete = showPickForm && legs.length === 0
                const disabled = (!content.trim() && !imageUrl) || posting || uploadingImage || pickIncomplete
                const button = (
                  <button onClick={handlePost} disabled={disabled} style={{
                    padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                    background: disabled ? 'var(--surface-3)' : 'var(--accent)',
                    color: disabled ? 'var(--text-3)' : 'var(--accent-fg)',
                    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 150ms',
                  }}>
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
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '6px 10px', borderRadius: 8, border: 'none',
      background: active ? (activeColor ?? 'var(--surface-3)') : 'transparent',
      color: active ? (activeFg ?? 'var(--text-1)') : 'var(--text-3)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 130ms',
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
