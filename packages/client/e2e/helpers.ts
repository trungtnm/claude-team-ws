import type { Page } from '@playwright/test'

export const TEST_API_KEY = process.env.CTW_E2E_API_KEY ?? ''

export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('ctw-').fill(TEST_API_KEY)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/board', { timeout: 10_000 })
}
