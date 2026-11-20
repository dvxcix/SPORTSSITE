import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'..')
if(process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Private UI review cannot run in a deployment or production environment.')
const envFiles=(await fs.readdir(root)).filter(name=>/^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(name))
if(envFiles.length)throw new Error('Start private review from a checkout without service .env files. The local fixtures need no credentials.')
const mode=process.argv[2]??'dev'
const port=process.env.SLIPSURGE_UI_REVIEW_PORT??'4180'
if(!/^\d{4,5}$/.test(port)||Number(port)>65535||Number(port)<1024)throw new Error('Choose a valid local review port.')
if(!['dev','build','start'].includes(mode))throw new Error('Choose dev, build or start for the private local review.')
const env={...process.env,SLIPSURGE_UI_REVIEW:'1',NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:mode==='dev'?'development':'production',...(mode==='dev'?{}:{SLIPSURGE_UI_REVIEW_BUILD:'1'})}
for(const key of Object.keys(env))if(/SUPABASE|WHOP|STRIPE|RESEND|DISCORD|TWITTER|X_API|OPENAI|ANTHROPIC|BROWSERBASE|APIFY|CRON_SECRET|DATABASE_URL|^AWS_|VERCEL/i.test(key))delete env[key]
console.log('SlipSurge private UI review: http://127.0.0.1:'+port+'/design-review\nLocal illustrative data. No production credentials, publication or operational API actions.')
const args=mode==='build'?['build','--webpack',...(process.argv.includes('--compile')?['--experimental-build-mode','compile']:[])]:[mode,...(mode==='dev'?['--webpack']:[]),'--hostname','127.0.0.1','--port',port]
const child=spawn(process.execPath,['--max-old-space-size=6144',path.join(root,'node_modules/next/dist/bin/next'),...args],{cwd:root,env,stdio:'inherit',windowsHide:true})
child.on('exit',code=>{process.exitCode=code??1})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
