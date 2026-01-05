import { test, expect } from '@playwright/test'

/**
 * RED Phase E2E Tests for Aggregation Builder
 *
 * These tests verify the Aggregation Builder component's ability to:
 * 1. Build a pipeline visually using the stage editor
 * 2. Run the pipeline against a collection
 * 3. View and interact with results
 *
 * These tests are expected to FAIL in the RED phase because the
 * aggregation builder functionality with backend integration isn't complete.
 *
 * The tests assume a connected database with the 'testdb' database and
 * 'users' collection containing sample documents.
 */

test.describe('Aggregation Builder - Pipeline Building', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to collection page and switch to Aggregation tab
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByRole('tab', { name: 'Aggregation' })).toBeVisible()
    await page.getByRole('tab', { name: 'Aggregation' }).click()

    // Wait for the aggregation builder to be visible
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()
  })

  test('displays empty pipeline state', async ({ page }) => {
    // Should show empty state message when no stages are added
    await expect(page.getByTestId('pipeline-empty-state')).toBeVisible()
    await expect(page.getByText('No stages added')).toBeVisible()

    // Add Stage button should be visible
    await expect(page.getByTestId('add-stage-button')).toBeVisible()
  })

  test('adds a $match stage to pipeline', async ({ page }) => {
    // Click Add Stage button
    await page.getByTestId('add-stage-button').click()

    // Should show stage type menu
    await expect(page.getByTestId('stage-type-menu')).toBeVisible()

    // Select $match stage type
    await page.getByTestId('stage-type-match').click()

    // Stage should be added to pipeline
    await expect(page.getByTestId('pipeline-stage-0')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$match')

    // Stage editor should show field inputs
    await expect(page.getByTestId('match-field-input')).toBeVisible()
    await expect(page.getByTestId('match-operator-select')).toBeVisible()
    await expect(page.getByTestId('match-value-input')).toBeVisible()
  })

  test('adds a $group stage with accumulator', async ({ page }) => {
    // Add $group stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()

    // Stage should be added
    await expect(page.getByTestId('pipeline-stage-0')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$group')

    // Configure group by field
    await page.getByTestId('group-by-field-input').fill('status')

    // Add an accumulator
    await page.getByTestId('add-accumulator-button').click()
    await expect(page.getByTestId('accumulator-0')).toBeVisible()

    // Configure accumulator
    await page.getByTestId('accumulator-name-input').fill('count')
    await page.getByTestId('accumulator-type-select').click()
    await page.getByRole('option', { name: 'sum' }).click()
    await page.getByTestId('accumulator-value-input').fill('1')

    // Verify pipeline preview shows the configuration
    await expect(page.getByTestId('pipeline-preview')).toContainText('$group')
    await expect(page.getByTestId('pipeline-preview')).toContainText('$sum')
  })

  test('adds a $project stage with field selection', async ({ page }) => {
    // Add $project stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-project').click()

    // Stage should be added
    await expect(page.getByTestId('pipeline-stage-0')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$project')

    // Add fields to project
    await page.getByTestId('project-add-field-button').click()
    await page.getByTestId('project-field-name-0').fill('name')
    await page.getByTestId('project-field-include-0').click()

    await page.getByTestId('project-add-field-button').click()
    await page.getByTestId('project-field-name-1').fill('email')
    await page.getByTestId('project-field-include-1').click()

    // Verify pipeline preview
    await expect(page.getByTestId('pipeline-preview')).toContainText('"name": 1')
    await expect(page.getByTestId('pipeline-preview')).toContainText('"email": 1')
  })

  test('adds a $sort stage', async ({ page }) => {
    // Add $sort stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-sort').click()

    // Configure sort
    await page.getByTestId('sort-field-input').fill('createdAt')
    await page.getByTestId('sort-direction-select').click()
    await page.getByRole('option', { name: /descending/i }).click()

    // Verify preview
    await expect(page.getByTestId('pipeline-preview')).toContainText('"createdAt": -1')
  })

  test('adds a $limit stage', async ({ page }) => {
    // Add $limit stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-limit').click()

    // Configure limit
    await page.getByTestId('limit-value-input').fill('10')

    // Verify preview
    await expect(page.getByTestId('pipeline-preview')).toContainText('$limit')
    await expect(page.getByTestId('pipeline-preview')).toContainText('10')
  })

  test('adds a $skip stage', async ({ page }) => {
    // Add $skip stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-skip').click()

    // Configure skip
    await page.getByTestId('skip-value-input').fill('5')

    // Verify preview
    await expect(page.getByTestId('pipeline-preview')).toContainText('$skip')
    await expect(page.getByTestId('pipeline-preview')).toContainText('5')
  })

  test('adds a $unwind stage', async ({ page }) => {
    // Add $unwind stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-unwind').click()

    // Configure unwind path
    await page.getByTestId('unwind-path-input').fill('$tags')

    // Verify preview
    await expect(page.getByTestId('pipeline-preview')).toContainText('$unwind')
    await expect(page.getByTestId('pipeline-preview')).toContainText('$tags')
  })

  test('builds a multi-stage pipeline', async ({ page }) => {
    // Add $match stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Add $group stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()
    await page.getByTestId('group-by-field-input').fill('category')
    await page.getByTestId('add-accumulator-button').click()
    await page.getByTestId('accumulator-name-input').fill('total')
    await page.getByTestId('accumulator-type-select').click()
    await page.getByRole('option', { name: 'count' }).click()

    // Add $sort stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-sort').click()
    await page.getByTestId('sort-field-input').fill('total')
    await page.getByTestId('sort-direction-select').click()
    await page.getByRole('option', { name: /descending/i }).click()

    // Add $limit stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-limit').click()
    await page.getByTestId('limit-value-input').fill('5')

    // Verify all stages are visible
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$match')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$group')
    await expect(page.getByTestId('pipeline-stage-2')).toContainText('$sort')
    await expect(page.getByTestId('pipeline-stage-3')).toContainText('$limit')

    // Verify stage count indicator
    await expect(page.getByTestId('pipeline-stage-count')).toContainText('4 stages')
  })

  test('removes a stage from pipeline', async ({ page }) => {
    // Add two stages
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-limit').click()

    // Verify both stages exist
    await expect(page.getByTestId('pipeline-stage-0')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-1')).toBeVisible()

    // Remove first stage
    await page.getByTestId('pipeline-stage-0-remove').click()

    // First stage should now be $limit
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$limit')
    await expect(page.getByTestId('pipeline-stage-1')).not.toBeVisible()
  })

  test('reorders stages via drag and drop', async ({ page }) => {
    // Add $match and $group stages
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()

    // Verify initial order
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$match')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$group')

    // Drag stage-1 above stage-0
    const stage1 = page.getByTestId('pipeline-stage-1-drag-handle')
    const stage0 = page.getByTestId('pipeline-stage-0')
    await stage1.dragTo(stage0)

    // Verify new order
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$group')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$match')
  })

  test('moves stage up with button', async ({ page }) => {
    // Add two stages
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()

    // Click move up button on second stage
    await page.getByTestId('pipeline-stage-1-move-up').click()

    // Verify reordering
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$group')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$match')
  })

  test('moves stage down with button', async ({ page }) => {
    // Add two stages
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()

    // Click move down button on first stage
    await page.getByTestId('pipeline-stage-0-move-down').click()

    // Verify reordering
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$group')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$match')
  })

  test('duplicates a stage', async ({ page }) => {
    // Add a stage with configuration
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Click duplicate button
    await page.getByTestId('pipeline-stage-0-duplicate').click()

    // Should have two identical stages
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$match')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$match')

    // Both should have the same configuration
    await expect(page.getByTestId('pipeline-preview')).toContainText('"status": "active"')
  })

  test('toggles stage enabled/disabled', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Stage should be enabled by default
    await expect(page.getByTestId('pipeline-stage-0-toggle')).toBeChecked()

    // Disable the stage
    await page.getByTestId('pipeline-stage-0-toggle').click()
    await expect(page.getByTestId('pipeline-stage-0-toggle')).not.toBeChecked()

    // Stage should appear visually disabled
    await expect(page.getByTestId('pipeline-stage-0')).toHaveClass(/disabled/)

    // Pipeline preview should not include disabled stage
    await expect(page.getByTestId('pipeline-preview')).not.toContainText('$match')
  })

  test('collapses and expands stage editor', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    // Stage content should be visible
    await expect(page.getByTestId('match-field-input')).toBeVisible()

    // Collapse the stage
    await page.getByTestId('pipeline-stage-0-collapse').click()

    // Stage content should be hidden
    await expect(page.getByTestId('match-field-input')).not.toBeVisible()

    // Expand the stage
    await page.getByTestId('pipeline-stage-0-expand').click()

    // Stage content should be visible again
    await expect(page.getByTestId('match-field-input')).toBeVisible()
  })

  test('clears entire pipeline', async ({ page }) => {
    // Add multiple stages
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-limit').click()

    // Click clear pipeline button
    await page.getByTestId('clear-pipeline-button').click()

    // Confirm in dialog
    await page.getByRole('button', { name: /confirm|clear/i }).click()

    // Pipeline should be empty
    await expect(page.getByTestId('pipeline-empty-state')).toBeVisible()
    await expect(page.getByTestId('pipeline-stage-0')).not.toBeVisible()
  })

  test('shows pipeline preview in JSON format', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Pipeline preview should show valid JSON
    const previewContent = await page.getByTestId('pipeline-preview').textContent()
    expect(previewContent).toBeTruthy()

    // Should be valid JSON
    expect(() => JSON.parse(previewContent!)).not.toThrow()

    // Should contain expected structure
    const pipeline = JSON.parse(previewContent!)
    expect(Array.isArray(pipeline)).toBe(true)
    expect(pipeline[0]).toHaveProperty('$match')
  })

  test('copies pipeline JSON to clipboard', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Click copy button
    await page.getByTestId('copy-pipeline-button').click()

    // Should show success message
    await expect(page.getByText(/copied/i)).toBeVisible()
  })

  test('validates stage configuration', async ({ page }) => {
    // Add a $match stage without configuring it
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    // Leave fields empty and try to run
    await page.getByTestId('run-pipeline-button').click()

    // Should show validation error
    await expect(page.getByTestId('validation-error')).toBeVisible()
    await expect(page.getByTestId('validation-error')).toContainText(/field.*required/i)
  })

  test('updates preview in real-time as fields change', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    // Start typing in field
    await page.getByTestId('match-field-input').fill('st')

    // Preview should update in real-time
    await expect(page.getByTestId('pipeline-preview')).toContainText('st')

    // Continue typing
    await page.getByTestId('match-field-input').fill('status')
    await expect(page.getByTestId('pipeline-preview')).toContainText('status')
  })
})

