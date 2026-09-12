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
    {!blogs?.length ? <ProductPanel padded className="text-center"><FilePenLine className="mx-auto text-zinc-600" size={28} /><p className="mt-3 font-black text-white">Your library is empty</p><Link href="/blog/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black"><Plus size={14} /> Start writing</Link></ProductPanel> : <div className="grid gap-3">{blogs.map((article) => <Link key={article.id} href={article.status === 'published' ? `/blog/${article.slug}` : `/blog/edit/${article.id}`} className="group grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-white/[.08] bg-white/[.025] p-3 transition hover:border-lime-400/25 hover:bg-white/[.04]">
      <div className="h-16 overflow-hidden rounded-xl bg-white/[.05]"><SafeImage src={article.cover_image} alt="" className="h-full w-full object-cover" fallback={<span className="grid h-full place-items-center text-zinc-700"><BookOpen size={22} /></span>} /></div>
      <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-black text-white">{article.title}</h2><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${article.status === 'published' ? 'bg-lime-400/10 text-lime-300' : 'bg-white/[.06] text-zinc-500'}`}>{article.status}</span></div><p className="mt-1 line-clamp-1 text-xs text-zinc-500">{article.excerpt || article.category || 'No excerpt'}</p><p className="mt-2 flex items-center gap-3 text-[10px] font-bold text-zinc-600"><span className="flex items-center gap-1"><Eye size={11} />{article.view_count ?? 0}</span><span className="flex items-center gap-1"><Clock size={11} />{new Date(article.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></p></div>
      <ArrowRight size={15} className="text-zinc-700 transition group-hover:translate-x-1 group-hover:text-lime-300" />
    </Link>)}</div>}
  </ProductPageShell>
}
