import { test, expect } from '@playwright/test'

/**
 * RED Phase E2E Tests for Index Management
 *
 * These tests verify the complete Create, List, Drop flow
 * for indexes in the mondodb Studio application.
 *
 * These tests are expected to FAIL in the RED phase because:
 * - Full backend integration may not be complete
 * - RPC endpoints (createIndex, listIndexes, dropIndex) may not be fully wired
 * - UI components (CreateIndex, DropIndex dialogs) may not be implemented
 *
 * The tests assume:
 * - A connected database with 'testdb' database
 * - A 'users' collection for index operations
 * - The application is running at localhost:5173
 * - The IndexList component is accessible via the collection page
 */

test.describe('Index Management - Complete Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the collection page with indexes tab
    await page.goto('/database/testdb/collection/users')

    // Wait for the index list to be visible (assumes there's an Indexes tab or section)
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('complete index lifecycle: create, list, verify, drop', async ({ page }) => {
    // ===== CREATE =====
    // Click the Create Index button
    await page.getByTestId('create-index-button').click()

    // Wait for the modal to appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Create Index')).toBeVisible()

    // Configure a simple ascending index on the 'email' field
    // Find the field name input and enter 'email'
    const fieldNameInput = page.getByTestId('index-field-name-0')
    await expect(fieldNameInput).toBeVisible()
    await fieldNameInput.fill('email')

    // Select ascending direction (1)
    const directionSelect = page.getByTestId('index-field-direction-0')
    await directionSelect.click()
    await page.getByRole('option', { name: 'Ascending (1)' }).click()

    // Submit the form
    await page.getByTestId('create-index-submit').click()

    // Wait for modal to close (indicates success)
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // ===== LIST & VERIFY =====
    // The newly created index should appear in the list
    // MongoDB auto-generates name like 'email_1' for { email: 1 }
    await expect(page.getByTestId('index-row-email_1')).toBeVisible({ timeout: 10000 })

    // Verify the index shows correct key configuration
    await expect(page.getByText('email: 1')).toBeVisible()

    // ===== DROP =====
    // Click the drop button for this index
    await page.getByTestId('drop-index-email_1').click()

    // Confirm deletion in the dialog
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Drop Index')).toBeVisible()
    await expect(page.getByText('email_1')).toBeVisible()

    // Click the drop confirmation button
    await page.getByTestId('drop-index-confirm').click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify index is no longer in the list
    await expect(page.getByTestId('index-row-email_1')).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Index Management - List Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('displays default _id index', async ({ page }) => {
    // Every MongoDB collection has a default _id index
    await expect(page.getByTestId('index-row-_id_')).toBeVisible()

    // Verify it shows the _id key
    await expect(page.getByText('_id: 1')).toBeVisible()

    // Should show default badge
    await expect(page.getByText('default')).toBeVisible()
  })

  test('shows index count badge', async ({ page }) => {
    // Should display the count of indexes
    // At minimum there's 1 (_id index)
    await expect(page.getByText(/\d+ indexes?/)).toBeVisible()
  })

  test('displays index table with proper columns', async ({ page }) => {
    // Verify table structure
    const table = page.getByTestId('index-table')
    await expect(table).toBeVisible()

    // Check column headers
    await expect(page.getByText('Name')).toBeVisible()
    await expect(page.getByText('Keys')).toBeVisible()
    await expect(page.getByText('Properties')).toBeVisible()
    await expect(page.getByText('Actions')).toBeVisible()
  })

  test('shows loading state while fetching indexes', async ({ page }) => {
    // Intercept and delay the API call to observe loading state
    await page.route('**/rpc/**', async (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      await route.continue()
    })

    // Reload page to trigger fresh fetch
    await page.reload()

    // Should show loading state
    await expect(page.getByTestId('index-list-loading')).toBeVisible()
  })

  test('shows error state when fetch fails', async ({ page }) => {
    // Intercept and fail the listIndexes request
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: -32000, message: 'Database error' } }),
        })
      } else {
        route.continue()
      }
    })

    // Reload page to trigger fresh fetch
    await page.reload()

    // Should show error state
    await expect(page.getByTestId('index-list-error')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Error loading indexes')).toBeVisible()
  })

  test('can retry after error', async ({ page }) => {
    let failOnce = true

    // Intercept and fail the first request, then succeed
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes') && failOnce) {
        failOnce = false
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: -32000, message: 'Temporary error' } }),
        })
      } else {
        route.continue()
      }
    })

    // Reload page to trigger fresh fetch
    await page.reload()

    // Should show error state
    await expect(page.getByTestId('index-list-error')).toBeVisible({ timeout: 10000 })

    // Click retry button
    await page.getByRole('button', { name: 'Retry' }).click()

    // Should now show the index list
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('index-table')).toBeVisible()
  })

  test('shows empty state when no indexes (edge case)', async ({ page }) => {
    // Mock response with empty indexes array
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', result: [] }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()

    // Should show empty state
    await expect(page.getByTestId('index-list-empty')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('No indexes found')).toBeVisible()
    await expect(page.getByText('Create an index to improve query performance')).toBeVisible()
  })
})

