import { test, expect } from '@playwright/test'

/**
 * RED Phase E2E Tests for Document List
 *
 * These tests verify the Document List component's ability to:
 * 1. Load and display documents from a collection
 * 2. Navigate between pages of documents (pagination)
 * 3. Switch between table and JSON view modes
 *
 * These tests are expected to FAIL in the RED phase because the
 * document list functionality with full backend integration isn't complete.
 *
 * The tests assume a connected database with the 'testdb' database and
 * 'users' collection containing sample documents.
 */

test.describe('Document List - Load Documents', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a collection page
    await page.goto('/database/testdb/collection/users')

    // Wait for the document list to be visible
    await expect(page.getByTestId('document-list')).toBeVisible()
  })

  test('displays documents from the collection', async ({ page }) => {
    // The document list should show documents
    const documentRows = page.getByTestId('document-row')

    // Should have at least one document displayed
    await expect(documentRows.first()).toBeVisible({ timeout: 10000 })

    // Count the visible documents (should be > 0)
    const count = await documentRows.count()
    expect(count).toBeGreaterThan(0)
  })

  test('shows document count in header', async ({ page }) => {
    // Should display total document count
    const documentCount = page.getByTestId('document-count')
    await expect(documentCount).toBeVisible()

    // The count text should contain a number
    const countText = await documentCount.textContent()
    expect(countText).toMatch(/\d+/)
  })

  test('displays document _id field', async ({ page }) => {
    // Each document row should show the _id
    const firstDocument = page.getByTestId('document-row').first()
    await expect(firstDocument).toBeVisible({ timeout: 10000 })

    // Should contain an _id field
    await expect(firstDocument.getByText('_id')).toBeVisible()
  })

  test('displays document fields', async ({ page }) => {
    // Documents should show their fields
    const firstDocument = page.getByTestId('document-row').first()
    await expect(firstDocument).toBeVisible({ timeout: 10000 })

    // Should display field names and values (assuming users have name/email)
    // This will vary based on actual document structure
    const documentContent = await firstDocument.textContent()
    expect(documentContent).toBeTruthy()
    expect(documentContent!.length).toBeGreaterThan(0)
  })

  test('shows loading state while fetching documents', async ({ page }) => {
    // Intercept the request to add delay
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.continue()
    })

    // Navigate to trigger loading
    await page.goto('/database/testdb/collection/users')

    // Should show loading indicator
    await expect(page.getByTestId('document-list-loading')).toBeVisible()
  })

  test('shows empty state when collection has no documents', async ({ page }) => {
    // Navigate to an empty collection
    await page.goto('/database/testdb/collection/empty_collection')

    // Should show empty state message
    await expect(page.getByText('No documents found')).toBeVisible({ timeout: 10000 })
  })

  test('shows error state when fetch fails', async ({ page }) => {
    // Intercept and fail the request
    await page.route('**/api/**', (route) => {
      route.abort('failed')
    })

    await page.goto('/database/testdb/collection/users')

    // Should show error message
    await expect(page.getByTestId('document-list-error')).toBeVisible({ timeout: 10000 })
  })

  test('can refresh document list', async ({ page }) => {
    // Wait for initial load
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Click refresh button
    await page.getByLabel('Refresh documents').click()

    // Should show loading state briefly
    // After loading, documents should still be visible
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })
  })

  test('expands document to show all fields', async ({ page }) => {
    const firstDocument = page.getByTestId('document-row').first()
    await expect(firstDocument).toBeVisible({ timeout: 10000 })

    // Click to expand document
    await firstDocument.click()

    // Should show expanded view with all document fields
    await expect(page.getByTestId('document-expanded')).toBeVisible()
  })
})

