import { test, expect } from '@playwright/test'

test.describe('OLAP Dashboard - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a collection first
    await page.goto('/')
    // Wait for app to load
    await page.waitForSelector('[data-testid="app-shell"]', { timeout: 10000 })
  })

  test('should show Analytics tab in collection page', async ({ page }) => {
    // Navigate to a collection
    await page.click('[data-testid="collection-item"]')

    // Check for Analytics tab
    await expect(page.locator('button:has-text("Analytics")')).toBeVisible()
  })

  test('should navigate to Analytics tab when clicked', async ({ page }) => {
    // Navigate to a collection
    await page.click('[data-testid="collection-item"]')

    // Click Analytics tab
    await page.click('button:has-text("Analytics")')

    // Check for Analytics content
    await expect(page.locator('text=OLAP Analytics dashboard')).toBeVisible()
  })

  test('should show R2 Datalake integration message', async ({ page }) => {
    // Navigate to a collection
    await page.click('[data-testid="collection-item"]')

    // Click Analytics tab
    await page.click('button:has-text("Analytics")')

    // Check for R2 Datalake reference
    await expect(page.locator('text=R2 Datalake')).toBeVisible()
  })
})

test.describe('OLAP Dashboard - Query Builder', () => {
  test.skip('should show collection selector when dashboard is implemented', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.locator('[data-testid="collection-select"]')).toBeVisible()
  })

  test.skip('should show date range picker when dashboard is implemented', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.locator('[data-testid="date-range-picker"]')).toBeVisible()
  })

  test.skip('should show add stage button when dashboard is implemented', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.locator('[data-testid="add-stage"]')).toBeVisible()
  })

  test.skip('should build simple aggregation visually', async ({ page }) => {
    await page.goto('/analytics')

    // Add a $match stage
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-match"]')

    // Configure the stage
    await page.fill('[data-testid="field-name"]', 'status')
    await page.fill('[data-testid="field-value"]', 'completed')

    // Check pipeline preview
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('$match')
  })
})

test.describe('OLAP Dashboard - Query Execution', () => {
  test.skip('should execute query and show results', async ({ page }) => {
    await page.goto('/analytics')

    // Select a collection
    await page.click('[data-testid="collection-select"]')
    await page.click('[data-testid="collection-option-users"]')

    // Run the query
    await page.click('[data-testid="run-query"]')

    // Check for results
    await expect(page.locator('[data-testid="results-table"]')).toBeVisible()
  })

  test.skip('should show engine routing info after query', async ({ page }) => {
    await page.goto('/analytics')

    // Select a collection and run a query
    await page.click('[data-testid="collection-select"]')
    await page.click('[data-testid="collection-option-users"]')
    await page.click('[data-testid="run-query"]')

    // Check for engine badge
    await expect(page.locator('[data-testid="engine-badge"]')).toHaveText(/SQLite|R2SQL|ClickHouse/)
  })

  test.skip('should show query execution time', async ({ page }) => {
    await page.goto('/analytics')

    // Run a query
    await page.click('[data-testid="run-query"]')

    // Check for execution time
    await expect(page.locator('[data-testid="execution-time"]')).toBeVisible()
  })
})

test.describe('OLAP Dashboard - Results Visualization', () => {
  test.skip('should render results as table by default', async ({ page }) => {
    await page.goto('/analytics')

    // Run a query
    await page.click('[data-testid="run-query"]')

    // Check for table view
    await expect(page.locator('[data-testid="results-table"]')).toBeVisible()
  })

  test.skip('should toggle to chart view', async ({ page }) => {
    await page.goto('/analytics')

    // Run a query
    await page.click('[data-testid="run-query"]')

    // Switch to chart view
    await page.click('[data-testid="view-chart"]')

    // Check for chart
    await expect(page.locator('[data-testid="chart-container"]')).toBeVisible()
  })

  test.skip('should export results as CSV', async ({ page }) => {
    await page.goto('/analytics')

    // Run a query
    await page.click('[data-testid="run-query"]')

    // Export as CSV
    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-csv"]')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test.skip('should export results as JSON', async ({ page }) => {
    await page.goto('/analytics')

    // Run a query
    await page.click('[data-testid="run-query"]')

    // Export as JSON
    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-json"]')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })
})
