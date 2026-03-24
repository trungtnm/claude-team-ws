import { test, expect } from '@playwright/test'

test.describe('Smoke Tests', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Claude Team Workspace/)
  })

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/projects/test/board')
    // Should redirect to login since no auth
    await expect(page).toHaveURL(/\/login/)
  })

  test('health check API responds', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/health')
    expect(response.ok()).toBeTruthy()
    const body = await response.json()
    expect(body.service).toBe('ctw-server')
    expect(body.status).toBeDefined()
  })
})