test.describe('Aggregation Builder - Run Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await page.getByRole('tab', { name: 'Aggregation' }).click()
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()
  })

  test('runs a simple $match pipeline', async ({ page }) => {
    // Add $match stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Click run button
    await page.getByTestId('run-pipeline-button').click()

    // Should show loading state
    await expect(page.getByTestId('pipeline-loading')).toBeVisible()

    // Should show results
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Should show result count
    await expect(page.getByTestId('result-count')).toBeVisible()
    const countText = await page.getByTestId('result-count').textContent()
    expect(countText).toMatch(/\d+/)
  })

  test('runs a $group aggregation pipeline', async ({ page }) => {
    // Add $group stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()
    await page.getByTestId('group-by-field-input').fill('status')
    await page.getByTestId('add-accumulator-button').click()
    await page.getByTestId('accumulator-name-input').fill('count')
    await page.getByTestId('accumulator-type-select').click()
    await page.getByRole('option', { name: 'sum' }).click()
    await page.getByTestId('accumulator-value-input').fill('1')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()

    // Wait for results
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Results should show grouped data with _id and count fields
    const resultsContent = await page.getByTestId('pipeline-results').textContent()
    expect(resultsContent).toContain('_id')
    expect(resultsContent).toContain('count')
  })

  test('runs a complex multi-stage pipeline', async ({ page }) => {
    // Build a complex pipeline: $match -> $group -> $sort -> $limit
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('active')
    await page.getByTestId('match-value-input').fill('true')

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-group').click()
    await page.getByTestId('group-by-field-input').fill('category')
    await page.getByTestId('add-accumulator-button').click()
    await page.getByTestId('accumulator-name-input').fill('total')
    await page.getByTestId('accumulator-type-select').click()
    await page.getByRole('option', { name: 'count' }).click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-sort').click()
    await page.getByTestId('sort-field-input').fill('total')
    await page.getByTestId('sort-direction-select').click()
    await page.getByRole('option', { name: /descending/i }).click()

    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-limit').click()
    await page.getByTestId('limit-value-input').fill('10')

    // Run the pipeline
    await page.getByTestId('run-pipeline-button').click()

    // Wait for results
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Should show execution time
    await expect(page.getByTestId('execution-time')).toBeVisible()
    const timeText = await page.getByTestId('execution-time').textContent()
    expect(timeText).toMatch(/\d+\s*(ms|s)/)
  })

  test('shows error when pipeline fails', async ({ page }) => {
    // Add a stage with invalid configuration
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('$invalidField')
    await page.getByTestId('match-operator-select').click()
    await page.getByRole('option', { name: /regex/i }).click()
    await page.getByTestId('match-value-input').fill('[invalid regex')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()

    // Should show error
    await expect(page.getByTestId('pipeline-error')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('pipeline-error')).toContainText(/error/i)
  })

  test('cancels running pipeline', async ({ page }) => {
    // Add a stage that might take time
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()

    // Should show cancel button during loading
    await expect(page.getByTestId('cancel-pipeline-button')).toBeVisible()

    // Click cancel
    await page.getByTestId('cancel-pipeline-button').click()

    // Loading should stop
    await expect(page.getByTestId('pipeline-loading')).not.toBeVisible()

    // Should show cancelled message
    await expect(page.getByText(/cancelled/i)).toBeVisible()
  })

  test('disables run button during execution', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()

    // Run button should be disabled
    await expect(page.getByTestId('run-pipeline-button')).toBeDisabled()

    // Wait for completion
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Run button should be enabled again
    await expect(page.getByTestId('run-pipeline-button')).toBeEnabled()
  })

  test('runs pipeline with keyboard shortcut', async ({ page }) => {
    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Use keyboard shortcut to run (Cmd+Enter or Ctrl+Enter)
    await page.keyboard.press('Meta+Enter')

    // Should show loading and then results
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })
  })

  test('re-runs pipeline with modified stages', async ({ page }) => {
    // Add and run initial stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Get initial result count
    const initialCount = await page.getByTestId('result-count').textContent()

    // Modify the filter value
    await page.getByTestId('match-value-input').fill('inactive')

    // Re-run pipeline
    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-loading')).toBeVisible()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Result count should potentially be different
    const newCount = await page.getByTestId('result-count').textContent()
    // The counts might be the same or different - we just verify it ran again
    expect(newCount).toBeTruthy()
  })

  test('shows sample documents option for large results', async ({ page }) => {
    // Add a stage that returns many documents
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-limit').click()
    await page.getByTestId('limit-value-input').fill('1000')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Should show option to load more or indicate sampling
    const hasSampleIndicator = await page.getByTestId('sample-mode-indicator').isVisible().catch(() => false)
    const hasLoadMore = await page.getByTestId('load-more-results').isVisible().catch(() => false)
    expect(hasSampleIndicator || hasLoadMore).toBe(true)
  })
})

