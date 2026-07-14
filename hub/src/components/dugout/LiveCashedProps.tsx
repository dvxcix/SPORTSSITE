'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { DerbyPlayer } from './HrDerbyTable'
import { computeCashedProps, fmtCashOdds, type CashedProp, type LiveHr } from '@/lib/hrDerbyLiveCash'

type Row = CashedProp & { seq: number }
type SortKey = 'seq' | 'players' | 'category' | 'prop' | 'odds'

function PlayerCell({ names, players }: { names: string[]; players: Map<string, DerbyPlayer> }) {
  if (names.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Field</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {names.map(name => {
        const p = players.get(name)
        return (
          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {p && (
              <span style={{ position: 'relative', width: 20, height: 20, flexShrink: 0 }}>
                <img src={p.headshotUrl} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                <img src={p.teamLogoUrl} alt={p.teamAbbr} style={{ position: 'absolute', bottom: -2, right: -3, width: 10, height: 10, objectFit: 'contain', filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.9))' }} />
              </span>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{name}</span>
          </span>
        )
      })}
    </div>
  )
}

export function LiveCashedProps({ hrs, players }: { hrs: LiveHr[]; players: DerbyPlayer[] }) {
  const byName = useMemo(() => new Map(players.map(p => [p.name, p])), [players])
  const seenRef = useRef(new Map<string, number>())
  const seqRef = useRef(0)
  const [rows, setRows] = useState<Row[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('seq')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const current = computeCashedProps(hrs, players)
    let changed = false
    for (const c of current) {
      if (!seenRef.current.has(c.key)) {
        seenRef.current.set(c.key, seqRef.current++)
        changed = true
      }
    }
    if (changed) {
      setRows(current.map(c => ({ ...c, seq: seenRef.current.get(c.key)! })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrs])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'seq' ? 'desc' : 'asc') }
  }

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortKey) {
        case 'seq': av = a.seq; bv = b.seq; break
        case 'players': av = a.players.join(', '); bv = b.players.join(', '); break
        case 'category': av = a.category; bv = b.category; break
        case 'prop': av = a.prop; bv = b.prop; break
        case 'odds': av = a.odds; bv = b.odds; break
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  if (rows.length === 0) return null

  const headers: { key: SortKey; label: string; align?: 'left' | 'center' }[] = [
    { key: 'players', label: 'Player', align: 'left' },
    { key: 'category', label: 'Market' },
    { key: 'prop', label: 'Prop', align: 'left' },
    { key: 'odds', label: 'Odds' },
  ]

  return (
    <div className="ss-card" style={{ padding: 14, marginBottom: 20, border: '1px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 900, color: '#06070A', background: 'var(--accent)', padding: '3px 9px', borderRadius: 99 }}>
          ✅ CASHED
        </span>
        <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>Props Cashing Live</p>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {headers.map(h => (
                <th
                  key={h.key}
                  onClick={() => handleSort(h.key)}
                  style={{
                    textAlign: h.align ?? 'center', padding: '8px 10px', fontSize: 10.5,
                    color: sortKey === h.key ? 'var(--accent)' : 'var(--text-3)',
                    textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {h.label}
                    {sortKey === h.key
                      ? (sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />)
                      : <ArrowUpDown size={10} style={{ opacity: 0.4 }} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 10px' }}>
                  <PlayerCell names={row.players} players={byName} />
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)' }}>{row.category}</td>
                <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)' }}>{row.prop}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: 'var(--accent)' }}>{fmtCashOdds(row.odds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
