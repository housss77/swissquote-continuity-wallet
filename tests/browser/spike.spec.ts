import { test, expect } from '@playwright/test'

test('startup shows Sepolia and never shows a fabricated success', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Swissquote Continuity Wallet', exact: true })).toBeVisible()
  await expect(page.getByText('Ethereum Sepolia only')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create passkey and initialize Safe' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
})

test('unsupported WebAuthn blocks creation with actionable guidance', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'PublicKeyCredential', { value: undefined }) })
  await page.goto('/')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('WebAuthn ES256 passkeys are unavailable')
  await expect(page.getByRole('button', { name: 'Create passkey and initialize Safe' })).toBeDisabled()
})

test('a rejected browser prompt does not create account metadata or claim success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.credentials, 'create', {
      value: async () => { throw new DOMException('Cancelled', 'NotAllowedError') },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create passkey and initialize Safe' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('cancelled, rejected, or timed out')
  expect(await page.evaluate(() => localStorage.length)).toBe(0)
})

test('virtual authenticator stores public metadata even when the network fails', async ({ page, context }) => {
  // Automation only: this does NOT prove a real user authenticator or onchain operation.
  // No successful blockchain response is mocked and no operation is broadcast.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost') await route.continue()
    else await route.fulfill({ status: 503, body: 'offline test' })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create passkey and initialize Safe' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible({ timeout: 30_000 })
  const keys = await page.evaluate(() => {
    const raw = localStorage.getItem('continuity-wallet-sepolia-passkey-v1')
    if (!raw) return []
    return Object.keys(JSON.parse(raw)).sort()
  })
  expect(keys).toEqual(['coordinates', 'rawId'])
  await expect(page.getByRole('button', { name: 'Authenticate and connect Safe' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
})

test('legacy pending metadata is labelled unknown with no submission acknowledgement', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('continuity-wallet-sepolia-pending-v1', JSON.stringify({
      userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint', description: 'Legacy unit fixture',
    }))
  })
  await page.goto('/')
  await expect(page.getByText('Unknown/unresolved; acceptance or confirmation is uncertain.')).toBeVisible()
  await expect(page.getByText('No submission acknowledgement recorded.', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create passkey and initialize Safe' })).toBeDisabled()
})

test('read-only checks preserve submission diagnostics and never broadcast', async ({ page }) => {
  let broadcasts = 0
  await page.addInitScript(() => {
    localStorage.setItem('continuity-wallet-sepolia-pending-v1', JSON.stringify({
      userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint', description: 'Rejected unit fixture', state: 'rejected', acceptance: 'no',
      submissionError: { stage: 'submit', at: '2026-01-01T00:00:00Z', message: 'AA24 signature error', httpStatus: 200, rpcCode: -32507, acceptance: 'no' },
    }))
  })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === 'localhost') return route.continue()
    const body = route.request().postDataJSON() as { id: number; method: string }
    if (body.method === 'eth_sendUserOperation') broadcasts++
    const result = body.method === 'eth_chainId' ? '0xaa36a7' : body.method === 'pimlico_getUserOperationStatus' ? { status: 'not_found', transactionHash: null } : null
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Check pending operation' }).click()
  await expect(page.getByText('Latest read-only checks:', { exact: false })).toBeVisible()
  await expect(page.getByText('AA24 signature error', { exact: true })).toBeVisible()
  await expect(page.getByText('-32507', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  expect(broadcasts).toBe(0)
})

test('preparation diagnostic failure cannot prompt a passkey, broadcast, or change stored identity/history', async ({ page }) => {
  let broadcasts = 0
  await page.addInitScript(() => {
    // Isolated public metadata fixture; not a real passkey or wallet identity.
    localStorage.setItem('continuity-wallet-sepolia-passkey-v1', JSON.stringify({ rawId: '00', coordinates: { x: `0x${'11'.repeat(32)}`, y: `0x${'22'.repeat(32)}` } }))
    localStorage.setItem('continuity-wallet-sepolia-pending-v1', JSON.stringify({
      userOperationHash: `0x${'11'.repeat(32)}`, safeAddress: '0x1111111111111111111111111111111111111111', kind: 'mint',
      description: 'Tutorial NFT mint: token 7 to this Safe. Zero ETH transferred.', state: 'rejected', acceptance: 'no',
      submissionError: { stage: 'submit', at: '2026-01-01T00:00:00Z', message: 'Gas limit rejected', httpStatus: 200, rpcCode: -32602, acceptance: 'no' },
    }))
    localStorage.setItem('continuity-wallet-sepolia-pending-v1-history', '[{"description":"Preserved test history"}]')
    Object.defineProperty(navigator.credentials, 'get', { value: async () => { throw new Error('Preparation must never request passkey signing') } })
    Object.defineProperty(navigator.credentials, 'create', { value: async () => { throw new Error('Preparation must never create a passkey') } })
  })
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === 'localhost') return route.continue()
    const body = route.request().postDataJSON() as { method?: string }
    if (body?.method === 'eth_sendUserOperation') broadcasts++
    await route.fulfill({ status: 503, body: 'offline preparation fixture' })
  })
  await page.goto('/')
  const storageBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))
  await page.getByRole('button', { name: 'Diagnose NFT sponsorship (no signing or sending)' }).click()
  const report = page.getByRole('region', { name: 'Preparation-only sponsorship diagnostic' }).locator('pre')
  await expect(report).toContainText('"valid": false', { timeout: 30_000 })
  await expect(report).toContainText('"stage": "prepare"')
  await expect(report).toContainText('"acceptance": "no"')
  await expect(report).not.toContainText('Preparation must never')
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()))).toBe(storageBefore)
  expect(broadcasts).toBe(0)
  await expect(page.getByText('Gas limit rejected', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
})
