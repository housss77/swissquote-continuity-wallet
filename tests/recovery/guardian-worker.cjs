// Separate processes hold separate disposable keys. Organizational independence
// remains simulated; no key leaves its process or gets persisted/logged.
const {generatePrivateKey,privateKeyToAccount}=require('viem/accounts')
const account=privateKeyToAccount(generatePrivateKey())
process.send({address:account.address})
let boundSafe,boundModule
process.on('message',async message=>{
  try {
    const {typed,id}=message
    const enrollment=typed.domain.name==='Continuity Guardian Enrollment' && typed.domain.version==='1' && typed.primaryType==='GuardianEnrollment'
    if (typed.domain.chainId!==11155111 || !enrollment && (typed.domain.name!=='Social Recovery Module' || typed.domain.version!=='0.2.0' || typed.primaryType!=='ExecuteRecovery'))throw new Error('Invalid test domain')
    if(enrollment && typed.message.third.toLowerCase()!==account.address.toLowerCase())throw new Error('Wrong enrollment guardian')
    const safe=typed.message.wallet || typed.message.safe
    boundSafe ??= safe
    boundModule ??= typed.domain.verifyingContract
    if (safe.toLowerCase()!==boundSafe.toLowerCase() || typed.domain.verifyingContract.toLowerCase()!==boundModule.toLowerCase())throw new Error('Test guardian context changed')
    // IPC cannot carry BigInt; restore documented typed integer fields only.
    const normalized={...typed,message:enrollment?{...typed.message,threshold:BigInt(typed.message.threshold),delay:BigInt(typed.message.delay)}:{...typed.message,nonce:BigInt(typed.message.nonce),newThreshold:BigInt(typed.message.newThreshold)}}
    process.send({id,signature:await account.signTypedData(normalized)})
  } catch {process.send({id:message.id,error:'TEST_GUARDIAN_REJECTED'})}
})
