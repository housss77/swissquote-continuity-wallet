// Web Locks prevent two tabs from authorizing the same browser's pending slot.
// No fallback to an unsafe localStorage compare-and-swap. A manual action is
// required to acquire this lock; refreshing a page never signs or broadcasts.
export async function withSendLock<T>(action:()=>Promise<T>):Promise<T> {
  if(!navigator.locks)throw new Error('SEND_LOCK_UNAVAILABLE')
  return navigator.locks.request('continuity-customer-send-v1',{ifAvailable:true},async lock=>{
    if(!lock)throw new Error('SEND_ALREADY_ACTIVE')
    return action()
  })
}
export function assertFreshQuote(at:number,now=Date.now()) {
  if(now-at>60_000 || now<at)throw new Error('SPONSORSHIP_QUOTE_EXPIRED')
}
