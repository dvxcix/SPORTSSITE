import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ShoppingBag, Plus, Tag } from 'lucide-react'

export const revalidate = 60

export default async function MarketplacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('*, seller:users(username, display_name, avatar_url, is_verified)')
    .eq('is_sold', false)
    .order('created_at', { ascending: false })
    .limit(30)

  const CATS = ['All', 'Memorabilia', 'Tickets', 'Picks Package', 'Coaching', 'Apparel', 'Cards', 'Other']

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg"><ShoppingBag size={20} className="text-emerald-400" /></div>
          <div>
            <h1 className="text-xl font-black text-white">Marketplace</h1>
            <p className="text-xs text-zinc-500">Buy & sell picks, merch, memorabilia</p>
          </div>
        </div>
        {user && (
          <Link href="/marketplace/sell"
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> List Item
          </Link>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATS.map(c => (
          <button key={c} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-bold text-zinc-400 hover:border-green-500/50 hover:text-white transition-all whitespace-nowrap shrink-0">{c}</button>
        ))}
      </div>

      {(listings?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="text-zinc-400 font-medium">No listings yet</p>
          {user && <Link href="/marketplace/sell" className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"><Plus size={14} /> Create the first listing</Link>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(listings ?? []).map((l: any) => (
            <Link key={l.id} href={`/marketplace/${l.id}`}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all">
              <div className="h-36 bg-zinc-800 flex items-center justify-center text-4xl">
                {l.images?.[0] ? <img src={l.images[0]} alt={l.title} className="w-full h-full object-cover" /> : '🏷️'}
              </div>
              <div className="p-3">
                <p className="font-bold text-white text-sm truncate">{l.title}</p>
                <p className="text-green-400 font-black text-lg">${Number(l.price).toFixed(2)}</p>
                {l.category && (
                  <span className="inline-block text-[10px] font-bold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full mt-1">
                    <Tag size={8} className="inline mr-0.5" />{l.category}
                  </span>
                )}
                <p className="text-xs text-zinc-600 mt-1">by @{l.seller?.display_name || l.seller?.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
