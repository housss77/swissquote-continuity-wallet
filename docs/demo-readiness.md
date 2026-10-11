# Morning demo readiness

Open **http://localhost:3000/demo**. The six-scene main pitch takes approximately 3:45. It needs no operator token, original passkey, JSON approval exchange or live timelock wait. Its recovery story is explicitly **Verified earlier on Sepolia**. Presenter narration, fallback and Q&A: [demo-script.md](demo-script.md).

## Start and read-only check

Tested Node 24.16.0 / npm 11.13.0. Keep the existing ignored `.env.local`; never overwrite it.

```powershell
npm ci
npm run build
npm run start
```

In a second terminal:

```powershell
npm run demo:check
```

The check never signs, sends or changes state. PASS checks contracts/owners/thresholds/guardians, preserved original Safe, receipts, recovery events, actual delay and NFT ownership. WARN may indicate missing live RPC, zero USDC or unverified live USDC acceptance. A configured sponsorship key/policy is only a presence check, not proof of eligibility. FAIL means a state/evidence mismatch: investigate read-only; do not sign or alter setup to force the demo.

If another app owns port 3000, stop and identify it rather than killing an unknown process. If the app is already running, refresh Chrome; do not start a second server. A local production process is left running at handoff, but it may need restarting after a workstation shutdown.

## Live signing context and funding

- Use the existing **Continuity Replacement** Chrome context for the recovered real Windows Hello spending passkey. No virtual authenticator. Do not erase or export credentials.
- Safe: `0xa46F0fb0AdD0B6c4Dae354aE2407e8f1162A6A06`.
- Ethereum Sepolia, 11155111. Official Circle test USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, 6 decimals.
- Last fresh check: **0 USDC and 0 ETH**. The one external prerequisite is funding this exact Safe through [Circle's free Sepolia USDC faucet](https://faucet.circle.com/). No native ETH purchase/funding is needed for sponsored spending.
- Human actions needing a passkey: Connect passkey, Confirm with passkey, Check backup access. Presentation navigation and Check live state do not need one.
- Do not use the original Safe `0x6f7c9faba9B6039255f2301935D891ffE6065e8C` for a new spend. Both acceptance wallets' security configuration is locked in this build.

## Three-to-five-minute verification

1. **0:00–0:45:** Run `npm run demo:check`. Confirm owner/2-of-3/module/original Safe/history checks PASS. A USDC funding warning is honest and leaves the historical pitch usable.
2. **0:45–1:30:** Open `/demo`, use Next/Back, check “Verified earlier on Sepolia,” open the finalization/recovered-spend explorer links. The read-only refresh is optional.
3. **1:30–2:15:** In Continuity Replacement, select the demo wallet and open `/send?demo=1`. Refresh the faucet-funded USDC balance. If an old completed attempt is present, recheck it and preserve it. Never clear an unresolved attempt.
4. **2:15–4:00:** Review **1 test USDC** to `0x419D08ffDD36aE0Ebcc5d652D029D50c33CfdD86`; verify wallet/recipient/amount/Sepolia/sponsored fees. Click **Confirm with passkey** once, approve Windows Hello, wait for the actual receipt. A slow provider may extend this timing; switch to historical evidence instead of retrying.
5. **4:00–5:00:** Open the confirmed transaction explorer link and verify the USDC Transfer. Record the actual public hash. If unresolved, use Check confirmation only. Do not call a sponsorship quote or UserOperation hash a successful transfer.

Faucet waiting is external and should happen before this short checklist. Full controlled acceptance details: [usdc-acceptance.md](usdc-acceptance.md).

## Real historical receipts

| Action | Sepolia transaction |
| --- | --- |
| Enrollment | [0x52b695e1…](https://sepolia.etherscan.io/tx/0x52b695e1c6efc91daecbe61054265bf4a049924d8711b5aa8b535ecd8009c6be) |
| B+C recovery initiation | [0x0279e443…](https://sepolia.etherscan.io/tx/0x0279e44352fe80bec8c3a3372e9d5acc40ce0d7cc133e554404a6d6d28876c21) |
| Owner rotation | [0x46632998…](https://sepolia.etherscan.io/tx/0x46632998eeaccb86aa4ede0819933ef553973a2ef9ee3f1b706efafc4a97d6bc) |
| Recovered sponsored NFT | [0x2c48f393…](https://sepolia.etherscan.io/tx/0x2c48f3936c4c04f36a073476f2e194ddc71f1514456e38906ed35c3bbc08c579) |

**There is no live USDC hash yet.** If passkey, faucet, RPC or paymaster fails, the fallback is the historical sponsored NFT/recovery receipts, clearly labeled historical. `/demo` still navigates without live RPC; it does not simulate a new successful transaction. Never ask the presenter to reveal an operator credential or private key.
