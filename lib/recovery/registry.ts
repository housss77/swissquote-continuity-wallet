import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Hex, PublicClient } from 'viem'
import { address } from './contracts'
import { recoveryState } from './onchain'
import { validateCredential, verifyMetadataProof } from './passkey'
import type { PublicCredential } from './types'
import {serverDataRoot} from '../server-data'
const root=serverDataRoot()
const filename=(safe:string)=>path.join(root,`${address(safe).toLowerCase()}.json`)
type PublicRecord={safe:string;module:string;credential:PublicCredential;signature:Hex}
export async function savePublicMetadata(client:PublicClient,record:PublicRecord) {
  const state=await recoveryState(client,record.safe),credential=validateCredential(record.credential)
  if (!state.protected || state.module.toLowerCase()!==address(record.module).toLowerCase() || credential.role!=='customer_backup'
    || !state.guardians.some(g=>g.toLowerCase()===credential.signer.toLowerCase())) throw new Error('RECOVERY_METADATA_NOT_REGISTERED_ONCHAIN')
  await verifyMetadataProof(client,state.safe,state.module,credential,record.signature)
  await fs.mkdir(root,{recursive:true})
  const clean={safe:state.safe,module:state.module,credential,signature:record.signature}
  await fs.writeFile(filename(state.safe),JSON.stringify(clean),'utf8')
  return credential
}
export async function publicMetadata(client:PublicClient,safe:string):Promise<PublicCredential|null> {
  let record:PublicRecord
  try { record=JSON.parse(await fs.readFile(filename(safe),'utf8')) as PublicRecord }
  catch (e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return null;throw new Error('RECOVERY_REGISTRY_UNAVAILABLE') }
  const state=await recoveryState(client,safe),credential=validateCredential(record.credential)
  if (record.safe.toLowerCase()!==state.safe.toLowerCase() || record.module.toLowerCase()!==state.module.toLowerCase()
    || !state.guardians.some(g=>g.toLowerCase()===credential.signer.toLowerCase())) return null
  await verifyMetadataProof(client,state.safe,state.module,credential,record.signature)
  return credential
}
