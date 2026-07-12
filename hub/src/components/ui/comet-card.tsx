'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// A perspective 3D tilt card with a mouse-following "comet" glare, the same
// effect family as Aceternity's Comet Card — rebuilt here rather than
// installed from their registry (this app vendors Aceternity pieces as
// plain local files, same as Tooltip in tooltip-card.tsx, not an npm
// package). Style updates happen via direct ref.style writes on
// mousemove instead of setState, since a card can get dozens of mousemove
// events per second and re-rendering React on every one of them is the
// difference between a smooth tilt and a janky one.
export function CometCard({
  children,
  className,
  rotateDepth = 17.5,
  translateDepth = 20,
}: {
  children: React.ReactNode
  className?: string
  rotateDepth?: number
  translateDepth?: number
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width // 0..1
    const py = (e.clientY - rect.top) / rect.height // 0..1
    const rotateY = (px - 0.5) * 2 * rotateDepth
    const rotateX = (0.5 - py) * 2 * rotateDepth
    const translateX = (px - 0.5) * 2 * (translateDepth / 4)
    const translateY = (py - 0.5) * 2 * (translateDepth / 4)

    card.style.transform =
      `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateX(${translateX}px) translateY(${translateY}px) scale3d(1.04,1.04,1.04)`

    if (glareRef.current) {
      glareRef.current.style.background =
        `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.25), rgba(255,255,255,0) 45%)`
    }
  }

  const handleMouseEnter = () => setHovering(true)
  const handleMouseLeave = () => {
    setHovering(false)
    const card = cardRef.current
    if (card) card.style.transform = 'rotateX(0deg) rotateY(0deg) translateX(0px) translateY(0px) scale3d(1,1,1)'
  }

  return (
    <div style={{ perspective: 1200 }} className={cn('inline-block', className)}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative',
          transformStyle: 'preserve-3d',
          transition: hovering ? 'box-shadow 150ms' : 'transform 400ms cubic-bezier(0.23,1,0.32,1), box-shadow 400ms',
          boxShadow: hovering
            ? '0 25px 50px -12px rgba(0,0,0,0.6), 0 0 40px -8px var(--accent)'
            : '0 10px 30px -10px rgba(0,0,0,0.5)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {children}
        {/* comet glare — tracks the cursor, only visible while hovering */}
        <div
          ref={glareRef}
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            opacity: hovering ? 1 : 0, transition: 'opacity 200ms',
            mixBlendMode: 'overlay',
          }}
        />
      </div>
    </div>
  )
}
