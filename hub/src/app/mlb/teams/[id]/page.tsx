import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { TierGate } from '@/components/layout/TierGate'
import { mlbHeadshot, mlbTeamLogo } from '@slipsurge/core/mlb-api'
import styles from '@/components/product/EntityPage.module.css'

export const revalidate = 1800

type Team = {
  id: number
  name: string
  abbreviation?: string
  locationName?: string
  venue?: { name?: string }
  league?: { name?: string }
  division?: { name?: string }
}

type RosterPlayer = {
  person: { id: number; fullName: string }
  jerseyNumber?: string
  position?: { name?: string; abbreviation?: string; type?: string }
  status?: { description?: string }
}

async function getTeam(id: string): Promise<{ team: Team; roster: RosterPlayer[] } | null> {
  if (!/^\d+$/.test(id)) return null
  const [teamRes, rosterRes] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/teams/${id}`, { next: { revalidate } }),
    fetch(`https://statsapi.mlb.com/api/v1/teams/${id}/roster?rosterType=active`, { next: { revalidate } }),
  ])
  if (!teamRes.ok || !rosterRes.ok) return null
  const [teamPayload, rosterPayload] = await Promise.all([teamRes.json(), rosterRes.json()])
  const team = teamPayload?.teams?.[0] as Team | undefined
  if (!team) return null
  return { team, roster: (rosterPayload?.roster ?? []) as RosterPlayer[] }
}

const POSITION_ORDER = ['Pitcher', 'Catcher', 'Infielder', 'Outfielder', 'Designated Hitter', 'Two-Way Player']

export default async function MlbTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getTeam(id)
  if (!data) notFound()

  const groups = new Map<string, RosterPlayer[]>()
  for (const player of data.roster) {
    const group = player.position?.type || 'Roster'
    const current = groups.get(group) ?? []
    current.push(player)
    groups.set(group, current)
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    const ai = POSITION_ORDER.indexOf(a)
    const bi = POSITION_ORDER.indexOf(b)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })

  return (
    <TierGate requiredTier="basic" label="MLB Team Hub">
      <main className={styles.page} style={{ '--entity-color': '#9cff39' } as CSSProperties}>
        <header className={styles.hero}>
          <div className={styles.avatar}>
            <img src={mlbTeamLogo(data.team.id)} alt={`${data.team.name} logo`} />
          </div>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>MLB team hub</p>
            <h1 className={styles.title}>{data.team.name}</h1>
            <div className={styles.meta}>
              {data.team.league?.name && <span className={styles.metaPill}>{data.team.league.name}</span>}
              {data.team.division?.name && <span className={styles.metaPill}>{data.team.division.name}</span>}
              {data.team.venue?.name && <span className={styles.metaPill}>{data.team.venue.name}</span>}
              <span className={styles.metaPill}>{data.roster.length} active players</span>
            </div>
          </div>
        </header>

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Active roster</h2>
          <span className={styles.sectionMeta}>Official club roster</span>
        </div>
        <section className={styles.panel}>
          {sortedGroups.map(([group, players]) => (
            <div className={styles.group} key={group}>
              <div className={styles.groupLabel}>{group}</div>
              {players.map(player => (
                <Link key={player.person.id} href={`/players/${player.person.id}`} className={styles.row}>
                  <div className={styles.rowAvatar}>
                    <img src={mlbHeadshot(player.person.id)} alt="" loading="lazy" />
                  </div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>{player.person.fullName}</div>
                    <div className={styles.rowMeta}>
                      {player.position?.name || 'Active roster'}
                      {player.jerseyNumber ? ` · #${player.jerseyNumber}` : ''}
                      {player.status?.description && player.status.description !== 'Active' ? ` · ${player.status.description}` : ''}
                    </div>
                  </div>
                  <ChevronRight className={styles.chevron} size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ))}
        </section>
      </main>
    </TierGate>
  )
}
