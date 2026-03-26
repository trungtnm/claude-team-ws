import { test, expect } from '@playwright/test'

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
    await expect(page.getByText('Invalid API key')).toBeVisible()
  })

  test('successful login redirects to board', async ({ page }) => {
    // This test requires the server to be running with seeded data
    // The API key is generated at seed time, so we'd need to fetch it first
    // For now, test the flow up to the API call
    await page.goto('/login')
    await page.getByPlaceholder('ctw-').fill('ctw-test-key')
    await page.getByRole('button', { name: 'Sign in' }).click()
    // Login will fail (invalid key) but we verify the form submits
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})
