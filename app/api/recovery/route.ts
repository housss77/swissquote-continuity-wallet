import { allowedSafe, authenticateOperator, checkBrowserOrigin, bankAddress, deployCredential, finalize, initiate, institutionalApproval, publicError, recoveryClient, relayRecords, replacementMetadata } from '../../../lib/recovery/server'
import { publicMetadata, savePublicMetadata } from '../../../lib/recovery/registry'
import { moduleConfig } from '../../../lib/recovery/contracts'
export const runtime='nodejs'
export async function GET(request:Request) {
  try {
    const safe=new URL(request.url).searchParams.get('safe')
    return Response.json({config:moduleConfig(),bank:bankAddress(),backup:safe?await publicMetadata(recoveryClient,safe):null,
      replacement:safe?await replacementMetadata(safe):null,transactions:safe?await relayRecords(safe):[]},{headers:{'Cache-Control':'no-store'}})
  } catch (e) {return Response.json({error:publicError(e)},{status:503})}
}
export async function POST(request:Request) {
  try {
    checkBrowserOrigin(request)
    if (Number(request.headers.get('content-length') || '0')>50000) throw new Error('RECOVERY_REQUEST_TOO_LARGE')
    const raw=await request.text()
    if (raw.length>50000) throw new Error('RECOVERY_REQUEST_TOO_LARGE')
    const body=JSON.parse(raw)
    let result
    switch(body.action) {
      case 'bank_approve':authenticateOperator(request);result=await institutionalApproval(body.intent,body.verifiedDemoIdentity,body.credential,body.signature);break
      case 'deploy_credential':authenticateOperator(request);result=await deployCredential(body.safe,body.credential,body.signature);break
      case 'publish_metadata':allowedSafe(body.safe);result=await savePublicMetadata(recoveryClient,body);break
      case 'initiate':result=await initiate(body.intent,body.approvals,body.credential,body.signature);break
      case 'finalize':result=await finalize(body.safe);break
      default:throw new Error('RECOVERY_ACTION_UNSUPPORTED')
    }
    return Response.json({result},{headers:{'Cache-Control':'no-store'}})
  } catch (e) {return Response.json({error:publicError(e)},{status:400})}
}
