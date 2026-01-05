import { test, expect } from '@playwright/test'

/**
 * RED Phase E2E Tests for Query Bar
 *
 * These tests verify the QueryBar component's execute query, filter results,
 * and query history functionality. They are expected to FAIL in the RED phase
 * because the backend wiring (actual MongoDB query execution) isn't complete.
 *
 * The tests assume a connected database with the 'testdb' database and
 * 'users' collection containing sample documents.
 */

test.describe('Query Bar - Execute Query', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a collection page
    // This assumes we have a connection established and can navigate to a collection
    await page.goto('/database/testdb/collection/users')

    // Wait for the QueryBar to be visible
    await expect(page.getByTestId('query-bar')).toBeVisible()
  })

  test('executes a simple filter query and shows results', async ({ page }) => {
    // Enter a filter query
    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Clear and type a new query
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "status": "active" }')

    // Click the execute button
    await page.getByTestId('execute-button').click()

    // Wait for execution to complete - should show result count
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Verify execution time is displayed
    await expect(page.getByTestId('execution-time')).toBeVisible()

    // The document list should update with filtered results
    // This is the key functionality that requires backend wiring
    const resultCountText = await page.getByTestId('result-count').textContent()
    expect(resultCountText).toContain('documents')
  })

  test('executes query with Cmd+Enter keyboard shortcut', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Type a query
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "age": { "$gt": 25 } }')

    // Execute with keyboard shortcut
    await page.keyboard.press('Meta+Enter')

    // Should show execution results
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('shows validation error for invalid JSON', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Type invalid JSON
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ invalid json }')

    // Wait for validation
    await page.waitForTimeout(500)

    // Should show Invalid badge
    await expect(page.getByText('Invalid')).toBeVisible()

    // Execute button should be disabled
    const executeButton = page.getByTestId('execute-button')
    await expect(executeButton).toHaveAttribute('aria-disabled', 'true')

    // Should show validation errors
    await expect(page.getByTestId('validation-errors')).toBeVisible()
  })

  test('shows execution error when query fails', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Type a query that will fail (assuming backend returns an error for this)
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "$invalidOperator": 1 }')

    // Execute the query
    await page.getByTestId('execute-button').click()

    // Should show execution error
    await expect(page.getByTestId('execution-error')).toBeVisible({ timeout: 10000 })
  })

  test('disables execute button during query execution', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "name": { "$regex": ".*" } }')

    // Click execute
    await page.getByTestId('execute-button').click()

    // Button should be disabled and show "Executing..."
    await expect(page.getByText('Executing...')).toBeVisible()
    const executeButton = page.getByTestId('execute-button')
    await expect(executeButton).toHaveAttribute('aria-disabled', 'true')
  })

  test('updates limit parameter and affects results', async ({ page }) => {
    // Change the limit
    const limitInput = page.getByTestId('limit-input')
    await limitInput.fill('5')

    // Execute query with empty filter
    await page.getByTestId('execute-button').click()

    // Should return at most 5 documents
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // The actual count should reflect the limit
    // This requires backend implementation
  })
})

