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
