import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
const output=path.resolve('.dist/recovery-test')
fs.mkdirSync(output,{recursive:true})
const binary=process.env.ANVIL_BINARY || path.resolve('.dist/recovery-reference/tools/node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe')
if (!fs.existsSync(binary))throw new Error('Set ANVIL_BINARY to an official Anvil executable; see recovery-design.md.')
await build({entryPoints:['tests/recovery/browser.js'],bundle:true,platform:'browser',format:'iife',inject:['tests/recovery/polyfills.js'],
  alias:{buffer:path.resolve('node_modules/buffer/index.js'),assert:path.resolve('node_modules/assert/build/assert.js'),stream:path.resolve('node_modules/stream-browserify/index.js'),events:path.resolve('node_modules/events/events.js')},outfile:path.join(output,'browser.js')})
const fork=spawn(binary,['--fork-url','https://ethereum-sepolia-rpc.publicnode.com','--chain-id','11155111','--accounts','0','--host','127.0.0.1','--port','8549','--silent'],{windowsHide:true,stdio:'ignore'})
let failed=false
fork.on('error',()=>{failed=true})
try {
  let ready=false
  for (let i=0;i<80;i++) {
    if (failed || fork.exitCode!==null)throw new Error('Local fork startup failed; check for port conflict.')
    try {const r=await fetch('http://127.0.0.1:8549',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(1000)});ready=(await r.json()).result==='0xaa36a7';if(ready)break} catch{}
    await new Promise(r=>setTimeout(r,250))
  }
  if (!ready)throw new Error('Local Sepolia fork unavailable; no test success claimed.')
  const child=spawn(process.execPath,['tests/recovery/fork.cjs'],{windowsHide:true,stdio:'inherit'})
  const code=await new Promise(resolve=>child.once('exit',resolve))
  if (code!==0)process.exitCode=1
} finally {fork.kill()}
