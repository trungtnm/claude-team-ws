import { test, expect } from '@playwright/test'
import { TEST_API_KEY, login } from './helpers'

test.describe('Epic Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_API_KEY, 'Set CTW_E2E_API_KEY to run authenticated E2E tests')
    await login(page)
  })

  test('create epic dialog has required fields', async ({ page }) => {
    await page.getByRole('button', { name: /Epic/ }).click()

    await expect(page.getByLabel('Title')).toBeVisible()
    await expect(page.getByLabel('Description')).toBeVisible()
  })

  test('create epic dialog validates required title', async ({ page }) => {
    await page.getByRole('button', { name: /Epic/ }).click()

    const createButton = page.getByRole('button', { name: /Create/ })
    if (await createButton.isVisible()) {
      await createButton.click()
      await expect(page.getByText('Create Epic')).toBeVisible()
    }
  })
})

test.describe('Page Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_API_KEY, 'Set CTW_E2E_API_KEY to run authenticated E2E tests')
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
