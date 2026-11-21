import assert from 'node:assert/strict'
import test from 'node:test'
import { scrollMessagePane } from '../src/lib/messageScroll'

function fixture(reduced = false) {
  const calls: ScrollToOptions[] = []
  const pane = {
    scrollTop: 120, scrollHeight: 2200, clientHeight: 600,
    ownerDocument: { defaultView: { matchMedia: () => ({ matches: reduced }) } },
    contains: (target: unknown) => target === message,
    getBoundingClientRect: () => ({ top: 80 }),
    scrollTo: (options: ScrollToOptions) => calls.push(options),
  }
  const message = { clientHeight: 60, getBoundingClientRect: () => ({ top: 500 }) }
  return { pane: pane as unknown as HTMLElement, message: message as unknown as HTMLElement, calls }
}

test('latest-message scrolling is confined to the conversation pane', () => {
  const { pane, calls } = fixture()
  scrollMessagePane(pane, undefined, 'smooth')
  assert.deepEqual(calls, [{ top: 2200, behavior: 'smooth' }])
})

test('reply jumps center the target inside the pane without scrolling ancestors', () => {
  const { pane, message, calls } = fixture()
  scrollMessagePane(pane, message, 'smooth')
  assert.deepEqual(calls, [{ top: 270, behavior: 'smooth' }])
})

test('missing or unrelated reply targets never move the conversation', () => {
  const { pane, calls } = fixture()
  scrollMessagePane(null)
  scrollMessagePane(pane, null)
  scrollMessagePane(pane, {} as HTMLElement)
  assert.equal(calls.length, 0)
})

test('conversation jumps respect reduced motion', () => {
  const { pane, message, calls } = fixture(true)
  scrollMessagePane(pane, message, 'smooth')
  assert.equal(calls[0].behavior, 'auto')
})

test('scroll position still updates when scrollTo is unavailable', () => {
  const { pane } = fixture()
  Object.assign(pane, { scrollTo: undefined })
  scrollMessagePane(pane)
  assert.equal(pane.scrollTop, 2200)
})
