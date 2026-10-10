import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const filename='.env.local'
execFileSync('git',['check-ignore','-q','--',filename],{stdio:'pipe'})
if (execFileSync('git',['ls-files','--',filename],{encoding:'utf8'}).trim()) throw new Error('LOCAL_ENV_IS_TRACKED')
const content=fs.readFileSync(filename,'utf8')
const existing=/^\s*RECOVERY_RELAYER_PRIVATE_KEY\s*=\s*(.*)$/m.exec(content)
if (existing && existing[1].trim()) throw new Error('RELAYER_KEY_ALREADY_EXISTS_NOT_OVERWRITTEN')
const excluded=new Set([
  '0x6f7c9faba9b6039255f2301935d891ffe6065e8c',
  '0x94a4f6affbd8975951142c3999aab7ecee555c2',
])
const institutional=/^\s*RECOVERY_INSTITUTIONAL_PRIVATE_KEY\s*=\s*(0x[a-fA-F0-9]{64})\s*$/m.exec(content)
if (institutional) excluded.add(privateKeyToAccount(institutional[1]).address.toLowerCase())
const allowed=/^\s*RECOVERY_ALLOWED_SAFE_ADDRESSES\s*=\s*(.*)$/m.exec(content)
for (const candidate of (allowed?.[1] || '').split(',')) excluded.add(candidate.trim().toLowerCase())
let key,account
do {key=generatePrivateKey();account=privateKeyToAccount(key)} while(excluded.has(account.address.toLowerCase()))
const line=`RECOVERY_RELAYER_PRIVATE_KEY=${key}`
const updated=existing ? content.replace(/^\s*RECOVERY_RELAYER_PRIVATE_KEY\s*=.*$/m,line) : `${content.trimEnd()}\n${line}\n`
// Verify the file has not changed since reading before replacing an empty entry.
if (fs.readFileSync(filename,'utf8')!==content) throw new Error('LOCAL_ENV_CHANGED_NO_KEY_WRITTEN')
fs.writeFileSync(filename,updated,{mode:0o600})
execFileSync('git',['check-ignore','-q','--',filename],{stdio:'pipe'})
if (execFileSync('git',['ls-files','--',filename],{encoding:'utf8'}).trim()) throw new Error('LOCAL_ENV_IS_TRACKED')
process.stdout.write(account.address+'\n')