test.describe('Query Bar - Filter Results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('query-bar')).toBeVisible()
  })

  test('filters documents by string field equality', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "email": "user@example.com" }')

    await page.getByTestId('execute-button').click()

    // Wait for results
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Verify the document list contains the matching document
    // This requires the document list to display results from the backend
    const resultCount = await page.getByTestId('result-count').textContent()
    expect(resultCount).toMatch(/\d+ documents?/)
  })

  test('filters documents with $gte comparison operator', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "age": { "$gte": 30 } }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('filters documents with $in array operator', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "status": { "$in": ["active", "pending"] } }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('filters documents with $and logical operator', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "$and": [{ "status": "active" }, { "age": { "$gt": 25 } }] }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('uses projection tab to limit returned fields', async ({ page }) => {
    // Switch to projection tab
    await page.getByTestId('tab-projection').click()

    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Enter projection
    await page.keyboard.type('{ "name": 1, "email": 1, "_id": 0 }')

    // Switch back to filter and execute
    await page.getByTestId('tab-filter').click()
    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Documents should only have name and email fields
    // This verification requires checking the actual document display
  })

  test('uses sort tab to order results', async ({ page }) => {
    // Switch to sort tab
    await page.getByTestId('tab-sort').click()

    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Enter sort (descending by createdAt)
    await page.keyboard.type('{ "createdAt": -1 }')

    // Switch back to filter and execute
    await page.getByTestId('tab-filter').click()
    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Results should be sorted by createdAt descending
    // This requires comparing document order
  })

  test('combines filter, projection, sort, and limit', async ({ page }) => {
    // Set filter
    const editor = page.getByTestId('query-editor')
    await editor.click()
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "status": "active" }')

    // Set projection
    await page.getByTestId('tab-projection').click()
    await page.getByTestId('query-editor').click()
    await page.keyboard.type('{ "name": 1, "status": 1 }')

    // Set sort
    await page.getByTestId('tab-sort').click()
    await page.getByTestId('query-editor').click()
    await page.keyboard.type('{ "name": 1 }')

    // Set limit
    await page.getByTestId('limit-input').fill('10')

    // Execute
    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('clears query with clear button', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "some": "filter" }')

    // Click clear button
    await page.getByLabel('Clear query').click()

    // Execute to get all documents
    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('formats JSON with format button', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Type unformatted JSON
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{"name":"test","age":25}')

    // Click format button
    await page.getByLabel('Format JSON').click()

    // The editor should now contain formatted JSON
    // We can verify this by checking the query is still valid
    await expect(page.getByText('Valid')).toBeVisible()
  })
})

test.describe('Query Bar - Query History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('query-bar')).toBeVisible()

    // Clear any existing history by clearing localStorage
    await page.evaluate(() => localStorage.removeItem('mongo.do-query-history'))
    await page.reload()
    await expect(page.getByTestId('query-bar')).toBeVisible()
  })

  test('opens history panel when history button is clicked', async ({ page }) => {
    // Click history toggle button (if it exists)
    const historyButton = page.getByLabel('Toggle history')

    if (await historyButton.isVisible()) {
      await historyButton.click()

      // History panel should be visible
      await expect(page.getByText('Query History')).toBeVisible()
    }
  })

  test('adds executed query to history', async ({ page }) => {
    // Execute a query
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "status": "active" }')

    await page.getByTestId('execute-button').click()

    // Wait for execution to complete
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Open history panel
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Should see the executed query in history
      await expect(page.getByText('{ "status": "active" }')).toBeVisible()
    }
  })

  test('loads query from history when clicked', async ({ page }) => {
    // First, execute a query to add it to history
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "email": "test@example.com" }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Clear the editor
    await page.getByLabel('Clear query').click()

    // Open history and click the saved query
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Click on the history entry
      await page.getByText('{ "email": "test@example.com" }').click()

      // The query should be loaded into the editor
      // Verify by executing and seeing the same filter works
      await page.getByTestId('execute-button').click()
      await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
    }
  })

  test('shows error badge for failed queries in history', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    // Execute a query that will fail
    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "$badOperator": 1 }')

    await page.getByTestId('execute-button').click()

    // Wait for error
    await expect(page.getByTestId('execution-error')).toBeVisible({ timeout: 10000 })

    // Open history
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Should show error badge on the query
      await expect(page.getByText('Error')).toBeVisible()
    }
  })

  test('can add query to favorites', async ({ page }) => {
    // Execute a query first
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "favorite": true }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Open history
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Click the favorite button on the history item
      await page.getByLabel('Add to favorites').first().click()

      // Switch to favorites tab
      await page.getByRole('button', { name: /Favorites/ }).click()

      // The query should appear in favorites
      await expect(page.getByText('{ "favorite": true }')).toBeVisible()
    }
  })

  test('can remove query from favorites', async ({ page }) => {
    // Execute and favorite a query
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "toUnfavorite": true }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Favorite it
      await page.getByLabel('Add to favorites').first().click()

      // Now unfavorite it
      await page.getByLabel('Remove from favorites').first().click()

      // Switch to favorites - should be empty
      await page.getByRole('button', { name: /Favorites/ }).click()
      await expect(page.getByText('No favorite queries yet')).toBeVisible()
    }
  })

  test('can search history by query text', async ({ page }) => {
    // Execute multiple queries
    const queries = [
      '{ "type": "user" }',
      '{ "type": "admin" }',
      '{ "category": "product" }'
    ]

    for (const query of queries) {
      const editor = page.getByTestId('query-editor')
      await editor.click()
      await page.keyboard.press('Meta+A')
      await page.keyboard.type(query)
      await page.getByTestId('execute-button').click()
      await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
    }

    // Open history
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Search for "admin"
      await page.getByPlaceholder('Search queries...').fill('admin')

      // Should only show the admin query
      await expect(page.getByText('{ "type": "admin" }')).toBeVisible()
      await expect(page.getByText('{ "type": "user" }')).not.toBeVisible()
      await expect(page.getByText('{ "category": "product" }')).not.toBeVisible()
    }
  })

  test('can delete query from history', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "toDelete": true }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Delete the query
      await page.getByLabel('Delete from history').first().click()

      // Should no longer be visible
      await expect(page.getByText('{ "toDelete": true }')).not.toBeVisible()
    }
  })

  test('can clear all non-favorite history', async ({ page }) => {
    // Execute queries
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "toClear": 1 }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "toClear": 2 }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Click clear history button
      await page.getByLabel('Clear history').click()

      // Handle confirmation dialog
      page.on('dialog', async (dialog) => {
        await dialog.accept()
      })

      // History should be empty
      await expect(page.getByText('No query history yet')).toBeVisible()
    }
  })

  test('shows execution stats in history entries', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "withStats": true }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Should show execution time and document count
      await expect(page.getByText(/\d+ms|<1ms|\d+\.\d+s/)).toBeVisible()
      await expect(page.getByText(/\d+ docs/)).toBeVisible()
    }
  })

  test('preserves history across page reloads', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "persistent": true }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Reload the page
    await page.reload()
    await expect(page.getByTestId('query-bar')).toBeVisible()

    // Open history
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // The query should still be in history
      await expect(page.getByText('{ "persistent": true }')).toBeVisible()
    }
  })

  test('filters history by current database and collection', async ({ page }) => {
    // Execute a query in users collection
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "collection": "users" }')

    await page.getByTestId('execute-button').click()
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Navigate to different collection (if navigation is available)
    // This test assumes the history panel can filter by collection context
    const historyButton = page.getByLabel('Toggle history')
    if (await historyButton.isVisible()) {
      await historyButton.click()

      // Should show the database.collection info
      await expect(page.getByText('testdb.users')).toBeVisible()
    }
  })
})

