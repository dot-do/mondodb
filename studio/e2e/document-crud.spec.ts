import { test, expect } from '@playwright/test'

/**
 * RED Phase E2E Tests for Document CRUD Operations
 *
 * These tests verify the complete Create, Read, Update, Delete flow
 * for documents in the mondodb Studio application.
 *
 * These tests are expected to FAIL in the RED phase because:
 * - Full backend integration may not be complete
 * - RPC endpoints may not be fully wired
 * - UI components may not have all required test IDs
 *
 * The tests assume:
 * - A connected database with 'testdb' database
 * - A 'users' collection for CRUD operations
 * - The application is running at localhost:5173
 */

test.describe('Document CRUD - Complete Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the collection page
    await page.goto('/database/testdb/collection/users')

    // Wait for the document list to be visible
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
  })

  test('complete CRUD lifecycle: create, read, update, delete', async ({ page }) => {
    // ===== CREATE =====
    // Click the Add Document button
    await page.getByTestId('add-document-button').click()

    // Wait for the modal to appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Insert Document')).toBeVisible()

    // Enter a new document
    const testDocument = {
      name: 'E2E Test User',
      email: 'e2e-test@example.com',
      age: 30,
      createdAt: new Date().toISOString(),
    }

    // Find the JSON editor and enter document
    const editor = page.getByTestId('create-document-editor')
    await expect(editor).toBeVisible()

    // Clear and type the document
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type(JSON.stringify(testDocument, null, 2))

    // Submit the form
    await page.getByTestId('create-document-submit').click()

    // Wait for modal to close (indicates success)
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // ===== READ =====
    // The newly created document should appear in the list
    await expect(page.getByText('E2E Test User')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('e2e-test@example.com')).toBeVisible()

    // Find the document row
    const documentRow = page.locator('[data-testid="document-row"]').filter({
      hasText: 'E2E Test User',
    })
    await expect(documentRow).toBeVisible()

    // ===== UPDATE =====
    // Open the document actions menu
    await documentRow.getByTestId('document-actions-menu').click()

    // Click Edit Document
    await page.getByTestId('menu-action-edit').click()

    // Wait for edit modal to appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Edit Document')).toBeVisible()

    // Find the editor and modify the document
    const editEditor = page.getByTestId('edit-document-editor')
    await expect(editEditor).toBeVisible()

    // Update the name field
    await editEditor.click()
    await page.keyboard.press('Meta+a')

    const updatedDocument = {
      ...testDocument,
      _id: '', // Will be filled by the actual _id from the created document
      name: 'E2E Test User Updated',
      age: 31,
    }

    // We need to get the actual _id first
    const documentContent = await editEditor.textContent()
    const idMatch = documentContent?.match(/"_id":\s*"([^"]+)"/)
    if (idMatch) {
      updatedDocument._id = idMatch[1]
    }

    await page.keyboard.type(
      JSON.stringify(
        {
          _id: updatedDocument._id,
          name: 'E2E Test User Updated',
          email: 'e2e-test@example.com',
          age: 31,
          createdAt: testDocument.createdAt,
        },
        null,
        2
      )
    )

    // Submit the update
    await page.getByTestId('edit-document-submit').click()

    // Wait for modal to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify the update in the list
    await expect(page.getByText('E2E Test User Updated')).toBeVisible({ timeout: 10000 })

    // ===== DELETE =====
    // Find the updated document row
    const updatedDocumentRow = page.locator('[data-testid="document-row"]').filter({
      hasText: 'E2E Test User Updated',
    })
    await expect(updatedDocumentRow).toBeVisible()

    // Open actions menu
    await updatedDocumentRow.getByTestId('document-actions-menu').click()

    // Click Delete
    await page.getByTestId('menu-action-delete').click()

    // Confirm deletion in the dialog
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Delete Document')).toBeVisible()
    await expect(page.getByText('This action cannot be undone')).toBeVisible()

    // Click the delete confirmation button
    await page.getByRole('button', { name: /delete/i }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // Verify document is no longer in the list
    await expect(page.getByText('E2E Test User Updated')).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Document CRUD - Create Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
  })

  test('opens insert document modal when clicking Add Document', async ({ page }) => {
    await page.getByTestId('add-document-button').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Insert Document')).toBeVisible()
    await expect(page.getByTestId('create-document-editor')).toBeVisible()
    await expect(page.getByTestId('create-document-submit')).toBeVisible()
  })

  test('can close insert modal without saving', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click Cancel button
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Modal should be closed
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('shows error for invalid JSON in create modal', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{ invalid json }')

    await page.getByTestId('create-document-submit').click()

    // Should show error message
    await expect(page.getByTestId('create-error')).toBeVisible()
  })

  test('shows error when trying to insert non-object JSON', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('["array", "not", "object"]')

    await page.getByTestId('create-document-submit').click()

    // Should show error about object requirement
    await expect(page.getByTestId('create-error')).toBeVisible()
    await expect(page.getByText('Document must be a JSON object')).toBeVisible()
  })

  test('can format JSON in create modal', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"test","age":25}')

    // Click format button
    await page.getByLabel('Format JSON').click()

    // The editor content should now be formatted
    const editorContent = await editor.textContent()
    expect(editorContent).toContain('  "name"')
  })

  test('can clear editor content in create modal', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"test"}')

    // Click clear button
    await page.getByLabel('Clear').click()

    // Editor should be reset to default
    const editorContent = await editor.textContent()
    expect(editorContent?.trim()).toBe('{}')
  })

  test('submit button is disabled during document creation', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"test"}')

    // Intercept and delay the API call
    await page.route('**/rpc/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.continue()
    })

    const submitButton = page.getByTestId('create-document-submit')
    await submitButton.click()

    // Button should show loading state
    await expect(submitButton).toContainText('Inserting...')
    await expect(submitButton).toBeDisabled()
  })

  test('can submit document with keyboard shortcut (Cmd+Enter)', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"Keyboard Test User","email":"keyboard@test.com"}')

    // Use keyboard shortcut
    await page.keyboard.press('Meta+Enter')

    // Modal should close on success
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
  })
})

