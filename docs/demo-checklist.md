# Presenter checklist

- Start the local app using the documented pinned Node/npm versions.
- Run `npm run demo:check`; it is read-only and never signs or submits.
- Open `http://localhost:3000/demo`. Rehearse Next/Back through all six scenes.
- Know the fallback: public historical recovery evidence works without an
  operator credential or spending passkey. Live refresh may be unavailable.
- For a live USDC transfer, use **Continuity Replacement**, the existing Chrome
  context containing the real recovered spending passkey. Keep `localhost`.
- Fund only the disposable Safe with Circle's free Ethereum Sepolia test USDC.
- Review recipient, amount and sponsor before the real Windows Hello approval.
- Do not spend from the original acceptance Safe or change either Safe's setup.
- Never clear browser data, rotate guardians or create replacement credentials
  to resolve a demonstration failure.
- A pending UserOperation is not a confirmed asset transfer. Do not resubmit it.
- Present testnet assets, simulated bank checks, advisory review and the test-only
  delay honestly. No FINMA approval or official Swissquote endorsement is claimed.

The final morning handoff and funded status are recorded in `demo-readiness.md`.
