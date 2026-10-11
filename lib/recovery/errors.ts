// Map sanitized API codes to guidance; never include the operator credential.
export function recoveryErrorMessage(message:string):string {
  switch(message) {
    case 'RECOVERY_THIRD_PARTY_POSSESSION_NOT_PROVEN':
      return 'RECOVERY_THIRD_PARTY_POSSESSION_NOT_PROVEN: the approval is invalid or does not match the current Safe, guardian addresses, Sepolia chain, recovery module, threshold two and delay. Select the signed public approval for this exact enrollment request. Keep your existing passkeys and approval files; protection setup remains blocked.'
    case 'RECOVERY_APPROVAL_FILE_INVALID':
      return 'RECOVERY_APPROVAL_FILE_INVALID: select the downloaded signed public approval JSON (maximum 20 KB), rather than the unsigned enrollment request. Keep the existing approval file and passkeys.'
    case 'RECOVERY_ENROLLMENT_INPUTS_REQUIRED':
      return 'RECOVERY_ENROLLMENT_INPUTS_REQUIRED: find the disposable Safe, restore its saved backup identity, and enter the independent guardian address before importing its signed approval.'
    case 'RECOVERY_ENROLLMENT_CHANGED':
      return 'RECOVERY_ENROLLMENT_CHANGED: the enrollment configuration changed during verification. Review the displayed Safe and guardians, then import the approval for that exact configuration. No signing or sending occurred.'
    case 'RECOVERY_THIRD_PARTY_WRONG_CHAIN':
      return 'RECOVERY_THIRD_PARTY_WRONG_CHAIN: select Ethereum Sepolia (chain ID 11155111) in the chosen guardian wallet, then check the connection again. No approval was signed.'
    case 'RECOVERY_WRONG_THIRD_PARTY_ACCOUNT':
      return 'RECOVERY_WRONG_THIRD_PARTY_ACCOUNT: the first account returned by the chosen wallet does not match the guardian in the request. Select that account and authorize it for localhost in your wallet, then check the connection again. Compare the displayed wallet account with the request’s guardian address.'
    case 'RECOVERY_GUARDIAN_ACCOUNT_UNAVAILABLE':
      return 'RECOVERY_GUARDIAN_ACCOUNT_UNAVAILABLE: unlock your guardian wallet and use Connect guardian wallet to authorize its account for localhost. No approval was signed.'
    case 'RECOVERY_INDEPENDENT_WALLET_UNAVAILABLE':
      return 'RECOVERY_INDEPENDENT_WALLET_UNAVAILABLE: select the guardian wallet provider. If none is listed, enable its browser extension for this profile and refresh the page.'
    case 'RECOVERY_OPERATOR_REQUIRED':
      return 'Enter the demo operator credential under Local demo operator before deploying a signer. Use the existing RECOVERY_DEMO_OPERATOR_TOKEN from .env.local, not your Windows Hello PIN. Keep your saved passkey.'
    case 'RECOVERY_OPERATOR_UNAUTHORIZED':
      return 'RECOVERY_OPERATOR_UNAUTHORIZED: the demo operator credential is missing or incorrect. Enter the existing RECOVERY_DEMO_OPERATOR_TOKEN from .env.local under Local demo operator; it is not your Windows Hello PIN. The API rejected this request before signing or sending.'
    case 'RECOVERY_SAFE_NOT_ALLOWLISTED':
      return 'RECOVERY_SAFE_NOT_ALLOWLISTED: this disposable Safe is not enabled for the demo relayer. Add only its address to RECOVERY_ALLOWED_SAFE_ADDRESSES in .env.local and restart the server. Keep your existing passkey; do not enable the original Safe.'
    case 'RECOVERY_INVALID_SAFE_ALLOWLIST':
      return 'RECOVERY_INVALID_SAFE_ALLOWLIST: an entry in RECOVERY_ALLOWED_SAFE_ADDRESSES in .env.local is invalid. Use valid Ethereum addresses with correct checksums or lowercase formatting, then restart the server. The request was rejected before signing or sending. Keep your existing passkey.'
    default:return message
  }
}
