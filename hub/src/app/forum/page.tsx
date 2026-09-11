import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, MessageSquare, Plus } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import { CommunityNav } from '@/components/community/CommunityNav'
import Image from 'next/image'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel } from '@/components/product/ProductPage'

export const revalidate = 60

export default async function ForumPage() {
  const supabase = await createClient()
  const [{ data: { user } }, { data: categories }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('forum_categories').select('*').order('sort_order', { ascending: true }),
  ])

  return (
    <ProductPageShell narrow>
      <CommunityNav />
      <ProductHero icon={<MessageSquare size={21} />} eyebrow="Community" title="Discussions" description="Questions, picks, and game-day conversation." actions={user ? <ProductAction href="/forum/new"><Plus size={14} /> New thread</ProductAction> : undefined} />

      {(categories?.length ?? 0) > 0 ? <div className="grid gap-3">
        {(categories ?? []).map((cat: any) => (
          <Link key={cat.id} href={`/forum/${cat.slug}`}
            className="ss-forum-category group">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
              {cat.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-white">{cat.name}</p>
                {cat.sport && (
                  sportLogoUrl(cat.sport)
                    ? <Image src={sportLogoUrl(cat.sport)!} alt={cat.sport} width={14} height={14} className="object-contain" />
                    : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{cat.sport}</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{cat.description}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-white">{cat.thread_count ?? 0}</p>
              <p className="text-xs text-zinc-600">threads</p>
            </div>
            <ArrowRight size={15} className="shrink-0 text-zinc-700 transition group-hover:translate-x-1 group-hover:text-lime-300" />
          </Link>
        ))}
      </div> : <ProductPanel padded className="text-center"><MessageSquare size={26} className="mx-auto text-zinc-600" /><p className="mt-3 font-black text-white">No discussions yet</p></ProductPanel>}
    </ProductPageShell>
  )
}
