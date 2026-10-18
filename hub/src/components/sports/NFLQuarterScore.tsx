import type { NflQuarterRow } from '@/lib/nflGameCenter'
import { TeamLogo } from './PlayerAvatar'

export function NFLQuarterScore({ rows }: { rows: NflQuarterRow[] }) {
  if (!rows.some(row => row.periods.some(value => value != null))) return null
  return <div style={{ overflowX: 'auto', margin: '12px 0', border: '1px solid var(--border)', borderRadius: 12 }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
      <caption className="sr-only">Score by quarter</caption>
      <thead><tr><th scope="col" style={{ padding: 12, textAlign: 'left' }}>Team</th>
        {rows[0].periods.map((_, i) => <th scope="col" key={i}>{i < 4 ? i + 1 : 'OT'}</th>)}<th scope="col">Total</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.team} style={{ borderTop: '1px solid var(--border)' }}>
        <th scope="row" style={{ padding: 12 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TeamLogo logo={row.logo} name={row.team} size={22} />{row.team}</span></th>
        {row.periods.map((score, i) => <td key={i}>{score ?? '—'}</td>)}<td style={{ fontWeight: 800 }}>{row.total}</td>
      </tr>)}</tbody>
    </table>
  </div>
}