test.describe('Aggregation Builder - View Results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await page.getByRole('tab', { name: 'Aggregation' }).click()
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()

    // Build and run a simple pipeline to get results
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')
    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })
  })

  test('displays results in JSON view by default', async ({ page }) => {
    // Results should be in JSON format
    await expect(page.getByTestId('results-json-view')).toBeVisible()

    // Should show proper JSON structure
    const content = await page.getByTestId('results-json-view').textContent()
    expect(content).toContain('{')
    expect(content).toContain('}')
  })

  test('switches to table view', async ({ page }) => {
    // Click table view toggle
    await page.getByTestId('results-view-table').click()

    // Table view should be visible
    await expect(page.getByTestId('results-table-view')).toBeVisible()

    // Should have column headers
    await expect(page.getByTestId('results-table-header')).toBeVisible()

    // Should have rows
    const rows = page.getByTestId('results-table-row')
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('switches back to JSON view', async ({ page }) => {
    // Switch to table first
    await page.getByTestId('results-view-table').click()
    await expect(page.getByTestId('results-table-view')).toBeVisible()

    // Switch back to JSON
    await page.getByTestId('results-view-json').click()

    // JSON view should be visible
    await expect(page.getByTestId('results-json-view')).toBeVisible()
  })

  test('expands and collapses JSON objects', async ({ page }) => {
    // Find expand/collapse toggle in JSON view
    const toggles = page.getByTestId('json-expand-toggle')
    const count = await toggles.count()

    if (count > 0) {
      // Click to collapse
      await toggles.first().click()

      // Should show collapsed indicator
      await expect(page.getByTestId('json-collapsed-indicator').first()).toBeVisible()

      // Click to expand
      await toggles.first().click()

      // Should show expanded content
      await expect(page.getByTestId('json-expanded-content').first()).toBeVisible()
    }
  })

  test('displays document count', async ({ page }) => {
    const resultCount = page.getByTestId('result-count')
    await expect(resultCount).toBeVisible()

    const text = await resultCount.textContent()
    expect(text).toMatch(/\d+\s*(documents?|results?)/i)
  })

  test('displays execution time', async ({ page }) => {
    const execTime = page.getByTestId('execution-time')
    await expect(execTime).toBeVisible()

    const text = await execTime.textContent()
    expect(text).toMatch(/\d+\s*(ms|s|milliseconds?|seconds?)/i)
  })

  test('copies single result document', async ({ page }) => {
    // Find copy button on first result document
    await page.getByTestId('result-document-0-copy').click()

    // Should show success message
    await expect(page.getByText(/copied/i)).toBeVisible()
  })

  test('copies all results', async ({ page }) => {
    // Click copy all results button
    await page.getByTestId('copy-all-results-button').click()

    // Should show success message
    await expect(page.getByText(/copied/i)).toBeVisible()
  })

  test('exports results as JSON file', async ({ page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent('download')

    // Click export button
    await page.getByTestId('export-results-button').click()
    await page.getByRole('menuitem', { name: /json/i }).click()

    // Should trigger download
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })

  test('exports results as CSV file', async ({ page }) => {
    // Set up download listener
    const downloadPromise = page.waitForEvent('download')

    // Click export button
    await page.getByTestId('export-results-button').click()
    await page.getByRole('menuitem', { name: /csv/i }).click()

    // Should trigger download
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
  })

  test('navigates through paginated results', async ({ page }) => {
    // Check if pagination is present (for large result sets)
    const pagination = page.getByTestId('results-pagination')
    const hasPagination = await pagination.isVisible().catch(() => false)

    if (hasPagination) {
      // Get initial page content
      const initialContent = await page.getByTestId('result-document-0').textContent()

      // Go to next page
      await page.getByTestId('results-next-page').click()

      // Content should be different
      await expect(page.getByTestId('result-document-0')).toBeVisible()
      const newContent = await page.getByTestId('result-document-0').textContent()
      expect(newContent).not.toBe(initialContent)
    }
  })

  test('shows stage-by-stage output view', async ({ page }) => {
    // Click on stage output view toggle
    await page.getByTestId('show-stage-outputs-toggle').click()

    // Should show output for each stage
    await expect(page.getByTestId('stage-0-output')).toBeVisible()

    // Stage output should show document count after that stage
    const stageOutput = await page.getByTestId('stage-0-output').textContent()
    expect(stageOutput).toMatch(/\d+\s*(documents?|results?)/i)
  })

  test('inspects individual document in detail view', async ({ page }) => {
    // Click on a document to view details
    await page.getByTestId('result-document-0').click()

    // Document detail view should appear
    await expect(page.getByTestId('document-detail-view')).toBeVisible()

    // Should show all document fields
    await expect(page.getByTestId('document-detail-view')).toContainText('_id')

    // Close detail view
    await page.getByTestId('close-document-detail').click()
    await expect(page.getByTestId('document-detail-view')).not.toBeVisible()
  })

  test('filters results in view', async ({ page }) => {
    // Type in results filter input
    await page.getByTestId('results-filter-input').fill('test')

    // Results should be filtered
    await expect(page.getByTestId('filtered-results-count')).toBeVisible()
    const filteredCount = await page.getByTestId('filtered-results-count').textContent()
    expect(filteredCount).toMatch(/\d+.*showing|showing.*\d+/i)
  })

  test('shows empty results message when no documents match', async ({ page }) => {
    // First, clear existing pipeline and build one that returns no results
    await page.getByTestId('clear-pipeline-button').click()
    await page.getByRole('button', { name: /confirm|clear/i }).click()

    // Add a match stage that won't match anything
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('nonexistent_field')
    await page.getByTestId('match-value-input').fill('impossible_value_12345')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Should show empty results message
    await expect(page.getByTestId('empty-results-message')).toBeVisible()
    await expect(page.getByText(/no results|no documents|0 documents/i)).toBeVisible()
  })

  test('preserves view mode across pipeline re-runs', async ({ page }) => {
    // Switch to table view
    await page.getByTestId('results-view-table').click()
    await expect(page.getByTestId('results-table-view')).toBeVisible()

    // Re-run pipeline
    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })

    // Should still be in table view
    await expect(page.getByTestId('results-table-view')).toBeVisible()
  })
})

