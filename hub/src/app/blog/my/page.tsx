import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, Eye, FilePenLine, Plus } from 'lucide-react'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import { SafeImage } from '@/components/ui/SafeImage'
import { CommunityNav } from '@/components/community/CommunityNav'

export const dynamic = 'force-dynamic'

export default async function MyBlogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/blog/my')
  const { data: blogs } = await supabase.from('blogs').select('id, title, slug, status, view_count, like_count, created_at, excerpt, cover_image, category').eq('author_id', user.id).order('created_at', { ascending: false })

  return <ProductPageShell narrow>
    <CommunityNav />
    <ProductHero icon={<FilePenLine size={22} />} eyebrow="Editorial studio" title="My articles" description="Draft, publish, and manage your long-form work." actions={<><ProductAction href="/blog"><BookOpen size={14} /> Read</ProductAction><ProductAction href="/blog/create"><Plus size={14} /> New article</ProductAction></>} />
    <ProductSectionHeader title="Library" meta={`${blogs?.length ?? 0} articles`} />
    {!blogs?.length ? <ProductPanel padded className="text-center"><FilePenLine className="mx-auto text-[var(--text-3)]" size={28} /><p className="mt-3 font-semibold text-[var(--text-1)]">Your library is empty</p><Link href="/blog/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-fill)] px-4 py-2.5 text-xs font-semibold text-[var(--accent-fg)]"><Plus size={14} /> Start writing</Link></ProductPanel> : <div className="grid gap-3">{blogs.map((article) => <Link key={article.id} href={article.status === 'published' ? `/blog/${article.slug}` : `/blog/edit/${article.id}`} className="group grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.025)] p-3 transition hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[rgba(var(--contrast-rgb),0.04)]">
      <div className="h-16 overflow-hidden rounded-xl bg-[rgba(var(--contrast-rgb),0.05)]"><SafeImage src={article.cover_image} alt="" className="h-full w-full object-cover" fallback={<span className="grid h-full place-items-center text-[var(--text-3)]"><BookOpen size={22} /></span>} /></div>
      <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-semibold text-[var(--text-1)]">{article.title}</h2><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${article.status === 'published' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : 'bg-[rgba(var(--contrast-rgb),0.06)] text-[var(--text-3)]'}`}>{article.status}</span></div><p className="mt-1 line-clamp-1 text-xs text-[var(--text-3)]">{article.excerpt || article.category || 'No excerpt'}</p><p className="mt-2 flex items-center gap-3 text-[12px] font-bold text-[var(--text-3)]"><span className="flex items-center gap-1"><Eye size={11} />{article.view_count ?? 0}</span><span className="flex items-center gap-1"><Clock size={11} />{new Date(article.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></p></div>
      <ArrowRight size={15} className="text-[var(--text-3)] transition group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
    </Link>)}</div>}
  </ProductPageShell>
}
