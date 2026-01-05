import { test, expect } from '@playwright/test'

test.describe('Connection Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('shows empty state when no connections', async ({ page }) => {
    await expect(page.getByText('No connections yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Connection' })).toBeVisible()
  })

  test('can open new connection form', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Connection' }).click()
    await expect(page.getByText('New Connection')).toBeVisible()
    await expect(page.getByLabel('Connection Name')).toBeVisible()
    await expect(page.getByLabel('Connection URL')).toBeVisible()
  })

  test('can cancel connection form', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Connection' }).click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('New Connection')).not.toBeVisible()
  })

  test('can fill in connection details', async ({ page }) => {
    await page.getByRole('button', { name: 'Add Connection' }).click()
    await page.getByLabel('Connection Name').fill('Test Connection')
    await page.getByLabel('Connection URL').fill('mongodo://localhost:8787')
    await expect(page.getByLabel('Connection Name')).toHaveValue('Test Connection')
  })
})
