import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  // These tests verify the app shell renders correctly
  // They run against the login page since auth is required for inner pages

  test('login page has correct title', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Claude Team Workspace')).toBeVisible()
  })

  test('unknown routes redirect to login (when unauthenticated)', async ({ page }) => {
    await page.goto('/nonexistent-page')
    await expect(page).toHaveURL(/\/login/)
  })

  test('root redirects to login (when unauthenticated)', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