test.describe('Aggregation Builder - Pipeline Templates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await page.getByRole('tab', { name: 'Aggregation' }).click()
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()
  })

  test('shows template menu', async ({ page }) => {
    // Click templates button
    await page.getByTestId('templates-button').click()

    // Template menu should be visible
    await expect(page.getByTestId('templates-menu')).toBeVisible()

    // Should have common templates
    await expect(page.getByTestId('template-count-by-field')).toBeVisible()
    await expect(page.getByTestId('template-time-series')).toBeVisible()
    await expect(page.getByTestId('template-top-n')).toBeVisible()
  })

  test('loads count by field template', async ({ page }) => {
    // Open templates
    await page.getByTestId('templates-button').click()

    // Select count by field template
    await page.getByTestId('template-count-by-field').click()

    // Should add $group stage with count accumulator
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$group')
    await expect(page.getByTestId('pipeline-preview')).toContainText('$sum')
  })

  test('loads time series template', async ({ page }) => {
    // Open templates
    await page.getByTestId('templates-button').click()

    // Select time series template
    await page.getByTestId('template-time-series').click()

    // Should add appropriate stages for time series analysis
    await expect(page.getByTestId('pipeline-preview')).toContainText('$dateToString')
  })

  test('loads top N template', async ({ page }) => {
    // Open templates
    await page.getByTestId('templates-button').click()

    // Select top N template
    await page.getByTestId('template-top-n').click()

    // Should have $sort and $limit stages
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$sort')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$limit')
  })

  test('confirms before replacing existing pipeline with template', async ({ page }) => {
    // Add a stage first
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()

    // Try to load a template
    await page.getByTestId('templates-button').click()
    await page.getByTestId('template-count-by-field').click()

    // Should show confirmation dialog
    await expect(page.getByText(/replace.*pipeline|overwrite|existing/i)).toBeVisible()

    // Confirm
    await page.getByRole('button', { name: /confirm|yes|replace/i }).click()

    // Template should be loaded
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$group')
  })
})

