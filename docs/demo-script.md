# Continuity presenter script

Open `http://localhost:3000/demo`. Six customer-journey scenes, approximately three minutes.
Any browser context can present the scripted story; it requests no real credentials. Use **Continuity Replacement** only for the separate optional live spending flow.
The presentation itself needs no passkey, operator credential or bank access.

## Thirty-second pitch

Continuity is a self-custody companion to Swissquote's existing crypto offering.
Customers approve spending with a passkey. If spending access is lost, two of
three guardians can install new access after an onchain delay, keeping the same
wallet and assets. We have demonstrated that lifecycle on Sepolia, including a
sponsored transaction after real human-operated recovery. Bank identity checks
are simulated; the underlying signatures and transactions are real.

## Main pitch: three minutes

The persistent **Simulated customer journey** label explains that these controls only change in-memory presentation state. They do not perform bank login, open an authenticator, sign or broadcast, or write wallet/session storage. Every proof popup says **Verified earlier on Sepolia**. Close each popup with **Close** before proceeding. No real timelock is shortened.

| Scene | Time | Narration and exact action |
| --- | --- | --- |
| Sign in | 25 sec | “Continuity is a self-custody companion close to the Swissquote account. This account entry is simulated; we are not connected to Swissquote.” Click **Continue with Swissquote (demo)**. No credentials are needed. |
| Create wallet | 30 sec | “The real wallet uses a customer passkey. Its private key stays in the authenticator.” Click **Create wallet (demo)**. The popup shows historical Safe deployment and sponsored NFT spending, not a wallet created now. Close it; click **Next scene**. |
| Add recovery | 30 sec | “A separate backup, the bank guardian and a trusted third party form a recovery circle. Any two may replace the owner after a delay.” Click **Enable recovery (demo)** to show the real historical enrollment proof. Registration does not prove present-day availability. Close it; click **Next scene**. |
| Spend | 30 sec | “The customer approves spending; the sponsor pays network gas. Swissquote is not a mandatory ordinary spending signer.” Click **Approve transaction (demo)**. This reuses the historical initial NFT receipt; it is not a second or newly sent transaction. USDC is implemented and automated-tested, but no live USDC receipt is verified. Close it; click **Next scene**. |
| Device loss | 20 sec | “Losing spending access need not move or lose the wallet. We restore control through a new passkey.” Device loss here is illustrative; no credentials are deleted and synced passkey loss is not proven. Click **Recover wallet (demo)**. |
| Recover | 45 sec | “This B+C recovery happened earlier on Sepolia: two distinct approvals, 252 seconds elapsed against a 180-second test delay, same Safe, new owner.” Click **Restore access (demo)** for historical owner rotation. Close it; show **View recovery initiation proof** and **View recovered transaction proof**. “The new passkey then spent again. Real contracts and signatures, simulated bank identity operations.” |

Finish with: **“Your assets stay yours. Swissquote adds an optional recovery path, not mandatory spending permission.”** Qualify the collective recovery power: any two guardians can take over after the delay. The 180-second delay is unsuitable for production. Optional services and the business case are explained in the technical Q&A below.

Use **Back**, **Next scene** or **Restart walkthrough** to rehearse. Read-only current-state refresh is available under **Live verification and evidence provenance** → **Check live state (read-only)**. It is not required to navigate or view stored proof.

## Optional real USDC flow — separate from the scripted journey

Only after test tokens are funded and the human presenter is ready, use the **Continuity Replacement** context and the actual `/send` page. Review a transfer, confirm with the customer passkey once, and wait for the independently checked receipt and matching USDC Transfer event. This is outside `/demo`; it may take longer than the pitch. Follow [controlled USDC acceptance](usdc-acceptance.md). If unavailable, use the historical NFT proof and state that no live USDC transfer was verified. Never present a simulated click, a quote, or a UserOperation hash as a confirmed transfer.

## Technical version: six minutes

1. **0:00–0:45 — Custody:** customer spending threshold one, authenticator-retained
   P-256 secret, public metadata only in the app; two guardians can collectively
   change control. No unconditional claim about legal custody classification.
