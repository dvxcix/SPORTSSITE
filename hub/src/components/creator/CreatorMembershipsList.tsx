import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'

export async function CreatorMembershipsList() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: memberships, error } = await supabase.from('creator_entitlements').select('id,product_id,status,current_period_end').eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) return <p role="status" className="mt-6 text-sm text-[var(--text-2)]">Creator memberships could not be loaded. Refresh to try again.</p>
  if (!memberships?.length) return null
  // A paused offer still has existing subscribers. Return only public offer fields for this buyer's memberships.
  const { data: products, error: productError } = await createAdminClient().from('creator_products').select('id,title,price,product_type').in('id', memberships.map(item => item.product_id))
  if (productError) return <p role="status" className="mt-6 text-sm text-[var(--text-2)]">Creator memberships could not be loaded. Refresh to try again.</p>
  return <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
    <h2 className="text-lg font-semibold">Creator memberships</h2>
    <div className="mt-4 grid gap-3">{memberships.map(item => {
      const product = products?.find(row => row.id === item.product_id)
      return <div key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] py-3">
        <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{product?.title || 'Creator membership'}</h3><p className="mt-1 text-xs text-[var(--text-2)]">{hasCurrentCreatorAccess(item) ? 'Access active' : 'Access ended'}{product ? ` · $${Number(product.price).toFixed(2)} ${product.product_type === 'membership' ? 'every 30 days' : 'one payment'}` : ''}</p></div>
        <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--accent)]" href={`/creators/access/complete?product=${item.product_id}`}>Manage membership <ArrowRight size={15}/></Link>
      </div>
    })}</div>
  </section>
}
