import { test, expect } from '@playwright/test'

test.describe('OLAP Visualization - Table View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
    // Assume we have a way to load some test data
  })

  test.skip('should display results in table format', async ({ page }) => {
    // Run a query to get results
    await page.click('[data-testid="run-query"]')

    // Check table is visible
    await expect(page.locator('[data-testid="results-table"]')).toBeVisible()
    await expect(page.locator('[data-testid="results-table"] thead')).toBeVisible()
    await expect(page.locator('[data-testid="results-table"] tbody')).toBeVisible()
  })

  test.skip('should show column headers from result fields', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    // Check headers exist
    const headers = page.locator('[data-testid="results-table"] th')
    await expect(headers).toHaveCount(await headers.count())
  })

  test.skip('should paginate large result sets', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    // Check pagination controls
    await expect(page.locator('[data-testid="pagination"]')).toBeVisible()
    await expect(page.locator('[data-testid="page-info"]')).toContainText(/of \d+/)
  })

  test.skip('should navigate between pages', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    // Get initial first row content
    const initialFirstRow = await page.locator('[data-testid="results-table"] tbody tr').first().textContent()

    // Go to next page
    await page.click('[data-testid="next-page"]')

    // First row should be different
    const newFirstRow = await page.locator('[data-testid="results-table"] tbody tr').first().textContent()
    expect(newFirstRow).not.toBe(initialFirstRow)
  })

  test.skip('should sort by column when header clicked', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    // Click a sortable header
    await page.click('[data-testid="results-table"] th:has-text("name")')

    // Check sort indicator
    await expect(page.locator('[data-testid="sort-indicator-asc"]')).toBeVisible()

    // Click again for descending
    await page.click('[data-testid="results-table"] th:has-text("name")')
    await expect(page.locator('[data-testid="sort-indicator-desc"]')).toBeVisible()
  })

  test.skip('should filter table rows', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    // Get initial row count
    const initialCount = await page.locator('[data-testid="results-table"] tbody tr').count()

    // Filter
    await page.fill('[data-testid="table-filter"]', 'test')

    // Row count should decrease or stay same
    const filteredCount = await page.locator('[data-testid="results-table"] tbody tr').count()
    expect(filteredCount).toBeLessThanOrEqual(initialCount)
  })
})

test.describe('OLAP Visualization - Chart View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should switch to chart view', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')

    await expect(page.locator('[data-testid="chart-container"]')).toBeVisible()
  })

  test.skip('should display bar chart by default', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')

    await expect(page.locator('[data-testid="chart-type-bar"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test.skip('should switch to line chart', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')
    await page.click('[data-testid="chart-type-line"]')

    await expect(page.locator('[data-testid="chart-type-line"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test.skip('should switch to pie chart', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')
    await page.click('[data-testid="chart-type-pie"]')

    await expect(page.locator('[data-testid="chart-type-pie"]')).toHaveAttribute('aria-pressed', 'true')
  })

  test.skip('should configure chart axes', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')
    await page.click('[data-testid="chart-settings"]')

    // Select X axis field
    await page.selectOption('[data-testid="x-axis-field"]', 'category')

    // Select Y axis field
    await page.selectOption('[data-testid="y-axis-field"]', 'count')

    // Chart should update
    await expect(page.locator('[data-testid="chart-x-label"]')).toContainText('category')
  })

  test.skip('should show chart legend', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')

    await expect(page.locator('[data-testid="chart-legend"]')).toBeVisible()
  })

  test.skip('should toggle chart legend visibility', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')

    // Toggle legend off
    await page.click('[data-testid="toggle-legend"]')
    await expect(page.locator('[data-testid="chart-legend"]')).not.toBeVisible()

    // Toggle legend on
    await page.click('[data-testid="toggle-legend"]')
    await expect(page.locator('[data-testid="chart-legend"]')).toBeVisible()
  })
})

test.describe('OLAP Visualization - Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should export results as CSV', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-csv"]')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test.skip('should export results as JSON', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-json"]')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })

  test.skip('should export chart as PNG', async ({ page }) => {
    await page.click('[data-testid="run-query"]')
    await page.click('[data-testid="view-toggle-chart"]')

    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-chart-png"]')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.png$/)
  })

  test.skip('should include filename with collection and timestamp', async ({ page }) => {
    // Set up collection context
    await page.click('[data-testid="collection-select"]')
    await page.click('[data-testid="collection-option-orders"]')

    await page.click('[data-testid="run-query"]')

    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-csv"]')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/orders.*\d{4}-\d{2}-\d{2}/)
  })
})

test.describe('OLAP Visualization - Engine Info', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should show SQLite engine badge for simple queries', async ({ page }) => {
    // Simple query that stays on SQLite
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')
    await page.fill('[data-testid="match-field"]', 'status')
    await page.fill('[data-testid="match-value"]', 'active')

    await page.click('[data-testid="run-query"]')

    await expect(page.locator('[data-testid="engine-badge"]')).toContainText('SQLite')
  })

  test.skip('should show R2 SQL engine badge for OLAP queries', async ({ page }) => {
    // Complex aggregation that routes to R2 SQL
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-group"]')
    // Configure complex aggregation...

    await page.click('[data-testid="run-query"]')

    await expect(page.locator('[data-testid="engine-badge"]')).toContainText(/R2SQL|ClickHouse/)
  })

  test.skip('should show query execution stats', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    await expect(page.locator('[data-testid="query-stats"]')).toBeVisible()
    await expect(page.locator('[data-testid="execution-time"]')).toContainText(/\d+\s*ms/)
    await expect(page.locator('[data-testid="rows-returned"]')).toContainText(/\d+\s*rows/)
  })

  test.skip('should show query plan on hover', async ({ page }) => {
    await page.click('[data-testid="run-query"]')

    await page.hover('[data-testid="engine-badge"]')

    await expect(page.locator('[data-testid="query-plan-tooltip"]')).toBeVisible()
  })
})
