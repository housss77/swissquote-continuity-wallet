import type {Request} from '@playwright/test'
// Same-origin credential-free gateways replace direct public RPC URLs. Keep
// synthetic fixtures intercepting them so browser tests never broadcast.
export function isRpcFixture(request:Request){const url=new URL(request.url());return url.hostname!=='localhost' || ['/api/rpc','/api/sponsor'].includes(url.pathname)}
