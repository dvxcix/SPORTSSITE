import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BlogEditor } from '@/components/blog/BlogEditor'
import Link from 'next/link'
import { ChevronLeft, FilePenLine } from 'lucide-react'

export default async function CreateBlogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/blog/create')
  return (
    <div className="ss-flow-page !max-w-3xl">
      <Link href="/blog" className="ss-flow-back"><ChevronLeft size={14} /> Articles</Link>
      <header className="ss-flow-heading"><span><FilePenLine size={22} /></span><div><p>Editorial studio</p><h1>Write an article</h1></div></header>
      <BlogEditor userId={user.id} />
    </div>
  )
}
