'use client'

import { useMemo, type ReactNode } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'
import type { SidelineTeam } from './types'
import { sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import styles from './sidelineBoard.module.css'

type AvatarPlayer = { name:string; headshot?:string|null; headshotFallbacks?:string[] }

// Shared with Sideline's existing player cards so the odds board has the same
// saved portrait, team-color gradient and team badge without roster lookups.
export function SidelinePlayerAvatar({player,team}:{player:AvatarPlayer;team:SidelineTeam}) {
  const sources=useMemo(()=>Array.from(new Set([player.headshot,...(player.headshotFallbacks??[])].filter((source):source is string=>Boolean(source)))),[player.headshot,player.headshotFallbacks])
  const portrait=sources.reduceRight<ReactNode>((fallback,source)=><SafeImage key={source} src={source} alt={`${player.name} headshot`} width={42} height={42} fallback={fallback}/>,<b>{player.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</b>)
  const logo=sportTeamLogoUrl('nfl',team.abbr)??team.logo
  return <span className={styles.avatar} style={{background:`linear-gradient(145deg, ${team.color}, ${team.color2 || '#111820'})`}}>
    <span className={styles.avatarFrame}>{portrait}</span>
    {logo?<SafeImage className={styles.avatarTeam} src={logo} alt={`${team.name} logo`} width={17} height={17}/>:null}
  </span>
}