test.describe('Index Management - Create Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('opens create index modal when clicking Create Index button', async ({ page }) => {
    await page.getByTestId('create-index-button').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Create Index')).toBeVisible()
    await expect(page.getByTestId('index-field-name-0')).toBeVisible()
    await expect(page.getByTestId('create-index-submit')).toBeVisible()
  })

  test('can close create modal without saving', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click Cancel button
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Modal should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('can create a simple ascending index', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Enter field name
    await page.getByTestId('index-field-name-0').fill('username')

    // Direction defaults to ascending, submit
    await page.getByTestId('create-index-submit').click()

    // Modal should close on success
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Index should appear in list
    await expect(page.getByTestId('index-row-username_1')).toBeVisible({ timeout: 10000 })
  })

  test('can create a descending index', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('createdAt')

    // Select descending direction
    await page.getByTestId('index-field-direction-0').click()
    await page.getByRole('option', { name: 'Descending (-1)' }).click()

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('index-row-createdAt_-1')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('createdAt: -1')).toBeVisible()
  })

  test('can create a compound index with multiple fields', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // First field
    await page.getByTestId('index-field-name-0').fill('status')

    // Click "Add Field" to add another field
    await page.getByTestId('add-index-field').click()

    // Second field
    await page.getByTestId('index-field-name-1').fill('createdAt')
    await page.getByTestId('index-field-direction-1').click()
    await page.getByRole('option', { name: 'Descending (-1)' }).click()

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    // Compound index name: status_1_createdAt_-1
    await expect(page.getByTestId('index-row-status_1_createdAt_-1')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('status: 1, createdAt: -1')).toBeVisible()
  })

  test('can create a unique index', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('email')

    // Toggle unique option
    await page.getByLabel('Unique').click()

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('index-row-email_1')).toBeVisible({ timeout: 10000 })

    // Should show unique badge
    const indexRow = page.getByTestId('index-row-email_1')
    await expect(indexRow.getByText('unique')).toBeVisible()
  })

  test('can create a sparse index', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('optionalField')

    // Toggle sparse option
    await page.getByLabel('Sparse').click()

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Should show sparse badge
    const indexRow = page.getByTestId('index-row-optionalField_1')
    await expect(indexRow.getByText('sparse')).toBeVisible({ timeout: 10000 })
  })

  test('can create a TTL index', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('expiresAt')

    // Toggle TTL option
    await page.getByLabel('TTL').click()

    // Enter TTL seconds
    await page.getByTestId('ttl-seconds-input').fill('3600')

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Should show TTL badge with value
    const indexRow = page.getByTestId('index-row-expiresAt_1')
    await expect(indexRow.getByText('TTL: 3600s')).toBeVisible({ timeout: 10000 })
  })

  test('can create a text index', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('description')

    // Select text index type
    await page.getByTestId('index-field-direction-0').click()
    await page.getByRole('option', { name: 'Text' }).click()

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Text indexes show the field with "text" type
    await expect(page.getByText('description: "text"')).toBeVisible({ timeout: 10000 })
  })

  test('can create a 2dsphere index for geospatial data', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('location')

    // Select 2dsphere index type
    await page.getByTestId('index-field-direction-0').click()
    await page.getByRole('option', { name: '2dsphere' }).click()

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    await expect(page.getByText('location: "2dsphere"')).toBeVisible({ timeout: 10000 })
  })

  test('can provide a custom index name', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('customField')

    // Enter custom name
    await page.getByTestId('index-name-input').fill('my_custom_index')

    await page.getByTestId('create-index-submit').click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Should use custom name
    await expect(page.getByTestId('index-row-my_custom_index')).toBeVisible({ timeout: 10000 })
  })

  test('can remove a field from compound index before creation', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Add first field
    await page.getByTestId('index-field-name-0').fill('field1')

    // Add second field
    await page.getByTestId('add-index-field').click()
    await page.getByTestId('index-field-name-1').fill('field2')

    // Add third field
    await page.getByTestId('add-index-field').click()
    await page.getByTestId('index-field-name-2').fill('field3')

    // Remove the second field
    await page.getByTestId('remove-index-field-1').click()

    // Field 2 should be gone, field 3 should now be at index 1
    await expect(page.getByTestId('index-field-name-1')).toHaveValue('field3')
  })

  test('shows validation error when field name is empty', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Try to submit without entering a field name
    await page.getByTestId('create-index-submit').click()

    // Should show validation error
    await expect(page.getByText('Field name is required')).toBeVisible()

    // Modal should still be open
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('shows error when index creation fails', async ({ page }) => {
    // Intercept and fail the createIndex request
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('createIndex')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            error: { code: -32000, message: 'Index already exists with different options' },
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('existingField')
    await page.getByTestId('create-index-submit').click()

    // Should show error
    await expect(page.getByTestId('create-index-error')).toBeVisible()
    await expect(page.getByText('Index already exists with different options')).toBeVisible()
  })

  test('submit button shows loading state during creation', async ({ page }) => {
    // Intercept and delay the createIndex request
    await page.route('**/rpc/**', async (route) => {
      if (route.request().postData()?.includes('createIndex')) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      await route.continue()
    })

    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('slowField')

    const submitButton = page.getByTestId('create-index-submit')
    await submitButton.click()

    // Button should show loading state
    await expect(submitButton).toContainText('Creating...')
    await expect(submitButton).toBeDisabled()
  })
})

