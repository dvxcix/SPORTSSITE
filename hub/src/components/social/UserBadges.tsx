'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Award, FlaskConical, X, Zap } from 'lucide-react'
import { useUserBadges, type Badge } from '@/lib/badges'
import { FloatingSurface } from '@/components/ui/FloatingSurface'
import { SafeImage } from '@/components/ui/SafeImage'

// Stable membership IDs keep presentation independent of editable admin names.
function presentation(badge: Badge) {
  if (badge.id === 'fdcf34d2-d7ea-469d-b697-06f2750c3c53' || badge.name === 'Ultimate') return { kind: 'ultimate', label: 'Ultimate', Icon: Zap }
  if (badge.id === '08b02397-3837-4d71-b126-82f3643bf536' || badge.name === 'Advanced') return { kind: 'advanced', label: 'Advanced', Icon: Zap }
  if (badge.name === 'Beta Tester') return { kind: 'beta', label: 'Beta', Icon: FlaskConical }
  return null
}

function badgeOrder(badge: Badge) {
  const kind = presentation(badge)?.kind
  return kind === 'ultimate' ? 0 : kind === 'advanced' ? 1 : kind === 'beta' ? 2 : 3
}

export function UserBadges({ userId, size = 14, maxVisible = 4, badges: suppliedBadges, interactive = false }: {
  userId: string | null | undefined
  size?: number
  maxVisible?: number
  badges?: Badge[]
  /** Leave static inside an existing link, button or mention option. */
  interactive?: boolean
}) {
  const fetchedBadges = useUserBadges(suppliedBadges ? null : userId)
  const badges = [...(suppliedBadges ?? fetchedBadges)].sort((a, b) => badgeOrder(a) - badgeOrder(b))
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => { setOpen(false); anchor.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    if (!open) return
    closeButton.current?.focus({ preventScroll: true })
    // A badge can be inside My Picks. Escape dismisses this panel first,
    // without also reaching the parent drawer's window-level handler.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopImmediatePropagation(); close()
    }
    document.addEventListener('keydown', dismiss, true)
    return () => document.removeEventListener('keydown', dismiss, true)
  }, [open, close])
  if (!userId || badges.length === 0) return null

  const visible = badges.slice(0, Math.max(1, maxVisible))
  const hiddenCount = badges.length - visible.length
  const label = `Member badges: ${badges.map(badge => badge.name).join(', ')}`
  const marks = <>{visible.map(badge => {
    const mark = presentation(badge)
    return <span key={badge.id} className={`ss-user-badge-mark${mark ? ` is-${mark.kind}` : ' is-custom'}`}>
      {mark ? <><mark.Icon size={12} strokeWidth={2} /><span>{mark.label}</span></> : <SafeImage className="ss-user-badge-icon" src={badge.icon_url} alt="" loading="eager" fallback={<Award className="ss-user-badge-fallback" size={14} />} />}
    </span>
  })}{hiddenCount > 0 && <span className="ss-user-badge-more">+{hiddenCount}</span>}</>
  const style = { '--badge-art-size': `${Math.max(14, Math.min(size, 20))}px` } as CSSProperties

  return <span className="ss-user-badges" style={style}>
    {interactive ? <button ref={anchor} type="button" className="ss-user-badge-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}><span aria-hidden="true">{marks}</span></button> : <span className="ss-user-badge-static" role="img" aria-label={label}><span aria-hidden="true">{marks}</span></span>}
    {interactive && <FloatingSurface open={open} anchorRef={anchor} onClose={close} role="dialog" ariaLabel="Member badges" className="ss-member-badge-panel" width={300}>
      <div className="ss-member-badge-panel-head"><strong>Member badges</strong><button ref={closeButton} type="button" aria-label="Close member badges" onClick={close}><X size={16} /></button></div>
      <div className="ss-member-badge-list">{badges.map(badge => <div key={badge.id} className="ss-badge-tooltip">
        <span className="ss-badge-tooltip-art"><SafeImage src={badge.icon_url} alt="" fallback={<Award size={20} />} /></span>
        <span><strong>{badge.name}</strong><small>{badge.description}</small></span>
      </div>)}</div>
    </FloatingSurface>}
  </span>
}
