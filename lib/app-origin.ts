// A fixed deployment origin, never a hostname inferred from an untrusted header.
export function deploymentOrigin(value = process.env.APP_ORIGIN || 'http://localhost:3000') {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))) throw new Error('APP_ORIGIN_INVALID')
  return url.origin
}
export function checkAppOrigin(request: Request, requireOrigin = true) {
  const expected = deploymentOrigin(), url = new URL(request.url), origin = request.headers.get('origin')
  // TLS may terminate at the trusted hosting proxy. Only the explicitly
  // configured host is accepted; forwarding headers cannot select an RP.
  const host=request.headers.get('host') || url.host
  if (host !== new URL(expected).host || (requireOrigin ? origin !== expected : origin !== null && origin !== expected)) throw new Error('APP_ORIGIN_REJECTED')
  return expected
}
export function validPasskeyRp(rpId: string) {
  const deployed = process.env.NEXT_PUBLIC_PASSKEY_RP_ID
  return rpId === 'localhost' || (!!deployed && rpId === deployed)
}
