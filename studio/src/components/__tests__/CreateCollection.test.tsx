/**
 * TDD RED Phase: Failing tests for Create Collection UI
 *
 * These tests define the expected behavior of a "Create Collection" feature
 * that does not yet exist. All tests should FAIL until the feature is implemented.
 *
 * Feature Requirements:
 * 1. A "Create Collection" button should exist in the DatabasePage
 * 2. Clicking it should open a modal/dialog
 * 3. User can enter a collection name
 * 4. Optional: capped collection settings, validation rules
 * 5. Submitting should call the createCollection RPC endpoint
 * 6. Success should refresh the collection list
 * 7. Error handling for invalid names or API failures
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

// These components don't exist yet - tests will fail at import
// Once implemented, they should be importable from these locations
import { DatabasePage } from '@components/pages/DatabasePage'
// import { CreateCollectionModal } from '@components/collections/CreateCollectionModal'
// import { CreateCollectionButton } from '@components/collections/CreateCollectionButton'

import { useCollectionsQuery } from '@hooks/useQueries'
// This mutation hook doesn't exist yet - will need to be created
// import { useCreateCollectionMutation } from '@hooks/useQueries'

import rpcClient from '@lib/rpc-client'

// Mock the hooks
vi.mock('@hooks/useQueries', () => ({
  useCollectionsQuery: vi.fn(),
  useCreateCollectionMutation: vi.fn(),
}))

// Mock rpcClient
vi.mock('@lib/rpc-client', () => ({
  default: {
    createCollection: vi.fn(),
    listCollections: vi.fn(),
  },
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ database: 'testdb' }),
  }
})

describe('Create Collection UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCollectionsQuery).mockReturnValue({
      data: [
        { name: 'users', type: 'collection' },
        { name: 'orders', type: 'collection' },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCollectionsQuery>)
  })

  describe('Create Collection Button', () => {
    it('should render a "Create Collection" button on the DatabasePage', () => {
      render(<DatabasePage />)

      // The button should exist with appropriate text or test ID
      const createButton = screen.getByRole('button', { name: /create collection/i })
      expect(createButton).toBeInTheDocument()
    })

    it('should have accessible name for screen readers', () => {
      render(<DatabasePage />)

      const createButton = screen.getByRole('button', { name: /create collection/i })
      expect(createButton).toHaveAccessibleName()
    })

    it('should render a button with data-testid for testing', () => {
      render(<DatabasePage />)

      expect(screen.getByTestId('create-collection-button')).toBeInTheDocument()
    })

    it('should be keyboard accessible with tabIndex', () => {
      render(<DatabasePage />)

      const createButton = screen.getByTestId('create-collection-button')
      expect(createButton).toHaveAttribute('tabIndex', '0')
    })
  })

  describe('Create Collection Modal - Opening', () => {
    it('should open modal when clicking "Create Collection" button', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      const createButton = screen.getByTestId('create-collection-button')
      await user.click(createButton)

      // Modal should be visible
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should show modal title "Create Collection"', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      expect(screen.getByRole('heading', { name: /create collection/i })).toBeInTheDocument()
    })

    it('should show the database name in the modal', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      expect(screen.getByText(/testdb/)).toBeInTheDocument()
    })
  })

  describe('Create Collection Modal - Form Fields', () => {
    it('should have a text input for collection name', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      expect(nameInput).toBeInTheDocument()
      expect(nameInput).toHaveAttribute('type', 'text')
    })

    it('should have empty collection name by default', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      expect(nameInput).toHaveValue('')
    })

    it('should allow typing in the collection name field', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      expect(nameInput).toHaveValue('products')
    })

    it('should have a checkbox for capped collection option', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const cappedCheckbox = screen.getByRole('checkbox', { name: /capped/i })
      expect(cappedCheckbox).toBeInTheDocument()
    })

    it('should show size/max fields when capped is checked', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const cappedCheckbox = screen.getByRole('checkbox', { name: /capped/i })
      await user.click(cappedCheckbox)

      expect(screen.getByLabelText(/size/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/max documents/i)).toBeInTheDocument()
    })

    it('should have Create and Cancel buttons', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      expect(screen.getByRole('button', { name: /^create$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  describe('Create Collection Modal - Validation', () => {
    it('should disable Create button when collection name is empty', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const createBtn = screen.getByTestId('create-collection-submit')
      // LeafyGreen uses aria-disabled
      expect(createBtn).toHaveAttribute('aria-disabled', 'true')
    })

    it('should enable Create button when collection name is provided', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      const createBtn = screen.getByTestId('create-collection-submit')
      expect(createBtn).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('should show error for collection name starting with system.', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'system.indexes')

      expect(screen.getByText(/cannot start with "system\."/i)).toBeInTheDocument()
    })

    it('should show error for collection name with invalid characters', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'invalid$name')

      expect(screen.getByText(/invalid characters/i)).toBeInTheDocument()
    })

    it('should show error for empty collection name after blur', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.click(nameInput)
      await user.tab() // blur

      expect(screen.getByText(/collection name is required/i)).toBeInTheDocument()
    })

    it('should warn if collection name already exists', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'users') // existing collection

      expect(screen.getByText(/collection already exists/i)).toBeInTheDocument()
    })
  })

  describe('Create Collection Modal - Submission', () => {
    const mockCreateCollection = vi.fn()

    beforeEach(() => {
      vi.mocked(rpcClient.createCollection).mockImplementation(mockCreateCollection)
      mockCreateCollection.mockResolvedValue(undefined)
    })

    it('should call createCollection API on submit', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(mockCreateCollection).toHaveBeenCalledWith('testdb', 'products', undefined)
      })
    })

    it('should call createCollection with capped options', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'logs')

      const cappedCheckbox = screen.getByRole('checkbox', { name: /capped/i })
      await user.click(cappedCheckbox)

      const sizeInput = screen.getByLabelText(/size/i)
      await user.clear(sizeInput)
      await user.type(sizeInput, '1048576')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(mockCreateCollection).toHaveBeenCalledWith('testdb', 'logs', {
          capped: true,
          size: 1048576,
        })
      })
    })

    it('should show loading state during submission', async () => {
      mockCreateCollection.mockImplementation(() => new Promise(() => {})) // never resolves
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByTestId('create-collection-submit'))

      expect(screen.getByTestId('create-collection-submit')).toHaveTextContent(/creating/i)
      expect(screen.getByTestId('create-collection-submit')).toHaveAttribute('aria-disabled', 'true')
    })

    it('should close modal on successful creation', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('should refresh collections list on successful creation', async () => {
      const mockRefetch = vi.fn()
      vi.mocked(useCollectionsQuery).mockReturnValue({
        data: [{ name: 'users', type: 'collection' }],
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      } as unknown as ReturnType<typeof useCollectionsQuery>)

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })

    it('should show success toast/message on creation', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.getByText(/collection.*created/i)).toBeInTheDocument()
      })
    })
  })

  describe('Create Collection Modal - Error Handling', () => {
    it('should display API error message on failure', async () => {
      vi.mocked(rpcClient.createCollection).mockRejectedValue(
        new Error('Collection already exists')
      )

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'users')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('create-collection-error')).toHaveTextContent(
          'Collection already exists'
        )
      })
    })

    it('should not close modal on error', async () => {
      vi.mocked(rpcClient.createCollection).mockRejectedValue(new Error('Server error'))

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('should allow retry after error', async () => {
      const createMock = vi.mocked(rpcClient.createCollection)
      createMock.mockRejectedValueOnce(new Error('Network error'))
      createMock.mockResolvedValueOnce(undefined)

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      // First attempt fails
      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('create-collection-error')).toBeInTheDocument()
      })

      // Retry should succeed
      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('should clear error when user modifies input', async () => {
      vi.mocked(rpcClient.createCollection).mockRejectedValue(new Error('API Error'))

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')
      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('create-collection-error')).toBeInTheDocument()
      })

      // Modify input
      await user.type(nameInput, '2')

      expect(screen.queryByTestId('create-collection-error')).not.toBeInTheDocument()
    })
  })

  describe('Create Collection Modal - Cancellation', () => {
    it('should close modal when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should close modal when Escape key is pressed', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should reset form when modal is closed and reopened', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      // Reopen modal
      await user.click(screen.getByTestId('create-collection-button'))

      const nameInputAgain = screen.getByLabelText(/collection name/i)
      expect(nameInputAgain).toHaveValue('')
    })

    it('should not call API when cancelled', async () => {
      const createMock = vi.mocked(rpcClient.createCollection)

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(createMock).not.toHaveBeenCalled()
    })
  })

  describe('Create Collection - Accessibility', () => {
    it('should trap focus within modal', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const modal = screen.getByRole('dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
    })

    it('should focus the name input when modal opens', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      expect(nameInput).toHaveFocus()
    })

    it('should have aria-describedby for error messages', async () => {
      vi.mocked(rpcClient.createCollection).mockRejectedValue(new Error('API Error'))

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'system.test')

      const errorId = screen.getByText(/cannot start with/i).id
      expect(nameInput).toHaveAttribute('aria-describedby', expect.stringContaining(errorId))
    })

    it('should announce errors to screen readers', async () => {
      vi.mocked(rpcClient.createCollection).mockRejectedValue(new Error('API Error'))

      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      const nameInput = screen.getByLabelText(/collection name/i)
      await user.type(nameInput, 'products')
      await user.click(screen.getByTestId('create-collection-submit'))

      await waitFor(() => {
        const errorEl = screen.getByTestId('create-collection-error')
        expect(errorEl).toHaveAttribute('role', 'alert')
      })
    })
  })

  describe('Create Collection - Advanced Options', () => {
    it('should have a toggle for advanced options', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))

      expect(screen.getByRole('button', { name: /advanced options/i })).toBeInTheDocument()
    })

    it('should show validation schema option when advanced is expanded', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))
      await user.click(screen.getByRole('button', { name: /advanced options/i }))

      expect(screen.getByLabelText(/validation schema/i)).toBeInTheDocument()
    })

    it('should show time series options when advanced is expanded', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))
      await user.click(screen.getByRole('button', { name: /advanced options/i }))

      expect(screen.getByRole('checkbox', { name: /time series/i })).toBeInTheDocument()
    })

    it('should show time field and meta field when time series is checked', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      await user.click(screen.getByTestId('create-collection-button'))
      await user.click(screen.getByRole('button', { name: /advanced options/i }))
      await user.click(screen.getByRole('checkbox', { name: /time series/i }))

      expect(screen.getByLabelText(/time field/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/meta field/i)).toBeInTheDocument()
    })
  })
})

describe('Create Collection from Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have a "+" button next to database name for creating collections', async () => {
    // This test expects a create collection button in the sidebar
    // when viewing a database
    render(<DatabasePage />)

    // Look for an add/plus button in the database header area
    const addButton = screen.getByTestId('sidebar-create-collection-button')
    expect(addButton).toBeInTheDocument()
  })

  it('should open create collection modal when sidebar button is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasePage />)

    await user.click(screen.getByTestId('sidebar-create-collection-button'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