test.describe('Index Management - Drop Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('opens drop confirmation dialog when clicking drop button', async ({ page }) => {
    // Assuming there's at least one droppable index (not _id_)
    // First create one if needed, or mock the data
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'email_1', key: { email: 1 } },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    // Click drop button for email_1 index
    await page.getByTestId('drop-index-email_1').click()

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Drop Index')).toBeVisible()
    await expect(page.getByText('email_1')).toBeVisible()
  })

  test('shows warning about permanent deletion', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'test_index', key: { test: 1 } },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('drop-index-test_index').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Should show warning
    await expect(page.getByText(/cannot be undone|permanently/i)).toBeVisible()
  })

  test('displays index key configuration in drop dialog', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'compound_idx', key: { status: 1, createdAt: -1 }, unique: true },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('drop-index-compound_idx').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Should show index details
    await expect(page.getByText('status: 1, createdAt: -1')).toBeVisible()
  })

  test('can cancel drop operation', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'keep_this_index', key: { keep: 1 } },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('drop-index-keep_this_index').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Index should still be in list
    await expect(page.getByTestId('index-row-keep_this_index')).toBeVisible()
  })

  test('successfully drops an index', async ({ page }) => {
    let indexes = [
      { name: '_id_', key: { _id: 1 } },
      { name: 'to_drop', key: { field: 1 } },
    ]

    await page.route('**/rpc/**', (route) => {
      const postData = route.request().postData()
      if (postData?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', result: indexes }),
        })
      } else if (postData?.includes('dropIndex')) {
        // Simulate successful drop
        indexes = indexes.filter((i) => i.name !== 'to_drop')
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', result: null }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('index-row-to_drop')).toBeVisible()

    // Click drop
    await page.getByTestId('drop-index-to_drop').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Confirm drop
    await page.getByTestId('drop-index-confirm').click()

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Index should be removed from list
    await expect(page.getByTestId('index-row-to_drop')).not.toBeVisible({ timeout: 5000 })
  })

  test('shows error when drop fails', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      const postData = route.request().postData()
      if (postData?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'fail_drop', key: { field: 1 } },
            ],
          }),
        })
      } else if (postData?.includes('dropIndex')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            error: { code: -32000, message: 'Cannot drop index: index in use' },
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('drop-index-fail_drop').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('drop-index-confirm').click()

    // Should show error
    await expect(page.getByTestId('drop-index-error')).toBeVisible()
    await expect(page.getByText('Cannot drop index: index in use')).toBeVisible()
  })

  test('drop button shows loading state during deletion', async ({ page }) => {
    await page.route('**/rpc/**', async (route) => {
      const postData = route.request().postData()
      if (postData?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'slow_drop', key: { field: 1 } },
            ],
          }),
        })
      } else if (postData?.includes('dropIndex')) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', result: null }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('drop-index-slow_drop').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const dropButton = page.getByTestId('drop-index-confirm')
    await dropButton.click()

    // Button should show loading state
    await expect(dropButton).toContainText('Dropping...')
    await expect(dropButton).toBeDisabled()
  })

  test('_id index drop button is disabled', async ({ page }) => {
    // The _id index cannot be dropped
    await expect(page.getByTestId('index-row-_id_')).toBeVisible()

    // Drop button should be disabled or show locked state
    await expect(page.getByTestId('drop-index-disabled')).toBeVisible()
  })

  test('shows tooltip explaining why _id cannot be dropped', async ({ page }) => {
    await expect(page.getByTestId('index-row-_id_')).toBeVisible()

    // Hover over the disabled drop button
    await page.getByTestId('drop-index-disabled').hover()

    // Should show tooltip explaining the restriction
    await expect(page.getByText('Cannot drop the default _id index')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Index Management - Index Properties Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('displays unique badge for unique indexes', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'email_1', key: { email: 1 }, unique: true },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    const indexRow = page.getByTestId('index-row-email_1')
    await expect(indexRow.getByText('unique')).toBeVisible()
  })

  test('displays sparse badge for sparse indexes', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'optional_1', key: { optional: 1 }, sparse: true },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    const indexRow = page.getByTestId('index-row-optional_1')
    await expect(indexRow.getByText('sparse')).toBeVisible()
  })

  test('displays TTL badge with expiration time', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'expires_1', key: { expires: 1 }, expireAfterSeconds: 86400 },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    const indexRow = page.getByTestId('index-row-expires_1')
    await expect(indexRow.getByText('TTL: 86400s')).toBeVisible()
  })

  test('displays multiple badges for indexes with multiple properties', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'multi_prop_1', key: { field: 1 }, unique: true, sparse: true },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    const indexRow = page.getByTestId('index-row-multi_prop_1')
    await expect(indexRow.getByText('unique')).toBeVisible()
    await expect(indexRow.getByText('sparse')).toBeVisible()
  })
})

