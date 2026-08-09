'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, LockKeyhole, Send, Sparkles } from 'lucide-react'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { notify } from '@/lib/notify'
import { BlockUserButton } from '@/components/social/BlockUserButton'

interface DMRoomProps {
  partner: { id: string; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean }
  currentUserId: string
  initialMessages: any[]
}

export function DMRoom({ partner, currentUserId, initialMessages }: DMRoomProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  function insertAtCursor(insertion: string) {
    const el = textInputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, start) + insertion + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase.channel(`dm-${[currentUserId, partner.id].sort().join('-')}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `dm_recipient_id=eq.${currentUserId}`,
      }, async (payload) => {
        if (payload.new.sender_id !== partner.id) return
        const { data } = await supabase.from('users').select('username, display_name, avatar_url').eq('id', payload.new.sender_id).single()
        setMessages(m => [...m, { ...payload.new, sender: data }])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId, partner.id])

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    setError('')
    const content = text.trim()
    const { data, error: err } = await supabase.from('messages')
      .insert({ sender_id: currentUserId, dm_recipient_id: partner.id, content, message_type: 'text' })
      .select('id, content, created_at, sender_id')
      .single()
    // Only clear the input once the message actually saved — clearing it
    // unconditionally (the previous behavior) silently ate whatever was
    // typed if the insert failed. A block (either direction) AND being
    // rate-limited both hit the same messages RLS insert policy and come
    // back as the identical 42501 error — Postgres RLS gives no way to tell
    // which WITH CHECK clause actually failed — so this deliberately stays
    // generic rather than guessing wrong and telling a merely-rate-limited
    // person they're blocked.
    if (err || !data) {
      setError(err?.code === '42501' ? "Couldn't send that message — try again in a moment." : 'Message failed to send — please try again.')
      setSending(false)
      return
    }
    setText('')
    setMessages(m => [...m, { ...data, sender: null }])
    // "Direct messages" has had a notification toggle in Settings since
    // this session's notifications work, but nothing ever actually fired
    // one — a DM landed with zero signal to the recipient beyond the
    // realtime subscription updating an already-open thread.
    const { data: me } = await supabase.from('users').select('username').eq('id', currentUserId).single()
    await notify(supabase, {
      userId: partner.id, actorId: currentUserId, type: 'message',
      message: 'sent you a message', link: me?.username ? `/messages/${me.username}` : null,
      targetId: currentUserId, targetType: 'user',
    })
    setSending(false)
  }

  return (
    <div className="ss-dm-room">
      {/* Header */}
      <div className="ss-dm-header">
        <Link href="/messages" className="ss-dm-back" aria-label="Back to messages">
          <ArrowLeft size={18} />
        </Link>
        <Link href={`/profile/${partner.username}`} className="ss-dm-partner">
          <div className="ss-dm-partner-avatar">
            {partner.avatar_url ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" /> : (partner.display_name || partner.username)[0].toUpperCase()}
          </div>
          <div>
            <p>{partner.display_name || partner.username}</p>
            <span>@{partner.username}</span>
          </div>
        </Link>
        <span className="ss-dm-private"><LockKeyhole size={11} /> Private</span>
        <BlockUserButton
          currentUserId={currentUserId}
          targetUserId={partner.id}
          targetUsername={partner.username}
          initialBlocked={false}
          variant="button"
        />
      </div>
      {error && <p className="ss-dm-error">{error}</p>}

      {/* Messages */}
      <div className="ss-dm-messages">
        <div className="ss-dm-thread-start"><Sparkles size={13} /><span>Your conversation with @{partner.username}</span></div>
        {messages.map(m => {
          const isMe = m.sender_id === currentUserId
          return (
            <div key={m.id} className={`ss-dm-message ${isMe ? 'is-mine' : ''}`}>
              {!isMe && (
                <div className="ss-dm-message-avatar">
                  {partner.avatar_url ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" /> : partner.username[0].toUpperCase()}
                </div>
              )}
              <div className="ss-dm-bubble-wrap">
                <div className="ss-dm-bubble">{m.content}</div>
                <time>{new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="ss-dm-composer">
        <div className="ss-dm-composer-row">
          <input
            ref={textInputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={`Message @${partner.username}…`}
            className="ss-dm-input"
          />
          <EmojiPicker onSelect={insertAtCursor} />
          <button onClick={send} disabled={!text.trim() || sending}
            className="ss-dm-send" aria-label="Send message">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