test.describe('Document CRUD - Read Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
  })

  test('displays documents in table view', async ({ page }) => {
    // Table should be visible by default
    await expect(page.getByTestId('document-table')).toBeVisible()

    // Should have document rows
    const rows = page.locator('[data-testid="document-row"]')
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
  })

  test('can switch to JSON view to read documents', async ({ page }) => {
    // Click JSON view toggle
    await page.getByTestId('view-toggle-json').click()

    // JSON view should be visible
    await expect(page.getByTestId('json-view')).toBeVisible()
    await expect(page.getByTestId('view-toggle-json')).toHaveAttribute('aria-pressed', 'true')
  })

  test('can expand document row to see all fields', async ({ page }) => {
    await expect(page.getByTestId('document-table')).toBeVisible()

    const firstRow = page.locator('[data-testid="document-row"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Click expand button
    const expandButton = firstRow.getByTestId('expand-button')
    if (await expandButton.isVisible()) {
      await expandButton.click()

      // Expanded content should be visible
      await expect(firstRow.getByTestId('expanded-content')).toBeVisible()
    }
  })

  test('can view document via actions menu', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Open actions menu
    await firstRow.getByTestId('document-actions-menu').click()

    // View action should be available
    const viewAction = page.getByTestId('menu-action-view')
    if (await viewAction.isVisible()) {
      await viewAction.click()
      // Should navigate or show document details
    }
  })

  test('can copy document ID via actions menu', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Open actions menu
    await firstRow.getByTestId('document-actions-menu').click()

    // Click copy ID
    await page.getByTestId('menu-action-copy-id').click()

    // Menu should close after action
    await expect(page.getByTestId('menu-action-copy-id')).not.toBeVisible()
  })

  test('can copy document as JSON via actions menu', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Open actions menu
    await firstRow.getByTestId('document-actions-menu').click()

    // Click copy JSON
    await page.getByTestId('menu-action-copy-json').click()

    // Menu should close after action
    await expect(page.getByTestId('menu-action-copy-json')).not.toBeVisible()
  })

  test('can export document as JSON file via actions menu', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Open actions menu
    await firstRow.getByTestId('document-actions-menu').click()

    // Set up download handler
    const downloadPromise = page.waitForEvent('download')

    // Click export
    await page.getByTestId('menu-action-export').click()

    // Should trigger download
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })
})

