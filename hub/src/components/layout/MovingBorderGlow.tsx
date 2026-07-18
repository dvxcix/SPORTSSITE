'use client'
import { useRef, type ReactNode } from 'react'
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useTransform } from 'motion/react'

// Faithful port of Aceternity's "Moving Border" (ui.aceternity.com/components/
// moving-border) — NOT a spinning conic-gradient behind the whole button (an
// earlier attempt here looked like a static glowing blob, not a moving light).
// The real technique: an invisible SVG rect traces the button's own outline,
// a small radial-gradient dot is animated to a point along that path every
// frame (getPointAtLength), and it all sits BEHIND an opaque inner content
// layer — overflow:hidden + a ~1px gap between the two means only the sliver
// of the dot currently crossing an edge is ever visible, reading as a single
// point of light traveling around the border, exactly like the demo.
function MovingDot({ duration = 3000, rx = 7, ry = 7 }: { duration?: number; rx?: number; ry?: number }) {
  const pathRef = useRef<SVGRectElement>(null)
  const progress = useMotionValue(0)

  useAnimationFrame(time => {
    const length = pathRef.current?.getTotalLength()
    if (length) {
      const pxPerMs = length / duration
      progress.set((time * pxPerMs) % length)
    }
  })

  const x = useTransform(progress, val => pathRef.current?.getPointAtLength(val).x ?? 0)
  const y = useTransform(progress, val => pathRef.current?.getPointAtLength(val).y ?? 0)
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`

  return (
    <>
      <svg preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect fill="none" width="100%" height="100%" rx={rx} ry={ry} ref={pathRef} />
      </svg>
      <motion.div style={{ position: 'absolute', top: 0, left: 0, transform }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'radial-gradient(circle, #fff6d6 0%, #f5d576 45%, transparent 75%)',
        }} />
      </motion.div>
    </>
  )
}

export function MovingBorderGlow({ children, borderRadius = 8, duration = 3000 }: {
  children: ReactNode; borderRadius?: number; duration?: number
}) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius, padding: 1.25 }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <MovingDot duration={duration} rx={borderRadius - 1} ry={borderRadius - 1} />
      </div>
      <div style={{ position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}
