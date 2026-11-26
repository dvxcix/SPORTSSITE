// Builds the iOS icon set and the social set (gradient artwork). Usage: node build-social.js
// Writes SVG sources to ./ios/src and ./social/src; render-social.sh turns them into PNGs.
// These files use gradients (and the social ones live text), so they are artwork, not logo masters.
const fs=require("fs"),path=require("path"),g=require("./geo.js");
const LIME="#b4ff4d",INK="#0a0a0b",HI="#d6ff95",LO="#8fe326";
const MARK=g.mark(48,40,88),WORD=g.word().p,MW=192/272;
const P=(d,fill,extra="")=>`<path fill="${fill}" fill-rule="evenodd" d="${d}" ${extra}/>`;
const out=(f,s)=>{const o=path.join(__dirname,f);fs.mkdirSync(path.dirname(o),{recursive:true});fs.writeFileSync(o,s)};
const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`;
const markAt=(cx,cy,h)=>g.place(MARK,cx-h*MW/2,cy-h/2,h).d;
const lin=(id,stops,x2=0,y2=1)=>`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o,c,a=1])=>`<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const rad=(id,cx,cy,r,c,a)=>`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${c}" stop-opacity="${a}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;

/* ---------------- iOS icons ---------------- */
const S=1024,MH=640;
const DARKBG=[[0,"#1d2025"],[1,INK]],LIMEBG=[[0,HI],[.5,LIME],[1,LO]];
const DEFS={
 lime:lin("bg",LIMEBG)+rad("hl",260,120,760,"#ffffff",.5)+lin("mk",[[0,"#22252a"],[1,INK]])+lin("rim",[[0,"#fff",.75],[.4,"#fff",0],[1,"#fff",.2]]),
 dark:lin("bg",DARKBG)+rad("hl",512,470,560,LIME,.26)+lin("mk",LIMEBG)+lin("rim",[[0,"#fff",.3],[.4,"#fff",0],[1,"#fff",.08]]),
 tinted:lin("bg",DARKBG)+rad("hl",512,470,560,"#ffffff",.1)+lin("mk",[[0,"#ffffff"],[1,"#aeb2ba"]])+lin("rim",[[0,"#fff",.3],[.4,"#fff",0],[1,"#fff",.08]])};