test.describe('Document List - Pagination', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a collection with many documents
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible()
  })

  test('shows pagination controls', async ({ page }) => {
    // Wait for documents to load
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Pagination controls should be visible
    await expect(page.getByTestId('pagination')).toBeVisible()
  })

  test('displays current page number', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Should show current page (starting at 1)
    const pageIndicator = page.getByTestId('page-indicator')
    await expect(pageIndicator).toBeVisible()
    await expect(pageIndicator).toContainText('1')
  })

  test('displays total page count', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Should show total pages
    const pageIndicator = page.getByTestId('page-indicator')
    const text = await pageIndicator.textContent()

    // Should be in format like "1 of 5" or "Page 1 / 5"
    expect(text).toMatch(/\d+\s*(of|\/)\s*\d+/i)
  })

  test('can navigate to next page', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Get initial documents
    const initialFirstDoc = await page.getByTestId('document-row').first().textContent()

    // Click next page button
    await page.getByTestId('next-page').click()

    // Wait for new documents to load
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Documents should be different (new page)
    const newFirstDoc = await page.getByTestId('document-row').first().textContent()
    expect(newFirstDoc).not.toBe(initialFirstDoc)

    // Page indicator should show page 2
    await expect(page.getByTestId('page-indicator')).toContainText('2')
  })

  test('can navigate to previous page', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // First go to page 2
    await page.getByTestId('next-page').click()
    await expect(page.getByTestId('page-indicator')).toContainText('2')

    // Get page 2 documents
    const page2FirstDoc = await page.getByTestId('document-row').first().textContent()

    // Go back to page 1
    await page.getByTestId('prev-page').click()

    // Wait for documents
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Should be back on page 1
    await expect(page.getByTestId('page-indicator')).toContainText('1')

    // Documents should be different from page 2
    const page1FirstDoc = await page.getByTestId('document-row').first().textContent()
    expect(page1FirstDoc).not.toBe(page2FirstDoc)
  })

  test('previous button is disabled on first page', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // On page 1, previous should be disabled
    const prevButton = page.getByTestId('prev-page')
    await expect(prevButton).toBeDisabled()
  })

  test('next button is disabled on last page', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Navigate to the last page
    // We'll click next until we can't anymore
    const nextButton = page.getByTestId('next-page')

    // Keep clicking next until disabled (with a max limit to prevent infinite loop)
    let attempts = 0
    while (!(await nextButton.isDisabled()) && attempts < 100) {
      await nextButton.click()
      await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 5000 })
      attempts++
    }

    // Next button should now be disabled
    await expect(nextButton).toBeDisabled()
  })

  test('can jump to first page', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Navigate to page 3
    await page.getByTestId('next-page').click()
    await page.getByTestId('next-page').click()
    await expect(page.getByTestId('page-indicator')).toContainText('3')

    // Click first page button
    await page.getByTestId('first-page').click()

    // Should be on page 1
    await expect(page.getByTestId('page-indicator')).toContainText('1')
  })

  test('can jump to last page', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Click last page button
    await page.getByTestId('last-page').click()

    // Wait for documents
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Next button should be disabled (we're on last page)
    await expect(page.getByTestId('next-page')).toBeDisabled()
  })

  test('can change page size', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Get initial document count
    const initialCount = await page.getByTestId('document-row').count()

    // Change page size
    await page.getByTestId('page-size-select').click()
    await page.getByRole('option', { name: '50' }).click()

    // Wait for reload
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Document count should change (assuming there are enough documents)
    const newCount = await page.getByTestId('document-row').count()

    // Either count changed or we see all available documents
    expect(newCount).toBeGreaterThanOrEqual(initialCount)
  })

  test('shows documents per page info', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Should show range like "1-20 of 100"
    const rangeInfo = page.getByTestId('pagination-range')
    await expect(rangeInfo).toBeVisible()

    const rangeText = await rangeInfo.textContent()
    expect(rangeText).toMatch(/\d+-\d+\s*(of)\s*\d+/i)
  })

  test('resets to page 1 when filter changes', async ({ page }) => {
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Go to page 2
    await page.getByTestId('next-page').click()
    await expect(page.getByTestId('page-indicator')).toContainText('2')

    // Apply a filter (via query bar)
    const editor = page.getByTestId('query-editor')
    await editor.click()
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "status": "active" }')
    await page.getByTestId('execute-button').click()

    // Should reset to page 1
    await expect(page.getByTestId('page-indicator')).toContainText('1')
  })
})

