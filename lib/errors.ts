export type Stage = 'passkey' | 'authenticate' | 'initialize' | 'prepare' | 'sign' | 'submit' | 'confirm' | 'balance'

// Raw provider/SDK errors can contain API keys, request bodies, and signatures.
// Inspect privately; expose only fixed messages, never raw error strings.
export function friendlyError(error: unknown, stage: Stage): string {
  const parts: string[] = []
  let item: unknown = error
  for (let depth = 0; depth < 6 && item && typeof item === 'object'; depth++) {
    const value = item as { name?: unknown; message?: unknown; cause?: unknown }
    if (typeof value.name === 'string') parts.push(value.name)
    if (typeof value.message === 'string') parts.push(value.message)
    item = value.cause
  }
  const text = parts.join(' ').toLowerCase()
  if (/unsupported_browser|notsupportederror/.test(text)) return 'WebAuthn ES256 passkeys are unavailable. Use current Chrome or Edge with Windows Hello, a compatible security key, or a supported phone.'
  if (/insecure_context|securityerror/.test(text)) return 'Passkeys require a secure context. Open http://localhost:3000 in Chrome or Edge; keep the same hostname for this credential.'
  if (/notallowederror|aborterror/.test(text) && ['passkey', 'authenticate', 'sign'].includes(stage)) return 'The passkey request was cancelled, rejected, or timed out. Unlock your authenticator and retry.'
  if (/missing_pimlico_key/.test(text)) return 'Set NEXT_PUBLIC_PIMLICO_API_KEY in .env.local, enable Sepolia sponsorship in Pimlico, and restart the app.'
  if (/missing_sponsorship_policy/.test(text)) return 'Set NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID to an active Sepolia sponsorship policy in .env.local and restart before signing.'
  if (/wrong_chain/.test(text)) return 'Network check failed: the RPC or bundler is not Ethereum Sepolia (11155111). Operation blocked.'
  if (/insufficient_funds|insufficient funds/.test(text)) return 'The Safe lacks Sepolia ETH for this transfer. Sponsorship pays gas only. Fund the displayed Safe address or choose the unfunded NFT mint.'
  if (/invalid_recipient/.test(text)) return 'Enter a valid, nonzero recipient address different from this Safe.'
  if (/invalid_amount/.test(text)) return 'Enter a positive ETH amount with no more than 18 decimal places.'
  if (/stored_data/.test(text)) return 'Public wallet metadata could not be read or saved in this browser. Enable local storage and keep the same browser profile and origin.'
  if (/confirmation_timeout/.test(text)) return 'Confirmation is still unknown. Keep the UserOperation hash and use “Check pending operation”. Do not submit the operation again.'
  if (/operation_reverted/.test(text)) return 'The UserOperation was included onchain but its execution reverted. It is not a successful mint or transfer.'
  if (/owner_mismatch/.test(text)) return 'Safe owner verification failed. Authenticate and reconnect to refresh the passkey signer after deployment; check that you are using the original credential.'
  if (/evidence_mismatch/.test(text)) return 'Receipt verification failed: the onchain event does not match this sponsored operation. No success is claimed.'
  if (/mint_unavailable/.test(text)) return 'The tutorial NFT contract is unavailable on Sepolia. Fund the Safe and use a transfer, or check the official tutorial contract.'
  if (/paymaster|sponsor|aa3\d|policy|quota/.test(text)) return 'Sponsorship failed. Check the Sepolia paymaster policy, API key permissions, provider quota, and sponsorship balance in Pimlico.'
  if (/401|403|unauthorized|forbidden|api key|apikey/.test(text)) return 'Pimlico rejected the API key or account permissions. Check your testnet key and enabled sponsorship, then restart after changing configuration.'
  if (/fetch|network|timeout|timed out|429|503|socket|econn|rpc_network/.test(text)) return 'The RPC or provider is unreachable, rate limited, or timed out. Check connectivity and provider status. If already submitted, check the pending operation before retrying.'
  if (stage === 'submit') return 'The bundler rejected or could not acknowledge the UserOperation. Check Pimlico diagnostics and any pending operation before attempting another send.'
  if (stage === 'prepare') return 'UserOperation estimation or sponsorship failed. Check Pimlico policy/limits and the Safe balance; no operation has been submitted.'
  if (stage === 'sign' || stage === 'authenticate') return 'Passkey authentication failed. Use the original authenticator on the original localhost origin.'
  if (stage === 'confirm') return 'Confirmation could not be verified. Keep the pending UserOperation hash and check it again; no success is claimed.'
  if (stage === 'balance') return 'Could not refresh the Sepolia balance or deployment status. Check the RPC connection.'
  if (stage === 'passkey') return 'Passkey creation failed. Use Chrome or Edge with an ES256-compatible authenticator and approve the browser request.'
  return 'Safe initialization failed. Check the Sepolia RPC, Pimlico key, EntryPoint 0.6 availability, and browser storage.'
}
