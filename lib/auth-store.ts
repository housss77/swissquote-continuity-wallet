import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {serverDataRoot} from './server-data'

export const token = () => randomBytes(32).toString('base64url')
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
let queue: Promise<unknown> = Promise.resolve()
// Single Node instance with a persistent volume. No serverless/multi-replica claim.
export function locked<T>(work:()=>Promise<T>):Promise<T> {
  const result=queue.then(work,work);queue=result.catch(()=>{});return result
}
const file=(kind:string,id:string)=>{
  if(!['credential','session','challenge'].includes(kind) || !/^[a-f0-9]{64}$/.test(id))throw new Error('AUTH_STORAGE_INVALID')
  return path.join(serverDataRoot(),'auth',kind,`${id}.json`)
}
export async function readRecord<T>(kind:string,id:string):Promise<T|null> {
  try{return JSON.parse(await fs.readFile(file(kind,id),'utf8')) as T}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('AUTH_STORAGE_UNAVAILABLE')}
}
export async function writeRecord(kind:string,id:string,value:unknown) {
  const target=file(kind,id);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700})
  const temporary=`${target}.${randomBytes(8).toString('hex')}.tmp`
  await fs.writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await fs.rename(temporary,target)
}
export async function removeRecord(kind:string,id:string) {
  await fs.rm(file(kind,id),{force:true})
}
