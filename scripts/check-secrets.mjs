import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root=process.cwd()
const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
const env=fs.existsSync('.env.local')?fs.readFileSync('.env.local','utf8'):''
const values=[]
for (const line of env.split(/\r?\n/)) {
  const match=/^([A-Z0-9_]+)=(.*)$/.exec(line)
  if (!match)continue
  const value=match[2].trim().replace(/^(['"])(.*)\1$/,'$2')
  if (value.length<12)continue
  if (match[1].includes('RPC_URL')) {
    try {const url=new URL(value);if(!url.search && !url.username && !url.password && url.hostname.endsWith('publicnode.com'))continue}catch{}
  }
  if (/PRIVATE_KEY|TOKEN|API_KEY|POLICY_ID|RPC_URL/.test(match[1]))values.push({name:match[1],value})
}
const findings=[]
for (const name of names) {
  if (!fs.existsSync(name) || !fs.statSync(name).isFile())continue
  const data=fs.readFileSync(name,'utf8')
  if (values.some(s=>data.includes(s.value)) || /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/.test(data))findings.push(name)
}
// Review the actual index too; a clean working copy must not hide an earlier
// staged credential. Filenames and values are never interpolated into a shell.
const staged=execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACMR','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
for (const name of staged) {
  const data=execFileSync('git',['show',`:${name}`],{encoding:'utf8',maxBuffer:20*1024*1024})
  if(values.some(s=>data.includes(s.value)) || /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/.test(data))findings.push(`index:${name}`)
}
const privateValues=values.filter(v=>!v.name.startsWith('NEXT_PUBLIC_'))
function scanClient(dir) {
  if (!fs.existsSync(dir))return
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const filename=path.join(dir,entry.name)
    if(entry.isDirectory())scanClient(filename)
    else if(/\.js$/.test(entry.name) && privateValues.some(s=>fs.readFileSync(filename,'utf8').includes(s.value)))findings.push(path.relative(root,filename))
  }
}
scanClient('.next/static')
const tracked=execFileSync('git',['ls-files','.env','.env.local','.env.*'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(v=>v && v!=='.env.example')
findings.push(...tracked)
const lines=fs.readFileSync('.env.example','utf8').trim().split(/\r?\n/)
if(lines.some(line=>!/^([A-Z][A-Z0-9_]*)=$/.test(line)))findings.push('.env.example')
console.log(JSON.stringify({checkedFiles:names.length,serverSecretsChecked:privateValues.length,clientBundleScanned:fs.existsSync('.next/static'),findings:[...new Set(findings)]},null,2))
if(findings.length)process.exitCode=1
