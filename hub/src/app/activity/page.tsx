import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, ChevronRight, Heart, History, MessageCircle, NotebookPen, Target, UserPlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import styles from './activity.module.css'

export const dynamic = 'force-dynamic'

const ICONS = {
  post: BookOpen,
  pick: Target,
  reply: MessageCircle,
  reaction: Heart,
  follow: UserPlus,
  community: Users,
  research: NotebookPen,
} as const

function dayLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function ActivityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/activity')

  const { data, error } = await supabase
    .from('member_activity_events')
    .select('id,activity_type,target_path,label,occurred_at')
    .eq('user_id', user.id)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(150)

  const groups = new Map<string, typeof data>()
  for (const event of data ?? []) {
    const day = dayLabel(event.occurred_at)
    groups.set(day, [...(groups.get(day) ?? []), event])
  }

  return <ProductPageShell narrow>
    <ProductHero
      icon={<History size={23}/>}
      eyebrow="Your history"
      title="Activity Replay"
      description="Return to the posts, picks, conversations, communities, and research you created."
      status={(data?.length ?? 0) + ' recent actions'}
    />

    {error ? <section className={styles.state}><History size={24}/><strong>Activity is temporarily unavailable.</strong></section>
      : !data?.length ? <section className={styles.state}><History size={24}/><strong>Your replay starts with your next action.</strong><Link href="/feed">Open the feed</Link></section>
      : <div className={styles.timeline}>
        {[...groups.entries()].map(([day, events]) => <section key={day} className={styles.day}>
          <header><span>{day}</span><i/></header>
          <div className={styles.events}>{events?.map(event => {
            const Icon = ICONS[event.activity_type as keyof typeof ICONS] ?? History
            return <Link key={event.id} href={event.target_path} className={styles.event}>
              <span className={styles.icon} data-type={event.activity_type}><Icon size={16}/></span>
              <span className={styles.copy}><strong>{event.label}</strong><small>{event.activity_type} · {timeLabel(event.occurred_at)}</small></span>
              <ChevronRight size={15}/>
            </Link>
          })}</div>
        </section>)}
      </div>}
  </ProductPageShell>
}
