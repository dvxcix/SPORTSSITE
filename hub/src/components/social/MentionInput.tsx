'use client'

import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AtSign, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { UserBadges } from './UserBadges'

export type MentionUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  tier: string | null
}

type MentionInputProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  currentUserId?: string | null
}

function activeMention(value: string, caret: number) {
  const beforeCaret = value.slice(0, caret)
  const match = beforeCaret.match(/(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/)
  if (!match) return null
  return { query: match[1], start: beforeCaret.lastIndexOf('@'), end: caret }
}

export const MentionInput = forwardRef<HTMLTextAreaElement, MentionInputProps>(function MentionInput({
  value, onValueChange, currentUserId, onKeyDown, onBlur, onClick, onKeyUp, ...props
}, forwardedRef) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(null)
  const [results, setResults] = useState<MentionUser[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const listboxId = useId()
  const supabase = useMemo(() => createClient(), [])
  const mentionQuery = mention?.query

  function assignRef(node: HTMLTextAreaElement | null) {
    localRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  function refreshMention(nextValue = value) {
    const nextMention = activeMention(nextValue, localRef.current?.selectionStart ?? nextValue.length)
    setMention(nextMention)
    setOpen(!!nextMention)
    setActiveIndex(0)
  }

  useEffect(() => {
    if (!open || mentionQuery === undefined) { setResults([]); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const query = mentionQuery.trim()
      let request = supabase.from('users')
        .select('id, username, display_name, avatar_url, is_verified, tier')
        .not('username', 'is', null)
        .order('follower_count', { ascending: false })
        .limit(8)
      if (query) request = request.or(`username.ilike.${query}%,display_name.ilike.%${query}%`)
      if (currentUserId) request = request.neq('id', currentUserId)
      const { data } = await request
      if (!cancelled) { setResults((data ?? []) as MentionUser[]); setLoading(false) }
    }, 120)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [currentUserId, mentionQuery, open, supabase])

  function selectUser(person: MentionUser) {
    if (!mention) return
    const insertion = `@${person.username} `
    onValueChange(value.slice(0, mention.start) + insertion + value.slice(mention.end))
    setOpen(false)
    setMention(null)
    requestAnimationFrame(() => {
      const caret = mention.start + insertion.length
      localRef.current?.focus()
      localRef.current?.setSelectionRange(caret, caret)
    })
  }

  return <div className="ss-mention-input-wrap">
    <textarea
      {...props}
      ref={assignRef}
      value={value}
      onChange={event => { onValueChange(event.target.value); refreshMention(event.target.value) }}
      onClick={event => { refreshMention(); onClick?.(event) }}
      onKeyUp={event => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) refreshMention(); onKeyUp?.(event) }}
      onKeyDown={event => {
        if (open && results.length) {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => (index + 1) % results.length); return }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => (index - 1 + results.length) % results.length); return }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            selectUser(results[Math.min(activeIndex, results.length - 1)])
            return
          }
        }
        if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); return }
        onKeyDown?.(event)
      }}
      onBlur={event => { window.setTimeout(() => setOpen(false), 140); onBlur?.(event) }}
      aria-autocomplete="list"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open && results.length ? `${listboxId}-${Math.min(activeIndex, results.length - 1)}` : undefined}
    />
    {open && <div id={listboxId} role="listbox" className="ss-mention-menu">
      <div className="ss-mention-menu-head"><AtSign size={13} /><span>Tag someone</span><small>{mention?.query ? `Searching "${mention.query}"` : 'People on SlipSurge'}</small></div>
      {loading && results.length === 0 ? <div className="ss-mention-empty"><Search size={14} /> Finding people...</div>
        : results.length === 0 ? <div className="ss-mention-empty">No matching accounts</div>
        : results.map((person, index) => <button
          id={`${listboxId}-${index}`} key={person.id} type="button" role="option" aria-selected={index === activeIndex}
          className={`ss-mention-option${index === activeIndex ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectUser(person)}
        >
          <span className="ss-mention-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : (person.display_name || person.username)[0].toUpperCase()}</span>
          <span className="ss-mention-identity"><span className="ss-mention-name">{person.display_name || person.username}{person.is_verified ? <i aria-label="Verified">&#10003;</i> : null}<UserBadges userId={person.id} size={15} maxVisible={3} /></span><small>@{person.username}</small></span>
          <AtSign className="ss-mention-action" size={16} />
        </button>)}
      <div className="ss-mention-menu-foot"><span>Arrow keys Navigate</span><span>Enter Select</span><span>Esc Close</span></div>
    </div>}
  </div>
})
