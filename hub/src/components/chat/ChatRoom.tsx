'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Image as ImageIcon, Reply, Send, TrendingUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/supabase/types'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { sendDesktopNotification } from '@/lib/desktopNotifications'
import { MentionInput } from '@/components/social/MentionInput'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { notifyMentions } from '@/lib/mentions'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'

interface ChatRoomProps {
  channelId: string
  channelSlug: string
  channelName: string
  initialMessages: Message[]
  currentUserId?: string
}

export function ChatRoom({ channelId, channelSlug, channelName, initialMessages, currentUserId }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [unseenCount, setUnseenCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)
  const supabase = useMemo(() => createClient(), [])

  function insertAtCursor(insertion: string) {
    const element = inputRef.current
    const start = element?.selectionStart ?? input.length
    const end = element?.selectionEnd ?? input.length
    setInput(input.slice(0, start) + insertion + input.slice(end))
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  useEffect(() => {
    const realtimeChannel = supabase
      .channel(`chat:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}`,
      }, async (payload) => {
        const newMessage = payload.new as Message
        const { data: sender } = await supabase
          .from('users')
          .select('id,username,display_name,avatar_url,is_verified,account_type')
          .eq('id', newMessage.sender_id)
          .single()
        const hydrated = { ...newMessage, sender: sender as Message['sender'] ?? undefined }
        setMessages(previous => previous.some(message => message.id === hydrated.id) ? previous : [...previous, hydrated])
        if (!atBottomRef.current && newMessage.sender_id !== currentUserId) setUnseenCount(count => count + 1)
        if (newMessage.sender_id !== currentUserId && document.visibilityState !== 'visible') {
          const senderName = sender?.display_name || sender?.username || 'Someone'
          void sendDesktopNotification(`# ${channelName} · ${senderName}`, newMessage.content || 'Shared a pick')
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(realtimeChannel) }
  }, [channelId, channelName, currentUserId, supabase])

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [atBottom, messages])

  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
  }, [])

  function handleScroll() {
    const viewport = scrollRef.current
    if (!viewport) return
    const nextAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80
    atBottomRef.current = nextAtBottom
    setAtBottom(nextAtBottom)
    if (nextAtBottom) setUnseenCount(0)
  }

  function jumpToLatest() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    atBottomRef.current = true
    setAtBottom(true)
    setUnseenCount(0)
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    if ((!input.trim() && !imageUrl) || !currentUserId || sending || uploadingImage) return
    const content = input.trim()
    setSendError('')
    setSending(true)
    const { data, error } = await supabase.from('messages').insert({
      channel_id: channelId, sender_id: currentUserId, content,
      reply_to_id: replyingTo?.id ?? null,
      media_urls: imageUrl ? [imageUrl] : [],
      message_type: imageUrl ? 'media' : 'text',
    }).select('id').single()
    if (!error && data) {
      setInput('')
      setImageUrl('')
      setReplyingTo(null)
      await notifyMentions(supabase, currentUserId, content, `/channels/${channelSlug}`, data.id, 'a channel message')
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setSendError('Message not sent. Try again.')
    }
    setSending(false)
  }

  async function uploadImage(file: File) {
    if (!currentUserId) return
    setUploadingImage(true)
    setSendError('')
    try {
      const result = await uploadMedia(file, 'messages')
      if ('error' in result) setSendError(result.error)
      else setImageUrl(result.publicUrl)
    } catch {
      setSendError('Image upload failed. Try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  return <div className="ss-chat-room">
    <div ref={scrollRef} onScroll={handleScroll} className="ss-chat-messages">
      {!messages.length && <div className="ss-chat-empty"><span>#</span><strong>{channelName}</strong><p>Start the conversation.</p></div>}
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const startsGroup = !previous || previous.sender_id !== message.sender_id || new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() > 300000
        const name = message.sender?.display_name || message.sender?.username || 'Member'
        const stamp = new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        const replyTarget = message.reply_to ?? messages.find(item => item.id === message.reply_to_id)
        return <article id={`message-${message.id}`} key={message.id} className={`ss-chat-message ${startsGroup ? 'starts-group' : ''} ${message.sender_id === currentUserId ? 'is-own' : ''}`}>
          {startsGroup ? (
            message.sender?.username
              ? <Link href={`/profile/${message.sender.username}`} className="ss-chat-avatar"><MemberAvatar src={message.sender.avatar_url} name={name} size={38} /></Link>
              : <MemberAvatar src={message.sender?.avatar_url} name={name} size={38} />
          ) : <time>{stamp}</time>}
          <div className="ss-chat-message-body">
            {startsGroup && <header>{message.sender?.username ? <Link href={`/profile/${message.sender.username}`}>{name}</Link> : <strong>{name}</strong>}{message.sender?.is_verified && <span className="ss-chat-verified">✓</span>}<time>{stamp}</time></header>}
            {replyTarget && <button type="button" className="ss-chat-reply-context" onClick={() => document.getElementById(`message-${replyTarget.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Reply size={11}/><span>{replyTarget.sender?.display_name || replyTarget.sender?.username || 'Member'}</span><p>{replyTarget.content}</p></button>}
            {message.pick_data ? <div className="ss-chat-pick"><div><TrendingUp size={10}/> PICK</div><strong>{message.pick_data.team}</strong><span>{message.pick_data.line} · {message.pick_data.odds}</span></div> : <p><LinkifiedText text={message.content || ''} /></p>}
            {message.media_urls?.[0] && <SafeImage src={message.media_urls[0]} alt="" className="ss-chat-media"/>}
            <button type="button" className="ss-chat-inline-action" onClick={() => { setReplyingTo(message); inputRef.current?.focus() }} aria-label={`Reply to ${name}`}><Reply size={12}/> Reply</button>
          </div>
        </article>
      })}
      <div ref={bottomRef}/>
    </div>
    {!atBottom && <button type="button" className="ss-chat-new" onClick={jumpToLatest}><ArrowDown size={14}/>{unseenCount ? `${unseenCount} new` : 'Latest'}</button>}
    <div className="ss-chat-composer-wrap">
      {replyingTo && <div className="ss-chat-replying"><Reply size={12}/><div><span>Replying to {replyingTo.sender?.display_name || replyingTo.sender?.username || 'member'}</span><p>{replyingTo.content}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={14}/></button></div>}
      {imageUrl && <div className="ss-chat-media-preview"><SafeImage src={imageUrl} alt="Upload preview"/><button type="button" onClick={() => setImageUrl('')} aria-label="Remove image"><X size={13}/></button></div>}
      {!currentUserId ? <p className="ss-chat-signin"><Link href="/auth/login">Sign in</Link> to join the conversation</p> : <form onSubmit={sendMessage} className="ss-chat-composer">
        <MentionInput ref={inputRef} value={input} onValueChange={value => { setInput(value); if (sendError) setSendError('') }} currentUserId={currentUserId} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
        }} placeholder={`Message #${channelName}`} maxLength={1000} rows={1}/>
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }}/>
        <button type="button" className="ss-chat-attach" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} aria-label="Attach image"><ImageIcon size={16}/></button>
        <EmojiPicker onSelect={insertAtCursor}/>
        <button type="submit" disabled={(!input.trim() && !imageUrl) || sending || uploadingImage} aria-label="Send message"><Send size={16}/></button>
      </form>}
      {sendError && <button type="button" className="ss-chat-send-error" onClick={() => inputRef.current?.form?.requestSubmit()}>{sendError}</button>}
    </div>
  </div>
}
