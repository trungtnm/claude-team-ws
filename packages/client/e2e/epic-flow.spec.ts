import { test, expect, type Page } from '@playwright/test'

const TEST_API_KEY = process.env.CTW_E2E_API_KEY || 'ctw-e2e-test-key-0000'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ctw-').fill(TEST_API_KEY)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/board', { timeout: 10_000 })
}

test.describe('Epic Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('create epic dialog has required fields', async ({ page }) => {
    await page.getByRole('button', { name: /Epic/ }).click()

    // Dialog should have title, description, and priority fields
    await expect(page.getByLabel('Title')).toBeVisible()
    await expect(page.getByLabel('Description')).toBeVisible()
  })

  test('create epic dialog validates required title', async ({ page }) => {
    await page.getByRole('button', { name: /Epic/ }).click()

    // Try to submit without title
    const createButton = page.getByRole('button', { name: /Create/ })
    if (await createButton.isVisible()) {
      await createButton.click()
      // Should show validation error or remain on dialog
      await expect(page.getByText('Create Epic')).toBeVisible()
    }
  })
})

test.describe('Page Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigate from board to captures', async ({ page }) => {
    await page.getByRole('link', { name: 'Captures' }).click()
    await expect(page).toHaveURL(/\/captures/)
    await expect(page.getByText('Captures')).toBeVisible()
  })

  test('navigate from board to agents', async ({ page }) => {
    await page.getByRole('link', { name: 'Agents' }).click()
    await expect(page).toHaveURL(/\/agents/)
    await expect(page.getByText('Agents')).toBeVisible()
  })

  test('navigate from board to graph', async ({ page }) => {
    await page.getByRole('link', { name: 'Graph' }).click()
    await expect(page).toHaveURL(/\/graph/)
  })

  test('navigate from board to settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByText('Settings')).toBeVisible()
  })
})
