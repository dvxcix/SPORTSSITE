import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AIBlogWriter } from '@/components/blog/AIBlogWriter'

export default async function AIBlogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/blog/create/ai')
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">✨</span>
        <div>
          <h1 className="text-xl font-black text-white">AI Blog Writer</h1>
          <p className="text-xs text-zinc-500">Describe your article — AI drafts it instantly</p>
        </div>
      </div>
      <AIBlogWriter userId={user.id} />
    </div>
  )
}
