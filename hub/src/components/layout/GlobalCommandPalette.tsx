'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Award, BarChart3, ChevronRight, Compass, FlaskConical, Hash, History, Layers3, LayoutDashboard, MessageCircle, Search, Settings, ShieldCheck, Table2, UserRound, Users, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import styles from './GlobalCommandPalette.module.css'

type CommandItem = { id: string; label: string; detail: string; href: string; icon: typeof Search; keywords?: string }
const destinations: CommandItem[] = [
  { id: 'feed', label: 'Feed', detail: 'Posts, picks, and live conversations', href: '/feed', icon: LayoutDashboard, keywords: 'home timeline social' },
  { id: 'explore', label: 'Explore', detail: 'People, games, creators, and communities', href: '/explore', icon: Compass, keywords: 'discover search trending' },
  { id: 'community', label: 'Community', detail: 'Groups, channels, and discussions', href: '/community', icon: Users, keywords: 'discord rooms forums groups' },
  { id: 'channels', label: 'Live rooms', detail: 'Game-day channels and realtime chat', href: '/channels', icon: Hash, keywords: 'chat live messages' },
  { id: 'messages', label: 'Messages', detail: 'Direct and group conversations', href: '/messages', icon: MessageCircle, keywords: 'dm inbox' },
  { id: 'dugout', label: 'The Dugout', detail: 'MLB markets and game intelligence', href: '/dugout', icon: FlaskConical, keywords: 'baseball mlb odds' },
  { id: 'sideline', label: 'The Sideline', detail: 'NFL markets and matchup intelligence', href: '/the-sideline', icon: BarChart3, keywords: 'football nfl odds' },
  { id: 'workspace', label: 'Research Workspace', detail: 'Compare saved markets, Matrices, and notes', href: '/workspace', icon: Layers3, keywords: 'watchlist notebook compare saved' },
  { id: 'missions', label: 'Missions', detail: 'Progress, milestones, and achievements', href: '/missions', icon: Award, keywords: 'level streak mastery rewards' },
  { id: 'activity', label: 'Activity Replay', detail: 'Your posts, picks, conversations, and research history', href: '/activity', icon: History, keywords: 'history recent actions replay' },
  { id: 'slate', label: 'Slate Breakdown', detail: 'Pitch mix and matchup analysis', href: '/slate-breakdown', icon: Table2, keywords: 'statcast pitchers batters' },
  { id: 'settings', label: 'Settings', detail: 'Account, profile, privacy, and notifications', href: '/settings', icon: Settings, keywords: 'account membership profile' },
]
type SportsResults = { players?: Array<{ mlbId: number; name: string; position?: string | null; teamName?: string | null }>; teams?: Array<{ id: number; name: string; abbr: string }> }
type NflResults = { players?: Array<{ gsis_id: string; display_name: string; position?: string | null; latest_team?: string | null }>; teams?: Array<{ team_abbr: string; team_name: string }> }

export function GlobalCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sports, setSports] = useState<CommandItem[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const show = () => { setActive(0); setOpen(true) }
    const keydown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setActive(0); setOpen(value => !value) } }
    window.addEventListener('slipsurge:open-command', show); window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('slipsurge:open-command', show); window.removeEventListener('keydown', keydown) }
  }, [])
  useEffect(() => {
    const value = query.trim()
    if (value.length < 2) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const [mlb, nfl] = await Promise.all([
        fetch(`/api/search/sports?q=${encodeURIComponent(value)}`).then(response => response.ok ? response.json() as Promise<SportsResults> : Promise.resolve({} as SportsResults)).catch(() => ({} as SportsResults)),
        fetch(`/api/search/nfl?q=${encodeURIComponent(value)}`).then(response => response.ok ? response.json() as Promise<NflResults> : Promise.resolve({} as NflResults)).catch(() => ({} as NflResults)),
      ])
      if (cancelled) return
      setSports([
        ...(mlb.players ?? []).slice(0, 4).map(player => ({ id: `mlb-${player.mlbId}`, label: player.name, detail: [player.teamName, player.position, 'MLB'].filter(Boolean).join(' · '), href: `/players/${player.mlbId}`, icon: UserRound })),
        ...(nfl.players ?? []).slice(0, 4).map(player => ({ id: `nfl-${player.gsis_id}`, label: player.display_name, detail: [player.latest_team, player.position, 'NFL'].filter(Boolean).join(' · '), href: `/nfl/players/${player.gsis_id}`, icon: UserRound })),
        ...(mlb.teams ?? []).slice(0, 2).map(team => ({ id: `mlb-team-${team.id}`, label: team.name, detail: `${team.abbr} · MLB`, href: `/search?q=${encodeURIComponent(team.name)}`, icon: ShieldCheck })),
        ...(nfl.teams ?? []).slice(0, 2).map(team => ({ id: `nfl-team-${team.team_abbr}`, label: team.team_name, detail: `${team.team_abbr} · NFL`, href: `/search?q=${encodeURIComponent(team.team_name)}`, icon: ShieldCheck })),
      ])
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query])
  const local = useMemo(() => { const value = query.trim().toLowerCase(); return value ? destinations.filter(item => `${item.label} ${item.detail} ${item.keywords ?? ''}`.toLowerCase().includes(value)) : destinations }, [query])
  const items = useMemo(() => [...local, ...sports], [local, sports])
  function close() { setOpen(false); setQuery(''); setSports([]) }
  function navigate(href: string) { close(); router.push(href) }
  if (!open) return null
  return <Modal onClose={close} maxWidth={650} label="Search SlipSurge"><div className={styles.shell}>
    <div className={styles.header}><Search size={18}/><input autoFocus className={styles.input} value={query} onChange={event => { const value = event.target.value; setQuery(value); setActive(0); if (value.trim().length < 2) setSports([]) }} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(items.length - 1, index + 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
      if (event.key === 'Enter') { event.preventDefault(); if (items[active]) navigate(items[active].href); else if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`) }
      if (event.key === 'Escape') close()
    }} placeholder="Search people, players, teams, tools…" aria-label="Search SlipSurge" autoComplete="off"/>{query ? <button type="button" className={styles.key} onClick={() => setQuery('')} aria-label="Clear search"><X size={12}/></button> : <kbd className={styles.key}>ESC</kbd>}</div>
    <div className={styles.body} role="listbox" aria-label="Search results">{items.length ? <div className={styles.section}><span className={styles.label}>{query ? 'Results' : 'Navigate'}</span>{items.map((item, index) => { const Icon = item.icon; return <button key={item.id} type="button" className={styles.item} data-active={active === index} onMouseEnter={() => setActive(index)} onClick={() => navigate(item.href)} role="option" aria-selected={active === index}><span className={styles.icon}><Icon size={16}/></span><span className={styles.copy}><strong>{item.label}</strong><span>{item.detail}</span></span><ChevronRight className={styles.arrow} size={15}/></button> })}</div> : <div className={styles.empty}><Search size={24}/><strong>No matching results</strong><span>Press Enter to search the full network.</span></div>}</div>
    <div className={styles.footer}><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>ESC</kbd> Close</span></div>
  </div></Modal>
}
