import assert from 'node:assert/strict'
import { loadNflWeather, periodWeather } from '../src/lib/nflWeather'
const game = { stadium:'Soldier Field',roof:'outdoors',surface:'grass',gameday:'2026-09-28',gametime:'20:15',temp:null,wind:null }
const now = new Date('2026-09-28T20:00:00Z')
const periods=[{startTime:'2026-09-28T19:00:00-05:00',endTime:'2026-09-28T20:00:00-05:00',temperature:61,temperatureUnit:'F',windSpeed:'5 to 10 mph',windDirection:'N',shortForecast:'Mostly Clear'}]
let calls=0
const fake = (async (url: string) => { calls++; return new Response(JSON.stringify(url.includes('/points/') ? {properties:{forecastHourly:'https://api.weather.gov/gridpoints/LOT/76,72/forecast/hourly'}} : {properties:{periods}})) }) as typeof fetch
assert.match(await loadNflWeather(game,fake,now),/Kickoff forecast: 61°F.*5 to 10 mph/)
assert.equal(calls,2)
calls=0
assert.equal(await loadNflWeather({...game,roof:'closed'},fake,now),'Indoors · grass')
assert.equal(calls,0)
assert.match(await loadNflWeather({...game,temp:0,wind:0},fake,now),/0°F · 0 mph/)
assert.equal(calls,0)
assert.match(await loadNflWeather({...game,gameday:'2026-09-20'},fake,now),/Historical weather unavailable/)
assert.equal(calls,0)
assert.match(await loadNflWeather({...game,gameday:'2026-10-20'},fake,now),/closer to kickoff/)
assert.match(await loadNflWeather({...game,stadium:'Tottenham Hotspur Stadium'},fake,now),/unavailable for this venue/)
assert.equal(calls,0)
assert.equal(periodWeather(periods,new Date('2026-09-29T04:00:00Z')),null)
assert.equal(periodWeather([{...periods[0],temperature:null as any}],new Date('2026-09-29T00:15:00Z')),null)
const failure = (async()=>new Response('{}',{status:503})) as typeof fetch
assert.match(await loadNflWeather(game,failure,now),/temporarily unavailable/)
assert.match(await loadNflWeather({...game,temp:58},failure,now),/58°F/)
console.log('PASS: kickoff timezone, missing data, zero values, roof, history, forecast horizon, venue, provider failures')
if(process.argv.includes('--live')) {
 const result=await loadNflWeather(game)
 console.log('LIVE Soldier Field:',result)
 assert.match(result,/forecast:.*°F/,'live Soldier Field forecast must resolve')
}
