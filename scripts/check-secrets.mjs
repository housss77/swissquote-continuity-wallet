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
    else if(/\.js$/.test(entry.name) && values.some(s=>fs.readFileSync(filename,'utf8').includes(s.value)))findings.push(path.relative(root,filename))
  }
}
scanClient('.next/static')
const tracked=execFileSync('git',['ls-files','.env','.env.local','.env.*'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(v=>v && v!=='.env.example')
findings.push(...tracked)
let historyBlobs=0
if(process.argv.includes('--history')) {
  // Scan every reachable blob in the history being pushed, without printing
  // blob contents, matched values, credential URLs or environment values.
  const objects=execFileSync('git',['rev-list','--objects','HEAD'],{encoding:'utf8',maxBuffer:20*1024*1024}).trim().split('\n')
  const objectNames=new Map(objects.map(line=>{const space=line.indexOf(' ');return [line.slice(0,space<0?undefined:space),space<0?'':line.slice(space+1)]}))
  const output=execFileSync('git',['cat-file','--batch'],{input:[...objectNames.keys()].join('\n')+'\n',maxBuffer:256*1024*1024})
  let offset=0
  while(offset<output.length) {
    const end=output.indexOf(10,offset),[oid,type,size]=output.subarray(offset,end).toString('utf8').split(' ')
    if(end<0 || !/^\d+$/.test(size))throw new Error('History scan could not parse Git objects')
    const length=Number(size),data=output.subarray(end+1,end+1+length)
    if(type==='blob') {
      historyBlobs++
      const contents=data.toString('utf8'),name=objectNames.get(oid)||'unnamed blob'
      if(values.some(s=>contents.includes(s.value)) || /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/.test(contents))findings.push(`history:${oid}:${name}`)
      if(/(^|\/)(?:\.env(?:\..*)?|\.recovery-data\/.*)$/.test(name) && name!=='.env.example')findings.push(`history:${name}`)
    }
    offset=end+1+length+1
  }
}
const lines=fs.readFileSync('.env.example','utf8').trim().split(/\r?\n/)
if(lines.some(line=>!/^([A-Z][A-Z0-9_]*)=$/.test(line)))findings.push('.env.example')
console.log(JSON.stringify({checkedFiles:names.length,historyBlobs,serverSecretsChecked:privateValues.length,clientBundleScanned:fs.existsSync('.next/static'),findings:[...new Set(findings)]},null,2))
if(findings.length)process.exitCode=1
