import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { BlogEditor } from '@/components/blog/BlogEditor'
import Link from 'next/link'
import { ChevronLeft, FilePenLine } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function EditBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/blog/edit/${id}`)

  const { data: blog } = await supabase.from('blogs').select('*').eq('id', id).single()
  if (!blog) notFound()
  if (blog.author_id !== user.id) redirect(`/blog/${blog.slug}`)

  return (
    <main className="ss-flow-page !max-w-3xl">
      <Link href="/blog/my" className="ss-flow-back"><ChevronLeft size={14} /> My articles</Link>
      <header className="ss-flow-heading"><span><FilePenLine size={22} /></span><div><p>Editorial studio</p><h1>Edit article</h1></div></header>
      <BlogEditor userId={user.id} blogId={blog.id} initial={blog} />
    </main>
  )
}
