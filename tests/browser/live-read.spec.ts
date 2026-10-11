import { test, expect } from '@playwright/test'

test('live Sepolia reads initialize a virtual-passkey Safe without broadcasting', async ({ page, context }) => {
  // Optional provider integration check: real RPC reads, virtual authenticator.
  // No transaction is signed or sent. This does not satisfy live user acceptance.
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Create passkey and initialize Safe' }).click()
  const accountHeading = page.getByRole('heading', { name: '2. Safe account', exact: true })
  const error = page.getByRole('main').getByRole('alert')
  await expect(accountHeading.or(error)).toBeVisible({ timeout: 60_000 })
  expect(await error.count(), await error.count() ? await error.innerText() : '').toBe(0)
  await expect(accountHeading).toBeVisible()
  const safePanel = page.locator('section').filter({ has: page.getByRole('heading', { name: '2. Safe account', exact: true }) })
  await expect(safePanel.getByText('Ethereum Sepolia (11155111)', { exact: true })).toBeVisible()
  await expect(safePanel.getByText('Predicted address: not yet deployed', { exact: true })).toBeVisible()
  const safeAddress = await safePanel.locator('dd code').first().textContent()
  expect(safeAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
  await expect(page.getByRole('heading', { name: 'Confirmed onchain' })).toHaveCount(0)
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
})
