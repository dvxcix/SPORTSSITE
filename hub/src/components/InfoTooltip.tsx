'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

// Replaces bare native `title=` attributes (plain OS tooltip, no styling
// control) with a small spring-animated card matching the site's theme —
// used for column-header/stat explanations across Dugout, Pitcher Report,
// Weather Lab, etc. Content passed in here must be public-facing: no
// internal formulas, jargon, or "(manual)" markers a beta tester shouldn't
// see — that's a copy rule enforced at each call site, not by this
// component itself.
export function InfoTooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [show, setShow] = useState(false)
  if (!content) return <>{children}</>
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', cursor: 'help' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            style={{
              position: 'absolute', bottom: 'calc(100% + 9px)', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 8,
              padding: '8px 11px', fontSize: 11, fontWeight: 500, color: 'var(--text-1)',
              whiteSpace: 'normal', width: 'max-content', maxWidth: 210, zIndex: 200,
              boxShadow: '0 10px 28px rgba(0,0,0,0.45)', pointerEvents: 'none', textAlign: 'left', lineHeight: 1.45,
            }}
          >
            {content}
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: '5px solid var(--surface-3)',
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
