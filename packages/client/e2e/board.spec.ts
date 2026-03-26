import { test, expect, type Page } from '@playwright/test'

const TEST_API_KEY = process.env.CTW_E2E_API_KEY || 'ctw-e2e-test-key-0000'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('ctw-').fill(TEST_API_KEY)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Wait for redirect to board
  await page.waitForURL('**/board', { timeout: 10_000 })
}

test.describe('Board Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('renders board with 5 status columns', async ({ page }) => {
    await expect(page.getByText('Epic Board')).toBeVisible()

    // Check all 5 status columns are visible
    await expect(page.getByText('Blocked')).toBeVisible()
    await expect(page.getByText('Ready')).toBeVisible()
    await expect(page.getByText('In Progress')).toBeVisible()
    await expect(page.getByText('In Review')).toBeVisible()
    await expect(page.getByText('Done')).toBeVisible()
  })

  test('header navigation links are present', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Board' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Captures' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Agents' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Graph' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  })

  test('can open create epic dialog', async ({ page }) => {
    await page.getByRole('button', { name: /Epic/ }).click()
    await expect(page.getByText('Create Epic')).toBeVisible()
  })

  test('capture shortcut button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Capture/ })).toBeVisible()
  })

  test('notification bell is visible', async ({ page }) => {
    // Notification dropdown trigger should be present
    await expect(page.locator('[data-testid="notification-trigger"], button:has(> svg.lucide-bell)')).toBeVisible()
  })
})
