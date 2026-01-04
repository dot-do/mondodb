import { test, expect } from '@playwright/test'

/**
 * RED Phase E2E Tests for Connection Panel
 *
 * These tests verify the ConnectionPanel component's connect flow, error handling,
 * and connection persistence functionality. They are expected to FAIL in the RED phase
 * because the full backend integration for connection management isn't complete.
 *
 * Test scenarios covered:
 * 1. Connect flow - user can enter connection string and connect
 * 2. Error handling - invalid connection strings show errors
 * 3. Persistence - saved connections are remembered across page reloads
 */

test.describe('Connection Panel - Connect Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure clean state
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('mondodb-connections')
      localStorage.removeItem('mondodb-recent-connections')
    })
    await page.reload()
  })

  test('displays the connection panel on initial load', async ({ page }) => {
    await page.goto('/')

    // Should show the main connection panel
    await expect(page.getByTestId('connection-panel')).toBeVisible()

    // Should display the mondodb Studio title
    await expect(page.getByText('mondodb Studio')).toBeVisible()

    // Should show disconnected status
    await expect(page.getByText('Disconnected')).toBeVisible()
  })

  test('shows view tabs when disconnected', async ({ page }) => {
    await page.goto('/')

    // Should show Saved, New, and Quick tabs
    await expect(page.getByTestId('tab-list')).toBeVisible()
    await expect(page.getByTestId('tab-new')).toBeVisible()
    await expect(page.getByTestId('tab-quick')).toBeVisible()
  })

  test('can navigate to new connection form', async ({ page }) => {
    await page.goto('/')

    // Click on the New tab
    await page.getByTestId('tab-new').click()

    // Should show the connection form
    await expect(page.getByTestId('connection-form')).toBeVisible()

    // Should show the connection name input
    await expect(page.getByTestId('connection-name-input')).toBeVisible()

    // Should show the connection URI input
    await expect(page.getByTestId('connection-uri-input')).toBeVisible()
  })

  test('can fill in connection details and connect', async ({ page }) => {
    await page.goto('/')

    // Navigate to New tab
    await page.getByTestId('tab-new').click()

    // Fill in connection name
    const nameInput = page.getByTestId('connection-name-input')
    await nameInput.clear()
    await nameInput.fill('Local Development')

    // Fill in connection URI
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()
    await uriInput.fill('mondodb://localhost:27017')

    // Verify values were entered
    await expect(nameInput).toHaveValue('Local Development')
    await expect(uriInput).toHaveValue('mondodb://localhost:27017')

    // Click connect button
    await page.getByTestId('connect-button').click()

    // Should show connecting status
    await expect(page.getByText('Connecting...')).toBeVisible()

    // After connection completes, should show Connected status
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })

    // Status indicator should show green and connection name
    await expect(page.getByTestId('connection-status')).toBeVisible()
    await expect(page.getByText('Local Development')).toBeVisible()
  })

  test('can quick connect with URI', async ({ page }) => {
    await page.goto('/')

    // Navigate to Quick tab
    await page.getByTestId('tab-quick').click()

    // Should show quick connect input
    await expect(page.getByTestId('quick-connect')).toBeVisible()
    await expect(page.getByTestId('quick-connect-input')).toBeVisible()

    // Enter connection URI
    const quickInput = page.getByTestId('quick-connect-input')
    await quickInput.fill('mondodb://localhost:27017/testdb')

    // Click connect
    await page.getByTestId('quick-connect-button').click()

    // Should attempt connection
    await expect(page.getByText('Connecting...')).toBeVisible()

    // After successful connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })
  })

  test('can connect to saved connection from list', async ({ page }) => {
    // Set up a saved connection in localStorage
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'saved-conn-1',
          name: 'Saved Connection',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          database: 'testdb',
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Should be on Saved tab by default
    await expect(page.getByTestId('connection-list')).toBeVisible()

    // Should show the saved connection
    await expect(page.getByText('Saved Connection')).toBeVisible()

    // Click on the saved connection to connect
    await page.getByTestId('connection-item-saved-conn-1').click()

    // Should show connecting status
    await expect(page.getByText('Connecting...')).toBeVisible()

    // After connection completes
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })
  })

  test('shows connection details after successful connection', async ({ page }) => {
    await page.goto('/')

    // Quick connect to a database
    await page.getByTestId('tab-quick').click()
    await page.getByTestId('quick-connect-input').fill('mondodb://localhost:27017/mydb')
    await page.getByTestId('quick-connect-button').click()

    // Wait for connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })

    // Should show connected info panel
    await expect(page.getByTestId('connected-info')).toBeVisible()

    // Should show host and port
    await expect(page.getByText(/localhost:27017/)).toBeVisible()

    // Should show database name
    await expect(page.getByText(/mydb/)).toBeVisible()
  })

  test('can disconnect from a connection', async ({ page }) => {
    await page.goto('/')

    // Quick connect first
    await page.getByTestId('tab-quick').click()
    await page.getByTestId('quick-connect-input').fill('mondodb://localhost:27017')
    await page.getByTestId('quick-connect-button').click()

    // Wait for connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })

    // Click disconnect button
    await page.getByTestId('disconnect-button').click()

    // Should return to disconnected state
    await expect(page.getByText('Disconnected')).toBeVisible()

    // Should show the tabs again
    await expect(page.getByTestId('tab-list')).toBeVisible()
  })

  test('can refresh connection status when connected', async ({ page }) => {
    await page.goto('/')

    // Quick connect
    await page.getByTestId('tab-quick').click()
    await page.getByTestId('quick-connect-input').fill('mondodb://localhost:27017')
    await page.getByTestId('quick-connect-button').click()

    // Wait for connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })

    // Click refresh button
    await page.getByTestId('refresh-button').click()

    // Should still be connected
    await expect(page.getByText('Connected')).toBeVisible()
  })

  test('hides tabs when connected', async ({ page }) => {
    await page.goto('/')

    // Quick connect
    await page.getByTestId('tab-quick').click()
    await page.getByTestId('quick-connect-input').fill('mondodb://localhost:27017')
    await page.getByTestId('quick-connect-button').click()

    // Wait for connection
    await expect(page.getByText('Connected')).toBeVisible({ timeout: 15000 })

    // Tabs should be hidden
    await expect(page.getByTestId('tab-list')).not.toBeVisible()
    await expect(page.getByTestId('tab-new')).not.toBeVisible()
    await expect(page.getByTestId('tab-quick')).not.toBeVisible()
  })
})

