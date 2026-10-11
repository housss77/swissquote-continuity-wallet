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
  if (/auth_existing_account_preserved|auth_credential_already_registered/.test(text)) return 'Your existing wallet is preserved. Choose Continue with passkey instead of creating another.'
  if (/auth_challenge_expired/.test(text)) return 'The sign-in request expired. Choose Continue with passkey to start a fresh request.'
  if (/auth_account_not_found/.test(text)) return 'This passkey is not registered on this website. Use the same domain where you created your wallet, or recover your access.'
  if (/auth_wallet_setup_required|auth_wallet_setup_unavailable|auth_unavailable|auth_verification_failed/.test(text)) return 'Wallet sign-in or setup could not finish. Your passkey is preserved. Reconnect and try again; no transaction was sent.'
  if (/auth_required/.test(text)) return 'Sign in with your spending passkey before requesting sponsored fees or sending.'
  if (/sponsor_/.test(text)) return 'The sponsorship service declined this operation. Check the configured Sepolia policy and supported transaction; nothing is automatically retried.'
  if (/usdc_invalid_amount/.test(text)) return 'Enter a positive USDC amount with no more than 6 decimal places. Exponents and negative amounts are not supported.'
  if (/insufficient_usdc/.test(text)) return 'Your wallet does not have enough test USDC. Use Circle’s free faucet for this wallet address, then refresh the balance.'
  if (/usdc_balance_unavailable/.test(text)) return 'USDC balance could not be verified. Refresh the wallet before preparing a transfer.'
  if (/usdc_simulation_failed/.test(text)) return 'The token contract did not confirm the simulated transfer. Signing is blocked.'
  if (/usdc_transfer_unverified|usdc_balance_reconciliation/.test(text)) return 'The expected USDC transfer could not be independently verified. No transfer success is claimed; preserve the attempt and check again.'
  if (/customer_passkey_unavailable/.test(text)) return 'Use the Chrome profile with your current spending passkey. The recovered demo wallet uses the Continuity Replacement profile.'
  if (/original_wallet_read_only/.test(text)) return 'This original acceptance wallet is read-only. Select the disposable demo wallet to test a transfer.'
  if (/demo_configuration_changed/.test(text)) return 'The verified demo wallet configuration has changed or could not be verified. Signing is blocked; inspect its onchain state.'
  if (/send_previous_attempt|send_already_active/.test(text)) return 'Another operation is saved or active in this browser. Check its confirmation and preserve the evidence before preparing a new transfer.'
  if (/send_lock_unavailable/.test(text)) return 'This browser cannot safely coordinate sends across tabs. Update Safari or Chrome and open the app over HTTPS.'
  if (/sponsorship_quote_expired|send_nonce_changed/.test(text)) return 'This review expired or the wallet nonce changed. Return to the form and prepare a fresh review. Nothing was resubmitted.'
  if (/unsupported_browser|notsupportederror|webauthn is not supported/.test(text)) return 'WebAuthn ES256 passkeys are unavailable. Use current Safari on iPhone with iCloud Keychain, Chrome with Windows Hello, or a compatible authenticator.'
  if (/insecure_context|securityerror/.test(text)) return 'Passkeys require HTTPS on your phone. On this computer localhost is also supported. Keep the same website address for your credential.'
  if (/notallowederror|aborterror/.test(text) && ['passkey', 'authenticate', 'sign'].includes(stage)) return 'The passkey request was cancelled, rejected, or timed out. Unlock your authenticator and retry.'
  if (/missing_pimlico_key/.test(text)) return 'The demo sponsor is not configured. The operator must configure the server’s Sepolia provider key before you can send.'
  if (/missing_sponsorship_policy/.test(text)) return 'The demo sponsor has no active Sepolia policy configured. Ask the operator to check server configuration before signing.'
  if (/wrong_chain/.test(text)) return 'Network check failed: the RPC or bundler is not Ethereum Sepolia (11155111). Operation blocked.'
  if (/invalid_verification_gas_bps/.test(text)) return 'NEXT_PUBLIC_VERIFICATION_GAS_BPS must be an integer from 11500 to 12000. Restart after correcting it; signing is blocked.'
  if (/gas_budget_exceeded/.test(text)) return 'The estimated UserOperation budget exceeds the observed 16,000,000-gas limit including the executor reserve. Operation blocked; no broadcast occurred.'
  if (/gas_verification_margin_insufficient|sponsorship_quote_gas_insufficient/.test(text)) return 'The fresh estimate does not fit the quote with the configured verification margin. Signing is blocked; do not force a retry.'
  if (/gas_adjustment_repeated|gas_invalid_estimate/.test(text)) return 'The gas-estimation flow returned invalid values or attempted another adjustment. Operation blocked before signing.'
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
  if (stage === 'sign' || stage === 'authenticate') return 'Passkey authentication failed. Use the same website and passkey that controls this wallet.'
  if (stage === 'confirm') return 'Confirmation could not be verified. Keep the pending UserOperation hash and check it again; no success is claimed.'
  if (stage === 'balance') return 'Could not refresh the Sepolia balance or deployment status. Check the RPC connection.'
  if (stage === 'passkey') return 'Passkey creation failed. Use current Safari with iCloud Keychain or Chrome with Windows Hello, and approve the device request.'
  return 'Safe initialization failed. Check the Sepolia RPC, Pimlico key, EntryPoint 0.6 availability, and browser storage.'
}
