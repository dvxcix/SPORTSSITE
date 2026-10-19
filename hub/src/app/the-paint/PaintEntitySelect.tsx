'use client'

import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, Grid2X2, UsersRound } from 'lucide-react'
import { BookLogo, bookName } from '@/components/BookLogo'
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
      <span className={styles.mark} aria-hidden="true">{selected?.icon ?? <Grid2X2 size={24}/>}</span>
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
    ...(allowAll ? [{ value: 'all', label: 'All sportsbooks', icon: <Grid2X2 size={25}/> }] : []),
    ...available.map(book => ({ value: book, label: bookName(book), icon: <BookLogo vendor={book} size={28}/> })),
  ]
  return <PaintEntitySelect value={value} onChange={onChange} label={label} options={options} className={className} kind="book"/>
}

export function PaintTeamSelect({ value, onChange, teams, label = 'Team', allowAll = true, className }: SelectProps & { teams: readonly { id: number | string; abbreviation: string; full_name: string }[] }) {
  const options: EntityOption[] = [
    ...(allowAll ? [{ value: 'all', label: 'All teams', icon: <UsersRound size={25}/> }] : []),
    ...[...new Map(teams.map(team => [String(team.id), team])).values()].map(team => ({ value: String(team.id), label: team.full_name, icon: <TeamLogo abbr={team.abbreviation} size={30}/> })),
  ]
  return <PaintEntitySelect value={value} onChange={onChange} label={label} options={options} className={className} kind="team"/>
}
