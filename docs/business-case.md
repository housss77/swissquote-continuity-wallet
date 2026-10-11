# Continuity: a self-custody companion

Swissquote already offers cryptocurrency trading and wallet transfers. Continuity proposes an optional self-custody companion, not Swissquote's first crypto wallet. [Swissquote's existing wallet offering](https://www.swissquote.com/en-ch/private/trade/products/cryptocurrencies/wallet).

Customers retain ordinary spending authority while a bank-facing experience offers optional recovery coordination and understandable transaction review. The prototype is Swissquote-inspired, not connected to Swissquote accounts, APIs, compliance systems or production identity services. Nothing prevents a customer with their spending key from using another compatible interface. Retention must come from useful services rather than mandatory bank permission.

## Proposed value

- Acquire customers who want self-custody but fear seed phrases and permanent loss.
- Retain an optional relationship through recovery support, risk explanations and future brokerage/on-ramp access.
- Offer premium security and recovery services without making the bank a required spending signer.
- Subsidize network fees as an acquisition/retention cost with explicit usage limits.
- Test whether fewer device-loss incidents lower support costs. This is a hypothesis, not a demonstrated saving.

A future optional Swissquote account connection would link a verified bank session to cryptographically proven wallet control, then use separately authorized brokerage/on-ramp transfers. Those banking integrations are proposals only. Wallet authentication, bank authentication and guardian approval must remain separate. The current operator token is a local demo control, not bank login.

## Illustrative annual unit economics

**Entirely hypothetical. Not Swissquote results, a forecast or a current fee schedule.** Assume 10,000 active wallets, 10% paying CHF 4/month, 20% using brokerage, four CHF 1,000 trades per brokerage user/year, an assumed 0.4% contribution per trade, six sponsored transactions per wallet/year at CHF 0.20 each.

| Item | Calculation | CHF/year |
| --- | --- | ---: |
| Premium services | 10,000 × 10% × 4 × 12 | 48,000 |
| Assumed brokerage contribution | 10,000 × 20% × 4 × 1,000 × 0.4% | 32,000 |
| Gas sponsorship | 10,000 × 6 × 0.20 | (12,000) |
| Contribution before excluded costs | 48,000 + 32,000 − 12,000 | 68,000 |

Development, compliance, guardian partners, fraud losses/controls, recovery operations, support, infrastructure and marketing costs are excluded. The remainder is **not profit**. Production gas costs can vary materially by chain, deployment and signature verification; CHF 0.20 is an illustration and does not price this Sepolia/Safe operation.

| Scenario: 10,000 active wallets | Paid share | Brokerage share | Gas/transaction | Annual contribution before excluded costs |
| --- | ---: | ---: | ---: | ---: |
| Lower adoption / higher fees | 5% | 10% | CHF 0.60 | CHF 4,000 |
| Illustrative base | 10% | 20% | CHF 0.20 | CHF 68,000 |
| Higher adoption / lower fees | 20% | 30% | CHF 0.10 | CHF 138,000 |

At the base assumptions, CHF 6.80 per active wallet/year remains before excluded costs. Losing premium adoption or adding expensive guardian/support operations can remove that contribution. A pilot should measure cost per sponsor operation, premium conversion, retention, recovery incidence, false-positive warnings and independently staffed guardian costs before any financial commitment.

## Proposed launch gate

A closed testnet pilot precedes any commercial claim. Commission recovery-module and integration review, define a realistic delay and alert/cancellation process, contract an independent guardian, isolate institutional keys, review Swiss legal classification, and verify actual wallet-control/beneficial-owner workflows. No production launch, integration or legal clearance is claimed by this demo.
