import type { NbaFirstBookBoard } from './nbaFirstBookQuotes'

// These readers run in the browser. They read rendered DOM only; no framework
// state, sportsbook APIs, tokens, or betslip interaction is involved.
export function readDkFirstBoards(): NbaFirstBookBoard[] {
  const visible = (element: Element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, observedAt = new Date().toISOString(), boards: NbaFirstBookBoard[] = []
  for (const card of [...document.querySelectorAll('.cb-non-collapsible')].slice(0, 200)) {
    if (!visible(card)) continue
    const markets = [...card.querySelectorAll('[data-testid="market-template"]')].filter(node => node.querySelector('.cb-market__label-name__text')?.textContent?.trim() === '1st Points Scorer' && visible(node))
    if (markets.length !== 1) continue
    const market = markets[0], clock = card.querySelector('.cb-title__day-time')?.textContent?.trim() ?? ''
    const split = clock.match(/^(.*?)\s+(\d{1,2}:\d{2}\s*[AP]M)$/i)
    const rows = [...market.querySelectorAll('[data-testid="market-label"]')].filter(visible).slice(0, 100).map(label => {
      const button = label.nextElementSibling
      const active = button?.tagName === 'BUTTON' && !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true' && visible(button)
      return { name: label.querySelector('.cb-market__label--truncate-strings')?.textContent?.trim() ?? '', odds: active ? button.querySelector('[data-testid="button-odds-market-board"]')?.textContent?.trim() ?? '' : '' }
    })
    const more = [...card.querySelectorAll('button,[role="button"],a')].some(node => /^(show|see|view) more$/i.test(node.textContent?.trim() ?? '') && visible(node))
    boards.push({ away: card.querySelector('.cb-title__left-team .cb-title__team-name')?.textContent?.trim() ?? '', home: card.querySelector('.cb-title__right-team .cb-title__team-name')?.textContent?.trim() ?? '',
      dateLabel: split?.[1] ?? '', timeLabel: split?.[2] ?? '', timeZone, observedAt, market: '1st Point', expanded: !more && rows.length < 100, rows })
  }
  return boards
}

export function readMgmFirstRows(panelId: string) {
  const panel = document.getElementById(panelId)
  if (!panel || panel.getAttribute('aria-hidden') !== 'false') return { rows: [], expanded: false }
  const visible = (element: Element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  const rows = [...panel.querySelectorAll('.attribute-key')].filter(node => node.querySelector('.goal-scorer-player-name') && visible(node)).slice(0, 100).map(label => {
    const option = label.nextElementSibling
    const active = option?.tagName === 'MS-OPTION' && !option.hasAttribute('disabled') && option.getAttribute('aria-disabled') !== 'true' && !option.classList.contains('disabled') && visible(option)
    return { name: label.querySelector('.goal-scorer-player-name')?.textContent?.trim() ?? '', odds: active ? option.querySelector('.option-value ms-font-resizer')?.textContent?.trim() ?? '' : '' }
  })
  const more = [...panel.querySelectorAll('*')].some(node => node.children.length === 0 && /^(show|see) more$/i.test(node.textContent?.trim() ?? '') && visible(node))
  return { rows, expanded: !more && rows.length < 100 }
}

export function readMgmFirstIdentity() {
  const visible = (element: Element) => {
    if (element.closest('[hidden],[aria-hidden="true"]')) return false
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }
  const teams = [...document.querySelectorAll('ms-scoreboard-participant .participant-name-value')].filter(visible).map(node => node.textContent?.trim() ?? '')
  const clocks = [...document.querySelectorAll('.event-time')].filter(visible)
  const league = [...document.querySelectorAll('.breadcrumb-title')].some(node => node.textContent?.trim() === 'NBA' && visible(node))
  if (!league || teams.length !== 2 || clocks.length !== 1) return null
  const countdown = clocks[0].textContent?.trim().match(/^Starting in\s*(\d{1,2})\s*min$/i)
  const dateLabel = countdown ? '' : clocks[0].querySelector('.date')?.textContent?.trim() ?? '', timeLabel = countdown ? '' : clocks[0].querySelector('.time')?.textContent?.trim() ?? ''
  return { away: teams[0], home: teams[1], dateLabel, timeLabel, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(countdown ? { countdown: { minutes: Number(countdown[1]), observedAt: new Date().toISOString() } } : {}) }
}
