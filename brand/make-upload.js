// Packages upload-ready files into ./upload, one folder per platform. Usage: node make-upload.js
// Run after build.js, build-social.js and render-social.sh. Needs Python 3 + Chrome/Edge (render) and ffmpeg.
const fs=require("fs"),path=require("path"),{spawnSync}=require("child_process"),g=require("./geo.js");
const SK=process.env.LOGO_SKILL_SCRIPTS||path.join(process.env.USERPROFILE||process.env.HOME,".claude/plugins/cache/logo-design-skill/logo-design/1.4.5/skills/logo-design/scripts");
const FF=process.env.FFMPEG||"ffmpeg";
const K=__dirname,U=path.join(K,"upload"),T=path.join(K,"upload","_tmp");
const LIME="#b4ff4d",INK="#0a0a0b",MARK=g.mark(48,40,88),MW=192/272,S=1024;
fs.rmSync(U,{recursive:true,force:true});fs.mkdirSync(T,{recursive:true});
const dir=d=>{const p=path.join(U,d);fs.mkdirSync(p,{recursive:true});return p};
const markAt=(cx,cy,h)=>g.place(MARK,cx-h*MW/2,cy-h/2,h).d;
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${body}</svg>\n`;
const grad=(a,b,c)=>`<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`;
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:"utf8"});if(r.status!==0)throw new Error(cmd+" failed: "+(r.stderr||r.error||"").toString().slice(-400))};
// render an svg to png (transparent kept)
const render=(src,out,w,h=w)=>run("py",["-3",path.join(SK,"render_png.py"),src,"-o",out,"--width",String(w),"--height",String(h)]);
// resize a png; opaque=true strips the alpha channel (App Store and Play reject icons with alpha)
const conv=(src,out,w,h,opaque)=>run(FF,["-y","-loglevel","error","-i",src,"-vf",`scale=${w}:${h}:flags=lanczos,format=${opaque?"rgb24":"rgba"}`,out]);
const tmp=(name,body)=>{const p=path.join(T,name+".svg");fs.writeFileSync(p,svg(body));const o=path.join(T,name+".png");render(p,o,S);return o};

/* ---- iOS ---- */
const set=dir("ios/AppIcon.appiconset");
conv(path.join(K,"ios/app-icon-default.png"),path.join(set,"AppIcon.png"),S,S,true);
// dark and tinted: mark only on a transparent background; iOS supplies the dark background itself
const dark=tmp("dark",grad("#d6ff95",LIME,"#8fe326")+`<path fill="url(#m)" d="${markAt(512,512,640)}"/>`);
const tint=tmp("tinted",grad("#ffffff","#e2e4e8","#aeb2ba")+`<path fill="url(#m)" d="${markAt(512,512,640)}"/>`);
fs.copyFileSync(dark,path.join(set,"AppIcon-dark.png"));fs.copyFileSync(tint,path.join(set,"AppIcon-tinted.png"));
fs.writeFileSync(path.join(set,"Contents.json"),JSON.stringify({images:[
 {filename:"AppIcon.png",idiom:"universal",platform:"ios",size:"1024x1024"},
 {appearances:[{appearance:"luminosity",value:"dark"}],filename:"AppIcon-dark.png",idiom:"universal",platform:"ios",size:"1024x1024"},
 {appearances:[{appearance:"luminosity",value:"tinted"}],filename:"AppIcon-tinted.png",idiom:"universal",platform:"ios",size:"1024x1024"}],
 info:{author:"xcode",version:1}},null,2)+"\n");
conv(path.join(K,"ios/app-icon-default.png"),path.join(dir("ios"),"app-store-icon-1024.png"),S,S,true);
// flat vector layers for Icon Composer (it adds the glass itself, so no gradients or shadows here)
const ic=dir("ios/icon-composer-layers");
fs.writeFileSync(path.join(ic,"foreground-ink.svg"),svg(`<path fill="${INK}" d="${markAt(512,512,640)}"/>`));
fs.writeFileSync(path.join(ic,"foreground-white.svg"),svg(`<path fill="#ffffff" d="${markAt(512,512,640)}"/>`));
fs.writeFileSync(path.join(ic,"background-lime.svg"),svg(grad("#d6ff95",LIME,"#8fe326")+`<rect width="${S}" height="${S}" fill="url(#m)"/>`));

/* ---- Android / Google Play ---- */
const an=dir("android");
conv(path.join(K,"ios/app-icon-default.png"),path.join(an,"play-store-icon-512.png"),512,512,true);
conv(tmp("afg",`<path fill="${INK}" d="${markAt(512,512,440)}"/>`),path.join(an,"adaptive-foreground-432.png"),432,432,false);   // mark sits inside the 66/108 safe zone
conv(path.join(K,"ios/layer-background-lime.png"),path.join(an,"adaptive-background-432.png"),432,432,true);
conv(tmp("amono",`<path fill="#ffffff" d="${markAt(512,512,440)}"/>`),path.join(an,"adaptive-monochrome-432.png"),432,432,false);

/* ---- website ---- */
const web=dir("website");for(const f of fs.readdirSync(path.join(K,"web")))if(f!=="slipsurge-app-icon.svg")fs.copyFileSync(path.join(K,"web",f),path.join(web,f));
conv(path.join(K,"social/og-image.png"),path.join(web,"og-image-1200x630.png"),1200,630,true);
fs.copyFileSync(path.join(K,"svg/horizontal/slipsurge-horizontal-on-dark.svg"),path.join(web,"logo-header-on-dark.svg"));
fs.copyFileSync(path.join(K,"svg/horizontal/slipsurge-horizontal-on-light.svg"),path.join(web,"logo-header-on-light.svg"));

/* ---- social ---- */
const so=(d,name,src,w,h)=>conv(path.join(K,"social",src+".png"),path.join(dir(d),name),w,h,true);
so("x","profile-400x400.png","avatar-lime",400,400);so("x","profile-dark-400x400.png","avatar-dark",400,400);
so("x","header-1500x500.png","x-header-dark",1500,500);so("x","header-lime-1500x500.png","x-header-lime",1500,500);
so("discord","server-icon-512x512.png","avatar-lime",512,512);so("discord","server-banner-960x540.png","discord-banner",960,540);
so("instagram","profile-1080x1080.png","avatar-lime",1080,1080);so("instagram","post-1080x1080.png","post-square-dark",1080,1080);so("instagram","post-lime-1080x1080.png","post-square-lime",1080,1080);so("instagram","story-1080x1920.png","story-dark",1080,1920);
so("youtube","profile-800x800.png","avatar-lime",800,800);so("youtube","banner-2560x1440.png","wide-banner",2560,1440);
so("general","square-logo-lime-1024.png","avatar-lime",1024,1024);so("general","square-logo-dark-1024.png","avatar-dark",1024,1024);so("general","phone-wallpaper-1290x2796.png","wallpaper-dark",1290,2796);

fs.rmSync(T,{recursive:true,force:true});console.log("upload folder ready");
