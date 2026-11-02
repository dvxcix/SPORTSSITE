import assert from 'node:assert/strict'
import test from 'node:test'
import { nflTouchdownQuoteLabel } from '../src/lib/nflTouchdownQuoteLabel.ts'
const quote = {propType:'anytime_td',label:'Anytime',vendor:'fanduel',line:.5,odds:220,openingOdds:null}
test('cached v5 data without quote provenance never fabricates a time', () => {
  assert.equal(nflTouchdownQuoteLabel(quote),'Last seen · Time unavailable')
  assert.equal(nflTouchdownQuoteLabel({...quote,observedAt:'invalid'}),'Last seen · Time unavailable')
  assert.equal(nflTouchdownQuoteLabel({...quote,observedAt:'2099-01-01T00:00:00Z'}),'Last seen · Time unavailable')
})
test('actual quote time and opening provenance remain visible across US daylight-saving time', () => {
  assert.equal(nflTouchdownQuoteLabel({...quote,observedAt:'2026-10-25T16:57:07.000Z'}),'Last seen · Quote time 10/25, 12:57:07 PM ET')
  assert.equal(nflTouchdownQuoteLabel({...quote,observedAt:'2026-11-02T16:57:07.000Z',isOpeningOnly:true}),'Opening · Quote time 11/2, 11:57:07 AM ET')
})
