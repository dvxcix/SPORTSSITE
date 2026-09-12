import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Award, Check, Flame, MessageCircle, NotebookPen, Sparkles, Target, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import styles from './missions.module.css'

export const dynamic = 'force-dynamic'

type Mission = { key: string; title: string; current: number; target: number; period: 'daily' | 'weekly' | 'career'; points: number }
type Mastery = {
  points: number
  level: number
  totals: { posts: number; picks: number; wins: number; replies: number; following: number; communities: number; notes: number }
  missions: Mission[]
  achievements: string[]
}

const ACHIEVEMENTS: Record<string, { title: string; detail: string; icon: typeof Award }> = {
  first_signal: { title: 'First Signal', detail: 'Shared a first post or pick.', icon: Sparkles },
  ten_picks: { title: 'Board Builder', detail: 'Tracked 10 picks.', icon: Target },
  ten_wins: { title: 'Proven Read', detail: 'Recorded 10 graded wins.', icon: Trophy },
  conversation_starter: { title: 'In the Mix', detail: 'Joined 25 conversations.', icon: MessageCircle },
  clubhouse_regular: { title: 'Clubhouse Regular', detail: 'Joined three communities.', icon: Flame },
  research_routine: { title: 'Research Routine', detail: 'Saved 10 research notes.', icon: NotebookPen },
}

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/missions')

  const { data, error } = await supabase.rpc('get_member_mastery')
  const mastery = (data ?? { points: 0, level: 1, totals: {}, missions: [], achievements: [] }) as Mastery
  const levelFloor = Math.pow(Math.max(0, mastery.level - 1), 2) * 100
  const levelCeiling = Math.pow(mastery.level, 2) * 100
  const levelProgress = Math.max(0, Math.min(100, ((mastery.points - levelFloor) / Math.max(1, levelCeiling - levelFloor)) * 100))

  return (
    <ProductPageShell narrow>
      <ProductHero
        icon={<Trophy size={23}/>}
        eyebrow="Member mastery"
        title="Missions"
        description="Build your record, research rhythm, and community presence."
        status={'Level ' + mastery.level}
        actions={<ProductAction href="/leaderboard"><Award size={14}/>Leaderboard</ProductAction>}
      />

      {error ? <div className={styles.error}>Progress is temporarily unavailable.</div> : (
        <div className={styles.layout}>
          <section className={styles.levelCard}>
            <div className={styles.levelMark}><span>{mastery.level}</span><small>LEVEL</small></div>
            <div className={styles.levelCopy}>
              <span>Mastery progress</span>
              <strong>{mastery.points.toLocaleString()} points</strong>
              <div className={styles.progress} role="progressbar" aria-label={Math.round(levelProgress) + '% to level ' + (mastery.level + 1)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelProgress)}><i style={{ width: levelProgress + '%' }}/></div>
              <small>{Math.max(0, levelCeiling - mastery.points).toLocaleString()} to Level {mastery.level + 1}</small>
            </div>
          </section>

          <section className={styles.panel}>
            <header><div><span>Active</span><h2>Mission board</h2></div><Target size={19}/></header>
            <div className={styles.missions}>
              {mastery.missions.map(mission => {
                const complete = mission.current >= mission.target
                const progress = Math.min(100, mission.current / mission.target * 100)
                return <article key={mission.key} data-complete={complete}>
                  <div className={styles.missionTop}><span>{mission.period}</span><b>+{mission.points}</b></div>
                  <strong>{mission.title}</strong>
                  <div className={styles.progress} role="progressbar" aria-label={mission.title + ' progress'} aria-valuemin={0} aria-valuemax={mission.target} aria-valuenow={Math.min(mission.current, mission.target)}><i style={{ width: progress + '%' }}/></div>
                  <small>{complete ? <><Check size={12}/> Complete</> : mission.current + ' / ' + mission.target}</small>
                </article>
              })}
            </div>
          </section>

          <section className={styles.panel}>
            <header><div><span>Earned</span><h2>Achievements</h2></div><Award size={19}/></header>
            <div className={styles.achievements}>
              {Object.entries(ACHIEVEMENTS).map(([key, achievement]) => {
                const earned = mastery.achievements.includes(key)
                const Icon = achievement.icon
                return <article key={key} data-earned={earned}>
                  <span className={styles.achievementIcon}><Icon size={18}/></span>
                  <div><strong>{achievement.title}</strong><small>{achievement.detail}</small></div>
                  {earned && <Check size={15}/>}
                </article>
              })}
            </div>
          </section>

          <section className={styles.stats}>
            <Link href="/picks"><span>Picks</span><strong>{mastery.totals.picks ?? 0}</strong></Link>
            <Link href="/leaderboard"><span>Wins</span><strong>{mastery.totals.wins ?? 0}</strong></Link>
            <Link href="/feed"><span>Posts</span><strong>{mastery.totals.posts ?? 0}</strong></Link>
            <Link href="/workspace"><span>Notes</span><strong>{mastery.totals.notes ?? 0}</strong></Link>
          </section>
        </div>
      )}
    </ProductPageShell>
  )
}
