import {checkAppOrigin} from '../../../lib/app-origin'
import {authOptions,completeAuth,sessionAccount,publicAccount,attachWallet,logout,cookieHeader,SESSION_COOKIE,CHALLENGE_COOKIE} from '../../../lib/auth-server'
export const runtime='nodejs'
const counts=new Map<string,{count:number;until:number}>()
function limited(){const now=Date.now(),old=counts.get('auth'),slot=old && old.until>now?old:{count:0,until:now+60_000};counts.set('auth',slot);if(++slot.count>100)throw new Error('AUTH_RATE_LIMIT')}
const safeError=(e:unknown)=>e instanceof Error && /^AUTH_[A-Z_]+$/.test(e.message)?e.message:'AUTH_VERIFICATION_FAILED'
export async function GET(request:Request) {
  try{checkAppOrigin(request,false);const account=await sessionAccount(request);return Response.json({account:account?publicAccount(account):null},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'AUTH_UNAVAILABLE'},{status:503})}
}
export async function POST(request:Request) {
  try{
    checkAppOrigin(request);limited();const raw=await request.text();if(raw.length>20000)throw new Error('AUTH_REQUEST_INVALID')
    const body=JSON.parse(raw)
    if(['register_options','login_options'].includes(body.action)){
      if(body.action==='register_options' && await sessionAccount(request))throw new Error('AUTH_EXISTING_ACCOUNT_PRESERVED')
      const result=await authOptions(body.action==='register_options'?'register':'login')
      return Response.json({options:result.options},{headers:{'Cache-Control':'no-store','Set-Cookie':cookieHeader(CHALLENGE_COOKIE,result.id,300)}})
    }
    if(['register_verify','login_verify'].includes(body.action)){
      const result=await completeAuth(request,body.action==='register_verify'?'register':'login',body.response)
      const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',cookieHeader(SESSION_COOKIE,result.session,21600));headers.append('Set-Cookie',cookieHeader(CHALLENGE_COOKIE,'',0))
      return Response.json({account:publicAccount(result.account)},{headers})
    }
    if(body.action==='finish_wallet'){
      const account=await sessionAccount(request);if(!account)throw new Error('AUTH_REQUIRED')
      if(account.safe)return Response.json({account:publicAccount(account)},{headers:{'Cache-Control':'no-store'}})
      // Only SDK initialization and public reads. No signing/submission API.
      let safe:`0x${string}`
      try{const {initializeWallet}=await import('../../../lib/wallet');const pack=await initializeWallet(account.passkey);safe=await pack.protocolKit.getAddress() as `0x${string}`}catch{throw new Error('AUTH_WALLET_SETUP_UNAVAILABLE')}
      await attachWallet(account,safe)
      return Response.json({account:publicAccount({...account,safe:safe as `0x${string}`})},{headers:{'Cache-Control':'no-store'}})
    }
    if(body.action==='logout'){await logout(request);return Response.json({ok:true},{headers:{'Set-Cookie':cookieHeader(SESSION_COOKIE,'',0),'Cache-Control':'no-store'}})}
    throw new Error('AUTH_REQUEST_INVALID')
  }catch(e){const error=safeError(e);return Response.json({error},{status:error==='AUTH_REQUIRED'?401:error==='AUTH_RATE_LIMIT'?429:400,headers:{'Cache-Control':'no-store'}})}
}
