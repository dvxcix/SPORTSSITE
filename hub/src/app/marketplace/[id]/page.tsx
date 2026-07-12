import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Tag, MessageCircle, Flag, CheckCircle } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'

export const dynamic = 'force-dynamic'

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: listing } = await supabase
    .from('marketplace_listings')
    .select('*, seller:users(id, username, display_name, avatar_url, is_verified, pick_record)')
    .eq('id', id)
    .single()

  if (!listing) notFound()

  const isOwner = user?.id === listing.seller_id

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-4 transition-colors">
        <ArrowLeft size={12} /> Back to Marketplace
      </Link>

      {/* Images */}
      <div className="h-56 bg-zinc-800 rounded-2xl mb-4 overflow-hidden flex items-center justify-center">
        {listing.images?.[0]
          ? <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
          : <span className="text-6xl">🏷️</span>
        }
      </div>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-black text-white">{listing.title}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            {listing.category && (
              <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Tag size={10} /> {listing.category}
              </span>
            )}
            {listing.condition && (
              <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">{listing.condition}</span>
            )}
            {listing.sport && (
              sportLogoUrl(listing.sport)
                ? <span className="bg-blue-400/10 rounded-full p-1 flex items-center"><img src={sportLogoUrl(listing.sport)} alt={listing.sport} className="w-4 h-4 object-contain" /></span>
                : <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">{listing.sport}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black text-green-400">${Number(listing.price).toFixed(2)}</p>
          {listing.is_sold && <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">SOLD</span>}
        </div>
      </div>

      {listing.description && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
        </div>
      )}

      {/* Seller */}
      <Link href={`/profile/${listing.seller?.username}`}
        className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 hover:border-zinc-700 transition-all">
        <div className="w-11 h-11 rounded-full bg-zinc-700 overflow-hidden">
          {listing.seller?.avatar_url && <img src={listing.seller.avatar_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1">
          <p className="font-bold text-white text-sm flex items-center gap-1">
            {listing.seller?.display_name || listing.seller?.username}
            {listing.seller?.is_verified && <span className="text-green-400 text-xs">✓</span>}
          </p>
          <p className="text-xs text-zinc-500">@{listing.seller?.username}</p>
        </div>
        <span className="text-xs text-zinc-500">View profile →</span>
      </Link>

      {/* Actions */}
      {!isOwner && !listing.is_sold && user && (
        <div className="flex gap-3">
          <Link href={`/messages/${listing.seller?.username}?ref=marketplace&listing=${id}`}
            className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black py-3 rounded-xl transition-colors">
            <MessageCircle size={16} /> Message Seller
          </Link>
        </div>
      )}
      {!user && (
        <Link href="/auth/login"
          className="block w-full text-center bg-green-500 hover:bg-green-400 text-black font-black py-3 rounded-xl transition-colors">
          Sign in to contact seller
        </Link>
      )}
      {isOwner && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <p className="text-sm text-zinc-400 mb-2">This is your listing</p>
          <div className="flex gap-2 justify-center">
            <button className="text-xs font-bold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-4 py-2 rounded-lg transition-colors">Edit</button>
            <button className="text-xs font-bold border border-green-500/50 text-green-400 hover:bg-green-500/10 px-4 py-2 rounded-lg transition-colors flex items-center gap-1">
              <CheckCircle size={12} /> Mark Sold
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 text-center">
        <button className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1 mx-auto transition-colors">
          <Flag size={11} /> Report listing
        </button>
      </div>
    </div>
  )
}
