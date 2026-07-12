'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { EmojiPicker } from '@/components/social/EmojiPicker'

interface DMRoomProps {
  partner: { id: string; username: string; display_name?: string; avatar_url?: string; is_verified?: boolean }
  currentUserId: string
  initialMessages: any[]
}

export function DMRoom({ partner, currentUserId, initialMessages }: DMRoomProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
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
    const content = text.trim()
    setText('')
    const { data } = await supabase.from('messages')
      .insert({ sender_id: currentUserId, dm_recipient_id: partner.id, content, message_type: 'text' })
      .select('id, content, created_at, sender_id')
      .single()
    if (data) setMessages(m => [...m, { ...data, sender: null }])
    setSending(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm sticky top-0 z-10">
        <Link href="/messages" className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <Link href={`/profile/${partner.username}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-sm font-black text-white">
            {partner.avatar_url ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" /> : (partner.display_name || partner.username)[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{partner.display_name || partner.username}</p>
            <p className="text-xs text-zinc-500">@{partner.username}</p>
          </div>
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(m => {
          const isMe = m.sender_id === currentUserId
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              {!isMe && (
                <div className="w-7 h-7 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-xs font-black text-white overflow-hidden">
                  {partner.avatar_url ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" /> : partner.username[0].toUpperCase()}
                </div>
              )}
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                isMe ? 'bg-green-500 text-black rounded-br-sm' : 'bg-zinc-800 text-white rounded-bl-sm'
              }`}>
                {m.content}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950">
        <div className="flex gap-2 items-center">
          <input
            ref={textInputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={`Message @${partner.username}…`}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"
          />
          <EmojiPicker onSelect={insertAtCursor} />
          <button onClick={send} disabled={!text.trim() || sending}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black p-2.5 rounded-xl transition-colors">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