test.describe('Aggregation Builder - Save and Load Pipelines', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await page.getByRole('tab', { name: 'Aggregation' }).click()
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()
  })

  test('saves pipeline with a name', async ({ page }) => {
    // Build a pipeline
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    // Click save button
    await page.getByTestId('save-pipeline-button').click()

    // Enter pipeline name
    await page.getByTestId('pipeline-name-input').fill('Active Users Pipeline')

    // Save
    await page.getByRole('button', { name: /save/i }).click()

    // Should show success message
    await expect(page.getByText(/saved/i)).toBeVisible()
  })

  test('loads a saved pipeline', async ({ page }) => {
    // First save a pipeline
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')

    await page.getByTestId('save-pipeline-button').click()
    await page.getByTestId('pipeline-name-input').fill('Test Pipeline')
    await page.getByRole('button', { name: /save/i }).click()

    // Clear the pipeline
    await page.getByTestId('clear-pipeline-button').click()
    await page.getByRole('button', { name: /confirm|clear/i }).click()

    // Open saved pipelines
    await page.getByTestId('saved-pipelines-button').click()

    // Click on the saved pipeline
    await page.getByText('Test Pipeline').click()

    // Pipeline should be loaded
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$match')
    await expect(page.getByTestId('match-field-input')).toHaveValue('status')
  })

  test('deletes a saved pipeline', async ({ page }) => {
    // Ensure a pipeline is saved first
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('test')
    await page.getByTestId('match-value-input').fill('value')

    await page.getByTestId('save-pipeline-button').click()
    await page.getByTestId('pipeline-name-input').fill('Pipeline To Delete')
    await page.getByRole('button', { name: /save/i }).click()

    // Open saved pipelines
    await page.getByTestId('saved-pipelines-button').click()

    // Delete the pipeline
    await page.getByTestId('delete-saved-pipeline-Pipeline To Delete').click()

    // Confirm deletion
    await page.getByRole('button', { name: /confirm|delete|yes/i }).click()

    // Pipeline should no longer be in the list
    await expect(page.getByText('Pipeline To Delete')).not.toBeVisible()
  })

  test('imports pipeline from JSON', async ({ page }) => {
    // Click import button
    await page.getByTestId('import-pipeline-button').click()

    // Paste JSON
    const pipelineJson = JSON.stringify([
      { $match: { status: 'active' } },
      { $limit: 10 }
    ])
    await page.getByTestId('import-json-input').fill(pipelineJson)

    // Import
    await page.getByRole('button', { name: /import/i }).click()

    // Pipeline should be imported
    await expect(page.getByTestId('pipeline-stage-0')).toContainText('$match')
    await expect(page.getByTestId('pipeline-stage-1')).toContainText('$limit')
  })

  test('shows error for invalid imported JSON', async ({ page }) => {
    // Click import button
    await page.getByTestId('import-pipeline-button').click()

    // Paste invalid JSON
    await page.getByTestId('import-json-input').fill('not valid json [}')

    // Try to import
    await page.getByRole('button', { name: /import/i }).click()

    // Should show error
    await expect(page.getByTestId('import-error')).toBeVisible()
    await expect(page.getByTestId('import-error')).toContainText(/invalid.*json/i)
  })
})

