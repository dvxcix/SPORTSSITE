'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, MessageCircle, Radio, Send, Sparkles, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar, type MemberRingStyle } from '@/components/social/MemberAvatar'
import { LinkifiedText } from '@/components/social/LinkifiedText'

export type GameRoomMessage = {
  id: string
  sport: string
  game_id: string
  user_id: string
  content: string
  created_at: string
  sender?: {
    username?: string | null
    display_name?: string | null
    avatar_url?: string | null
    avatar_ring_style?: MemberRingStyle | null
    avatar_ring_color?: string | null
    is_verified?: boolean | null
  } | null
}

export type GameRoomPick = {
  id: string
  game_pk?: string | number | null
  reaction_count?: number | null
  comment_count?: number | null
  pick_data?: {
    result?: string | null
    player_name?: string | null
    prop_label?: string | null
    line?: string | number | null
    legs?: Array<{ game_pk?: string | number | null; result?: string | null }>
  } | null
  author?: GameRoomMessage['sender'] & { id?: string | null }
}

function gamePickResult(pick: GameRoomPick, gameId: string) {
  if (String(pick.game_pk) === String(gameId)) return pick.pick_data?.result ?? 'pending'
  return pick.pick_data?.legs?.find(leg => leg.game_pk != null && String(leg.game_pk) === String(gameId))?.result ?? 'pending'
}

