'use client'

import { useState, type ReactNode } from 'react'
import { MessagesSquare, Rows3 } from 'lucide-react'

type GroupWorkspaceTabsProps = {
  posts: ReactNode
  chat?: ReactNode
  postCount: number
  initialTab?: 'posts' | 'chat'
}

export function GroupWorkspaceTabs({ posts, chat, postCount, initialTab = 'posts' }: GroupWorkspaceTabsProps) {
  const [active, setActive] = useState<'posts' | 'chat'>(initialTab === 'chat' && chat ? 'chat' : 'posts')

  return (
    <section className="ss-group-workspace">
      <div className="ss-group-tabs" role="tablist" aria-label="Group sections">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'posts'}
          className={active === 'posts' ? 'is-active' : ''}
          onClick={() => setActive('posts')}
        >
          <Rows3 size={15} /> Posts <span>{postCount}</span>
        </button>
        {chat && (
          <button
            type="button"
            role="tab"
            aria-selected={active === 'chat'}
            className={active === 'chat' ? 'is-active' : ''}
            onClick={() => setActive('chat')}
          >
            <MessagesSquare size={15} /> Live chat
          </button>
        )}
      </div>
      <div role="tabpanel" className="ss-group-panel" hidden={active !== 'posts'}>{posts}</div>
      {chat && <div role="tabpanel" className="ss-group-panel" hidden={active !== 'chat'}>{chat}</div>}
    </section>
  )
}
