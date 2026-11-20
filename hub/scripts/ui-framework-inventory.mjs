import fs from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..')
const files=[]
async function scan(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(['api','node_modules','.next'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(/\.(tsx|css)$/.test(entry.name))files.push(file)}}
await scan(path.join(root,'src'))
const colourCounts=new Map(),utilityCounts=new Map(),results=[]
for(const file of files){const text=await fs.readFile(file,'utf8');const colours=[...text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map(x=>x[0]);for(const c of colours)colourCounts.set(c,(colourCounts.get(c)||0)+1);for(const m of text.matchAll(/(?:text|bg|border|ring|divide|from|to|via)-(?:zinc|gray|slate|neutral|white|black)[\w/[\].%-]*/g))utilityCounts.set(m[0],(utilityCounts.get(m[0])||0)+1);results.push({file:path.relative(root,file).replaceAll('\\','/'),kind:file.endsWith('page.tsx')?'page':file.endsWith('.css')?'stylesheet':'component',client:text.includes("'use client'")||text.includes('"use client"'),hardcodedColours:colours.length,smallText:[...text.matchAll(/text-\[(?:[6-9]|10|11)px\]|font-size\s*:\s*(?:[6-9]|10|11)px/g)].length,svgCount:(text.match(/<svg\b/g)||[]).length,canvas:text.includes('getContext('),dialogs:(text.match(/<Modal\b|<ModalSurface\b|role=["']dialog/g)||[]).length})}
const report={generatedAt:new Date().toISOString(),baseline:'e7b68ef36a967955ff5c6acf4e4fa45e21ac7df7',counts:{files:results.length,pages:results.filter(x=>x.kind==='page').length,stylesheets:results.filter(x=>x.kind==='stylesheet').length,components:results.filter(x=>x.kind==='component').length,svgFiles:results.filter(x=>x.svgCount).length,canvasFiles:results.filter(x=>x.canvas).length},files:results,colours:[...colourCounts].sort((a,b)=>b[1]-a[1]),utilities:[...utilityCounts].sort((a,b)=>b[1]-a[1])}
await fs.mkdir(path.join(root,'docs/design'),{recursive:true})
await fs.writeFile(path.join(root,'docs/design/ui-inventory-current.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({counts:report.counts,colours:report.colours.slice(0,18),utilities:report.utilities.slice(0,14)}))