test.describe('Connection Panel - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('mondodb-connections')
      localStorage.removeItem('mondodb-recent-connections')
    })
    await page.reload()
  })

  test('shows error for invalid connection string format', async ({ page }) => {
    await page.goto('/')

    // Navigate to New connection form
    await page.getByTestId('tab-new').click()

    // Enter invalid URI format
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()
    await uriInput.fill('not-a-valid-uri')

    // Try to connect
    await page.getByTestId('connect-button').click()

    // Should show error message
    await expect(page.getByTestId('connection-error')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Invalid connection string/i)).toBeVisible()
  })

  test('shows error for unreachable host', async ({ page }) => {
    await page.goto('/')

    // Navigate to New connection form
    await page.getByTestId('tab-new').click()

    // Enter URI with unreachable host
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()
    await uriInput.fill('mondodb://nonexistent-host.invalid:27017')

    // Try to connect
    await page.getByTestId('connect-button').click()

    // Should show connecting status first
    await expect(page.getByText('Connecting...')).toBeVisible()

    // Should eventually show error
    await expect(page.getByTestId('connection-error')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/Connection failed|Unable to connect|Error/i)).toBeVisible()

    // Should show error status
    await expect(page.getByText('Error')).toBeVisible()
  })

  test('shows error for connection refused', async ({ page }) => {
    await page.goto('/')

    // Navigate to Quick connect
    await page.getByTestId('tab-quick').click()

    // Try to connect to a port that's not running MongoDB
    await page.getByTestId('quick-connect-input').fill('mondodb://localhost:39999')
    await page.getByTestId('quick-connect-button').click()

    // Should show error
    await expect(page.getByTestId('connection-status')).toBeVisible()
    await expect(page.getByText(/Error|Connection refused|failed/i)).toBeVisible({ timeout: 15000 })
  })

  test('shows error for authentication failure', async ({ page }) => {
    await page.goto('/')

    // Navigate to form tab for detailed connection
    await page.getByTestId('tab-new').click()
    await page.getByTestId('form-tab').click()

    // Fill in host and port
    await page.getByTestId('connection-host-input').fill('localhost')
    await page.getByTestId('connection-port-input').fill('27017')

    // Select basic auth
    await page.getByTestId('connection-auth-select').selectOption('basic')

    // Fill in invalid credentials
    await page.getByTestId('connection-username-input').fill('invalid_user')
    await page.getByTestId('connection-password-input').fill('wrong_password')

    // Try to connect
    await page.getByTestId('connect-button').click()

    // Should show authentication error
    await expect(page.getByText(/Authentication failed|Invalid credentials|Unauthorized/i)).toBeVisible({ timeout: 15000 })
  })

  test('test connection shows failure for invalid URI', async ({ page }) => {
    await page.goto('/')

    // Navigate to New connection form
    await page.getByTestId('tab-new').click()

    // Enter invalid URI
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()
    await uriInput.fill('mondodb://nonexistent:99999')

    // Click test button
    await page.getByTestId('test-button').click()

    // Should show test result with failure
    await expect(page.getByTestId('test-result')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Connection failed|Error|failed/i)).toBeVisible()
  })

  test('test connection shows success for valid connection', async ({ page }) => {
    await page.goto('/')

    // Navigate to New connection form
    await page.getByTestId('tab-new').click()

    // Enter valid URI (assuming local server is running)
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()
    await uriInput.fill('mondodb://localhost:27017')

    // Click test button
    await page.getByTestId('test-button').click()

    // Should show test result with success
    await expect(page.getByTestId('test-result')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Connection successful/i)).toBeVisible()

    // Should show latency
    await expect(page.getByText(/\d+ms/)).toBeVisible()
  })

  test('empty connection string shows validation error', async ({ page }) => {
    await page.goto('/')

    // Navigate to New connection form
    await page.getByTestId('tab-new').click()

    // Clear the URI input
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()

    // Try to connect with empty string
    await page.getByTestId('connect-button').click()

    // Should show validation error
    await expect(page.getByText(/required|cannot be empty|Please enter/i)).toBeVisible({ timeout: 5000 })
  })

  test('error state clears when switching views', async ({ page }) => {
    await page.goto('/')

    // Trigger an error
    await page.getByTestId('tab-new').click()
    const uriInput = page.getByTestId('connection-uri-input')
    await uriInput.clear()
    await uriInput.fill('invalid-uri')
    await page.getByTestId('connect-button').click()

    // Wait for error
    await expect(page.getByTestId('connection-error')).toBeVisible({ timeout: 5000 })

    // Switch to Quick tab
    await page.getByTestId('tab-quick').click()

    // Switch back to New
    await page.getByTestId('tab-new').click()

    // Error should be cleared (fresh form)
    await expect(page.getByTestId('connection-error')).not.toBeVisible()
  })

  test('displays error badge in status indicator', async ({ page }) => {
    await page.goto('/')

    // Try to connect to invalid host
    await page.getByTestId('tab-quick').click()
    await page.getByTestId('quick-connect-input').fill('mondodb://invalid-host:12345')
    await page.getByTestId('quick-connect-button').click()

    // Should show error status in indicator
    await expect(page.getByTestId('connection-status')).toBeVisible()
    await expect(page.getByText('[X]')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Connection Panel - Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('mondodb-connections')
      localStorage.removeItem('mondodb-recent-connections')
    })
    await page.reload()
  })

  test('saved connections persist across page reloads', async ({ page }) => {
    await page.goto('/')

    // Navigate to New connection form
    await page.getByTestId('tab-new').click()

    // Fill in connection details
    await page.getByTestId('connection-name-input').fill('Persistent Connection')
    await page.getByTestId('connection-uri-input').fill('mondodb://localhost:27017')

    // Save the connection (not connect)
    await page.getByTestId('save-button').click()

    // Should return to list view
    await expect(page.getByTestId('connection-list')).toBeVisible()

    // Should show the saved connection
    await expect(page.getByText('Persistent Connection')).toBeVisible()

    // Reload the page
    await page.reload()

    // Should still show the saved connection
    await expect(page.getByTestId('connection-list')).toBeVisible()
    await expect(page.getByText('Persistent Connection')).toBeVisible()
  })

  test('multiple saved connections are remembered', async ({ page }) => {
    await page.goto('/')

    // Save first connection
    await page.getByTestId('tab-new').click()
    await page.getByTestId('connection-name-input').fill('Connection One')
    await page.getByTestId('connection-uri-input').fill('mondodb://localhost:27017')
    await page.getByTestId('save-button').click()

    // Save second connection
    await page.getByTestId('tab-new').click()
    await page.getByTestId('connection-name-input').fill('Connection Two')
    await page.getByTestId('connection-uri-input').fill('mondodb://localhost:27018')
    await page.getByTestId('save-button').click()

    // Save third connection
    await page.getByTestId('tab-new').click()
    await page.getByTestId('connection-name-input').fill('Connection Three')
    await page.getByTestId('connection-uri-input').fill('mondodb://localhost:27019')
    await page.getByTestId('save-button').click()

    // Reload page
    await page.reload()

    // All connections should be present
    await expect(page.getByText('Connection One')).toBeVisible()
    await expect(page.getByText('Connection Two')).toBeVisible()
    await expect(page.getByText('Connection Three')).toBeVisible()
  })

  test('recent connections appear in quick connect', async ({ page }) => {
    // Set up some recent connections
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'recent-1',
          name: 'Recent DB 1',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date().toISOString(),
        },
        {
          id: 'recent-2',
          name: 'Recent DB 2',
          uri: 'mondodb://localhost:27018',
          host: 'localhost',
          port: 27018,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Navigate to Quick connect
    await page.getByTestId('tab-quick').click()

    // Should show recent connections
    await expect(page.getByTestId('recent-recent-1')).toBeVisible()
    await expect(page.getByTestId('recent-recent-2')).toBeVisible()
  })

  test('clicking recent connection fills URI input', async ({ page }) => {
    // Set up a recent connection
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'recent-fill',
          name: 'Recent Fill',
          uri: 'mondodb://fillme:27017/testdb',
          host: 'fillme',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date().toISOString(),
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Navigate to Quick connect
    await page.getByTestId('tab-quick').click()

    // Click on the recent connection
    await page.getByTestId('recent-recent-fill').click()

    // URI input should be filled
    await expect(page.getByTestId('quick-connect-input')).toHaveValue('mondodb://fillme:27017/testdb')
  })

  test('can edit saved connection', async ({ page }) => {
    // Set up a saved connection
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'edit-conn',
          name: 'Edit Me',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Open connection menu
    await page.getByTestId('menu-edit-conn').click()

    // Click edit
    await page.getByTestId('edit-edit-conn').click()

    // Should show form with existing values
    await expect(page.getByTestId('connection-form')).toBeVisible()
    await expect(page.getByTestId('connection-name-input')).toHaveValue('Edit Me')

    // Edit the name
    const nameInput = page.getByTestId('connection-name-input')
    await nameInput.clear()
    await nameInput.fill('Edited Connection')

    // Save changes
    await page.getByTestId('save-button').click()

    // Should show updated name
    await expect(page.getByText('Edited Connection')).toBeVisible()
    await expect(page.getByText('Edit Me')).not.toBeVisible()

    // Reload to verify persistence
    await page.reload()
    await expect(page.getByText('Edited Connection')).toBeVisible()
  })

  test('can delete saved connection', async ({ page }) => {
    // Set up saved connections
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'delete-me',
          name: 'Delete Me',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
        },
        {
          id: 'keep-me',
          name: 'Keep Me',
          uri: 'mondodb://localhost:27018',
          host: 'localhost',
          port: 27018,
          auth: { type: 'none' },
          tls: { enabled: false },
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Open connection menu
    await page.getByTestId('menu-delete-me').click()

    // Click delete
    await page.getByTestId('delete-delete-me').click()

    // Connection should be removed
    await expect(page.getByText('Delete Me')).not.toBeVisible()
    await expect(page.getByText('Keep Me')).toBeVisible()

    // Reload to verify persistence
    await page.reload()
    await expect(page.getByText('Delete Me')).not.toBeVisible()
    await expect(page.getByText('Keep Me')).toBeVisible()
  })

  test('can duplicate saved connection', async ({ page }) => {
    // Set up a saved connection
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'dup-original',
          name: 'Original Connection',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Open connection menu
    await page.getByTestId('menu-dup-original').click()

    // Click duplicate
    await page.getByTestId('duplicate-dup-original').click()

    // Should show both original and duplicate
    await expect(page.getByText('Original Connection')).toBeVisible()
    await expect(page.getByText(/Original Connection \(Copy\)|Copy of Original Connection/)).toBeVisible()

    // Reload to verify persistence
    await page.reload()
    await expect(page.getByText('Original Connection')).toBeVisible()
    await expect(page.getByText(/Original Connection \(Copy\)|Copy of Original Connection/)).toBeVisible()
  })

  test('can toggle connection as favorite', async ({ page }) => {
    // Set up a saved connection
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'fav-conn',
          name: 'Favorite Me',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: false,
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Click favorite toggle
    await page.getByTestId('favorite-fav-conn').click()

    // Should be marked as favorite
    // Toggle favorites filter to verify
    await page.getByTestId('favorites-toggle').click()
    await expect(page.getByText('Favorite Me')).toBeVisible()

    // Reload and check favorites filter still shows it
    await page.reload()
    await page.getByTestId('favorites-toggle').click()
    await expect(page.getByText('Favorite Me')).toBeVisible()
  })

  test('favorites persist across reloads', async ({ page }) => {
    // Set up a favorite connection
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'persisted-fav',
          name: 'Persisted Favorite',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: true,
        },
        {
          id: 'not-fav',
          name: 'Not Favorite',
          uri: 'mondodb://localhost:27018',
          host: 'localhost',
          port: 27018,
          auth: { type: 'none' },
          tls: { enabled: false },
          isFavorite: false,
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Toggle favorites filter
    await page.getByTestId('favorites-toggle').click()

    // Should only show favorite connection
    await expect(page.getByText('Persisted Favorite')).toBeVisible()
    await expect(page.getByText('Not Favorite')).not.toBeVisible()
  })

  test('connection count is displayed correctly', async ({ page }) => {
    // Set up multiple connections
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        { id: 'c1', name: 'Conn 1', uri: 'mondodb://localhost:27017', host: 'localhost', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        { id: 'c2', name: 'Conn 2', uri: 'mondodb://localhost:27018', host: 'localhost', port: 27018, auth: { type: 'none' }, tls: { enabled: false } },
        { id: 'c3', name: 'Conn 3', uri: 'mondodb://localhost:27019', host: 'localhost', port: 27019, auth: { type: 'none' }, tls: { enabled: false } },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Should show connection count
    await expect(page.getByTestId('connection-count')).toHaveTextContent('3 of 3 connections')
  })

  test('search filters connections and updates count', async ({ page }) => {
    // Set up connections
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        { id: 'prod', name: 'Production DB', uri: 'mondodb://prod:27017', host: 'prod', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        { id: 'stage', name: 'Staging DB', uri: 'mondodb://stage:27017', host: 'stage', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
        { id: 'dev', name: 'Development DB', uri: 'mondodb://dev:27017', host: 'dev', port: 27017, auth: { type: 'none' }, tls: { enabled: false } },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Search for 'Production'
    await page.getByTestId('search-input').fill('Production')

    // Should only show Production DB
    await expect(page.getByText('Production DB')).toBeVisible()
    await expect(page.getByText('Staging DB')).not.toBeVisible()
    await expect(page.getByText('Development DB')).not.toBeVisible()

    // Count should update
    await expect(page.getByTestId('connection-count')).toHaveTextContent('1 of 3 connections')
  })

  test('connections sorted by recent shows most recent first', async ({ page }) => {
    // Set up connections with different lastConnectedAt times
    await page.goto('/')
    await page.evaluate(() => {
      const now = Date.now()
      const connections = [
        { id: 'old', name: 'Old Connection', uri: 'mondodb://old:27017', host: 'old', port: 27017, auth: { type: 'none' }, tls: { enabled: false }, lastConnectedAt: new Date(now - 86400000).toISOString() },
        { id: 'newest', name: 'Newest Connection', uri: 'mondodb://newest:27017', host: 'newest', port: 27017, auth: { type: 'none' }, tls: { enabled: false }, lastConnectedAt: new Date(now).toISOString() },
        { id: 'middle', name: 'Middle Connection', uri: 'mondodb://middle:27017', host: 'middle', port: 27017, auth: { type: 'none' }, tls: { enabled: false }, lastConnectedAt: new Date(now - 3600000).toISOString() },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Sort by recent
    await page.getByTestId('sort-select').selectOption('recent')

    // Get all connection items
    const items = await page.getByTestId(/connection-item-/).all()

    // First should be newest
    expect(await items[0].getAttribute('data-testid')).toBe('connection-item-newest')
  })

  test('empty state shows when no saved connections', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('mondodb-connections')
    })
    await page.reload()

    // Should show empty state
    await expect(page.getByText('No saved connections')).toBeVisible()
  })

  test('last connected time is displayed for recent connections', async ({ page }) => {
    // Set up a connection with lastConnectedAt
    await page.goto('/')
    await page.evaluate(() => {
      const connections = [
        {
          id: 'with-time',
          name: 'Timed Connection',
          uri: 'mondodb://localhost:27017',
          host: 'localhost',
          port: 27017,
          auth: { type: 'none' },
          tls: { enabled: false },
          lastConnectedAt: new Date().toISOString(),
        },
      ]
      localStorage.setItem('mondodb-connections', JSON.stringify(connections))
    })
    await page.reload()

    // Should show relative time or "just now" or similar
    await expect(page.getByText(/just now|seconds? ago|moments? ago/i)).toBeVisible()
  })
})

test.describe('Connection Panel - Advanced Form Fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.removeItem('mondodb-connections')
    })
    await page.reload()
  })

  test('can switch between URI and form connection methods', async ({ page }) => {
    await page.goto('/')

    // Navigate to New tab
    await page.getByTestId('tab-new').click()

    // Should default to URI tab
    await expect(page.getByTestId('connection-uri-input')).toBeVisible()

    // Switch to form tab
    await page.getByTestId('form-tab').click()

    // Should show host and port inputs
    await expect(page.getByTestId('connection-host-input')).toBeVisible()
    await expect(page.getByTestId('connection-port-input')).toBeVisible()
  })

  test('form tab shows authentication options', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('tab-new').click()
    await page.getByTestId('form-tab').click()

    // Should show auth select
    await expect(page.getByTestId('connection-auth-select')).toBeVisible()

    // Select basic auth
    await page.getByTestId('connection-auth-select').selectOption('basic')

    // Should show username/password fields
    await expect(page.getByTestId('connection-username-input')).toBeVisible()
    await expect(page.getByTestId('connection-password-input')).toBeVisible()
    await expect(page.getByTestId('connection-authsource-input')).toBeVisible()
  })

  test('form tab shows TLS options', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('tab-new').click()
    await page.getByTestId('form-tab').click()

    // Should show TLS checkbox
    await expect(page.getByTestId('connection-tls-checkbox')).toBeVisible()
  })

  test('saves connection with all advanced options', async ({ page }) => {
    await page.goto('/')

    await page.getByTestId('tab-new').click()

    // Fill name
    await page.getByTestId('connection-name-input').fill('Advanced Connection')

    // Switch to form tab
    await page.getByTestId('form-tab').click()

    // Fill host/port
    await page.getByTestId('connection-host-input').fill('myserver.com')
    await page.getByTestId('connection-port-input').fill('27018')

    // Set auth
    await page.getByTestId('connection-auth-select').selectOption('basic')
    await page.getByTestId('connection-username-input').fill('admin')
    await page.getByTestId('connection-password-input').fill('secret123')
    await page.getByTestId('connection-authsource-input').fill('admin')

    // Enable TLS
    await page.getByTestId('connection-tls-checkbox').check()

    // Save
    await page.getByTestId('save-button').click()

    // Should show in list
    await expect(page.getByText('Advanced Connection')).toBeVisible()

    // Reload and verify
    await page.reload()
    await expect(page.getByText('Advanced Connection')).toBeVisible()
  })
})