test.describe('Aggregation Builder - Explain Plan', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await page.getByRole('tab', { name: 'Aggregation' }).click()
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()

    // Build a simple pipeline
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-value-input').fill('active')
  })

  test('shows explain plan for pipeline', async ({ page }) => {
    // Click explain button
    await page.getByTestId('explain-pipeline-button').click()

    // Should show explain plan
    await expect(page.getByTestId('explain-plan')).toBeVisible({ timeout: 10000 })

    // Should show plan details
    await expect(page.getByTestId('explain-plan')).toContainText(/stage|plan|index/i)
  })

  test('shows winning plan details', async ({ page }) => {
    // Click explain button
    await page.getByTestId('explain-pipeline-button').click()
    await expect(page.getByTestId('explain-plan')).toBeVisible({ timeout: 10000 })

    // Should show winning plan
    await expect(page.getByTestId('winning-plan')).toBeVisible()
  })

  test('toggles between explain verbosity levels', async ({ page }) => {
    // Click explain button
    await page.getByTestId('explain-pipeline-button').click()
    await expect(page.getByTestId('explain-plan')).toBeVisible({ timeout: 10000 })

    // Change verbosity level
    await page.getByTestId('explain-verbosity-select').click()
    await page.getByRole('option', { name: /executionStats/i }).click()

    // Should show more detailed stats
    await expect(page.getByTestId('explain-plan')).toContainText(/executionStats|docsExamined/i)
  })
})

