'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { DerbyPlayer } from './HrDerbyTable'
import type { PropLine } from '@/lib/hrDerbyOdds'

function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}` }

type Outcome = 'won' | 'lost' | undefined
function outcomeBg(o: Outcome) {
  if (o === 'won') return 'rgba(34,197,94,0.16)'
  if (o === 'lost') return 'rgba(248,113,113,0.10)'
  return undefined
}
function outcomeMark(o: Outcome) {
  if (o === 'won') return ' ✅'
  if (o === 'lost') return ' ❌'
  return ''
}

type SortKey = 'player' | 'label' | 'line' | 'overOdds' | 'underOdds' | 'real'
type Row = PropLine & { real: number | null; realLabel: string; flagged?: boolean; overOutcome?: Outcome; underOutcome?: Outcome }

export function SortablePropTable({ rows }: { rows: Row[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('player')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortKey) {
        case 'player': av = a.player; bv = b.player; break
        case 'label': av = a.label; bv = b.label; break
        case 'line': av = a.line; bv = b.line; break
        case 'overOdds': av = a.overOdds; bv = b.overOdds; break
        case 'underOdds': av = a.underOdds; bv = b.underOdds; break
        case 'real': av = a.real ?? -Infinity; bv = b.real ?? -Infinity; break
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  const headers: { key: SortKey; label: string; align?: 'left' | 'center' }[] = [
    { key: 'player', label: 'Player', align: 'left' },
    { key: 'label', label: 'Prop', align: 'left' },
    { key: 'line', label: 'Line' },
    { key: 'overOdds', label: 'Over' },
    { key: 'underOdds', label: 'Under' },
    { key: 'real', label: 'Your Number' },
  ]

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
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
          {sorted.map((pl, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{pl.player} {pl.flagged && '❓'}</td>
              <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)' }}>{pl.label}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{pl.line}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12, background: outcomeBg(pl.overOutcome) }}>{fmtOdds(pl.overOdds)}{outcomeMark(pl.overOutcome)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12, background: outcomeBg(pl.underOutcome) }}>{fmtOdds(pl.underOdds)}{outcomeMark(pl.underOutcome)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>{pl.realLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
