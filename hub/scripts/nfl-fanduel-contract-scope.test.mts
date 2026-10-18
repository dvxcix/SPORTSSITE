import test from 'node:test'
import assert from 'node:assert/strict'
import { nflFdMarket } from '../src/lib/scrapers/nflFanduelMarkets.ts'
test('combined passing and rushing is not individual rushing',()=>{
 assert.equal(nflFdMarket('C.J. Stroud - Alt Passing + Rushing Yds')?.prop,'passing_rushing_yards')
 assert.equal(nflFdMarket('Woody Marks - Alt Rushing Yds')?.prop,'rushing_yards')
 assert.equal(nflFdMarket('Woody Marks - Rushing + Receiving Yds')?.prop,'rushing_receiving_yards')
})
test('abbreviated quarter contracts cannot overwrite full-game markets',()=>{
 assert.equal(nflFdMarket('Xavier Hutchinson - 1st Qtr Receiving Yds'),null)
 assert.equal(nflFdMarket('Trevor Lawrence - 4th Qtr Rushing Yds'),null)
 assert.equal(nflFdMarket('Xavier Hutchinson - Alt Receiving Yds')?.prop,'receiving_yards')
})
