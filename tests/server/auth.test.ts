import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {generateKeyPairSync,createHash,randomBytes,sign} from 'node:crypto'
import {isoCBOR} from '@simplewebauthn/server/helpers'
import type {AuthenticationResponseJSON,RegistrationResponseJSON} from '@simplewebauthn/server'
import {authOptions,completeAuth,cookieHeader,sessionAccount,SESSION_COOKIE,CHALLENGE_COOKIE,attachWallet,logout} from '../../lib/auth-server'
let directory:string,previous:string|undefined
before(async()=>{previous=process.env.CONTINUITY_DATA_DIR;directory=await mkdtemp(path.join(os.tmpdir(),'continuity-auth-test-'));process.env.CONTINUITY_DATA_DIR=directory})
after(async()=>{if(previous===undefined)delete process.env.CONTINUITY_DATA_DIR;else process.env.CONTINUITY_DATA_DIR=previous;await rm(directory,{recursive:true,force:true})})
const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest()
const request=(challenge:string,session?:string)=>new Request('http://localhost:3000/api/auth',{headers:{cookie:`${CHALLENGE_COOKIE}=${challenge}${session?`; ${SESSION_COOKIE}=${session}`:''}`,origin:'http://localhost:3000'}})
function fixture(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32).toString('base64url')
 const key=isoCBOR.encode(new Map<number,number|Uint8Array>([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x!,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y!,'base64url'))]]))
 return {privateKey,key,id}
}
function registration(f:ReturnType<typeof fixture>,challenge:string,origin='http://localhost:3000',flags=0x45):RegistrationResponseJSON {
 const id=Buffer.from(f.id,'base64url'),length=Buffer.alloc(2);length.writeUInt16BE(id.length)
 const data=Buffer.concat([digest('localhost'),Buffer.from([flags]),Buffer.alloc(4),Buffer.alloc(16),length,id,Buffer.from(f.key)])
 const attestation=isoCBOR.encode(new Map<string,unknown>([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(data)]]) as never)
 return {id:f.id,rawId:f.id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin})).toString('base64url'),attestationObject:Buffer.from(attestation).toString('base64url'),transports:['internal']}}
}
function authentication(f:ReturnType<typeof fixture>,challenge:string,origin='http://localhost:3000',flags=5,counter=1):AuthenticationResponseJSON {
 const count=Buffer.alloc(4);count.writeUInt32BE(counter)
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin})),data=Buffer.concat([digest('localhost'),Buffer.from([flags]),count])
 return {id:f.id,rawId:f.id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:data.toString('base64url'),signature:sign('sha256',Buffer.concat([data,digest(client)]),f.privateKey).toString('base64url')}}
}
test('verified P-256 registration persists only the public key and creates a cookie session',async()=>{
 const f=fixture(),options=await authOptions('register'),result=await completeAuth(request(options.id),'register',registration(f,options.options.challenge))
 assert.equal(result.account.passkey.rawId,Buffer.from(f.id,'base64url').toString('hex'));assert.equal(result.account.safe,null)
 assert.ok(await sessionAccount(request('',result.session)))
 assert.match(cookieHeader(SESSION_COOKIE,result.session,3600),/HttpOnly; SameSite=Strict/)
 await assert.rejects(()=>completeAuth(request(options.id),'register',registration(f,options.options.challenge)),/CHALLENGE_EXPIRED/)
})
test('fresh signed login verifies challenge, origin, UV and counter; replay and tampering fail',async()=>{
 const f=fixture(),enroll=await authOptions('register');await completeAuth(request(enroll.id),'register',registration(f,enroll.options.challenge))
 const options=await authOptions('login'),response=authentication(f,options.options.challenge),result=await completeAuth(request(options.id),'login',response)
 assert.equal(result.account.counter,1)
 await assert.rejects(()=>completeAuth(request(options.id),'login',response),/CHALLENGE_EXPIRED/)
 for(const [origin,flags,counter] of [['https://attacker.example',5,2],['http://localhost:3000',1,2],['http://localhost:3000',5,1]] as const){const next=await authOptions('login');await assert.rejects(()=>completeAuth(request(next.id),'login',authentication(f,next.options.challenge,origin,flags,counter)))}
 const invalid=await authOptions('login'),forged=authentication(f,invalid.options.challenge,'http://localhost:3000',5,2);forged.response.signature=Buffer.from('invalid').toString('base64url');await assert.rejects(()=>completeAuth(request(invalid.id),'login',forged))
})
test('wallet binding cannot be silently replaced and logout revokes the server session',async()=>{
 const f=fixture(),options=await authOptions('register'),result=await completeAuth(request(options.id),'register',registration(f,options.options.challenge))
 const safe='0x1111111111111111111111111111111111111111';await attachWallet(result.account,safe)
 await assert.rejects(()=>attachWallet(result.account,'0x2222222222222222222222222222222222222222'),/BINDING_MISMATCH/)
 assert.equal((await sessionAccount(request('',result.session)))?.safe,safe)
 await logout(request('',result.session));assert.equal(await sessionAccount(request('',result.session)),null)
})
test('wrong-origin or non-user-verified registration cannot create an account',async()=>{
 for(const [origin,flags] of [['https://attacker.example',0x45],['http://localhost:3000',0x41]] as const){const f=fixture(),options=await authOptions('register');await assert.rejects(()=>completeAuth(request(options.id),'register',registration(f,options.options.challenge,origin,flags)))}
})
