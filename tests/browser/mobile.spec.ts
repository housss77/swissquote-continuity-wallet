import {test,expect} from '@playwright/test'
import {walletFixture} from './product-fixtures'
import {PENDING_KEY} from '../../lib/constants'
test('phone sign-in, installation and manifesto have real next steps without claiming a transaction',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/login')
 await expect(page.getByRole('button',{name:'Continue with passkey',exact:true})).toBeVisible()
 await expect(page.getByText(/No email password or seed phrase/)).toBeVisible()
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.goto('/install');await expect(page.getByText(/Add to Home Screen/)).toBeVisible()
 const manifest=await page.request.get('/manifest.webmanifest'),body=await manifest.json();expect(body.display).toBe('standalone');expect(body.start_url).toBe('/login')
 expect((await page.request.get('/apple-icon')).headers()['content-type']).toContain('image/png')
})
test('virtual passkey sign-in verifies the actual server assertion and rejects reuse',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP virtual authenticator is Chromium-only; not physical Face ID.')
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable')
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
 try{
  await page.goto('/login')
  // Registration/login only: no SDK wallet initialization or UserOperation.
  const result=await page.evaluate(async()=>{
   async function call(action:string,response?:unknown){const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,response})});return {status:r.status,body:await r.json()}}
   const options=await call('register_options'),o=options.body.options
   const bytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
   const credential=await navigator.credentials.create({publicKey:{...o,challenge:bytes(o.challenge),user:{...o.user,id:bytes(o.user.id)}}}) as PublicKeyCredential
   const registered=await call('register_verify',credential.toJSON())
   const auth=await call('login_options'),a=auth.body.options
   const assertion=await navigator.credentials.get({publicKey:{...a,challenge:bytes(a.challenge)}}) as PublicKeyCredential
   const login=await call('login_verify',assertion.toJSON()),replay=await call('login_verify',assertion.toJSON())
   const state=await fetch('/api/auth').then(r=>r.json())
   return {registered:registered.status,login:login.status,replay:replay.status,authenticated:!!state.account,safe:state.account?.safe}
  })
  expect(result).toEqual({registered:200,login:200,replay:400,authenticated:true,safe:null})
 }finally{await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});await cdp.send('WebAuthn.disable')}
})
test('cross-origin auth requests fail and a page reload cannot broadcast',async({page})=>{
 let submits=0;page.on('request',request=>{try{if(request.method()==='POST' && request.postDataJSON()?.method==='eth_sendUserOperation')submits++}catch{}})
 await page.goto('/login');await page.reload();await page.goto('/demo');expect(submits).toBe(0)
 const response=await page.request.post('/api/auth',{headers:{origin:'https://attacker.example'},data:{action:'login_options'}});expect(response.status()).toBe(400)
})
test('unfunded predicted wallet offers explicit activation and never signs on page load',async({page})=>{
 const f=await walletFixture(page,{safe:'0x1111111111111111111111111111111111111111',deployed:false,protectedWallet:false})
 let signatures=0;await page.exposeFunction('unexpectedSignature',()=>{signatures++});await page.addInitScript(()=>Object.defineProperty(navigator.credentials,'get',{value:()=>{void (window as unknown as {unexpectedSignature:()=>void}).unexpectedSignature();throw new Error('MUST_NOT_SIGN')}}))
 await page.goto('/');await expect(page.getByRole('link',{name:'Activate wallet'})).toBeVisible()
 await page.getByRole('link',{name:'Activate wallet'}).click();await expect(page.getByRole('button',{name:'Review test activation'})).toBeVisible()
 await expect(page.getByText(/zero ETH and zero USDC are transferred/)).toBeVisible();expect(f.sends()).toBe(0);expect(signatures).toBe(0)
})
test('activation preserves an unresolved operation across reload and never treats a hash as success',async({page})=>{
 const safe='0x1111111111111111111111111111111111111111',f=await walletFixture(page,{safe,deployed:false,protectedWallet:false})
 await page.addInitScript(({key,safe})=>localStorage.setItem(key,JSON.stringify({kind:'mint',safeAddress:safe,userOperationHash:`0x${'11'.repeat(32)}`,state:'accepted',acceptance:'yes',description:'Tutorial NFT mint: token 1 to this Safe. Zero ETH transferred.'})),{key:PENDING_KEY,safe})
 await page.goto('/activate');await expect(page.getByRole('heading',{name:'Activation needs confirmation'})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Check confirmation'})).toBeVisible();await expect(page.getByRole('heading',{name:'Confirmed on Sepolia'})).toHaveCount(0);expect(f.sends()).toBe(0)
})
test('funding guide names the exact Sepolia network and reads the current token balance',async({page})=>{
 const f=await walletFixture(page,{balance:20000000n});await page.goto('/receive')
 await expect(page.getByText('Current balance: 20 test USDC',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Open Circle faucet ↗'})).toHaveAttribute('href','https://faucet.circle.com/')
 await page.getByText('Faucet requested but the balance is still zero?',{exact:true}).click();await expect(page.getByRole('button',{name:'Check faucet transaction'})).toBeDisabled();expect(f.sends()).toBe(0)
})