2. **0:45–1:45 — Spending:** Safe 1.4.1, pinned Protocol Kit 4.1.0 and Relay Kit
   3.1.0, EntryPoint v0.6. Explain estimation, validated sponsorship, WebAuthn
   signing, one broadcast and independent receipt/event checks as separate stages.
3. **1:45–2:30 — Gasless USDC:** six-decimal integer accounting, exact transfer
   calldata and token evidence. A simulation or HTTP 200 is not chain success.
4. **2:30–4:00 — Recovery:** reviewed Candide v0.2.0, three distinct guardians,
   canonical Safe/chain/module/new-owner/threshold/nonce-bound approvals. B+C
   worked without an original customer approval. The real test wait was 252
   seconds. Show explorer receipts; do not shorten the contract delay.
5. **4:00–5:00 — Security:** revoked owner versus credential deletion, guardian
   collusion, shared device failure domain, absent alerts and production controls.
   UI warnings are bypassable by a usable spending passkey.
6. **5:00–6:00 — Bank fit:** optional ecosystem services, hypothetical economics,
   AML identity versus cryptographic control, production audit and legal review.

## Emergency fallback

- **Passkey unavailable:** do not create another key or retry repeatedly. Continue
  through historical evidence. No new transfer is claimed.
- **RPC unavailable:** say “Live refresh unavailable; this is previously verified
  evidence.” Stored receipt links and facts remain visible.
- **Paymaster denies:** no unsponsored fallback and no ETH purchase. Show the
  preserved error and historical sponsored NFT receipt.
- **Accepted but unconfirmed:** keep the operation pending, do not resend, and
  return after the pitch to check its exact hash.
- **Unexpected ownership/configuration:** stop live signing and use documented
  historical evidence with an explicit current-state warning.

Never call a historical action “just submitted,” claim a live USDC transfer
without its matching receipt/logs, or equate a new browser profile with actual
loss of synced passkeys.

## Jury questions: precise answers

**Why is this self-custody?** Daily spending needs the customer passkey, not a Swissquote spending key. Explain the qualification: any two recovery guardians can replace that owner after the delay. This is customer spending control with collective social recovery, not unconditional exclusive control forever.

**Can Swissquote freeze or steal funds?** The bank guardian alone cannot spend or recover, and there is no bank spending guard. Two guardians colluding can take over after the delay. Separately, USDC issuer powers can affect transfers. The local demo UI's safety locks are not onchain permissions.

**What if two guardians collude?** They can replace the owner. Real independent operations, a much longer delay, alerts and customer cancellation are required production defenses; several are absent here. Say the limitation plainly.

**What if my phone is stolen?** WebAuthn requires user verification. If the attacker also has usable spending access, the threshold-one Safe can spend without our advisory UI. Recovery does not freeze those spends. Stronger independent customer authorization is a future proposal.

**Why not MPC?** Safe/passkeys and an established recovery module allowed a verifiable solo implementation without new share servers or custom cryptography. MPC is a different trust/availability model, not something we implemented or universally rejected.

**What if every customer device is lost?** The verified B+C path used the bank mock and independent third party to install a new customer passkey after the actual delay. Neither original customer credential was required. Human identity verification and organizational independence still need production implementation.

**How do you prove actual ownership?** Onchain signatures prove control and approvals for specific intents. They do not prove beneficial ownership. A bank-session-bound Safe ERC-1271 challenge plus separately verified legal identity is proposed, not implemented.

**What is genuine and what is mocked?** Real: contracts, signatures, timelock, owner rotation, same address, sponsored NFT receipts. Automated: virtual authenticators/fork tests and USDC transfer validation. Simulated: institutional identity checks and organizational services. No real USDC receipt yet. The presentation labels completed proof as historical.

**Who funds gas and how does Swissquote profit?** Pimlico sponsors this testnet flow. A future bank subsidy could be an acquisition/retention cost; optional premium services and brokerage could contribute revenue. Our economics are explicitly hypothetical and exclude significant costs.

**Is it compliant with Swiss law?** No certification or legal approval is claimed. We distinguish spending and recovery power, control proof and beneficial ownership, and propose review against FINMA's AML/custody guidance. Sanctions screening and bank infrastructure are absent.
