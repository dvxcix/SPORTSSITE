// Executed in the existing cloud browser, never on the owner's laptop.
export async function runNbaPikkitScrape(){
  const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms))
  const marketWords=/points?|rebounds?|assists?|threes?|steals?|blocks?|turnovers?|3.?point/i
  const selector=Array.from(document.querySelectorAll('select')).map(select=>({select,score:Array.from(select.options).filter(o=>marketWords.test(o.textContent??'')).length})).sort((a,b)=>b.score-a.score)[0]
  if(!selector||selector.score<2)return {url:location.href,capturedAt:new Date().toISOString(),props:{},complete:false,diagnostic:{selects:Array.from(document.querySelectorAll('select')).map(s=>Array.from(s.options).map(o=>o.textContent?.trim()).slice(0,40)),marketControls:Array.from(document.querySelectorAll('button,[role="tab"]')).map(n=>n.textContent?.trim()??'').filter(t=>/props|points|rebounds|assists|odds|popular|all markets/i.test(t)).slice(0,30)}}
  const options=Array.from(selector.select.options).filter(o=>o.value&&marketWords.test(o.textContent??'')).map(o=>({value:o.value,label:o.textContent?.trim()??''}))
  const props:Record<string,Record<string,number>>={};let complete=true;const started=Date.now()
  for(const option of options){
    if(Date.now()-started>80000){complete=false;break}
    const select=selector.select
    if(!select.isConnected){complete=false;break}
    select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));await pause(1200)
    const rows=document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean), counts:Record<string,number>={}
    for(let i=1;i<rows.length;i++){
      const match=rows[i].match(/^([\d,]+)\s+Picks?$/i)
      if(!match)continue
      const name=rows[i-1].replace(/\s+(Over|Under)\s+[+-]?\d+(\.\d+)?$/i,'').trim()
      if(name.length>=3&&name.length<=120)counts[name]=Number(match[1].replace(/,/g,''))
    }
    if(select.value!==option.value){complete=false;break}
    props[option.label]=counts
  }
  return {url:location.href,capturedAt:new Date().toISOString(),props,complete}
}
