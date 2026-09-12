import type { CSSProperties } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'

type MemberTone = 'default' | 'creator' | 'advanced' | 'ultimate'
export type MemberRingStyle = 'none' | 'solid' | 'surge' | 'pulse' | 'orbit'

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
  ringStyle = 'surge',
  ringColor,
  online = false,
  className = '',
}: {
  src?: string | null
  name: string
  size?: number
  tone?: MemberTone
  ringStyle?: MemberRingStyle | null
  ringColor?: string | null
  online?: boolean
  className?: string
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
  const style = {
    '--member-size': `${size}px`,
    '--member-hue': hueFor(name),
    '--member-custom-ring': ringColor || undefined,
    width: size,
    height: size,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    flexBasis: size,
    flexGrow: 0,
    flexShrink: 0,
  } as CSSProperties

  return (
    <span className={`ss-member-avatar is-${tone} ring-${ringStyle || 'surge'} ${className}`} style={style} aria-hidden="true">
      <span className="ss-member-avatar-media">
        <SafeImage src={src} alt="" width={size} height={size} fallback={<span>{initials}</span>} />
      </span>
      {online && <span className="ss-member-presence" />}
    </span>
  )
}
