import { test, expect } from '@playwright/test'

test.describe('Board page', () => {
  test('shows 5 kanban columns', async ({ page }) => {
    await page.goto('/board')

    // The board page has 5 columns with Vietnamese labels
    await expect(page.locator('text=Nháp')).toBeVisible()
    await expect(page.locator('text=Sẵn sàng')).toBeVisible()
    await expect(page.locator('text=Đang thực hiện')).toBeVisible()
    await expect(page.locator('text=Đang xem xét')).toBeVisible()
    await expect(page.locator('text=Hoàn thành')).toBeVisible()
  })

  test('shows Epic Board heading', async ({ page }) => {
    await page.goto('/board')
    await expect(page.locator('h1', { hasText: 'Epic Board' })).toBeVisible()
  })
})
