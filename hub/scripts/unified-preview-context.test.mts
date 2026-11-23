import test from 'node:test'
import assert from 'node:assert/strict'
import { preservePublicPreviewContext } from '../src/lib/publicPreviewContext'
import { PUBLIC_PREVIEW_EXAMPLES } from '../src/lib/publicResearchPreviewExamples'
import { readPreviewContext, type PreviewSport, type ResearchPreview } from '../src/lib/publicResearchPreview'

for(const sport of ['nba','nfl'] as PreviewSport[]){
  test(`${sport} saved example selection keeps the exact public game and current schedule`,()=>{
    const example=PUBLIC_PREVIEW_EXAMPLES[sport]
    const current:ResearchPreview={board:{...example,example:false,game:{...example.game,date:'2026-11-23',id:sport==='nba'?'21718171':'2026_12_MIN_SF'}},date:'2026-11-23',schedule:[],scheduleAvailable:true}
    const context=readPreviewContext({preview:sport,game:example.game.id,date:example.game.date,player:String(example.players[0].id),line:String(example.players[0].prices[0].line)})
    const selected=preservePublicPreviewContext(sport,current,context)
    assert.equal(selected.board,example)
    assert.equal(selected.date,current.date)
    assert.equal(selected.schedule,current.schedule)
    assert.equal(current.board.example,false,'selection must not mutate the shared current preview')
    assert.equal(preservePublicPreviewContext(sport,current,null),current)
    assert.equal(preservePublicPreviewContext(sport,current,{...context!,date:'2026-11-09'}),current)
    assert.equal(preservePublicPreviewContext(sport,current,{...context!,game:'arbitrary-history'}),current)
    assert.equal(preservePublicPreviewContext(sport,current,{...context!,sport:sport==='nba'?'nfl':'nba'}),current)
  })
}
