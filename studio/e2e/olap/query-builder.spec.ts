import { test, expect } from '@playwright/test'

test.describe('OLAP Query Builder - Stage Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should add $match stage', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')

    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$match')
  })

  test.skip('should add $group stage', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-group"]')

    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$group')
  })

  test.skip('should add $project stage', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-project"]')

    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$project')
  })

  test.skip('should add $sort stage', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-sort"]')

    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$sort')
  })

  test.skip('should add $limit stage', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-limit"]')

    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$limit')
  })

  test.skip('should remove stage', async ({ page }) => {
    // Add a stage first
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')

    // Remove it
    await page.click('[data-testid="stage-0-remove"]')

    await expect(page.locator('[data-testid="stage-0"]')).not.toBeVisible()
  })

  test.skip('should reorder stages via drag and drop', async ({ page }) => {
    // Add two stages
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-group"]')

    // Drag stage-1 to stage-0 position
    await page.dragAndDrop('[data-testid="stage-1"]', '[data-testid="stage-0"]')

    // Check order is reversed
    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$group')
    await expect(page.locator('[data-testid="stage-1"]')).toContainText('$match')
  })
})

test.describe('OLAP Query Builder - Stage Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should configure $match with equality condition', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')

    // Configure the match stage
    await page.fill('[data-testid="match-field"]', 'status')
    await page.fill('[data-testid="match-value"]', 'active')

    // Check preview
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('"status": "active"')
  })

  test.skip('should configure $match with comparison operator', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')

    // Configure with $gte operator
    await page.fill('[data-testid="match-field"]', 'age')
    await page.selectOption('[data-testid="match-operator"]', '$gte')
    await page.fill('[data-testid="match-value"]', '18')

    // Check preview
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('$gte')
  })

  test.skip('should configure $group with accumulator', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-group"]')

    // Configure the group stage
    await page.fill('[data-testid="group-by-field"]', 'category')
    await page.click('[data-testid="add-accumulator"]')
    await page.fill('[data-testid="accumulator-name"]', 'count')
    await page.selectOption('[data-testid="accumulator-type"]', '$sum')
    await page.fill('[data-testid="accumulator-value"]', '1')

    // Check preview
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('$group')
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('$sum')
  })

  test.skip('should configure $project with field inclusion', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-project"]')

    // Include specific fields
    await page.click('[data-testid="project-add-field"]')
    await page.fill('[data-testid="project-field-0"]', 'name')
    await page.click('[data-testid="project-include-0"]')

    await page.click('[data-testid="project-add-field"]')
    await page.fill('[data-testid="project-field-1"]', 'email')
    await page.click('[data-testid="project-include-1"]')

    // Check preview
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('"name": 1')
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('"email": 1')
  })

  test.skip('should configure $sort with direction', async ({ page }) => {
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-sort"]')

    // Configure sort
    await page.fill('[data-testid="sort-field"]', 'createdAt')
    await page.selectOption('[data-testid="sort-direction"]', '-1')

    // Check preview
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('"createdAt": -1')
  })
})

test.describe('OLAP Query Builder - Pipeline Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should show empty pipeline message', async ({ page }) => {
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('No stages added')
  })

  test.skip('should update preview in real-time', async ({ page }) => {
    // Add a stage
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')

    // Start typing
    await page.fill('[data-testid="match-field"]', 'sta')

    // Preview should update
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('sta')
  })

  test.skip('should show valid JSON in preview', async ({ page }) => {
    // Add a complete stage
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')
    await page.fill('[data-testid="match-field"]', 'status')
    await page.fill('[data-testid="match-value"]', 'active')

    // Get preview content and validate JSON
    const previewContent = await page.locator('[data-testid="pipeline-preview"]').textContent()
    expect(() => JSON.parse(previewContent || '')).not.toThrow()
  })

  test.skip('should copy pipeline to clipboard', async ({ page }) => {
    // Add a stage
    await page.click('[data-testid="add-stage"]')
    await page.click('[data-testid="stage-type-match"]')
    await page.fill('[data-testid="match-field"]', 'status')
    await page.fill('[data-testid="match-value"]', 'active')

    // Copy to clipboard
    await page.click('[data-testid="copy-pipeline"]')

    // Check for success message
    await expect(page.locator('[data-testid="copy-success"]')).toBeVisible()
  })
})

test.describe('OLAP Query Builder - Templates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test.skip('should load count by field template', async ({ page }) => {
    await page.click('[data-testid="templates-menu"]')
    await page.click('[data-testid="template-count-by-field"]')

    // Should have $group stage with $sum
    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$group')
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('$sum')
  })

  test.skip('should load time series template', async ({ page }) => {
    await page.click('[data-testid="templates-menu"]')
    await page.click('[data-testid="template-time-series"]')

    // Should have date grouping
    await expect(page.locator('[data-testid="pipeline-preview"]')).toContainText('$dateToString')
  })

  test.skip('should load top N template', async ({ page }) => {
    await page.click('[data-testid="templates-menu"]')
    await page.click('[data-testid="template-top-n"]')

    // Should have $sort and $limit
    await expect(page.locator('[data-testid="stage-0"]')).toContainText('$sort')
    await expect(page.locator('[data-testid="stage-1"]')).toContainText('$limit')
  })
})
