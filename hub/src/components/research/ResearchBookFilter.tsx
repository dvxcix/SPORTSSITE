'use client'

import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'
import { BookLogo, bookName } from '@/components/BookLogo'
import { preferredBookIds } from '@/lib/researchPreferences'
import styles from './ResearchBookFilter.module.css'

export function useResearchBooks(available: readonly string[], preferred: readonly string[]) {
  const [selection, setSelection] = useState<string[] | null>(null)
  return { books: selection === null ? preferredBookIds(available, preferred) : available.filter(book => selection.includes(book)), setBooks: setSelection }
}

export function ResearchBookFilter({ available, selected, onChange }: { available: readonly string[]; selected: readonly string[]; onChange: (books: string[]) => void }) {
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger className={styles.trigger} aria-label={`Show sportsbooks: ${selected.length} selected`}>
      <span className={styles.logos} aria-hidden="true">{selected.slice(0, 3).map(book => <BookLogo key={book} vendor={book} size={20}/>)}</span><span>{selected.length === available.length ? 'All books' : `${selected.length} books`}</span><ChevronDown size={15}/>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className={styles.panel} sideOffset={7} align="start" collisionPadding={12} avoidCollisions>
      <DropdownMenu.Label className={styles.head}>Show books</DropdownMenu.Label>
      <DropdownMenu.Item className={styles.all} onSelect={event => { event.preventDefault(); onChange([...available]) }}>All books</DropdownMenu.Item>
      <DropdownMenu.Group aria-label="Visible sportsbooks">{available.map(book => <DropdownMenu.CheckboxItem className={styles.option} key={book} textValue={bookName(book)} checked={selected.includes(book)} disabled={selected.length === 1 && selected.includes(book)} onSelect={event => event.preventDefault()} onCheckedChange={() => onChange(selected.includes(book) ? selected.filter(item => item !== book) : [...selected, book])}>
        <span className={styles.box}><DropdownMenu.ItemIndicator><Check size={13}/></DropdownMenu.ItemIndicator></span><span aria-hidden="true"><BookLogo vendor={book} size={22}/></span><span>{bookName(book)}</span>
      </DropdownMenu.CheckboxItem>)}</DropdownMenu.Group>
      {!available.length && <p>No captured books in this view.</p>}
      <DropdownMenu.Separator className={styles.separator}/><DropdownMenu.Item asChild><Link className={styles.link} href="/settings/research">Edit saved defaults ↗</Link></DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>
}
