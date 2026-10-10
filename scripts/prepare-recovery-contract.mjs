// Compile the unmodified, Certora-reviewed Candide recovery source. No .env loaded.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import solc from 'solc'
const commit = 'd0959d28ae084a7d549bb2c12d04482653456c2c'
const entry = 'contracts/modules/social_recovery/SocialRecoveryModule.sol'
const roots = {
  '@openzeppelin/contracts/': 'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v4.9.6/contracts/',
  '@safe-global/safe-contracts/': 'https://raw.githubusercontent.com/safe-global/safe-smart-account/v1.4.1/',
}
const sources = {}
async function obtain(name) {
  if (sources[name]) return
  const prefix = Object.keys(roots).find(p => name.startsWith(p))
  const url = prefix ? roots[prefix] + name.slice(prefix.length) : `https://raw.githubusercontent.com/candidelabs/candide-contracts/${commit}/${name}`
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Public source download failed: HTTP ${response.status}`)
  const content = await response.text()
  sources[name] = { content }
  for (const match of content.matchAll(/import\s+(?:[^;]*?from\s+)?["']([^"']+)["'];/g)) {
    const imported = match[1].startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1])) : match[1]
    await obtain(imported)
  }
}
await obtain(entry)
if (!solc.version().startsWith('0.8.20+commit.a1b79de6')) throw new Error('Unexpected compiler')
const settings = { optimizer: { enabled: true, runs: 1000000 }, viaIR: true,
  outputSelection: { '*': { '*': ['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'] } } }
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings })))
if (output.errors?.some(e => e.severity === 'error')) throw new Error('Unmodified upstream contract compilation failed')
const contract = output.contracts[entry].SocialRecoveryModule
const artifact = { upstream: { repository:'https://github.com/candidelabs/candide-contracts',commit,compiler:solc.version(),
  sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,{content}]) => [name,createHash('sha256').update(content).digest('hex')])) },
  abi:contract.abi, bytecode:`0x${contract.evm.bytecode.object}`, deployedBytecode:`0x${contract.evm.deployedBytecode.object}`,
  immutableReferences:contract.evm.deployedBytecode.immutableReferences }
try {
  const previous=JSON.parse(await fs.readFile('lib/recovery/artifact.json','utf8'))
  if (JSON.stringify(previous)!==JSON.stringify(artifact)) throw new Error('Pinned recovery artifact changed; review sources/compiler before replacing it.')
} catch(e) {if (e.code!=='ENOENT')throw e}
await fs.mkdir('lib/recovery',{recursive:true})
await fs.writeFile('lib/recovery/artifact.json',JSON.stringify(artifact,null,2)+'\n')
console.log('Reviewed Candide v0.2.0 compiled unchanged; source hashes recorded in the public artifact.')
