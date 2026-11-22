'use client'

import { useEffect, useRef, useState } from 'react'
import { Flag, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import { BlockUserButton } from './BlockUserButton'

export function CommentActions({ name, isOwn, currentUserId, authorId, username, onEdit, onDelete, onReport }: {
  name: string; isOwn: boolean; currentUserId?: string; authorId: string; username?: string
  onEdit: () => void; onDelete: () => void; onReport: () => void
}) {
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const close = () => { setOpen(false); anchor.current?.focus({ preventScroll: true }) }
  useEffect(() => { if (open) panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }) }, [open])
  if (!currentUserId) return null
  return <>
    <button ref={anchor} type="button" className="ss-comment-more" aria-label={`Actions for ${name}'s comment`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}><MoreHorizontal size={17} aria-hidden="true" /></button>
    <FloatingSurface open={open} anchorRef={anchor} onClose={() => setOpen(false)} role="dialog" ariaLabel="Comment actions" className="ss-profile-actions-menu" width={240} align="end">
      <div ref={panel} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')), index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (index < 0) return
        event.preventDefault()
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== anchor.current) setOpen(false) }}>
        {isOwn ? <>
          <button type="button" onClick={() => { close(); onEdit() }}><Pencil size={15} />Edit comment</button>
          <button type="button" className="danger" onClick={() => { close(); onDelete() }}><Trash2 size={15} />Delete comment</button>
        </> : <>
          <button type="button" onClick={() => { close(); onReport() }}><Flag size={15} />Report comment</button>
          {username && <BlockUserButton currentUserId={currentUserId} targetUserId={authorId} targetUsername={username} initialBlocked={false} variant="dropdown-item" onDone={close} />}
        </>}
      </div>
    </FloatingSurface>
  </>
}
