// Browser DOM readers. Deliberately independent of framework/application state.
export function readMgmPropMenu() {
  const visible = (element: Element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  const headers = [...document.querySelectorAll('button[aria-controls][aria-expanded]')].flatMap(button => {
    const title = button.querySelector('[slot="title"]')?.textContent?.trim() ?? '', id = button.getAttribute('aria-controls') ?? ''
    if (!title || !/^[a-zA-Z0-9_-]+$/.test(id) || !visible(button)) return []
    return [{ title, id }]
  })
  const all = [...document.querySelectorAll('button[data-menu-item-id="-1"].ds-pill-current.ds-pill-selected')].filter(visible)
  const allSelected = all.length === 1 && all[0].textContent?.trim() === 'All' && all[0].getAttribute('aria-disabled') !== 'true' && !all[0].hasAttribute('disabled')
  const loading = [...document.querySelectorAll('[aria-busy="true"],progress,[role="progressbar"]')].some(visible)
  return { headers, allSelected, loading }
}

export function readMgmPropPanel(panelId: string) {
  const empty = { targets: [] as string[], selectedTarget: '', expanded: false, allSelected: false, signature: '', rows: [] as { name: string; side: string; odds: string; unavailable: boolean }[] }
  const panel = document.getElementById(panelId)
  if (!panel || panel.getAttribute('aria-hidden') !== 'false') return empty
  const visible = (element: Element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  const tabs = [...panel.querySelectorAll('button[role="tab"]')].filter(visible)
  const targets = tabs.map(tab => tab.textContent?.trim() ?? '').filter(text => /^\d+\+$/.test(text))
  const selected = tabs.filter(tab => tab.getAttribute('aria-selected') === 'true' && /^\d+\+$/.test(tab.textContent?.trim() ?? ''))
  const all = tabs.filter(tab => tab.textContent?.trim() === 'All')
  const binaryGroups = [...panel.querySelectorAll('.yes-no-container')].filter(visible)
  if (binaryGroups.length) {
    if (binaryGroups.length !== 1 || targets.length) return empty
    const group = binaryGroups[0], headings = [...group.querySelectorAll('.option-group-header > span')].map(node => node.textContent?.trim() ?? '').filter(Boolean)
    if (!['Yes', 'Yes,No'].includes(headings.join(','))) return empty
    const selectionIds: string[] = []
    const playerRows = [...group.querySelectorAll('.yes-no-option-row-container')].filter(visible)
    const rows = playerRows.slice(0, 100).flatMap(row => {
      const name = row.querySelector('.attribute-key .attribute-key-ellipsis')?.textContent?.trim() ?? ''
      const options = [...row.children].filter(node => node.tagName === 'MS-OPTION' || node.classList.contains('empty-option'))
      const outcomes = headings.map((heading, index) => {
        const option = options[index], unavailable = Boolean(option && visible(option) && option.querySelector('.offline.option-indicator .lock.option-group-lock-icon'))
        selectionIds.push(option?.querySelector('[data-test-option-id]')?.getAttribute('data-test-option-id') ?? '')
        const side = option?.querySelector('.name')?.textContent?.trim() ?? ''
        return { name, side: side === heading ? side : '', odds: option && visible(option) ? option.querySelector('.option-value ms-font-resizer')?.textContent?.trim() ?? '' : '', unavailable }
      })
      return options.length === headings.length ? outcomes : [...outcomes, { name, side: '', odds: '', unavailable: false }]
    })
    const more = [...panel.querySelectorAll('.show-more-less-button')].some(node => visible(node) && /^Show More/.test(node.textContent?.trim() ?? ''))
    return { targets: ['0.5'], selectedTarget: '0.5', allSelected: true, expanded: !more && playerRows.length < 100, signature: JSON.stringify([selectionIds, rows]), rows }
  }
  const groups = [...panel.querySelectorAll('.player-milestone-container')].filter(visible)
  if (groups.length !== 1) return { ...empty, targets }
  const selectionIds: string[] = []
  const rows = [...groups[0].querySelectorAll('.attribute-key.player-statistics')].filter(visible).slice(0, 100).map(label => {
    const option = label.nextElementSibling, scoped = option?.tagName === 'MS-OPTION' && visible(option)
    const unavailable = Boolean(scoped && option.querySelector('.option-indicator.offline .lock.option-group-lock-icon'))
    selectionIds.push(scoped ? option.querySelector('[data-test-option-id]')?.getAttribute('data-test-option-id') ?? '' : '')
    return { name: label.querySelector('.group-title .title')?.textContent?.trim() ?? '', side: scoped ? option.querySelector('.name')?.textContent?.trim() ?? '' : '', odds: scoped ? option.querySelector('.option-value ms-font-resizer')?.textContent?.trim() ?? '' : '', unavailable }
  })
  const more = [...panel.querySelectorAll('.show-more-less-button')].some(node => visible(node) && /^Show More/.test(node.textContent?.trim() ?? ''))
  return { targets, selectedTarget: selected.length === 1 ? selected[0].textContent!.trim() : '', allSelected: all.length === 0 || all.length === 1 && all[0].getAttribute('aria-selected') === 'true',
    expanded: !more && rows.length < 100, signature: JSON.stringify([selectionIds, rows]), rows }
}