const shadow=(c,a,b)=>`<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="${b}" flood-color="${c}" flood-opacity="${a}"/></filter>`;
const SHADOW={lime:shadow("#3f7400",.35,12),dark:shadow("#000",.6,14),tinted:shadow("#000",.6,14)};
const iconBody=k=>rx=>`<defs>${DEFS[k]}${SHADOW[k]}</defs><rect width="${S}" height="${S}" rx="${rx}" fill="url(#bg)"/><rect width="${S}" height="${S}" rx="${rx}" fill="url(#hl)"/>`+(rx?`<rect x="6" y="6" width="${S-12}" height="${S-12}" rx="${rx-6}" fill="none" stroke="url(#rim)" stroke-width="12"/>`:"")+P(markAt(S/2,S/2,MH),"url(#mk)",'filter="url(#sh)"');
const NAMES={lime:"default",dark:"dark",tinted:"tinted"};
for(const k of Object.keys(NAMES)){out(`ios/src/app-icon-${NAMES[k]}.svg`,svg(S,S,iconBody(k)(0)));out(`ios/src/app-icon-${NAMES[k]}-rounded.svg`,svg(S,S,iconBody(k)(230)))}
// layers for Icon Composer: flat transparent foregrounds + plain backgrounds
for(const [n,c] of [["ink",INK],["lime",LIME],["white","#ffffff"]])out(`ios/src/layer-foreground-${n}.svg`,svg(S,S,P(markAt(S/2,S/2,MH),c)));
out("ios/src/layer-background-lime.svg",svg(S,S,`<defs>${lin("bg",LIMEBG)}</defs><rect width="${S}" height="${S}" fill="url(#bg)"/>`));
out("ios/src/layer-background-dark.svg",svg(S,S,`<defs>${lin("bg",DARKBG)}</defs><rect width="${S}" height="${S}" fill="url(#bg)"/>`));
// preview: the four appearances on a wallpaper
{const W=2400,H=900,t=420,y=170,xs=[150,710,1270,1830],lab=["Default","Dark","Tinted","Clear"];
 const uniq=(s,k)=>s.replace(/id="(\w+)"/g,`id="$1${k}"`).replace(/url\(#(\w+)\)/g,`url(#$1${k})`);
 const tile=(k,x)=>`<svg x="${x}" y="${y}" width="${t}" height="${t}" viewBox="0 0 ${S} ${S}">${uniq(iconBody(k)(230),k)}</svg>`;
 const clear=`<svg x="${xs[3]}" y="${y}" width="${t}" height="${t}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="230" fill="#fff" fill-opacity=".2"/><rect x="6" y="6" width="${S-12}" height="${S-12}" rx="224" fill="none" stroke="url(#crim)" stroke-width="12"/>${P(markAt(S/2,S/2,MH),"#fff",'fill-opacity=".92"')}</svg>`;
 const labels=lab.map((l,i)=>`<text x="${xs[i]+t/2}" y="${y+t+90}" text-anchor="middle" font-family="Bahnschrift,'Segoe UI',sans-serif" font-size="46" font-weight="600" fill="#fff" fill-opacity=".9">${l}</text>`).join("");
 out("ios/src/appearances-preview.svg",svg(W,H,`<defs>${lin("wp",[[0,"#12351f"],[.5,"#0d1c2e"],[1,"#2a1140"]],1,1)}${rad("w1",400,100,1100,LIME,.35)}${rad("w2",2100,900,1000,"#4d7cff",.4)}${lin("crim",[[0,"#fff",.8],[.4,"#fff",.1],[1,"#fff",.3]])}</defs><rect width="${W}" height="${H}" fill="url(#wp)"/><rect width="${W}" height="${H}" fill="url(#w1)"/><rect width="${W}" height="${H}" fill="url(#w2)"/>${tile("lime",xs[0])}${tile("dark",xs[1])}${tile("tinted",xs[2])}${clear}${labels}`))}

/* ---------------- social ---------------- */
const lockH=(cx,cy,h,mf,wf)=>{const mw=h*MW,wh=h*.43,ww=g.place(WORD,0,0,wh).w,gap=h*.2,x=cx-(mw+gap+ww)/2;return P(g.place(MARK,x,cy-h/2,h).d,mf)+P(g.place(WORD,x+mw+gap,cy-wh/2,wh).d,wf)};
const lockV=(cx,cy,h,mf,wf)=>{const mh=h*.66,wh=h*.16,ww=g.place(WORD,0,0,wh).w,top=cy-h/2;return P(markAt(cx,top+mh/2,mh),mf)+P(g.place(WORD,cx-ww/2,top+h-wh,wh).d,wf)};
const tag=(x,y,size,fill,txt)=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Bahnschrift,'Segoe UI',sans-serif" font-weight="600" font-size="${size}" letter-spacing="${size*.22}" fill="${fill}" fill-opacity=".8">${txt}</text>`;
const TAG="RESEARCH · PICKS · COMMUNITIES";
// backgrounds. ghost = [cx,cy,height] of the oversized mark
function bgDark(w,h,ghost){const m=Math.hypot(w,h);return `<defs>${rad("g1",w*.9,-h*.15,m*.5,LIME,.34)}${rad("g2",w*.02,h*1.2,m*.42,"#56c400",.24)}${rad("g3",w*.5,h*.5,m*.45,"#16330a",.22)}${lin("gh",[[0,LIME,.14],[1,LIME,.02]])}${lin("mk",LIMEBG)}</defs><rect width="${w}" height="${h}" fill="${INK}"/><rect width="${w}" height="${h}" fill="url(#g3)"/><rect width="${w}" height="${h}" fill="url(#g1)"/><rect width="${w}" height="${h}" fill="url(#g2)"/>`+(ghost?P(markAt(...ghost),"url(#gh)"):"")}
function bgLime(w,h,ghost){const m=Math.max(w,h);return `<defs>${lin("b",[[0,"#deffa6"],[.45,LIME],[1,"#7fdc1c"]],1,1)}${rad("g1",w*.12,-h*.1,m*.7,"#ffffff",.6)}${rad("g2",w*.95,h*1.1,m*.6,"#3f9a00",.35)}${lin("gh",[[0,INK,.07],[1,INK,.015]])}</defs><rect width="${w}" height="${h}" fill="url(#b)"/><rect width="${w}" height="${h}" fill="url(#g1)"/><rect width="${w}" height="${h}" fill="url(#g2)"/>`+(ghost?P(markAt(...ghost),"url(#gh)"):"")}
const A=(name,w,h,body)=>out(`social/src/${name}.svg`,svg(w,h,body));
// X header 1500x500 (keep the bottom-left clear: the avatar sits there)
A("x-header-dark",1500,500,bgDark(1500,500,[1290,250,900])+lockH(790,225,150,"url(#mk)","#fff")+tag(790,372,22,"#fff",TAG));
A("x-header-lime",1500,500,bgLime(1500,500,[1290,250,900])+lockH(790,225,150,INK,INK)+tag(790,372,22,INK,TAG));
// avatars (X, Discord, Instagram, Whop): square, safe inside a circle crop
A("avatar-lime",1024,1024,bgLime(1024,1024)+P(markAt(512,512,540),INK));
A("avatar-dark",1024,1024,bgDark(1024,1024)+P(markAt(512,512,540),"url(#mk)"));
// link preview (Open Graph) 1200x630
A("og-image",1200,630,bgDark(1200,630,[1010,315,1100])+lockH(600,285,170,"url(#mk)","#fff")+tag(600,455,24,"#fff",TAG));
// Discord server banner 960x540
A("discord-banner",960,540,bgDark(960,540,[800,270,950])+lockH(480,245,130,"url(#mk)","#fff")+tag(480,385,19,"#fff",TAG));
// YouTube / wide banner 2560x1440 (content inside the central 1546x423 safe area)
A("wide-banner",2560,1440,bgDark(2560,1440,[2130,720,2300])+lockH(1280,690,210,"url(#mk)","#fff")+tag(1280,880,32,"#fff",TAG));
// square post 1080 and story 1080x1920
A("post-square-dark",1080,1080,bgDark(1080,1080,[860,540,1500])+lockV(540,500,430,"url(#mk)","#fff")+tag(540,850,26,"#fff",TAG));
A("post-square-lime",1080,1080,bgLime(1080,1080,[860,540,1500])+lockV(540,500,430,INK,INK)+tag(540,850,26,INK,TAG));
A("story-dark",1080,1920,bgDark(1080,1920,[760,960,2300])+lockV(540,900,520,"url(#mk)","#fff")+tag(540,1290,28,"#fff",TAG));
// phone wallpaper 1290x2796
A("wallpaper-dark",1290,2796,bgDark(1290,2796,[900,1500,3000])+P(markAt(645,1500,520),"url(#mk)"));
console.log("ios + social sources written");
