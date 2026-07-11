import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BlogEditor } from '@/components/blog/BlogEditor'

export default async function CreateBlogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/blog/create')
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Write an Article</h1>
      <BlogEditor userId={user.id} />
    </div>
  )
}
