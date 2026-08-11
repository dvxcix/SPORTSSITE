import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Shield } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { TierGate } from '@/components/layout/TierGate'
import styles from '@/components/product/EntityPage.module.css'

export const revalidate = 0

function currentNflSeason(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  return now.getUTCMonth() < 2 ? year - 1 : year
}

async function getTeamData(abbr: string) {
  const admin = createAdminClient()
  const { data: team } = await admin.from('nfl_teams').select('*').eq('team_abbr', abbr.toUpperCase()).maybeSingle()
  if (!team) return null
  const { data: roster } = await admin
    .from('nfl_players')
    .select('gsis_id, display_name, position, position_group, jersey_number, headshot, status, years_of_experience, college_name')
    .eq('latest_team', team.team_abbr)
    .gte('last_season', currentNflSeason())
    .order('position_group', { ascending: true })
    .order('display_name', { ascending: true })
  return { team, roster: roster ?? [] }
}

export async function generateMetadata({ params }: { params: Promise<{ abbr: string }> }): Promise<Metadata> {
  const { abbr } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('nfl_teams').select('team_name').eq('team_abbr', abbr.toUpperCase()).maybeSingle()
  return { title: data?.team_name ? `${data.team_name} — SlipSurge` : 'Team — SlipSurge' }
}

export default async function NflTeamPage({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params
  const data = await getTeamData(abbr)
  if (!data) notFound()
  const { team, roster } = data
  const groups = new Map<string, typeof roster>()
  for (const player of roster) {
    const key = player.position_group || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(player)
  }

  return (
    <TierGate requiredTier="basic" label="Team Pages">
      <main className={styles.page} style={{ '--entity-color': team.team_color ?? '#9cff39' } as React.CSSProperties}>
        <header className={styles.hero}>
          <div className={styles.avatar}>
            {team.team_logo_espn ? <img src={team.team_logo_espn} alt="" /> : <Shield size={38} />}
          </div>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>NFL team hub</p>
            <h1 className={styles.title}>{team.team_name}</h1>
            <div className={styles.meta}>
              <span className={styles.metaPill}>{team.team_conf} {team.team_division}</span>
              <span className={styles.metaPill}>{roster.length} active players</span>
            </div>
          </div>
        </header>

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Current roster</h2>
          <span className={styles.sectionMeta}>{currentNflSeason()} season</span>
        </div>
        <section className={styles.panel}>
          {roster.length === 0 ? <div className={styles.empty}>Current roster data has not synced yet.</div> : Array.from(groups.entries()).map(([group, players]) => (
            <div className={styles.group} key={group}>
              <div className={styles.groupLabel}>{group}</div>
              {players.map(player => (
                <Link key={player.gsis_id} href={`/nfl/players/${player.gsis_id}`} className={styles.row}>
                  <div className={styles.rowAvatar}>
                    {player.headshot ? <img src={player.headshot} alt="" /> : <span>{player.position || 'NFL'}</span>}
                  </div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>{player.display_name}</div>
                    <div className={styles.rowMeta}>{player.position}{player.jersey_number != null ? ` · #${player.jersey_number}` : ''}{player.status ? ` · ${player.status}` : ''}</div>
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
