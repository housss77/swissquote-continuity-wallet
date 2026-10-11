// Map sanitized API codes to guidance; never include the operator credential.
export function recoveryErrorMessage(message:string):string {
  switch(message) {
    case 'RECOVERY_OPERATOR_REQUIRED':
      return 'Enter the demo operator credential under Local demo operator before deploying a signer. Use the existing RECOVERY_DEMO_OPERATOR_TOKEN from .env.local, not your Windows Hello PIN. Keep your saved passkey.'
    case 'RECOVERY_OPERATOR_UNAUTHORIZED':
      return 'RECOVERY_OPERATOR_UNAUTHORIZED: the demo operator credential is missing or incorrect. Enter the existing RECOVERY_DEMO_OPERATOR_TOKEN from .env.local under Local demo operator; it is not your Windows Hello PIN. The API rejected this request before signing or sending.'
    case 'RECOVERY_SAFE_NOT_ALLOWLISTED':
      return 'RECOVERY_SAFE_NOT_ALLOWLISTED: this disposable Safe is not enabled for the demo relayer. Add only its address to RECOVERY_ALLOWED_SAFE_ADDRESSES in .env.local and restart the server. Keep your existing passkey; do not enable the original Safe.'
    default:return message
  }
}
