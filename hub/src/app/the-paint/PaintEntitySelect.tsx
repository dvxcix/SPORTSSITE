'use client'

import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, UsersRound } from 'lucide-react'
import { bookName } from '@/components/BookLogo'
import { SportsbookMark } from '@/components/SportsbookMark'
import { TeamLogo } from './PaintVisuals'
import styles from './PaintEntitySelect.module.css'

type EntityOption = { value: string; label: string; icon: ReactNode }
type SelectProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  allowAll?: boolean
  className?: string
}

/** A logo trigger with a portalled, keyboard-navigable choice list. */
function PaintEntitySelect({ value, onChange, label, options, className, kind }: Omit<SelectProps, 'allowAll' | 'label'> & { label: string; options: EntityOption[]; kind: 'book' | 'team' }) {
  const selected = options.find(option => option.value === value)
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger className={`${styles.trigger} ${className ?? ''}`} data-paint-entity-select={kind} data-value={value} aria-label={`${label}: ${selected?.label ?? value}`}>
      <span className={styles.mark} aria-hidden="true">{selected?.icon ?? (kind === 'book' ? <SportsbookMark/> : <UsersRound size={25}/>)}</span>
      <ChevronDown className={styles.chevron} size={13} aria-hidden="true"/>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={styles.menu} sideOffset={7} align="start" collisionPadding={12} avoidCollisions onEscapeKeyDown={event => event.stopPropagation()}>
        <DropdownMenu.Label className={styles.heading}>{label}</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={value} onValueChange={onChange} aria-label={label}>
          {options.map(option => <DropdownMenu.RadioItem key={option.value} value={option.value} textValue={option.label} className={styles.option}>
            <span className={styles.optionMark} aria-hidden="true">{option.icon}</span>
            <span className={styles.optionLabel}>{option.label}</span>
            <DropdownMenu.ItemIndicator className={styles.selected}><Check size={15} aria-hidden="true"/></DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}

export function PaintBookSelect({ value, onChange, books, label = 'Sportsbook', allowAll = true, className }: SelectProps & { books: readonly string[] }) {
  const available = [...new Set([...(value !== 'all' ? [value] : []), ...books])].filter(book => book !== 'all')
  const options: EntityOption[] = [
    ...(allowAll ? [{ value: 'all', label: 'All sportsbooks', icon: <SportsbookMark books={available}/> }] : []),
    ...available.map(book => ({ value: book, label: bookName(book), icon: <SportsbookMark vendor={book} size={28}/> })),
  ]
  return <PaintEntitySelect value={value} onChange={onChange} label={label} options={options} className={className} kind="book"/>
}

export function PaintTeamSelect({ value, onChange, teams, label = 'Team', allowAll = true, className }: SelectProps & { teams: readonly { id: number | string; abbreviation: string; full_name: string }[] }) {
  const available = [...new Map(teams.map(team => [String(team.id), team])).values()]
  const allTeamsIcon = available.length === 2
    ? <span className={styles.teamStack} aria-hidden="true">{available.map(team => <span key={team.id}><TeamLogo abbr={team.abbreviation} size={20}/></span>)}</span>
    : <UsersRound size={25}/>
  const options: EntityOption[] = [
    ...(allowAll ? [{ value: 'all', label: 'All teams', icon: allTeamsIcon }] : []),
    ...available.map(team => ({ value: String(team.id), label: team.full_name, icon: <TeamLogo abbr={team.abbreviation} size={30}/> })),
  ]
  return <PaintEntitySelect value={value} onChange={onChange} label={label} options={options} className={className} kind="team"/>
}
