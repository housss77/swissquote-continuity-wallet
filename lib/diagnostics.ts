import type { Stage } from './errors'

export type Acceptance = 'no' | 'yes' | 'unknown'
export type Diagnostic = {
  stage: Stage
  at: string
  message: string
  httpStatus?: number
  rpcCode?: number
  sdkCode?: string
  acceptance: Acceptance
}

// Never stringify SDK errors: ethers includes signed payloads and credential URLs.
export function scrubMessage(value: unknown): string {
  let text = typeof value === 'string' ? value : 'Unspecified error'
  const dump = text.search(/[\[{]|\b(?:payload|requestBody|request body|params|signature|authenticatorData|clientDataJSON)\s*[:=]/i)
  if (dump >= 0) text = text.slice(0, dump) + '(request data redacted)'
  for (const secret of [process.env.NEXT_PUBLIC_PIMLICO_API_KEY, process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID]) {
    if (secret) text = text.split(secret).join('(redacted)')
  }
  text = text.replace(/https?:\/\/[^\s"'<>]+/gi, '(URL redacted)')
    .replace(/\b(apikey|api_key|authorization|token|secret|password|rawId|credentialId)\s*[:=]\s*[^\s,;]+/gi, '$1=(redacted)')
    .replace(/0x[a-f\d]{40,}/gi, '(hex data redacted)')
  return text.replace(/[\r\n\t]+/g, ' ').slice(0, 500)
}

export class RpcFailure extends Error {
  constructor(message: string, public httpStatus?: number, public rpcCode?: number) {
    super(scrubMessage(message))
    this.name = 'RpcFailure'
    this.httpStatus = typeof httpStatus === 'number' && Number.isFinite(httpStatus) ? httpStatus : undefined
    this.rpcCode = typeof rpcCode === 'number' && Number.isFinite(rpcCode) ? rpcCode : undefined
  }
}

export function diagnose(error: unknown, stage: Stage, acceptance: Acceptance): Diagnostic {
  if (error instanceof RpcFailure) {
    return { stage, acceptance, at: new Date().toISOString(), message: error.message, httpStatus: error.httpStatus, rpcCode: error.rpcCode }
  }
  const seen = new Set<unknown>()
  const queue: unknown[] = [error]
  let message: unknown
  let rpcCode: number | undefined
  let sdkCode: string | undefined
  let httpStatus: number | undefined
  for (let i = 0; i < 12 && queue.length; i++) {
    const item = queue.shift()
    if (!item || typeof item !== 'object' || seen.has(item)) continue
    seen.add(item)
    const value = item as Record<string, unknown>
    if (typeof value.code === 'number') { rpcCode = value.code; message = value.message }
    if (typeof value.code === 'string' && !sdkCode) sdkCode = scrubMessage(value.code)
    if (message === undefined) message = value.shortMessage ?? value.message
    if (typeof value.status === 'number') httpStatus = value.status
    if (typeof value.statusCode === 'number') httpStatus = value.statusCode
    queue.push(value.cause, value.error, value.info, value.response)
  }
  return { stage, acceptance, at: new Date().toISOString(), message: scrubMessage(message), rpcCode, sdkCode, httpStatus }
}

export function isDefiniteRejection(error: unknown): boolean {
  if (!(error instanceof RpcFailure)) return false
  // Internal/transport errors and "already known" responses remain ambiguous.
  if (/already (known|submitted|pending|included|accepted)/i.test(error.message)) return false
  return error.httpStatus === 401 || error.httpStatus === 403
    || (error.rpcCode !== undefined && [-32600, -32601, -32602, -32500, -32501, -32502, -32503, -32504, -32505, -32506, -32507, -32508].includes(error.rpcCode))
}