export function GameRoom({ sport, gameId, phase, initialMessages, currentUserId, picks = [] }: {
  sport: string
  gameId: string
  phase: 'pre' | 'in' | 'post'
  initialMessages: GameRoomMessage[]
  currentUserId?: string
  picks?: GameRoomPick[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState(initialMessages)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const channel = supabase.channel(`game-room:${sport}:${gameId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_room_messages', filter: `game_id=eq.${gameId}` }, async payload => {
        const next = payload.new as GameRoomMessage
        if (next.sport !== sport) return
        const { data: sender } = await supabase.from('users').select('username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified').eq('id', next.user_id).maybeSingle()
        setMessages(current => current.some(message => message.id === next.id) ? current : [...current, { ...next, sender }])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_room_messages', filter: `game_id=eq.${gameId}` }, payload => {
        const removed = payload.old as { id?: string; sport?: string }
        if (removed.sport && removed.sport !== sport) return
        setMessages(current => current.filter(message => message.id !== removed.id))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [gameId, sport, supabase])

  useEffect(() => { bottomRef.current?.scrollIntoView() }, [messages.length])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const message = content.trim()
    if (!message || !currentUserId || sending) return
    setSending(true); setError('')
    const { error: sendError } = await supabase.from('game_room_messages').insert({ sport, game_id: gameId, user_id: currentUserId, content: message })
    setSending(false)
    if (sendError) { setError('Message not sent. Try again.'); return }
    setContent('')
  }

  const phaseLabel = phase === 'in' ? 'Live now' : phase === 'post' ? 'Final discussion' : 'Pregame room'
  const recap = useMemo(() => {
    if (phase !== 'post') return null
    const winningPicks = picks.filter(pick => gamePickResult(pick, gameId) === 'win')
    const contributors = new Map<string, { name: string; username?: string; avatar?: string | null; ringStyle?: MemberRingStyle | null; ringColor?: string | null; messages: number; wins: number; impact: number }>()
    const upsert = (key: string, identity: GameRoomMessage['sender'], changes: { messages?: number; wins?: number; impact?: number }) => {
      const existing = contributors.get(key) ?? { name: identity?.display_name || identity?.username || 'Member', username: identity?.username ?? undefined, avatar: identity?.avatar_url, ringStyle: identity?.avatar_ring_style, ringColor: identity?.avatar_ring_color, messages: 0, wins: 0, impact: 0 }
      existing.messages += changes.messages ?? 0
      existing.wins += changes.wins ?? 0
      existing.impact += changes.impact ?? 0
      contributors.set(key, existing)
    }
    messages.forEach(message => upsert(message.user_id, message.sender, { messages: 1, impact: 1 }))
    winningPicks.forEach(pick => upsert(pick.author?.id || pick.author?.username || pick.id, pick.author, { wins: 1, impact: 5 + Math.min(5, Number(pick.reaction_count ?? 0)) }))
    return {
      winningPicks,
      contributors: [...contributors.values()].sort((a, b) => b.impact - a.impact || b.wins - a.wins || b.messages - a.messages).slice(0, 3),
    }
  }, [gameId, messages, phase, picks])

  return <section className="ss-game-room" aria-label="Game room">
    <header><div className="ss-game-room-signal"><Radio size={15}/><span>{phaseLabel}</span></div><strong>Game Room</strong><small>{messages.length} message{messages.length === 1 ? '' : 's'}</small></header>
    {recap && <section className="ss-game-room-recap" aria-labelledby={`game-recap-${sport}-${gameId}`}>
      <header><div><span><Sparkles size={12}/> FINAL RECAP</span><h2 id={`game-recap-${sport}-${gameId}`}>What the community called</h2></div><Trophy size={19}/></header>
      <div className="ss-game-room-recap-stats"><span><CheckCircle2 size={14}/><strong>{recap.winningPicks.length}</strong> winning prediction{recap.winningPicks.length === 1 ? '' : 's'}</span><span><MessageCircle size={14}/><strong>{messages.length}</strong> room message{messages.length === 1 ? '' : 's'}</span></div>
      {recap.winningPicks.length > 0 && <div className="ss-game-room-winning-picks">{recap.winningPicks.slice(0, 3).map(pick => <Link key={pick.id} href={`/posts/${pick.id}`}><CheckCircle2 size={13}/><span><b>{pick.pick_data?.player_name || 'Winning pick'}</b><small>{pick.pick_data?.prop_label || pick.pick_data?.line || 'Verified result'}</small></span></Link>)}</div>}
      {recap.contributors.length > 0 && <div className="ss-game-room-contributors"><small>TOP CONTRIBUTORS</small><div>{recap.contributors.map((contributor, index) => <Link key={`${contributor.username || contributor.name}-${index}`} href={contributor.username ? `/profile/${contributor.username}` : '#'} aria-label={`${contributor.name}, top contributor ${index + 1}`}><i>{index + 1}</i><MemberAvatar src={contributor.avatar} name={contributor.name} size={28} ringStyle={contributor.ringStyle} ringColor={contributor.ringColor}/><span><b>{contributor.name}</b><small>{contributor.wins ? `${contributor.wins} win${contributor.wins === 1 ? '' : 's'}` : `${contributor.messages} message${contributor.messages === 1 ? '' : 's'}`}</small></span></Link>)}</div></div>}
    </section>}
    <div className="ss-game-room-stream" aria-live="polite">
      {messages.length === 0 && <div className="ss-game-room-empty"><Radio size={24}/><strong>The room is open</strong><p>Start the conversation around this matchup.</p></div>}
      {messages.map(message => {
        const name = message.sender?.display_name || message.sender?.username || 'Member'
        return <article key={message.id}>
          {message.sender?.username ? <Link href={`/profile/${message.sender.username}`}><MemberAvatar src={message.sender.avatar_url} name={name} size={34} ringStyle={message.sender.avatar_ring_style} ringColor={message.sender.avatar_ring_color}/></Link> : <MemberAvatar src={message.sender?.avatar_url} name={name} size={34}/>} 
          <div><header><strong>{name}</strong>{message.sender?.is_verified && <span>✓</span>}<time>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></header><p><LinkifiedText text={message.content}/></p></div>
        </article>
      })}
      <div ref={bottomRef}/>
    </div>
    {!currentUserId ? <div className="ss-game-room-signin"><Link href={`/auth/login?next=${encodeURIComponent(`/sports/${sport}/${gameId}`)}`}>Sign in</Link> to join the room.</div> : <form onSubmit={send}><label className="sr-only" htmlFor={`game-room-${sport}-${gameId}`}>Message Game Room</label><textarea id={`game-room-${sport}-${gameId}`} value={content} maxLength={800} rows={1} placeholder="Message Game Room" onChange={event => { setContent(event.target.value); if (error) setError('') }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }}/><button type="submit" disabled={!content.trim() || sending} aria-label="Send message">{sending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}</button></form>}
    {error && <p role="alert" className="ss-game-room-error">{error}</p>}
  </section>
}
