'use client'

import { useEffect, useId, useRef, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MessagesSquare, Rows3, TrendingUp } from 'lucide-react'

type GroupWorkspaceTabsProps = {
  posts: ReactNode
  chat?: ReactNode
  postCount: number
  initialTab?: 'posts' | 'picks' | 'chat'
}

export function GroupWorkspaceTabs({ posts, chat, postCount, initialTab = 'posts' }: GroupWorkspaceTabsProps) {
  const router=useRouter(),pathname=usePathname(),search=useSearchParams(),id=useId(),[pending,startTransition]=useTransition()
  const tabs=useRef<HTMLDivElement>(null)
  const alignChat=useRef(false)
  const requested=search.get('view')||initialTab
  const active=requested==='picks'?'picks':requested==='chat'&&chat?'chat':'posts'
  useEffect(()=>{
    if(active!=='chat'||pending||!alignChat.current)return
    alignChat.current=false
    if(window.matchMedia('(max-width:767px), (max-width:1024px) and (any-pointer:coarse)').matches){
      const short=(window.visualViewport?.height??window.innerHeight)<560
      const composer=tabs.current?.parentElement?.querySelector<HTMLElement>('.ss-chat-composer')
      ;(short?composer??tabs.current:tabs.current)?.scrollIntoView({block:short?'end':'start',behavior:'auto'})
    }
  },[active,pending])
  function select(value:'posts'|'picks'|'chat'){
    alignChat.current=value==='chat'
    const query=new URLSearchParams(search.toString());query.set('view',value)
    if(value!=='chat')query.delete('channel')
    startTransition(()=>router.replace(`${pathname}?${query}`,{scroll:false}))
  }

  return (
    <section className="ss-group-workspace" data-view={active}>
      <div ref={tabs} className="ss-group-tabs" role="tablist" aria-label="Group sections" onKeyDown={event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
        const buttons=[...tabs.current!.querySelectorAll<HTMLButtonElement>('[role="tab"]')],index=buttons.findIndex(button=>button===document.activeElement)
        const target=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length
        event.preventDefault();buttons[target].focus();buttons[target].click()
      }}>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'posts'}
          id={`${id}-posts`} aria-controls={`${id}-feed`} tabIndex={active==='posts'?0:-1}
          className={active === 'posts' ? 'is-active' : ''}
          onClick={() => select('posts')}
        >
          <Rows3 size={15} /> Posts {active==='posts'&&postCount>0&&<span aria-label={`${postCount} loaded posts`}>{postCount}</span>}
        </button>
        <button type="button" role="tab" id={`${id}-picks`} aria-controls={`${id}-feed`} aria-selected={active==='picks'} tabIndex={active==='picks'?0:-1} className={active==='picks'?'is-active':''} onClick={()=>select('picks')}><TrendingUp size={15}/> Picks</button>
        {chat && (
          <button
            type="button"
            role="tab"
            aria-selected={active === 'chat'}
            id={`${id}-chat`} aria-controls={`${id}-conversation`} tabIndex={active==='chat'?0:-1}
            className={active === 'chat' ? 'is-active' : ''}
            onClick={() => select('chat')}
          >
            <MessagesSquare size={15} /> Live chat
          </button>
        )}
      </div>
      <div role="tabpanel" id={`${id}-feed`} aria-labelledby={`${id}-${active==='picks'?'picks':'posts'}`} aria-busy={pending} className="ss-group-panel" hidden={active === 'chat'}>{posts}</div>
      {chat && <div role="tabpanel" id={`${id}-conversation`} aria-labelledby={`${id}-chat`} className="ss-group-panel" hidden={active !== 'chat'}>{active==='chat'?chat:null}</div>}
    </section>
  )
}
