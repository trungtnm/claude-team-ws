import { test, expect } from '@playwright/test'

test('app loads and shows header', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('text=Claude Team WS')).toBeVisible()
})

test('navigates to board page by default', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/board/)
})

test('sidebar navigation works', async ({ page }) => {
  await page.goto('/')

  // Click Agents nav item
  await page.click('a[href="/agents"]')
  await expect(page).toHaveURL(/\/agents/)

  // Click Graph nav item (Vietnamese label)
  await page.click('a[href="/graph"]')
  await expect(page).toHaveURL(/\/graph/)

  // Click Settings nav item (Vietnamese label)
  await page.click('a[href="/settings"]')
  await expect(page).toHaveURL(/\/settings/)
})
