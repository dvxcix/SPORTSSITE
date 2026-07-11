import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { BlogEditor } from '@/components/blog/BlogEditor'

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
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Edit Article</h1>
      <BlogEditor userId={user.id} blogId={blog.id} initial={blog} />
    </div>
  )
}
