import { createClient } from '@/lib/supabase/server'
import { AdminDeleteRowAction } from '@/components/admin/AdminDeleteRowAction'

export const dynamic = 'force-dynamic'

export default async function AdminMarketplacePage() {
  const supabase = await createClient()
  const { data: listings } = await supabase
    .from('marketplace_listings')
    .select('id, title, price, category, sport, condition, is_sold, view_count, created_at, seller:users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">Manage Marketplace</h1>
      {(listings?.length ?? 0) === 0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">No listings yet</div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Listing</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Seller</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Price</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Category</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Views</th>
                <th className="px-4 py-3 text-xs font-bold text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(listings ?? []).map((l: any) => (
                <tr key={l.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white max-w-xs">
                    <p className="line-clamp-2">{l.title}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">@{l.seller?.username}</td>
                  <td className="px-4 py-3 text-xs text-zinc-300 font-mono">${Number(l.price ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                      {l.category || '—'}{l.sport ? ` · ${l.sport}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.is_sold ? 'bg-zinc-800 text-zinc-500' : 'bg-green-500/10 text-green-400'}`}>
                      {l.is_sold ? 'Sold' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{l.view_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <AdminDeleteRowAction table="marketplace_listings" id={l.id} confirmLabel="this listing" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
