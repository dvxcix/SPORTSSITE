import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, FileText, Flag, LayoutDashboard, MessageSquare, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminStatCard } from '@/components/admin/AdminStatCard'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

type RecentUser = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  account_type: string | null
  created_at: string
}

type RecentPost = {
  id: string
  content: string | null
  created_at: string
  author: { username: string | null } | null
}

const sectionClass = 'overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-card)]'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const [
    { count: userCount },
    { count: postCount },
    { count: groupCount },
    { count: reportCount },
    { data: recentUsersData },
    { data: recentPostsData },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('groups').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('users').select('id, username, display_name, avatar_url, account_type, created_at').order('created_at', { ascending: false }).limit(5),
    supabase.from('posts').select('id, content, created_at, author:users!posts_author_id_fkey(username)').order('created_at', { ascending: false }).limit(5),
  ])

  const recentUsers = (recentUsersData ?? []) as RecentUser[]
  const recentPosts = (recentPostsData ?? []) as unknown as RecentPost[]
  const stats = [
    { label: 'Total users', value: userCount ?? 0, icon: Users, tone: 'info' as const, detail: 'Registered accounts' },
    { label: 'Total posts', value: postCount ?? 0, icon: FileText, tone: 'success' as const, detail: 'Published community posts' },
    { label: 'Groups', value: groupCount ?? 0, icon: MessageSquare, tone: 'warning' as const, detail: 'Active community spaces' },
    { label: 'Pending reports', value: reportCount ?? 0, icon: Flag, tone: 'danger' as const, detail: 'Awaiting moderation' },
  ]

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:space-y-8 lg:p-8">
      <AdminPageHeader
        title="Control center"
        description="Monitor platform activity, review recent changes, and move directly into the tools that need attention."
        icon={LayoutDashboard}
      />

      <section aria-label="Platform overview" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <AdminStatCard key={stat.label} {...stat} />)}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className={sectionClass}>
          <SectionHeader title="Recent signups" href="/admin/users" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentUsers.length > 0 ? recentUsers.map((user) => {
              const name = user.display_name || user.username || 'Unnamed user'
              return (
                <div key={user.id} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] sm:px-5">
                  <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-overlay)] text-xs font-black text-[var(--text-primary)]">
                    {user.avatar_url ? <Image src={user.avatar_url} alt="" fill sizes="36px" className="object-cover" unoptimized /> : name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">{name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">@{user.username || 'pending'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {user.account_type && user.account_type !== 'user' && (
                      <Badge variant={user.account_type === 'admin' ? 'danger' : 'popular'}>{user.account_type}</Badge>
                    )}
                    <time className="text-[10px] tabular-nums text-[var(--text-muted)]">{new Date(user.created_at).toLocaleDateString()}</time>
                  </div>
                </div>
              )
            }) : <EmptyRow label="No recent signups" />}
          </div>
        </section>

        <section className={sectionClass}>
          <SectionHeader title="Recent posts" href="/admin/content/posts" />
          <div className="divide-y divide-[var(--border-subtle)]">
            {recentPosts.length > 0 ? recentPosts.map((post) => (
              <article key={post.id} className="px-4 py-3 transition-colors hover:bg-[var(--surface-hover)] sm:px-5">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-bold text-[var(--accent-primary)]">@{post.author?.username || 'unknown'}</p>
                  <time className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{new Date(post.created_at).toLocaleString()}</time>
                </div>
                <p className="line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{post.content || 'Post has no text content.'}</p>
              </article>
            )) : <EmptyRow label="No recent posts" />}
          </div>
        </section>
      </div>
    </main>
  )
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
      <h2 className="text-sm font-black text-[var(--text-primary)]">{title}</h2>
      <Link href={href} className="group flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]">
        View all <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return <p className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">{label}</p>
}
