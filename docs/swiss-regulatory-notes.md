# Swiss regulatory considerations

Hackathon analysis, checked against primary sources on 11 October 2026. It is not legal advice, a FINMA certification or a formal compliance assessment. Production classification requires Swiss legal review of actual contracts, control, operating arrangements and services.

## Authority and control

Ordinary spending uses one customer passkey. Swissquote's mock guardian is not a required spending signer and cannot authorize a transfer alone. Any two recovery guardians can replace the owner after a delay and subsequently control assets. Therefore this is customer-controlled daily spending with collective recovery authority, not an absolute claim that nobody else can ever gain control. Guardian collusion, contractual powers, cancellation, key custody and operational independence matter to any custody/control assessment.

Current FINMA custody guidance emphasizes robust technical infrastructure, supervised providers, bankruptcy protection and continuing responsibility when providers are used. It does not certify this particular social-recovery arrangement. [FINMA Guidance 01/2026 announcement](https://www.finma.ch/en/news/2026/01/20260112-mm-am-01-26/).

## AML and wallet verification

FINMA Guidance 02/2019 applies a technology-neutral AML approach: relevant financial intermediaries must identify customers/beneficial owners, monitor risk and address payment information. Its supervised-institution approach to external wallets requires ownership checks for transfers involving the institution's own customers. A passkey signature establishes cryptographic control, not legal beneficial ownership or sanctions status. A production bank integration must determine the applicable obligations and evidence rather than treating a UI signature as complete AML verification. [FINMA Guidance 02/2019, Payments on the blockchain](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf).

## Proposed ownership protocol — not implemented

The authenticated bank session would receive a one-time, expiring challenge bound to the Safe address, chain 11155111 (or explicitly selected production chain), purpose, bank customer session identifier and unpredictable nonce. The customer would approve using the **current Safe owner**. The verifier would check the actual Safe ERC-1271 signature path, current owner/threshold and anti-replay state, then associate the result with separately established legal identity/beneficial ownership. Recovery rotation would require renewed verification. Session privacy, expiry, revocation, proof retention and chain reorganization need explicit design.

This prototype verifies recovery approvals and passkey contract signatures for their specific purposes. It does **not** implement this bank-session ownership protocol. It has no real bank KYC, Travel Rule exchange, sanctions provider, MROS reporting or compliance approval. “Reviewed demo contract” is a technical list, not legal approval. “Sanctions: Not checked” is intentional.

## Product boundaries

Keep customer spending authentication distinct from bank account authentication and recovery adjudication. Document the two-guardian takeover power before enrollment. Do not promise lost-device recovery based solely on compromised email/SMS, or imply that an institution's identity check alone is a second cryptographic guardian. Production requires substantially longer delay, independent guardian operations, alerts, cancellation handling, consumer disclosures and jurisdiction-specific review. A 180-second demo timelock is never an appropriate production default.