test.describe('Document CRUD - Update Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="document-row"]').first()).toBeVisible({ timeout: 10000 })
  })

  test('opens edit modal from document actions menu', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()

    // Open actions menu
    await firstRow.getByTestId('document-actions-menu').click()

    // Click edit
    await page.getByTestId('menu-action-edit').click()

    // Edit modal should appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Edit Document')).toBeVisible()
    await expect(page.getByTestId('edit-document-editor')).toBeVisible()
  })

  test('edit modal shows document ID that cannot be changed', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Should display the _id
    await expect(page.getByText('_id:')).toBeVisible()
  })

  test('shows error when trying to modify _id field', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('edit-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    // Try to change _id
    await page.keyboard.type('{"_id":"changed-id","name":"test"}')

    await page.getByTestId('edit-document-submit').click()

    // Should show error
    await expect(page.getByTestId('edit-error')).toBeVisible()
    await expect(page.getByText('Cannot modify _id field')).toBeVisible()
  })

  test('save button is disabled when no changes made', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Save button should be disabled without changes
    await expect(page.getByTestId('edit-document-submit')).toBeDisabled()
  })

  test('shows Modified badge when document has unsaved changes', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Make a change
    const editor = page.getByTestId('edit-document-editor')
    await editor.click()
    // Add a space to trigger change detection
    await page.keyboard.press('End')
    await page.keyboard.type(' ')

    // Should show Modified badge
    await expect(page.getByText('Modified')).toBeVisible()
  })

  test('can reset changes using Reset button', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Get original content
    const editor = page.getByTestId('edit-document-editor')
    const originalContent = await editor.textContent()

    // Make a change
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type('MODIFIED')

    // Click reset
    await page.getByLabel('Reset changes').click()

    // Content should be restored
    const restoredContent = await editor.textContent()
    expect(restoredContent).toBe(originalContent)
  })

  test('can duplicate document via actions menu', async ({ page }) => {
    // Count documents before
    const initialCount = await page.locator('[data-testid="document-row"]').count()

    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()

    // Click duplicate
    await page.getByTestId('menu-action-duplicate').click()

    // Wait for the duplicate to appear
    await page.waitForTimeout(1000)

    // Should have one more document
    const newCount = await page.locator('[data-testid="document-row"]').count()
    expect(newCount).toBe(initialCount + 1)
  })

  test('submit button shows loading state during update', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Make a change
    const editor = page.getByTestId('edit-document-editor')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ')

    // Intercept and delay the API call
    await page.route('**/rpc/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.continue()
    })

    const submitButton = page.getByTestId('edit-document-submit')
    await submitButton.click()

    // Button should show loading state
    await expect(submitButton).toContainText('Saving...')
    await expect(submitButton).toBeDisabled()
  })
})

test.describe('Document CRUD - Delete Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="document-row"]').first()).toBeVisible({ timeout: 10000 })
  })

  test('opens delete confirmation dialog from actions menu', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()

    // Click delete
    await page.getByTestId('menu-action-delete').click()

    // Delete dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Delete Document')).toBeVisible()
  })

  test('delete dialog shows warning about permanent deletion', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-delete').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Should show warning
    await expect(page.getByText('This action cannot be undone')).toBeVisible()
    await expect(page.getByText('permanently deleted')).toBeVisible()
  })

  test('delete dialog shows document ID and preview', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-delete').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Should show document ID
    await expect(page.getByText('Document ID:')).toBeVisible()

    // Should show document preview
    await expect(page.getByTestId('delete-document-preview')).toBeVisible()
  })

  test('can cancel delete operation', async ({ page }) => {
    const initialCount = await page.locator('[data-testid="document-row"]').count()

    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-delete').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Click cancel
    await page.getByRole('button', { name: /cancel/i }).click()

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Document count should be unchanged
    const finalCount = await page.locator('[data-testid="document-row"]').count()
    expect(finalCount).toBe(initialCount)
  })

  test('delete button shows loading state during deletion', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-delete').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Intercept and delay the API call
    await page.route('**/rpc/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.continue()
    })

    const deleteButton = page.getByRole('button', { name: /delete/i }).last()
    await deleteButton.click()

    // Button should show loading state
    await expect(deleteButton).toContainText('Deleting...')
  })

  test('shows error message when delete fails', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-delete').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Intercept and fail the API call
    await page.route('**/rpc/**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await page.getByRole('button', { name: /delete/i }).last().click()

    // Should show error
    await expect(page.getByTestId('delete-error')).toBeVisible()
  })
})

