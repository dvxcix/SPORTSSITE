import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateStoryForm } from '@/components/social/CreateStoryForm'
import { TierGate } from '@/components/layout/TierGate'
import Link from 'next/link'
import { ChevronLeft, Sparkles } from 'lucide-react'

export default async function CreateStoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/stories/create')
  return (
    <TierGate requiredTier="basic" label="Stories">
      <div className="ss-flow-page !max-w-md">
        <Link href="/feed" className="ss-flow-back"><ChevronLeft size={14} /> Feed</Link>
        <header className="ss-flow-heading"><span><Sparkles size={22} /></span><div><p>24 hours</p><h1>Add to story</h1></div></header>
        <CreateStoryForm userId={user.id} />
      </div>
    </TierGate>
  )
}
