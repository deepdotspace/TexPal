import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * Smoke tests run against `/`, which renders the public landing page
 * (signed-in users who have already seen it are redirected to /home).
 */
test.describe('Smoke tests', () => {
  test('landing page loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await expect(page.getByTestId('landing-page')).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  })

  test('unknown route shows the 404 page', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await expect(page.getByText('404')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Page not found')).toBeVisible()
  })
})
