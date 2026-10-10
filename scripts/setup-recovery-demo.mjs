import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
const filename='.env.local'
execFileSync('git',['check-ignore','-q','--',filename],{stdio:'pipe'})
if(execFileSync('git',['ls-files','--',filename],{encoding:'utf8'}).trim())throw new Error('LOCAL_ENV_IS_TRACKED')
let content=fs.existsSync(filename)?fs.readFileSync(filename,'utf8'):''
const additions=[]
if (!/^RECOVERY_INSTITUTIONAL_PRIVATE_KEY=.+/m.test(content)) additions.push(`RECOVERY_INSTITUTIONAL_PRIVATE_KEY=${generatePrivateKey()}`)
if (!/^RECOVERY_DEMO_OPERATOR_TOKEN=.+/m.test(content)) additions.push(`RECOVERY_DEMO_OPERATOR_TOKEN=${randomBytes(32).toString('hex')}`)
if (additions.length) {
  content=content.trimEnd()+'\n'+additions.join('\n')+'\n'
  fs.writeFileSync(filename,content,{mode:0o600})
}
process.loadEnvFile(filename)
console.log(JSON.stringify({bankGuardian:privateKeyToAccount(process.env.RECOVERY_INSTITUTIONAL_PRIVATE_KEY).address,
  operatorCredential:'Configured server-side. Read it locally in .env.local; do not paste it into chat.',
  independence:'Institutional governance is simulated. Third-party keys are not generated or stored by this script.'},null,2))
