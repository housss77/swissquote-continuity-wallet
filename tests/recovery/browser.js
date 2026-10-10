import Safe, { SafeProvider, extractPasskeyData } from '@safe-global/protocol-kit'
window.createProbePasskey = async () => {
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Isolated recovery compatibility test' },
    user: { id: crypto.getRandomValues(new Uint8Array(32)), name: crypto.randomUUID(), displayName: 'Disposable test guardian' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestation: 'none',
  } })
  return extractPasskeyData(credential)
}
window.signProbeDigest = async (passkey, digest, rpc = 'http://127.0.0.1:8549') => {
  const provider = await SafeProvider.init(rpc, passkey, '1.4.1')
  return (await provider.getExternalSigner()).signMessage(digest)
}
window.signProbeSafeTransaction = async (passkey, safeAddress, transactions, rpc = 'http://127.0.0.1:8549') => {
  const safe = await Safe.init({ provider: rpc, signer: passkey, safeAddress })
  const prepared = await safe.createTransaction({ transactions })
  const signed = await safe.signTransaction(prepared)
  return { data: signed.data, signatures: signed.encodedSignatures() }
}