test.describe('Document List - View Modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible()
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows view mode toggle', async ({ page }) => {
    // View mode toggle should be visible
    await expect(page.getByTestId('view-mode-toggle')).toBeVisible()
  })

  test('defaults to table view', async ({ page }) => {
    // Table view should be active by default
    const tableButton = page.getByTestId('view-mode-table')
    await expect(tableButton).toHaveAttribute('aria-pressed', 'true')

    // Table structure should be visible
    await expect(page.getByTestId('document-table')).toBeVisible()
  })

  test('can switch to JSON view', async ({ page }) => {
    // Click JSON view button
    await page.getByTestId('view-mode-json').click()

    // JSON view should now be active
    await expect(page.getByTestId('view-mode-json')).toHaveAttribute('aria-pressed', 'true')

    // JSON viewer should be visible
    await expect(page.getByTestId('document-json-view')).toBeVisible()
  })

  test('can switch back to table view', async ({ page }) => {
    // Switch to JSON view first
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Switch back to table view
    await page.getByTestId('view-mode-table').click()

    // Table should be visible again
    await expect(page.getByTestId('document-table')).toBeVisible()
    await expect(page.getByTestId('view-mode-table')).toHaveAttribute('aria-pressed', 'true')
  })

  test('table view shows column headers', async ({ page }) => {
    // Ensure we're in table view
    await expect(page.getByTestId('document-table')).toBeVisible()

    // Should have column headers
    const headers = page.getByTestId('table-header')
    await expect(headers).toBeVisible()

    // _id column should always be present
    await expect(page.getByRole('columnheader', { name: '_id' })).toBeVisible()
  })

  test('table view shows sortable columns', async ({ page }) => {
    await expect(page.getByTestId('document-table')).toBeVisible()

    // Column headers should have sort indicators
    const sortableHeader = page.getByTestId('sortable-column').first()
    await expect(sortableHeader).toBeVisible()

    // Click to sort
    await sortableHeader.click()

    // Should show sort direction indicator
    await expect(page.getByTestId('sort-indicator')).toBeVisible()
  })

  test('JSON view shows formatted JSON', async ({ page }) => {
    // Switch to JSON view
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Should show syntax-highlighted JSON
    const jsonContent = page.getByTestId('json-content')
    await expect(jsonContent).toBeVisible()

    // Should contain JSON structure characters
    const content = await jsonContent.textContent()
    expect(content).toContain('{')
    expect(content).toContain('}')
  })

  test('JSON view can expand/collapse documents', async ({ page }) => {
    // Switch to JSON view
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Find expand/collapse toggle
    const toggleButton = page.getByTestId('json-toggle').first()
    await expect(toggleButton).toBeVisible()

    // Click to collapse
    await toggleButton.click()

    // Content should be collapsed
    await expect(page.getByTestId('json-collapsed').first()).toBeVisible()

    // Click to expand again
    await toggleButton.click()

    // Content should be expanded
    await expect(page.getByTestId('json-expanded').first()).toBeVisible()
  })

  test('JSON view can copy document to clipboard', async ({ page }) => {
    // Switch to JSON view
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Find copy button
    const copyButton = page.getByLabel('Copy document').first()
    await expect(copyButton).toBeVisible()

    // Click copy
    await copyButton.click()

    // Should show copy confirmation
    await expect(page.getByText('Copied!')).toBeVisible()
  })

  test('preserves view mode across pagination', async ({ page }) => {
    // Switch to JSON view
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Navigate to next page
    await page.getByTestId('next-page').click()

    // Should still be in JSON view
    await expect(page.getByTestId('document-json-view')).toBeVisible()
    await expect(page.getByTestId('view-mode-json')).toHaveAttribute('aria-pressed', 'true')
  })

  test('preserves view mode across filter changes', async ({ page }) => {
    // Switch to JSON view
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Apply a filter
    const editor = page.getByTestId('query-editor')
    await editor.click()
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "status": "active" }')
    await page.getByTestId('execute-button').click()

    // Wait for results
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Should still be in JSON view
    await expect(page.getByTestId('document-json-view')).toBeVisible()
  })

  test('table view supports row selection', async ({ page }) => {
    await expect(page.getByTestId('document-table')).toBeVisible()

    // Click checkbox on first row
    const rowCheckbox = page.getByTestId('document-row').first().getByRole('checkbox')
    await rowCheckbox.click()

    // Row should be selected
    await expect(rowCheckbox).toBeChecked()

    // Selection count should be shown
    await expect(page.getByTestId('selection-count')).toContainText('1')
  })

  test('table view supports select all', async ({ page }) => {
    await expect(page.getByTestId('document-table')).toBeVisible()

    // Click select all checkbox in header
    const selectAllCheckbox = page.getByTestId('select-all-checkbox')
    await selectAllCheckbox.click()

    // All rows should be selected
    const checkboxes = page.getByTestId('document-row').getByRole('checkbox')
    const count = await checkboxes.count()

    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toBeChecked()
    }

    // Selection count should match document count
    const documentCount = await page.getByTestId('document-row').count()
    await expect(page.getByTestId('selection-count')).toContainText(String(documentCount))
  })

  test('JSON view shows document actions on hover', async ({ page }) => {
    // Switch to JSON view
    await page.getByTestId('view-mode-json').click()
    await expect(page.getByTestId('document-json-view')).toBeVisible()

    // Hover over first document
    const firstDocument = page.getByTestId('json-document').first()
    await firstDocument.hover()

    // Should show action buttons
    await expect(page.getByTestId('document-actions')).toBeVisible()
    await expect(page.getByLabel('Edit document')).toBeVisible()
    await expect(page.getByLabel('Delete document')).toBeVisible()
  })

  test('table view allows inline field editing', async ({ page }) => {
    await expect(page.getByTestId('document-table')).toBeVisible()

    // Double-click on a cell to edit
    const editableCell = page.getByTestId('editable-cell').first()
    await editableCell.dblclick()

    // Should show input field
    await expect(page.getByTestId('inline-edit-input')).toBeVisible()
  })
})

