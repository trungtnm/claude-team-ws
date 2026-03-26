import { test, expect, type Page } from '@playwright/test'

const TEST_API_KEY = process.env.CTW_E2E_API_KEY ?? ''

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ctw-').fill(TEST_API_KEY)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/board', { timeout: 10_000 })
}

test.describe('Agents Page', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_API_KEY, 'Set CTW_E2E_API_KEY to run authenticated E2E tests')
    await login(page)
    await page.getByRole('link', { name: 'Agents' }).click()
    await page.waitForURL('**/agents')
  })

  test('renders agents page with session tabs', async ({ page }) => {
    await expect(page.getByText('Agents')).toBeVisible()
    await expect(page.getByText('Active')).toBeVisible()
    await expect(page.getByText('History')).toBeVisible()
  })

  test('has new session button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New Session/ })).toBeVisible()
  })

  test('can open new session dialog', async ({ page }) => {
    await page.getByRole('button', { name: /New Session/ }).click()
    // Dialog should open with prompt input
    await expect(page.getByText('New Session')).toBeVisible()
  })

  test('shows empty state when no sessions', async ({ page }) => {
    // If no sessions exist, should show empty state
    const emptyState = page.getByText('No active sessions')
    const sessionList = page.locator('button[class*="rounded"]')
    // Either shows empty state OR has session items
    const hasContent = await emptyState.isVisible().catch(() => false) ||
      (await sessionList.count()) > 0
    expect(hasContent).toBeTruthy()
  })

  test('can switch between active and history tabs', async ({ page }) => {
    await page.getByText('History').click()
    // Tab should be active (has accent color)
    await expect(page.getByText('History')).toBeVisible()

    await page.getByText('Active').click()
    await expect(page.getByText('Active')).toBeVisible()
  })

  test('has session filter input', async ({ page }) => {
    await expect(page.getByPlaceholder('Filter sessions...')).toBeVisible()
  })
})

test.describe('Captures Page', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_API_KEY, 'Set CTW_E2E_API_KEY to run authenticated E2E tests')
    await login(page)
    await page.getByRole('link', { name: 'Captures' }).click()
    await page.waitForURL('**/captures')
  })

  test('renders captures page', async ({ page }) => {
    await expect(page.getByText('Captures')).toBeVisible()
  })

  test('capture shortcut button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Capture/ })).toBeVisible()
  })
})
