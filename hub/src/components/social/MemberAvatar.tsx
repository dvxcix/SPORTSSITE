import type { CSSProperties } from 'react'

type MemberTone = 'default' | 'creator' | 'advanced' | 'ultimate'

function hueFor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return Math.abs(hash) % 360
}

export function MemberAvatar({
  src,
  name,
  size = 44,
  tone = 'default',
  online = false,
  className = '',
}: {
  src?: string | null
  name: string
  size?: number
  tone?: MemberTone
  online?: boolean
  className?: string
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
  const style = {
    '--member-size': `${size}px`,
    '--member-hue': hueFor(name),
  } as CSSProperties

  return (
    <span className={`ss-member-avatar is-${tone} ${className}`} style={style} aria-hidden="true">
      <span className="ss-member-avatar-media">
        {src ? <img src={src} alt="" /> : <span>{initials}</span>}
      </span>
      {online && <span className="ss-member-presence" />}
    </span>
  )
}
