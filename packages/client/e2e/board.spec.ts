import { test, expect } from '@playwright/test'
import { TEST_API_KEY, login } from './helpers'

test.describe('Board Page', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TEST_API_KEY, 'Set CTW_E2E_API_KEY to run authenticated E2E tests')
    await login(page)
  })

  test('renders board with 5 status columns', async ({ page }) => {
    await expect(page.getByText('Epic Board')).toBeVisible()

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
    await expect(page.getByTestId('notification-trigger')).toBeVisible()
  })
})
