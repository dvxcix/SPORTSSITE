'use client'

import { useEffect, useRef, useState } from 'react'
import type { DerbyPlayer } from './HrDerbyTable'
import { computeCashedProps, fmtCashOdds, type CashedProp, type LiveHr } from '@/lib/hrDerbyLiveCash'

export function LiveCashedProps({ hrs, players }: { hrs: LiveHr[]; players: DerbyPlayer[] }) {
  const seenRef = useRef(new Set<string>())
  const [order, setOrder] = useState<string[]>([])
  const [byKey, setByKey] = useState<Map<string, CashedProp>>(new Map())

  useEffect(() => {
    const current = computeCashedProps(hrs, players)
    const fresh: string[] = []
    const next = new Map(byKey)
    for (const c of current) {
      next.set(c.key, c)
      if (!seenRef.current.has(c.key)) {
        seenRef.current.add(c.key)
        fresh.push(c.key)
      }
    }
    if (fresh.length > 0) {
      setByKey(next)
      setOrder(prev => [...fresh, ...prev])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrs])

  if (order.length === 0) return null

  return (
    <div className="ss-card" style={{ padding: 14, marginBottom: 20, border: '1px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, color: '#06070A', background: 'var(--accent)', padding: '3px 9px', borderRadius: 99 }}>
          ✅ CASHED
        </span>
        <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>Props Cashing Live</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
        {order.map(key => {
          const c = byKey.get(key)
          if (!c) return null
          return (
            <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{c.label}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{fmtCashOdds(c.odds)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
