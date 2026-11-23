import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { writeAdminAudit } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'

type MatrixListing = {
  id: string
  title: string
  description: string
  matrix_type: 'classic' | 'pipeline'
  status: 'published' | 'unlisted' | 'removed'
  copy_count: number
  published_at: string
  author: { username: string; display_name: string | null } | null
}

async function moderateMatrixListing(formData: FormData) {
  'use server'
  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || '')
  if (!id || !['published', 'removed'].includes(status)) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/marketplace')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return

  const admin = createAdminClient()
  const { error } = await admin
    .from('matrix_marketplace_listings')
    .update({ status, moderation_note: status === 'removed' ? 'Removed by SlipSurge moderation.' : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await writeAdminAudit(admin, {
    actorUserId: user.id,
    action: status === 'removed' ? 'matrix_marketplace.removed' : 'matrix_marketplace.restored',
    targetType: 'matrix_marketplace_listing',
    targetId: id,
  })
  revalidatePath('/admin/marketplace')
  revalidatePath('/marketplace')
}

export default async function AdminMarketplacePage() {
  const { data } = await createAdminClient()
    .from('matrix_marketplace_listings')
    .select('id, title, description, matrix_type, status, copy_count, published_at, author:users(username, display_name)')
    .order('published_at', { ascending: false })
    .limit(200)
  const listings = (data ?? []) as unknown as MatrixListing[]

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.2em] text-[var(--accent)]">ULTIMATE COMMUNITY</p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--text-1)]">Matrix Marketplace</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">Review shared Matrix publications. Removing a post never deletes the member&apos;s original Matrix.</p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-2)]">{listings.length} {listings.length === 1 ? 'publication' : 'publications'}</span>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] py-20 text-center text-sm text-[var(--text-3)]">No Matrix publications yet.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]">
          <div role="region" tabIndex={0} aria-label="Matrix publications, scroll for all columns" className="ss-table-region overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)]">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Publication</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Member</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Type</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Adds</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-3)]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {listings.map(listing => (
                  <tr key={listing.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--surface-2)_35%,transparent)]">
                    <td className="max-w-md px-4 py-3">
                      <p className="font-bold text-[var(--text-1)]">{listing.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--text-3)]">{listing.description || 'No description provided.'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-2)]">@{listing.author?.username || 'unknown'}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-[var(--surface-2)] px-2 py-1 text-[12px] font-semibold uppercase text-[var(--text-2)]">{listing.matrix_type}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-2)]">{listing.copy_count}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[12px] font-semibold uppercase ${listing.status === 'published' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]' : listing.status === 'removed' ? 'bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]' : 'bg-[var(--surface-2)] text-[var(--text-3)]'}`}>{listing.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <form action={moderateMatrixListing}>
                        <input type="hidden" name="id" value={listing.id} />
                        <input type="hidden" name="status" value={listing.status === 'removed' ? 'published' : 'removed'} />
                        <button type="submit" className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${listing.status === 'removed' ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]' : 'bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_20%,transparent)]'}`}>
                          {listing.status === 'removed' ? 'Restore' : 'Remove'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