test.describe('Document CRUD - Bulk Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="document-row"]').first()).toBeVisible({ timeout: 10000 })
  })

  test('can select multiple documents', async ({ page }) => {
    // Enable selection mode and select multiple rows
    const rows = page.locator('[data-testid="document-row"]')
    const firstRowCheckbox = rows.first().getByRole('checkbox')
    const secondRowCheckbox = rows.nth(1).getByRole('checkbox')

    if (await firstRowCheckbox.isVisible()) {
      await firstRowCheckbox.click()
      await secondRowCheckbox.click()

      // Selection info should show count
      await expect(page.getByTestId('selection-info')).toBeVisible()
      await expect(page.getByText('2 selected')).toBeVisible()
    }
  })

  test('can select all documents', async ({ page }) => {
    const selectAllCheckbox = page.getByTestId('select-all-checkbox')

    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click()

      // All rows should be selected
      const checkboxes = page.locator('[data-testid="document-row"]').getByRole('checkbox')
      const count = await checkboxes.count()

      for (let i = 0; i < count; i++) {
        await expect(checkboxes.nth(i)).toBeChecked()
      }
    }
  })

  test('shows bulk actions when documents are selected', async ({ page }) => {
    const rows = page.locator('[data-testid="document-row"]')
    const firstRowCheckbox = rows.first().getByRole('checkbox')

    if (await firstRowCheckbox.isVisible()) {
      await firstRowCheckbox.click()

      // Bulk actions should appear
      await expect(page.getByTestId('bulk-actions')).toBeVisible()
      await expect(page.getByTestId('bulk-delete')).toBeVisible()
      await expect(page.getByTestId('bulk-export')).toBeVisible()
      await expect(page.getByTestId('bulk-copy')).toBeVisible()
    }
  })

  test('can bulk delete selected documents', async ({ page }) => {
    const rows = page.locator('[data-testid="document-row"]')
    const firstRowCheckbox = rows.first().getByRole('checkbox')
    const secondRowCheckbox = rows.nth(1).getByRole('checkbox')

    if (await firstRowCheckbox.isVisible()) {
      const initialCount = await rows.count()

      await firstRowCheckbox.click()
      await secondRowCheckbox.click()

      // Click bulk delete
      await page.getByTestId('bulk-delete').click()

      // Confirmation dialog should appear
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Delete Documents')).toBeVisible()
      await expect(page.getByText('2 documents')).toBeVisible()

      // Confirm deletion
      await page.getByRole('button', { name: /delete/i }).click()

      // Dialog should close
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // Should have 2 fewer documents
      const finalCount = await rows.count()
      expect(finalCount).toBe(initialCount - 2)
    }
  })

  test('can clear selection', async ({ page }) => {
    const rows = page.locator('[data-testid="document-row"]')
    const firstRowCheckbox = rows.first().getByRole('checkbox')

    if (await firstRowCheckbox.isVisible()) {
      await firstRowCheckbox.click()

      await expect(page.getByTestId('bulk-actions')).toBeVisible()

      // Click clear selection
      await page.getByTestId('bulk-clear').click()

      // Bulk actions should disappear
      await expect(page.getByTestId('bulk-actions')).not.toBeVisible()
      await expect(firstRowCheckbox).not.toBeChecked()
    }
  })

  test('can bulk export selected documents', async ({ page }) => {
    const rows = page.locator('[data-testid="document-row"]')
    const firstRowCheckbox = rows.first().getByRole('checkbox')
    const secondRowCheckbox = rows.nth(1).getByRole('checkbox')

    if (await firstRowCheckbox.isVisible()) {
      await firstRowCheckbox.click()
      await secondRowCheckbox.click()

      // Set up download handler
      const downloadPromise = page.waitForEvent('download')

      // Click bulk export
      await page.getByTestId('bulk-export').click()

      // Should trigger download
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/\.json$/)
    }
  })
})

