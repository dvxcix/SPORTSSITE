'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import type { SidelineTeam } from './types'
import { sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import styles from './sidelineBoard.module.css'

type AvatarPlayer = { name:string; headshot?:string|null; headshotFallbacks?:string[] }

// Shared with Sideline's existing player cards so the odds board has the same
// saved portrait, team-color gradient and team badge without roster lookups.
export function SidelinePlayerAvatar({player,team}:{player:AvatarPlayer;team:SidelineTeam}) {
  const sources=useMemo(()=>Array.from(new Set([player.headshot,...(player.headshotFallbacks??[])].filter((source):source is string=>Boolean(source)))),[player.headshot,player.headshotFallbacks])
  const [failedSources,setFailedSources]=useState<string[]>([]),[failedTeamLogo,setFailedTeamLogo]=useState<string|null>(null)
  const source=sources.find(candidate=>!failedSources.includes(candidate))??null
  const logo=sportTeamLogoUrl('nfl',team.abbr)??team.logo
  return <span className={styles.avatar} style={{background:`linear-gradient(145deg, ${team.color}, ${team.color2 || '#111820'})`}}>
    {source?<Image unoptimized={!source.startsWith('https://static.www.nfl.com/')} src={source} alt={`${player.name} headshot`} width={42} height={42} onError={()=>setFailedSources(current=>current.includes(source)?current:[...current,source])}/>:<b>{player.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</b>}
    {logo&&logo!==failedTeamLogo?<Image unoptimized className={styles.avatarTeam} src={logo} alt={`${team.name} logo`} width={17} height={17} onError={()=>setFailedTeamLogo(logo)}/>:null}
  </span>
}