test.describe('Index Management - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('handles indexes with special characters in field names', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'nested.field_1', key: { 'nested.field': 1 } },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('nested.field: 1')).toBeVisible()
  })

  test('handles indexes with many fields in compound index', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              {
                name: 'many_fields',
                key: { a: 1, b: -1, c: 1, d: -1, e: 1 },
              },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await expect(page.getByText('a: 1, b: -1, c: 1, d: -1, e: 1')).toBeVisible()
  })

  test('handles network error gracefully during index operations', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('createIndex')) {
        route.abort('failed')
      } else {
        route.continue()
      }
    })

    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByTestId('index-field-name-0').fill('networkError')
    await page.getByTestId('create-index-submit').click()

    // Should show error
    await expect(page.getByTestId('create-index-error')).toBeVisible()
  })

  test('refreshes index list after operations complete', async ({ page }) => {
    let indexCount = 1
    await page.route('**/rpc/**', (route) => {
      const postData = route.request().postData()
      if (postData?.includes('listIndexes')) {
        const indexes = [{ name: '_id_', key: { _id: 1 } }]
        if (indexCount > 1) {
          indexes.push({ name: 'new_index', key: { new: 1 } })
        }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', result: indexes }),
        })
      } else if (postData?.includes('createIndex')) {
        indexCount++
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: '1', result: 'new_index' }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    // Initially only _id_ index
    await expect(page.getByText('1 index')).toBeVisible()

    // Create new index
    await page.getByTestId('create-index-button').click()
    await page.getByTestId('index-field-name-0').fill('new')
    await page.getByTestId('create-index-submit').click()

    // After creation, list should refresh and show 2 indexes
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText('2 indexes')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Index Management - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('index-list')).toBeVisible({ timeout: 10000 })
  })

  test('can close create modal with Escape key', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('can close drop modal with Escape key', async ({ page }) => {
    await page.route('**/rpc/**', (route) => {
      if (route.request().postData()?.includes('listIndexes')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '1',
            result: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'test_1', key: { test: 1 } },
            ],
          }),
        })
      } else {
        route.continue()
      }
    })

    await page.reload()
    await expect(page.getByTestId('index-table')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('drop-index-test_1').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Tab navigates through form fields in create modal', async ({ page }) => {
    await page.getByTestId('create-index-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const fieldNameInput = page.getByTestId('index-field-name-0')
    await fieldNameInput.focus()

    // Tab should move to next focusable element
    await page.keyboard.press('Tab')

    // The direction select should be focused next
    const directionSelect = page.getByTestId('index-field-direction-0')
    await expect(directionSelect).toBeFocused()
  })
})
