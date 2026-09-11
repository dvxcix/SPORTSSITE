import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AIBlogWriter } from '@/components/blog/AIBlogWriter'
import Link from 'next/link'
import { ChevronLeft, Sparkles } from 'lucide-react'

export default async function AIBlogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/blog/create/ai')
  return (
    <main className="ss-flow-page !max-w-3xl">
      <Link href="/blog/my" className="ss-flow-back"><ChevronLeft size={14} /> My articles</Link>
      <header className="ss-flow-heading"><span><Sparkles size={22} /></span><div><p>Editorial studio</p><h1>Draft assistant</h1></div></header>
      <AIBlogWriter userId={user.id} />
    </main>
  )
}