test.describe('Query Bar - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('query-bar')).toBeVisible()
  })

  test('handles empty filter (returns all documents)', async ({ page }) => {
    // Clear the editor to empty filter
    await page.getByLabel('Clear query').click()

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Should return all documents (non-zero count assuming collection has data)
    const resultCount = await page.getByTestId('result-count').textContent()
    expect(resultCount).toContain('documents')
  })

  test('handles special characters in query values', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "email": "test+special@example.com" }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles unicode characters in query', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "name": "日本語テスト" }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles nested object queries', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "address.city": "San Francisco" }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles array element queries', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "tags": "mongodb" }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles $regex queries', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "name": { "$regex": "^John", "$options": "i" } }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles $exists queries', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    await page.keyboard.type('{ "deletedAt": { "$exists": false } }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles ObjectId in query', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    // Note: In MongoDB extended JSON, ObjectId is represented with $oid
    await page.keyboard.type('{ "_id": { "$oid": "507f1f77bcf86cd799439011" } }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('handles date queries', async ({ page }) => {
    const editor = page.getByTestId('query-editor')
    await editor.click()

    await page.keyboard.press('Meta+A')
    // MongoDB extended JSON date format
    await page.keyboard.type('{ "createdAt": { "$gte": { "$date": "2024-01-01T00:00:00Z" } } }')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })

  test('respects limit value of 1', async ({ page }) => {
    const limitInput = page.getByTestId('limit-input')
    await limitInput.fill('1')

    await page.getByTestId('execute-button').click()

    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Should return exactly 1 document
    const resultCount = await page.getByTestId('result-count').textContent()
    expect(resultCount).toContain('1 document')
  })

  test('validates limit is within acceptable range', async ({ page }) => {
    const limitInput = page.getByTestId('limit-input')

    // Try to set limit to 0 (should be clamped to minimum)
    await limitInput.fill('0')
    await page.getByTestId('execute-button').click()

    // Should still execute (clamped to 1)
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })

    // Try limit > 1000 (should be clamped to maximum)
    await limitInput.fill('9999')
    await page.getByTestId('execute-button').click()

    // Should still execute (clamped to 1000)
    await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 10000 })
  })
})
