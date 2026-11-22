'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Ellipsis, Share2 } from 'lucide-react'
import { FloatingSurface } from '@/components/ui/FloatingSurface'

export function ProfileActions({ username, children }: { username: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const firstAction = useRef<HTMLButtonElement>(null)
  useEffect(()=>{if(open)firstAction.current?.focus({preventScroll:true})},[open])
  async function share() {
    const url = `${window.location.origin}/profile/${username}`
    if (navigator.share) {
      await navigator.share({ title: `@${username} on SlipSurge`, url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  if(children)return <>
    <button type="button" ref={anchor} onClick={()=>setOpen(value=>!value)} aria-label={`More actions for @${username}`} aria-haspopup="dialog" aria-expanded={open} className="ss-profile-more"><Ellipsis size={18}/></button>
    <FloatingSurface open={open} anchorRef={anchor} onClose={()=>setOpen(false)} role="dialog" ariaLabel="Profile actions" className="ss-profile-actions-menu" width={240}>
      <div onKeyDown={event=>{
        if(event.key==='Escape'){event.stopPropagation();setOpen(false);anchor.current?.focus();return}
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
        const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
        if(index<0)return
        event.preventDefault()
        buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus()
      }} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)&&event.relatedTarget!==anchor.current)setOpen(false)}}>
      <button type="button" ref={firstAction} onClick={share}><Share2 size={15}/>{copied?'Link copied':'Share profile'}</button>
      {children}
      </div>
    </FloatingSurface>
  </>
  return <button type="button" onClick={share} aria-label={`Share @${username}'s profile`} className="ss-profile-more">
    {copied ? <Check size={14} className="text-[var(--accent)]" /> : <Share2 size={14} />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
  </button>
}
