'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowDown, ArrowLeft, Image as ImageIcon, LockKeyhole, Reply, Send, Sparkles, X } from 'lucide-react'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { notify } from '@/lib/notify'
import { BlockUserButton } from '@/components/social/BlockUserButton'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'
import { GifPicker } from '@/components/social/GifPicker'

interface DMRoomProps {
  partner: { id: string; username: string; display_name?: string; avatar_url?: string; avatar_ring_style?: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit'; avatar_ring_color?: string; is_verified?: boolean }
  currentUserId: string
  initialMessages: DMMessage[]
}

export type DMMessage = {
  id: string
  content: string
  created_at: string
  sender_id: string
  reply_to_id?: string | null
  sender?: { username?: string; display_name?: string; avatar_url?: string; avatar_ring_style?: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit'; avatar_ring_color?: string } | null
  reply_to?: Pick<DMMessage, 'id' | 'content' | 'sender_id'> | null
  media_urls?: string[] | null
}

export function DMRoom({ partner, currentUserId, initialMessages }: DMRoomProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [unseenCount, setUnseenCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)
  const supabase = useMemo(() => createClient(), [])

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
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [atBottom, messages])

  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
    void supabase.from('notifications').update({ read: true })
      .eq('user_id', currentUserId).eq('actor_id', partner.id).eq('type', 'message').eq('read', false)
  }, [currentUserId, partner.id, supabase])

  useEffect(() => {
    const channel = supabase.channel(`dm-${[currentUserId, partner.id].sort().join('-')}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `dm_recipient_id=eq.${currentUserId}`,
      }, async (payload) => {
        const incoming = payload.new as DMMessage
        if (incoming.sender_id !== partner.id) return
        const { data } = await supabase.from('users').select('username, display_name, avatar_url, avatar_ring_style, avatar_ring_color').eq('id', incoming.sender_id).single()
        setMessages(current => current.some(message => message.id === incoming.id) ? current : [...current, { ...incoming, sender: data }])
        if (!atBottomRef.current) setUnseenCount(count => count + 1)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [currentUserId, partner.id, supabase])

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

  async function send() {
    if ((!text.trim() && !imageUrl) || sending || uploadingImage) return
    setSending(true)
    setError('')
    const content = text.trim()
    try {
      const { data, error: err } = await supabase.from('messages')
        .insert({ sender_id: currentUserId, dm_recipient_id: partner.id, content, message_type: imageUrl ? 'media' : 'text', reply_to_id: replyingTo?.id ?? null, media_urls: imageUrl ? [imageUrl] : [] })
        .select('id, content, created_at, sender_id, reply_to_id, media_urls')
        .single()
      if (err || !data) {
        setError(err?.code === '42501' ? "Couldn't send that message — try again in a moment." : 'Message failed to send — please try again.')
        return
      }
      setText('')
      setImageUrl('')
      setReplyingTo(null)
      setMessages(current => current.some(message => message.id === data.id)
        ? current
        : [...current, { ...data, sender: null }])
      requestAnimationFrame(jumpToLatest)

      const { data: me } = await supabase.from('users').select('username').eq('id', currentUserId).single()
      void notify(supabase, {
        userId: partner.id, actorId: currentUserId, type: 'message',
        message: 'sent you a message', link: me?.username ? `/messages/${me.username}` : null,
        targetId: currentUserId, targetType: 'user',
      })
    } catch {
      setError('Message failed to send — please try again.')
    } finally {
      setSending(false)
    }
  }

  async function uploadImage(file: File) {
    setUploadingImage(true)
    setError('')
    try {
      const result = await uploadMedia(file, 'messages')
      if ('error' in result) setError(result.error)
      else setImageUrl(result.publicUrl)
    } catch {
      setError('Image upload failed. Try again.')
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="ss-dm-room">
      {/* Header */}
      <div className="ss-dm-header">
        <Link href="/messages" className="ss-dm-back" aria-label="Back to messages">
          <ArrowLeft size={18} />
        </Link>
        <Link href={`/profile/${partner.username}`} className="ss-dm-partner">
          <MemberAvatar src={partner.avatar_url} name={partner.display_name || partner.username} size={40} ringStyle={partner.avatar_ring_style} ringColor={partner.avatar_ring_color} />
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
      {error && <p className="ss-dm-error" role="alert">{error}</p>}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="ss-dm-messages">
        <div className="ss-dm-thread-start"><Sparkles size={13} /><span>Your conversation with @{partner.username}</span></div>
        {messages.map(m => {
          const isMe = m.sender_id === currentUserId
          const replyTarget = m.reply_to ?? messages.find(message => message.id === m.reply_to_id)
          return (
            <div id={`message-${m.id}`} key={m.id} className={`ss-dm-message ${isMe ? 'is-mine' : ''}`}>
              {!isMe && (
                <MemberAvatar src={partner.avatar_url} name={partner.display_name || partner.username} size={28} ringStyle={partner.avatar_ring_style} ringColor={partner.avatar_ring_color} />
              )}
              <div className="ss-dm-bubble-wrap">
                {replyTarget && <button type="button" className="ss-dm-reply-context" onClick={() => document.getElementById(`message-${replyTarget.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Reply size={10}/><span>{replyTarget.sender_id === currentUserId ? 'You' : partner.display_name || partner.username}</span><p>{replyTarget.content}</p></button>}
                <div className="ss-dm-bubble"><LinkifiedText text={m.content || ''} /></div>
                {m.media_urls?.[0] && <SafeImage src={m.media_urls[0]} alt="" className="ss-dm-media"/>}
                <div className="ss-dm-message-meta"><time>{new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time><button type="button" onClick={() => { setReplyingTo(m); textInputRef.current?.focus() }} aria-label="Reply to message"><Reply size={11}/> Reply</button></div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {!atBottom && <button type="button" className="ss-dm-new" onClick={jumpToLatest}><ArrowDown size={14}/>{unseenCount ? `${unseenCount} new` : 'Latest'}</button>}

      {/* Input */}
      <div className="ss-dm-composer">
        {replyingTo && <div className="ss-dm-replying"><Reply size={12}/><div><span>Replying to {replyingTo.sender_id === currentUserId ? 'yourself' : partner.display_name || partner.username}</span><p>{replyingTo.content}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={14}/></button></div>}
        {imageUrl && <div className="ss-chat-media-preview"><SafeImage src={imageUrl} alt="Upload preview"/><button type="button" onClick={() => setImageUrl('')} aria-label="Remove image"><X size={13}/></button></div>}
        <div className="ss-dm-composer-row">
          <textarea
            ref={textInputRef}
            value={text}
            onChange={e => { setText(e.target.value); if (error) setError('') }}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={`Message @${partner.username}…`}
            className="ss-dm-input"
            rows={1}
            maxLength={1000}
            aria-label={`Message ${partner.display_name || partner.username}`}
          />
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }}/>
          <button type="button" className="ss-chat-attach" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} aria-label="Attach image"><ImageIcon size={16}/></button>
          <EmojiPicker onSelect={insertAtCursor} />
          <GifPicker uploadKind="messages" onSelect={setImageUrl}/>
          <button type="button" onClick={send} disabled={(!text.trim() && !imageUrl) || sending || uploadingImage}
            className="ss-dm-send" aria-label="Send message">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
