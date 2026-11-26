// Shared geometry for the SlipSurge "Bolt dollar" mark and wordmark. Every shape is a plain filled polygon.
const H=192;
// Zig S: two bars joined by a diagonal, with a short hook on each bar. t = stem, deg = diagonal angle, o = bar overhang.
function zigS(t,deg,o){const a=deg*Math.PI/180,c=t/2,run=(H-2*t)/Math.tan(a),dw=t/Math.sin(a),W=2*o+dw+run;
 return {w:W,p:[[[o,0],[W,0],[W,t],[W-c,t+c],[W-t,t+c],[W-t,t],[o+dw,t],[W-o,H-t],[W-o,H],[0,H],[0,H-t],[c,H-t-c],[t,H-t-c],[t,H-t],[W-o-dw,H-t],[o,t]]]}}
const move=(polys,dx,dy)=>polys.map(p=>p.map(([x,y])=>[x+dx,y+dy]));
// the mark: heavy zig S plus two bolt ends (parallelograms, 45deg), point-symmetric
function mark(nw=48,nh=40,x0=88){const s=zigS(48,45,14).p[0];const t=[[x0,0],[x0+nw,0],[x0+nw+nh,-nh],[x0+nh,-nh]];return [s,t,t.map(([x,y])=>[192-x,192-y])]}
// wordmark capitals, stem 36
function letters(t=36){const w=132,co=32,ci=11,bh=120,dw=t/Math.sin(Math.PI/3),lr=(H-bh)/Math.tan(Math.PI/3),S=zigS(t,60,10);
 return {S,
 s:{w,p:[[[co,0],[w-co,0],[w,co],[w,58],[w-t,58],[w-t,t+ci],[w-t-ci,t],[t+ci,t],[t,t+ci],[t,78-ci],[t+ci,78],[w-co,78],[w,78+co],[w,H-co],[w-co,H],[co,H],[0,H-co],[0,134],[t,134],[t,H-t-ci],[t+ci,H-t],[w-t-ci,H-t],[w-t,H-t-ci],[w-t,114+ci],[w-t-ci,114],[co,114],[0,114-co],[0,co]]]},
 L:{w:108,p:[[[0,0],[t,0],[t,H-t],[108,H-t],[108,H],[0,H]]]},
 I:{w:t,p:[[[0,0],[t,0],[t,H],[0,H]]]},
 P:{w,p:[[[0,0],[w-co,0],[w,co],[w,bh-co],[w-co,bh],[t,bh],[t,H],[0,H]],[[t,t],[w-t-ci,t],[w-t,t+ci],[w-t,bh-t-ci],[w-t-ci,bh-t],[t,bh-t]]]},
 U:{w,p:[[[0,0],[t,0],[t,H-t-ci],[t+ci,H-t],[w-t-ci,H-t],[w-t,H-t-ci],[w-t,0],[w,0],[w,H-co],[w-co,H],[co,H],[0,H-co]]]},
 R:{w,p:[[[0,0],[w-co,0],[w,co],[w,bh-co],[w-co,bh],[w+4-lr,bh],[w+4,H],[w+4-dw,H],[w+4-lr-dw,bh],[t,bh],[t,H],[0,H]],[[t,t],[w-t-ci,t],[w-t,t+ci],[w-t,bh-t-ci],[w-t-ci,bh-t],[t,bh-t]]]},
 G:{w,p:[[[co,0],[w-co,0],[w,co],[w,58],[w-t,58],[w-t,t+ci],[w-t-ci,t],[t+ci,t],[t,t+ci],[t,H-t-ci],[t+ci,H-t],[w-t,H-t],[w-t,126],[64,126],[64,90],[w,90],[w,H-co],[w-co,H],[co,H],[0,H-co],[0,co]]]},
 E:{w:108,p:[[[0,0],[108,0],[108,t],[t,t],[t,78],[96,78],[96,114],[t,114],[t,H-t],[108,H-t],[108,H],[0,H]]]}}}
// kerning tweaks added to the base gap, keyed by letter pair
const KERN={LI:-6,Ps:-6,RG:-4};
function word(text="sLIPsURGE",gap=26,t=36){const A=letters(t);let x=0,out=[];[...text].forEach((ch,i)=>{const g=A[ch];out.push(...move(g.p,x,0));x+=g.w+(i<text.length-1?gap+(KERN[ch+text[i+1]]||0):0)});return {w:x,p:out}}
const r=n=>+n.toFixed(2);
const d=(polys,s=1,tx=0,ty=0)=>polys.map(p=>"M"+p.map(([x,y])=>r(x*s+tx)+" "+r(y*s+ty)).join(" L")+" Z").join(" ");
const bbox=polys=>{const xs=polys.flat().map(p=>p[0]),ys=polys.flat().map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
// place polys so their bounding box sits at (x,y) with the given height
const place=(polys,x,y,h)=>{const [a,b,c,e]=bbox(polys),s=h/(e-b);return {d:d(polys,s,x-a*s,y-b*s),w:(c-a)*s,h}};
module.exports={H,zigS,mark,letters,word,d,bbox,place,move,r};
