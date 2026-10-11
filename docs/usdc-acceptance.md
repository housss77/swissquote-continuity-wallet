# Gasless test USDC acceptance

Implementation and automated verification are complete; a live USDC transfer has **not** been verified. Historical NFT receipts demonstrate sponsored spending, not a USDC transfer. No unattended signature, transfer, funding or public-chain configuration change was made during polish.

## Contract and pipeline

Ethereum Sepolia, chain 11155111. Official Circle test USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, symbol USDC, decimals 6, deployed code checked by RPC. Source: [Circle's contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses). Tokens have no financial value. Use the [public Circle faucet](https://faucet.circle.com/) rather than buying assets.

`parseUnits(amount, 6)` and bigint balances preserve exact units. Only `transfer(recipient, amount)` is supported by Send; no native ETH value, approval or arbitrary calldata is accepted. The existing Safe Relay Kit 3.1.0 / Protocol Kit 4.1.0 v0.6 preparation is reused: bounded 1.20× verification allowance (11500–12000 bps configuration), SDK call/pre-verification margins, fresh policy sponsorship, actual-paymaster re-estimation, quote/intent binding and modeled executor reserve. Gas fields never change after sponsorship or signing. See [Safe's ERC-4337 guide](https://docs.safe.global/sdk/relay-kit/guides/4337-safe-sdk); the installed versions remain authoritative for integration.

Review runs a real ERC-20 simulation from the Safe and, for a deployed wallet, an `executeUserOp` call from the EntryPoint. Neither proves a real signature or bundler acceptance. Quotes expire after 60 seconds. A Web Lock serializes manual browser sends; a persisted attempt reserves the operation slot before the passkey prompt. Cancellation preserves a rejected, unsent record. No reload, read-only check, timeout or transport failure triggers a broadcast retry.

Inclusion requires two block confirmations, a successful receipt, the exact successful sponsored UserOperation event and deployed Safe/paymaster code. USDC success additionally requires exactly one matching outgoing Transfer in this UserOperation's execution interval, not another operation in the same bundle. Sender/recipient block-end balances are reconciled against **all** token transfers in the block to account for concurrent activity. If archive/log reads are unavailable, the matching event remains the transfer evidence and reconciliation is explicitly unavailable; a computed mismatch blocks success.

## One controlled human test

1. Use the original **Continuity Replacement** Chrome context containing the recovered Windows Hello spending passkey. Do not create a new wallet, clear storage, rotate guardians or use a virtual authenticator.
2. Fund `0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06` with Ethereum Sepolia USDC at Circle's faucet. Run `npm run demo:check` and verify a positive USDC balance. No Safe ETH funding is required.
3. Open `http://localhost:3000/send?demo=1` after selecting the verified demo wallet on `/demo`. If an earlier attempt is shown, check its receipt and preserve the completed evidence before a new transfer. Unresolved attempts must remain blocked.
4. Review **1 test USDC** to `0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86`. Confirm that the wallet, recipient, amount, Sepolia and sponsored fees are correct. Click **Confirm with passkey** once and approve Windows Hello. This signs and broadcasts once; there is no separate post-signing send button.
5. Wait for **Confirmed on Sepolia** and open its actual transaction receipt. Check the official token Transfer from the same Safe to the recipient for 1,000,000 units. Preserve the public transaction hash for the evidence document. If unresolved, use **Check confirmation**, never another send.

The paymaster policy must permit the USDC target/method as well as the previous NFT method. Policy rejection may require a dashboard correction; account API access and actual paymaster authorization are separate. The frontend Pimlico key is public and susceptible to testnet rate/abuse exposure. Restrict its chain, targets, limits and budget.

## Remaining verification

Real Windows Hello signing, current USDC sponsorship-policy eligibility, a real transfer receipt, balances and actual signed gas allowance require this controlled human attempt. Dummy-signature/provider estimates and automated fixtures do not establish those results. The original acceptance Safe remains application read-only; the recovered disposable Safe's configuration is locked in this build. These application restrictions are not new onchain guards.
