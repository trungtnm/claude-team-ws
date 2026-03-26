import { test, expect } from '@playwright/test'

const TEST_API_KEY = process.env.CTW_E2E_API_KEY || 'ctw-e2e-test-key-0000'

test.describe('Authentication', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/board')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Claude Team Workspace')).toBeVisible()
    await expect(page.getByPlaceholder('ctw-')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('shows error on invalid API key', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('ctw-').fill('invalid-key')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  })

  test('successful login redirects to board', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('ctw-').fill(TEST_API_KEY)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/board/, { timeout: 10_000 })
    await expect(page.getByText('Epic Board')).toBeVisible()
  })

  test('authenticated user can access board directly', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.getByPlaceholder('ctw-').fill(TEST_API_KEY)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/board', { timeout: 10_000 })

    // Navigate away and back
    await page.goto('/board')
    await expect(page.getByText('Epic Board')).toBeVisible()
  })
})