test.describe('Aggregation Builder - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await page.getByRole('tab', { name: 'Aggregation' }).click()
    await expect(page.getByTestId('aggregation-builder')).toBeVisible()
  })

  test('handles special characters in field names', async ({ page }) => {
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('user.name')
    await page.getByTestId('match-value-input').fill('test')

    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })
  })

  test('handles array values in $in operator', async ({ page }) => {
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('status')
    await page.getByTestId('match-operator-select').click()
    await page.getByRole('option', { name: /in/i }).click()
    await page.getByTestId('match-value-input').fill('["active", "pending"]')

    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 10000 })
  })

  test('handles numeric values correctly', async ({ page }) => {
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('age')
    await page.getByTestId('match-operator-select').click()
    await page.getByRole('option', { name: />/i }).click()
    await page.getByTestId('match-value-input').fill('25')

    // Preview should show number, not string
    await expect(page.getByTestId('pipeline-preview')).toContainText('"$gt": 25')
    await expect(page.getByTestId('pipeline-preview')).not.toContainText('"$gt": "25"')
  })

  test('handles boolean values correctly', async ({ page }) => {
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('isActive')
    await page.getByTestId('match-value-input').fill('true')

    // Preview should show boolean, not string
    await expect(page.getByTestId('pipeline-preview')).toContainText('"isActive": true')
  })

  test('handles null values correctly', async ({ page }) => {
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('deletedAt')
    await page.getByTestId('match-value-input').fill('null')

    // Preview should show null, not string
    await expect(page.getByTestId('pipeline-preview')).toContainText('"deletedAt": null')
  })

  test('handles $regex with options', async ({ page }) => {
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('name')
    await page.getByTestId('match-operator-select').click()
    await page.getByRole('option', { name: /regex/i }).click()
    await page.getByTestId('match-value-input').fill('^John')

    // Should show regex options
    await expect(page.getByTestId('regex-options-input')).toBeVisible()
    await page.getByTestId('regex-options-input').fill('i')

    // Preview should include $options
    await expect(page.getByTestId('pipeline-preview')).toContainText('$regex')
    await expect(page.getByTestId('pipeline-preview')).toContainText('$options')
  })

  test('handles very long pipelines gracefully', async ({ page }) => {
    // Add 10 stages
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('add-stage-button').click()
      await page.getByTestId('stage-type-match').click()
      await page.getByTestId('match-field-input').last().fill(`field${i}`)
      await page.getByTestId('match-value-input').last().fill(`value${i}`)
    }

    // Should show all stages with scrolling
    await expect(page.getByTestId('pipeline-stage-9')).toBeVisible()

    // Should still be able to run
    await page.getByTestId('run-pipeline-button').click()
    await expect(page.getByTestId('pipeline-results')).toBeVisible({ timeout: 15000 })
  })

  test('handles collection with no documents', async ({ page }) => {
    // Navigate to empty collection
    await page.goto('/database/testdb/collection/empty_collection')
    await page.getByRole('tab', { name: 'Aggregation' }).click()

    // Add a stage
    await page.getByTestId('add-stage-button').click()
    await page.getByTestId('stage-type-match').click()
    await page.getByTestId('match-field-input').fill('any')
    await page.getByTestId('match-value-input').fill('value')

    // Run pipeline
    await page.getByTestId('run-pipeline-button').click()

    // Should show empty results message
    await expect(page.getByTestId('empty-results-message')).toBeVisible({ timeout: 10000 })
  })
})
