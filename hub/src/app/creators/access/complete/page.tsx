import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreatorAccessComplete } from './CreatorAccessComplete'
export default async function AccessCompletePage({ searchParams }: { searchParams: Promise<{ product?: string; status?: string }> }) {
 const { product, status } = await searchParams
 const outcome = status === 'failed' || status === 'canceled' ? status : null
 if (!product || !/^[0-9a-f-]{36}$/i.test(product)) redirect('/groups')
 const supabase = await createClient()
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) redirect(`/auth/login?next=${encodeURIComponent('/creators/access/complete?product=' + product + (outcome ? '&status=' + outcome : ''))}`)
 return <CreatorAccessComplete productId={product} outcome={outcome}/>
}
