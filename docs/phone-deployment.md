# iPhone demo deployment

This is a Sepolia hackathon application, not a released Swissquote service. The
mobile web app can be added to an iPhone home screen. No App Store installation,
email provider or seed phrase is required. Physical Face ID and a live USDC
transfer still require human acceptance on the final HTTPS domain.

## The deployment model

Use **one Node 24.16.0 instance with a persistent disk**, behind HTTPS. Keep the
same hostname for the entire demo. `Dockerfile` packages Next standalone output;
`compose.yaml` supplies the persistent `/data` volume and binds port 3000 to the
host's loopback interface. A hosting provider or reverse proxy terminates TLS.
Do not expose plain HTTP port 3000 to iPhones.

The disk contains public credential keys/IDs, counters, hashed session/challenge
identifiers, and the existing recovery registry/acknowledgements. It contains no
customer private keys. Treat it as sensitive account data and back it up securely.
Ephemeral/serverless hosting and multiple replicas are unsupported by the current
file-backed session store. Docker Desktop was unavailable for image execution on
the implementation machine; the Next production server and Compose syntax were
tested separately. Run the image smoke test before publishing.

## Hosted setup (for example, a Render Docker web service)

1. Connect `housss77/swissquote-continuity-wallet`, select
   `feat/hackathon-polish`, use the root `Dockerfile`, and disable automatic
   deployment until the smoke test passes. Choose a single service with a
   persistent disk mounted at `/data`; review hosting charges yourself.
2. Reserve its final HTTPS hostname before enrolling passkeys. Configure
   `APP_ORIGIN` as that exact origin, and `NEXT_PUBLIC_PASSKEY_RP_ID` as its
   hostname without scheme or path. The latter is a public **build-time** value;
   changing it requires rebuilding. Keep `CONTINUITY_DATA_DIR=/data`.
3. Configure server-only `SEPOLIA_RPC_URL`, `PIMLICO_API_KEY`,
   `PIMLICO_SPONSORSHIP_POLICY_ID`, and `SPONSORSHIP_PROVIDER=pimlico` in the
   hosting secret settings. Restrict the key/policy to Sepolia, deployment and the
   permitted NFT/USDC contracts; set budget and rate limits. Do not use the old
   `NEXT_PUBLIC_*` credential names in a new deployment.
4. Public build settings for the existing recovery implementation are
   `NEXT_PUBLIC_RECOVERY_MODULE_ADDRESS`, `NEXT_PUBLIC_RECOVERY_DELAY_SECONDS`
   and `NEXT_PUBLIC_VERIFICATION_GAS_BPS` (12000, the validated existing default).
   Use the reviewed test module and 180-second **test-only** delay. Neither setting
   changes a deployed contract. Never reconfigure either acceptance Safe.
5. Leave recovery signer/operator secrets unset if demonstrating only spending
   and historical recovery. Actual recovery on a new disposable Safe additionally
   needs the existing separate server-side relayer/institutional keys, operator
   token, explicit `RECOVERY_ALLOWED_SAFE_ADDRESSES`, signed third-party proof and
   real timelock. Provision these through secure secret settings; do not put them
   in build arguments, screenshots, URLs or chat. The two protected Safes remain
   blocked even if placed in the allowlist.
6. Set the health-check path to `/api/health`. Confirm `/login`, `/demo`,
   `/manifest.webmanifest` and `/apple-icon` load over HTTPS. `/api/health` is only
   liveness, not proof of provider eligibility. Run `npm run mobile:check` with the
   deployment configuration in a secure environment for read-only readiness.
7. Test registration, sign-out, sign-in and a service restart on a **new** phone
   wallet. Wallet identity must survive the restart. Only then perform one
   explicit sponsored activation or funded USDC transfer.

Docker smoke test on a configured host:

```sh
docker compose --env-file .env.local config --quiet
docker compose --env-file .env.local build
docker compose --env-file .env.local up -d
```

These commands start the app, not blockchain deployments. Never delete its
volume or run `down -v` to troubleshoot a live demo. Prefer the hosted provider's
managed HTTPS ingress; preserve the public Host/Origin and deny alternate hosts.

Without Docker, `npm ci`, `npm run build`, then `npm run start` run the supported
Next standalone server locally. The start wrapper copies only public/static
assets and keeps the existing registry in the repository's ignored data folder.
`npm run start:host` listens on all interfaces for a trusted HTTPS reverse proxy;
it does not make HTTP phone passkeys secure. A container uses the same standalone
entrypoint directly with `/data` mounted.

## iPhone: short human test

1. In current Safari, open **the final HTTPS URL `/login`**. Enable your device
   passcode and passkeys/password manager. Choose **Create wallet**, then approve
   the authenticator prompt. A newly created wallet has a new Safe address;
   localhost Windows Hello credentials cannot migrate to this domain.
2. On the wallet page choose **Activate wallet → Review test activation**. Read
   the zero-value NFT mint review, then choose **Confirm with passkey** once.
   This signs and broadcasts a real Sepolia UserOperation. Check the confirmed
   transaction link. If pending/unresolved, check confirmation; do not send again.
3. For USDC, open **Get free test USDC**, copy this exact Safe address and request
   **USDC / Ethereum Sepolia** at Circle. Refresh. If still zero, use the public
   faucet transaction hash check to verify the token, recipient and receipt.
   A faucet click alone does not prove funding.
4. **Send USDC → Review transfer → Confirm with passkey** once, to a distinct
   recipient. Confirmation requires the independent receipt, successful sponsored
   UserOperation event and matching official ERC-20 Transfer. The wallet need not
   hold ETH. The default sponsorship allowance is at most 100 test USDC per send.
5. Safari **Share → Add to Home Screen**. Confirm sign-in on the home-screen app;
   password manager/session behavior can vary. Offline screens cannot send or
   confirm; no background retry is queued. `/demo` always distinguishes earlier
   verified recovery from any current transaction.

An existing accepted wallet remains available in its original Windows browser
context at localhost. Do not create a replacement credential for it merely to
try iPhone UI. Do not change its guardians, owners or modules.

After a genuine recovery on a new disposable wallet, sign out of any old wallet
session and choose the **replacement spending passkey** when signing in again.
The signed replacement metadata registers its public key with the login service;
the old passkey may still authenticate its old web session but cannot authorize
Safe spending once its onchain ownership has been revoked. Registration or a
web session does not prove that its key remains the current owner.

## Security and remaining production work

Server sign-in verifies an origin/RP-bound, single-use, user-verified WebAuthn
assertion with a cryptographic library. A six-hour HttpOnly SameSite Strict
session can request sponsored fees; it cannot sign an onchain transaction.
Spending still needs the Safe owner's WebAuthn signature. Localhost retains the
legacy tutorial workflow; that unauthenticated compatibility path is disabled
on a public deployment, including behind a reverse proxy.

The auth registry, in-memory demo rate limits and file storage need operational
hardening before a banking production launch: durable database transactions,
shared rate limits/account quotas, expired-record cleanup, monitoring, secure
backups and incident procedures. A compromised server can corrupt public wallet
metadata, deny service or consume sponsorship quota; it cannot manufacture a
valid customer spending signature. Recovery still has the separately documented
two-guardian takeover risk and simulated bank identity verification. This task
does not certify banking compliance or provide a native iOS app.

References: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[Render Docker deployments](https://render.com/docs/docker),
[Render persistent disks](https://render.com/docs/disks),
[SimpleWebAuthn server verification](https://simplewebauthn.dev/docs/packages/server),
[Safe passkey tutorial](https://docs.safe.global/advanced/passkeys/tutorials/react).