test.describe('Document List - Edge Cases', () => {
  test('handles very large documents gracefully', async ({ page }) => {
    // Navigate to collection with large documents
    await page.goto('/database/testdb/collection/large_docs')
    await expect(page.getByTestId('document-list')).toBeVisible()

    // Should truncate very long fields
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Large content should show truncation indicator
    const truncatedContent = page.getByTestId('truncated-value')
    if (await truncatedContent.count() > 0) {
      await expect(truncatedContent.first()).toContainText('...')
    }
  })

  test('handles nested documents in table view', async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-table')).toBeVisible()
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Nested objects should show expandable indicator
    const nestedField = page.getByTestId('nested-field-indicator')
    if (await nestedField.count() > 0) {
      await nestedField.first().click()

      // Should expand to show nested content
      await expect(page.getByTestId('nested-content')).toBeVisible()
    }
  })

  test('handles arrays in table view', async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-table')).toBeVisible()
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Arrays should show array indicator with count
    const arrayField = page.getByTestId('array-field-indicator')
    if (await arrayField.count() > 0) {
      // Should show array length
      const text = await arrayField.first().textContent()
      expect(text).toMatch(/\[\d+ items?\]/)
    }
  })

  test('handles special BSON types', async ({ page }) => {
    await page.goto('/database/testdb/collection/bson_types')
    await expect(page.getByTestId('document-list')).toBeVisible()
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Switch to JSON view for better type visibility
    await page.getByTestId('view-mode-json').click()

    // Should display special types appropriately
    // ObjectId
    const content = await page.getByTestId('json-content').textContent()
    expect(content).toContain('$oid')
  })

  test('handles null and undefined values', async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-table')).toBeVisible()
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Null values should be displayed distinctly
    const nullValue = page.getByTestId('null-value')
    if (await nullValue.count() > 0) {
      await expect(nullValue.first()).toContainText('null')
    }
  })

  test('handles binary data display', async ({ page }) => {
    await page.goto('/database/testdb/collection/binary_data')
    await expect(page.getByTestId('document-list')).toBeVisible()
    await expect(page.getByTestId('document-row').first()).toBeVisible({ timeout: 10000 })

    // Binary data should show placeholder or base64 representation
    const binaryField = page.getByTestId('binary-field')
    if (await binaryField.count() > 0) {
      await expect(binaryField.first()).toContainText('Binary')
    }
  })
})