test.describe('Document CRUD - Inline Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="document-row"]').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows inline action buttons on document row hover', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()

    // Hover over the row
    await firstRow.hover()

    // Inline actions should be visible
    const inlineActions = firstRow.getByTestId('inline-actions')
    if (await inlineActions.isVisible()) {
      await expect(inlineActions.getByTestId('action-edit')).toBeVisible()
      await expect(inlineActions.getByTestId('action-delete')).toBeVisible()
    }
  })

  test('can edit document using inline edit button', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.hover()

    const inlineEditButton = firstRow.getByTestId('action-edit')
    if (await inlineEditButton.isVisible()) {
      await inlineEditButton.click()

      // Edit modal should open
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Edit Document')).toBeVisible()
    }
  })

  test('can delete document using inline delete button', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.hover()

    const inlineDeleteButton = firstRow.getByTestId('action-delete')
    if (await inlineDeleteButton.isVisible()) {
      await inlineDeleteButton.click()

      // Delete dialog should open
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Delete Document')).toBeVisible()
    }
  })

  test('can copy document JSON using inline copy button', async ({ page }) => {
    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.hover()

    const inlineCopyButton = firstRow.getByTestId('action-copy-json')
    if (await inlineCopyButton.isVisible()) {
      await inlineCopyButton.click()

      // Should copy to clipboard (hard to verify, but button action should complete)
    }
  })
})

test.describe('Document CRUD - Error Handling', () => {
  test('shows error when create operation fails', async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })

    // Intercept and fail the create request
    await page.route('**/rpc/**', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database error' }),
        })
      } else {
        route.continue()
      }
    })

    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"test"}')

    await page.getByTestId('create-document-submit').click()

    // Should show error
    await expect(page.getByTestId('create-error')).toBeVisible()
  })

  test('shows error when update operation fails', async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="document-row"]').first()).toBeVisible({ timeout: 10000 })

    const firstRow = page.locator('[data-testid="document-row"]').first()
    await firstRow.getByTestId('document-actions-menu').click()
    await page.getByTestId('menu-action-edit').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    // Make a change
    const editor = page.getByTestId('edit-document-editor')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ')

    // Intercept and fail the update request
    await page.route('**/rpc/**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Update failed' }),
      })
    })

    await page.getByTestId('edit-document-submit').click()

    // Should show error
    await expect(page.getByTestId('edit-error')).toBeVisible()
  })

  test('handles network errors gracefully', async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })

    // Abort network requests
    await page.route('**/rpc/**', (route) => {
      route.abort('failed')
    })

    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"test"}')

    await page.getByTestId('create-document-submit').click()

    // Should show error
    await expect(page.getByTestId('create-error')).toBeVisible()
  })
})

test.describe('Document CRUD - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/database/testdb/collection/users')
    await expect(page.getByTestId('document-list')).toBeVisible({ timeout: 10000 })
  })

  test('can close create modal with Escape key when empty', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('can format JSON with Cmd+Shift+F in create modal', async ({ page }) => {
    await page.getByTestId('add-document-button').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const editor = page.getByTestId('create-document-editor')
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('{"name":"test","age":25}')

    // Use keyboard shortcut to format
    await page.keyboard.press('Meta+Shift+f')

    // The editor content should now be formatted
    const editorContent = await editor.textContent()
    expect(editorContent).toContain('\n')
  })
})
