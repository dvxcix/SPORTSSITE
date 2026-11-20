'use client'

import { Heart, MessageCircle, Repeat2, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { LinkifiedText } from '@/components/social/LinkifiedText'

export interface Post {
  id: string
  author: { name: string; handle: string; avatar?: string; verified?: boolean; tier?: 'free' | 'pro' }
  content: string
  pick?: { team: string; line: string; odds: string; result?: 'win' | 'loss' | 'pending' }
  reactions: { likes: number; comments: number; reposts: number }
  createdAt: string
  sport?: string
}

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--border-2)] transition-all">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--surface-3)] shrink-0 flex items-center justify-center text-[var(--text-1)] font-bold text-sm">
          {post.author.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--text-1)] text-sm">{post.author.name}</span>
            {post.author.verified && <span className="text-[var(--green)] text-xs">✓</span>}
            {post.author.tier === 'pro' && <Badge variant="pick">PRO</Badge>}
            <span className="text-[var(--text-3)] text-xs">@{post.author.handle}</span>
            <span className="text-[var(--text-3)] text-xs ml-auto">{post.createdAt}</span>
          </div>

          <p className="mt-1.5 text-sm text-[var(--text-1)] leading-relaxed"><LinkifiedText text={post.content} /></p>

          {post.pick && (
            <div className={`mt-3 rounded-lg border p-3 ${
              post.pick.result === 'win' ? 'border-[color-mix(in_srgb,var(--green)_30%,transparent)] bg-[color-mix(in_srgb,var(--green)_5%,transparent)]' :
              post.pick.result === 'loss' ? 'border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[color-mix(in_srgb,var(--red)_5%,transparent)]' :
              'border-yellow-500/30 bg-yellow-500/5'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={12} className="text-yellow-400" />
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Pick</span>
                {post.pick.result && (
                  <span className={`ml-auto text-xs font-bold ${
                    post.pick.result === 'win' ? 'text-[var(--green)]' :
                    post.pick.result === 'loss' ? 'text-[var(--red)]' : 'text-[var(--text-2)]'
                  }`}>
                    {post.pick.result === 'win' ? '✓ WIN' : post.pick.result === 'loss' ? '✗ LOSS' : 'PENDING'}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-[var(--text-1)]">{post.pick.team}</p>
              <p className="text-xs text-[var(--text-2)]">{post.pick.line} · <span className="font-mono">{post.pick.odds}</span></p>
            </div>
          )}

          <div className="flex items-center gap-5 mt-3">
            <button className="flex items-center gap-1.5 text-[var(--text-3)] hover:text-[var(--red)] transition-colors text-xs">
              <Heart size={14} />
              <span>{post.reactions.likes}</span>
            </button>
            <button className="flex items-center gap-1.5 text-[var(--text-3)] hover:text-[var(--blue)] transition-colors text-xs">
              <MessageCircle size={14} />
              <span>{post.reactions.comments}</span>
            </button>
            <button className="flex items-center gap-1.5 text-[var(--text-3)] hover:text-[var(--green)] transition-colors text-xs">
              <Repeat2 size={14} />
              <span>{post.reactions.reposts}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
