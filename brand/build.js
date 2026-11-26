// Builds the SlipSurge logo kit (Bolt dollar). Usage: node build.js  -> writes ./svg/**
const fs=require("fs"),path=require("path"),g=require("./geo.js");
const LIME="#b4ff4d",INK="#0a0a0b",WHITE="#ffffff",BLACK="#000000";
const MARK=g.mark(48,40,88),SMALL=g.mark(60,46,80),WORD=g.word().p;   // SMALL = small-size cut with larger bolt ends
const svg=(w,h,body,desc)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d"><title id="t">SlipSurge logo</title><desc id="d">${desc}</desc>${body}</svg>\n`;
const D_SYM="An angular letter S struck by a lightning bolt, like a dollar sign",D_LOCK=D_SYM+", with the SlipSurge wordmark";
const p=(d,fill,id)=>`<path id="${id}" fill="${fill}" fill-rule="evenodd" d="${d}"/>`;
const out=(f,s)=>{const o=path.join(__dirname,"svg",f);fs.mkdirSync(path.dirname(o),{recursive:true});fs.writeFileSync(o,s)};
// mark centred in a box (x,y,size) at a given height; returns path data
const markIn=(polys,x,y,size,h)=>{const [a,b,c,e]=g.bbox(polys),w=(c-a)*h/(e-b);return g.place(polys,x+(size-w)/2,y+(size-h)/2,h).d};
const tile=(x,y,s,fill,rx)=>`<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}" fill="${fill}"/>`;

// symbol (256 canvas, transparent)
for(const [n,c] of [["black",BLACK],["white",WHITE],["ink",INK],["lime",LIME]]){
 out(`symbol/slipsurge-symbol-${n}.svg`,svg(256,256,p(markIn(MARK,0,0,256,224),c,"symbol"),D_SYM));
 out(`symbol/slipsurge-symbol-small-${n}.svg`,svg(256,256,p(markIn(SMALL,0,0,256,232),c,"symbol"),D_SYM))}
// app icons: full-bleed 1024 masters (the OS rounds the corners) and rounded previews
for(const [n,bg,fg] of [["lime",LIME,INK],["dark",INK,LIME]]){
 out(`app-icon/slipsurge-app-icon-${n}.svg`,svg(1024,1024,`<rect width="1024" height="1024" fill="${bg}"/>`+p(markIn(MARK,0,0,1024,640),fg,"symbol"),D_SYM));
 out(`app-icon/slipsurge-app-icon-${n}-rounded.svg`,svg(1024,1024,tile(0,0,1024,bg,230)+p(markIn(MARK,0,0,1024,640),fg,"symbol"),D_SYM));
 out(`app-icon/slipsurge-tile-${n}.svg`,svg(256,256,tile(0,0,256,bg,58)+p(markIn(MARK,0,0,256,160),fg,"symbol"),D_SYM));
 out(`app-icon/slipsurge-tile-small-${n}.svg`,svg(256,256,tile(0,0,256,bg,58)+p(markIn(SMALL,0,0,256,184),fg,"symbol"),D_SYM))}
// wordmark
const WH=96,ww=g.place(WORD,0,0,WH).w;
for(const [n,c] of [["black",BLACK],["white",WHITE],["ink",INK]])out(`wordmark/slipsurge-wordmark-${n}.svg`,svg(Math.round(ww+48),WH+48,p(g.place(WORD,24,24,WH).d,c,"wordmark"),"SlipSurge wordmark"));
// lockups: [name, mark colour, word colour, tile colour or null]
const SCHEMES=[["on-dark",LIME,WHITE,null],["on-light",INK,INK,null],["tile-on-light",INK,INK,LIME],["tile-on-dark",INK,WHITE,LIME],["black",BLACK,BLACK,null],["white",WHITE,WHITE,null]];
for(const [n,mc,wc,tc] of SCHEMES){
 // horizontal: mark box 208, gap 44, wordmark cap height 96
 {const M=208,x0=24,y0=24,W=Math.round(x0+M+44+ww+24),Hh=256;
  const m=tc?tile(x0,y0,M,tc,47)+p(markIn(MARK,x0,y0,M,132),mc,"symbol"):p(markIn(MARK,x0-24,y0,M,M),mc,"symbol");const mx=tc?x0+M+44:x0+M-48+44;
  out(`horizontal/slipsurge-horizontal-${n}.svg`,svg(tc?W:W-48,Hh,m+p(g.place(WORD,mx,(Hh-WH)/2,WH).d,wc,"wordmark"),D_LOCK))}
 // stacked: mark above, wordmark cap height 72
 {const wh=72,sw=g.place(WORD,0,0,wh).w,W=Math.round(sw+64),M=200,Hh=32+M+40+wh+32;
  const m=tc?tile((W-M)/2,32,M,tc,45)+p(markIn(MARK,(W-M)/2,32,M,126),mc,"symbol"):p(markIn(MARK,(W-M)/2,32,M,M),mc,"symbol");
  out(`stacked/slipsurge-stacked-${n}.svg`,svg(W,Hh,m+p(g.place(WORD,32,32+M+40,wh).d,wc,"wordmark"),D_LOCK))}}
console.log("kit svgs written")
// "liquid glass" style preview of the app icon (presentation only: uses gradients, not a master file)
out("app-icon/slipsurge-app-icon-glass-preview.svg",svg(1024,1024,`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6ff95"/><stop offset=".55" stop-color="${LIME}"/><stop offset="1" stop-color="#93e62a"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`+tile(0,0,1024,"url(#g)",230)+`<rect x="5" y="5" width="1014" height="1014" rx="225" fill="none" stroke="url(#h)" stroke-width="10"/>`+p(markIn(MARK,0,0,1024,640),INK,"symbol"),D_SYM));
