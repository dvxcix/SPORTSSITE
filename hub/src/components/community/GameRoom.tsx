'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Radio, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/social/MemberAvatar'
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
    avatar_ring_style?: string | null
    avatar_ring_color?: string | null
    is_verified?: boolean | null
  } | null
}

export function GameRoom({ sport, gameId, phase, initialMessages, currentUserId }: {
  sport: string
  gameId: string
  phase: 'pre' | 'in' | 'post'
  initialMessages: GameRoomMessage[]
  currentUserId?: string
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

  return <section className="ss-game-room" aria-label="Game room">
    <header><div className="ss-game-room-signal"><Radio size={15}/><span>{phaseLabel}</span></div><strong>Game Room</strong><small>{messages.length} message{messages.length === 1 ? '' : 's'}</small></header>
    <div className="ss-game-room-stream" aria-live="polite">
      {messages.length === 0 && <div className="ss-game-room-empty"><Radio size={24}/><strong>The room is open</strong><p>Start the conversation around this matchup.</p></div>}
      {messages.map(message => {
        const name = message.sender?.display_name || message.sender?.username || 'Member'
        return <article key={message.id}>
          {message.sender?.username ? <Link href={`/profile/${message.sender.username}`}><MemberAvatar src={message.sender.avatar_url} name={name} size={34} ringStyle={message.sender.avatar_ring_style as any} ringColor={message.sender.avatar_ring_color}/></Link> : <MemberAvatar src={message.sender?.avatar_url} name={name} size={34}/>} 
          <div><header><strong>{name}</strong>{message.sender?.is_verified && <span>✓</span>}<time>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></header><p><LinkifiedText text={message.content}/></p></div>
        </article>
      })}
      <div ref={bottomRef}/>
    </div>
    {!currentUserId ? <div className="ss-game-room-signin"><Link href={`/auth/login?next=${encodeURIComponent(`/sports/${sport}/${gameId}`)}`}>Sign in</Link> to join the room.</div> : <form onSubmit={send}><label className="sr-only" htmlFor={`game-room-${sport}-${gameId}`}>Message Game Room</label><textarea id={`game-room-${sport}-${gameId}`} value={content} maxLength={800} rows={1} placeholder="Message Game Room" onChange={event => { setContent(event.target.value); if (error) setError('') }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }}/><button type="submit" disabled={!content.trim() || sending} aria-label="Send message">{sending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}</button></form>}
    {error && <p role="alert" className="ss-game-room-error">{error}</p>}
  </section>
}
