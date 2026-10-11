import {test,expect} from '@playwright/test'
import {walletFixture} from './product-fixtures'
import {PENDING_KEY,ENTRY_POINT} from '../../lib/constants'
import {DEMO_SAFE} from '../../lib/product'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {ENTRY_POINT_ABI} from '../../lib/proof'
import {tokenAbi,USDC_ADDRESS} from '../../lib/product'
const recipient='0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86'
test('zero USDC shows faucet funding and blocks review without requesting a signature',async({page})=>{
 const f=await walletFixture(page);await page.goto('/send');await expect(page.getByText('Balance: 0 USDC')).toBeVisible()
 await expect(page.getByRole('link',{name:'Get free test USDC ↗'})).toHaveAttribute('href','https://faucet.circle.com/')
 await expect(page.getByRole('button',{name:'Review transfer'})).toBeDisabled();expect(f.sends()).toBe(0)
})
test('Max preserves six decimals and invalid input never prepares or broadcasts',async({page})=>{
 const f=await walletFixture(page,{balance:1_234_567n});await page.goto('/send')
 await page.getByRole('button',{name:'Max',exact:true}).click();await expect(page.getByLabel('Amount in USDC')).toHaveValue('1.234567')
 await page.getByLabel('Recipient address').fill(recipient);await page.getByLabel('Amount in USDC').fill('1.1234567');await page.getByRole('button',{name:'Review transfer'}).click()
 await expect(page.getByRole('main').getByRole('alert')).toContainText('6 decimal places');expect(f.sends()).toBe(0)
})
test('valid transfer requires current customer credentials; viewing a funded wallet cannot send',async({page})=>{
 const f=await walletFixture(page,{balance:2_000_000n});await page.route('**/api/recovery?*',r=>r.fulfill({json:{replacement:null}}))
 await page.goto('/send?demo=1');await expect(page.getByLabel('Recipient address')).toHaveValue(recipient)
 await page.getByRole('button',{name:'Review transfer'}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Continuity Replacement')
 await expect(page.getByRole('button',{name:'Confirm with passkey'})).toHaveCount(0);expect(f.sends()).toBe(0)
})
test('pending transfer survives reload and blocks a duplicate transfer without claiming success',async({page})=>{
 const f=await walletFixture(page,{balance:2_000_000n})
 await page.addInitScript(({key,safe,recipient})=>localStorage.setItem(key,JSON.stringify({kind:'usdc',description:'Send 1 test USDC',userOperationHash:`0x${'11'.repeat(32)}`,safeAddress:safe,state:'accepted',acceptance:'yes',usdcIntent:{chainId:11155111,safe,recipient,token:'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',amount:'1000000'}})),{key:PENDING_KEY,safe:DEMO_SAFE,recipient})
 await page.goto('/send');await expect(page.getByRole('region',{name:'Saved operation'})).toContainText('Submitted')
 await expect(page.getByRole('button',{name:'Review transfer'})).toHaveCount(0)
 await page.reload();await expect(page.getByRole('button',{name:'Check confirmation'})).toBeVisible();await expect(page.getByText('CONFIRMED ON SEPOLIA',{exact:true})).toHaveCount(0);expect(f.sends()).toBe(0)
})
test('stored inclusion is reverified before showing a USDC confirmation, hiding stale pending UI',async({page})=>{
 // Synthetic receipt only; this test is never public-chain evidence.
 const hash=`0x${'11'.repeat(32)}` as const,tx=`0x${'22'.repeat(32)}` as const,sponsor='0x6666666666667849c56f2850848cE1C4da65c68b'
 const rawLog=(address:string,topics:unknown,data:string,index:string)=>({address,topics,data,logIndex:index,blockNumber:'0xff',transactionHash:tx,transactionIndex:'0x0',blockHash:hash,removed:false})
 const logs=[rawLog(ENTRY_POINT,encodeEventTopics({abi:parseAbi(['event BeforeExecution()']),eventName:'BeforeExecution'}),'0x','0x1'),rawLog(USDC_ADDRESS,encodeEventTopics({abi:tokenAbi,eventName:'Transfer',args:{from:DEMO_SAFE,to:recipient}}),encodeAbiParameters([{type:'uint256'}],[1_000_000n]),'0x2'),rawLog(ENTRY_POINT,encodeEventTopics({abi:ENTRY_POINT_ABI,eventName:'UserOperationEvent',args:{userOpHash:hash,sender:DEMO_SAFE,paymaster:sponsor}}),encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[1n,true,1n,1n]),'0x3')]
 const f=await walletFixture(page,{balance:1_000_000n,receipt:{transactionHash:tx,transactionIndex:'0x0',blockHash:hash,blockNumber:'0xff',from:sponsor,to:ENTRY_POINT,cumulativeGasUsed:'0x10',gasUsed:'0x10',effectiveGasPrice:'0x1',logs,logsBloom:`0x${'00'.repeat(256)}`,status:'0x1',type:'0x2',contractAddress:null}})
 await page.addInitScript(({key,safe,recipient,hash,tx,sponsor})=>localStorage.setItem(key,JSON.stringify({kind:'usdc',description:'Send 1 test USDC',userOperationHash:hash,transactionHash:tx,paymasterAddress:sponsor,safeAddress:safe,state:'included',acceptance:'yes',usdcIntent:{chainId:11155111,safe,recipient,token:'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',amount:'1000000'}})),{key:PENDING_KEY,safe:DEMO_SAFE,recipient,hash,tx,sponsor})
 await page.goto('/send');await expect(page.getByText('CONFIRMED ON SEPOLIA',{exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'View confirmed transaction ↗'})).toHaveAttribute('href',`https://sepolia.etherscan.io/tx/${tx}`)
 await expect(page.getByText(/matching Transfer event verified/)).toBeVisible();await expect(page.getByRole('button',{name:'Check confirmation'})).toHaveCount(0);expect(f.sends()).toBe(0)
 // A different tab's new attempt must invalidate this receipt, never reuse it.
 await page.evaluate(key=>{const old=JSON.parse(localStorage.getItem(key)!);localStorage.setItem(key,JSON.stringify({...old,state:'accepted',userOperationHash:`0x${'44'.repeat(32)}`,transactionHash:undefined}));window.dispatchEvent(new StorageEvent('storage',{key}))},PENDING_KEY)
 await expect(page.getByText('CONFIRMED ON SEPOLIA',{exact:true})).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Check confirmation'})).toBeVisible();expect(f.sends()).toBe(0)
})
