/**
 * CreateIndexDialog Unit Tests - RED Phase (TDD)
 *
 * These tests define the expected behavior of the CreateIndexDialog component.
 * Written in RED phase - tests should FAIL initially until implementation is complete.
 *
 * Test Coverage:
 * 1. Dialog rendering when open/closed
 * 2. Field selection for index keys
 * 3. Index type selection (ascending, descending, text, 2dsphere)
 * 4. Compound index creation (multiple fields)
 * 5. Index options (unique, sparse, background, TTL)
 * 6. Form validation
 * 7. Submit and cancel behavior
 * 8. Accessibility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { CreateIndexDialog, validateIndexDefinition, IndexDefinition } from '../CreateIndexDialog'
import { useCreateIndexMutation } from '@hooks/useQueries'

// Helper to clean up LeafyGreen portals between tests
function cleanupPortals() {
  document.querySelectorAll('[data-lg-portal]').forEach(el => el.remove())
  document.querySelectorAll('[data-leafygreen-ui-modal-container]').forEach(el => el.remove())
  document.querySelectorAll('[class*="lg-ui-portal"]').forEach(el => el.remove())
}

// Mock the mutation hook
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useCreateIndexMutation: vi.fn(),
  }
})

describe('CreateIndexDialog', () => {
  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  const mockMutateAsync = vi.fn()
  const mockMutation = {
    mutateAsync: mockMutateAsync,
    isPending: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(useCreateIndexMutation).mockReturnValue(mockMutation as any)
  })

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
    cleanup()
    cleanupPortals()
  })

  // ===========================================================================
  // SECTION 1: Dialog Rendering
  // ===========================================================================
  describe('dialog rendering', () => {
    it('renders modal when open is true', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByRole('heading', { name: /create index/i })).toBeInTheDocument()
    })

    it('does not render modal content when open is false', () => {
      render(<CreateIndexDialog {...defaultProps} open={false} />)
      expect(screen.queryByRole('heading', { name: /create index/i })).not.toBeInTheDocument()
    })

    it('shows collection name in description', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByText(/testcoll/)).toBeInTheDocument()
    })

    it('renders Create Index submit button', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('create-index-submit')).toBeInTheDocument()
    })

    it('renders Cancel button', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      const cancelButtons = screen.getAllByRole('button').filter(btn =>
        btn.textContent?.toLowerCase().includes('cancel')
      )
      expect(cancelButtons.length).toBeGreaterThan(0)
    })

    it('renders Add Field button', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('add-field-button')).toBeInTheDocument()
    })

    it('renders index preview section', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('index-preview')).toBeInTheDocument()
    })

    it('renders index name input', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('index-name-input')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 2: Field Selection
  // ===========================================================================
  describe('field selection', () => {
    it('starts with one empty field row', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('index-field-0')).toBeInTheDocument()
      expect(screen.queryByTestId('index-field-1')).not.toBeInTheDocument()
    })

    it('can add additional field rows', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      await user.click(screen.getByTestId('add-field-button'))

      expect(screen.getByTestId('index-field-0')).toBeInTheDocument()
      expect(screen.getByTestId('index-field-1')).toBeInTheDocument()
    })

    it('can add multiple field rows for compound indexes', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Add 2 more fields
      await user.click(screen.getByTestId('add-field-button'))
      await user.click(screen.getByTestId('add-field-button'))

      expect(screen.getByTestId('index-field-0')).toBeInTheDocument()
      expect(screen.getByTestId('index-field-1')).toBeInTheDocument()
      expect(screen.getByTestId('index-field-2')).toBeInTheDocument()
    })

    it('can remove field rows when more than one exists', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Add a second field
      await user.click(screen.getByTestId('add-field-button'))
      expect(screen.getByTestId('index-field-1')).toBeInTheDocument()

      // Remove the first field
      await user.click(screen.getByTestId('remove-field-0'))

      // Should only have one field row now
      expect(screen.getByTestId('index-field-0')).toBeInTheDocument()
      expect(screen.queryByTestId('index-field-1')).not.toBeInTheDocument()
    })

    it('does not show remove button when only one field exists', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      // With only one field, remove button should not be present
      expect(screen.queryByTestId('remove-field-0')).not.toBeInTheDocument()
    })

    it('can enter field name in input', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.clear(fieldInput)
      await user.type(fieldInput, 'username')

      expect(fieldInput).toHaveValue('username')
    })

    it('shows field count in footer', () => {
      render(<CreateIndexDialog {...defaultProps} />)
      expect(screen.getByText(/0 field\(s\) selected/i)).toBeInTheDocument()
    })

    it('updates field count when fields have names', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'email')

      expect(screen.getByText(/1 field\(s\) selected/i)).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 3: Index Type Selection
  // ===========================================================================
  describe('index type selection', () => {
    it('defaults to ascending (1) direction', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      const directionSelect = screen.getByTestId('field-direction-0')
      expect(directionSelect).toHaveTextContent('Ascending')
    })

    it('can select descending direction (-1)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)

      // Select descending option
      const descOption = await screen.findByText('Descending (-1)')
      await user.click(descOption)

      expect(screen.getByTestId('field-direction-0')).toHaveTextContent('Descending')
    })

    it('can select text index type', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)

      const textOption = await screen.findByText('Text')
      await user.click(textOption)

      expect(screen.getByTestId('field-direction-0')).toHaveTextContent('Text')
    })

    it('can select 2dsphere index type', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)

      const geoOption = await screen.findByText('2dsphere')
      await user.click(geoOption)

      expect(screen.getByTestId('field-direction-0')).toHaveTextContent('2dsphere')
    })

    it('preserves field type when field name is updated', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Select text type
      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)
      const textOption = await screen.findByText('Text')
      await user.click(textOption)

      // Now update field name
      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'content')

      // Type should still be text
      expect(screen.getByTestId('field-direction-0')).toHaveTextContent('Text')
    })
  })

  // ===========================================================================
  // SECTION 4: Compound Index Creation
  // ===========================================================================
  describe('compound index creation', () => {
    it('can create compound index with multiple fields', async () => {
      mockMutateAsync.mockResolvedValue('firstName_1_lastName_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter first field
      const field0 = screen.getByTestId('field-name-0')
      await user.type(field0, 'firstName')

      // Add second field
      await user.click(screen.getByTestId('add-field-button'))
      const field1 = screen.getByTestId('field-name-1')
      await user.type(field1, 'lastName')

      // Submit
      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { firstName: 1, lastName: 1 },
          options: undefined,
        })
      })
    })

    it('preserves field order in compound index', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Add second field
      await user.click(screen.getByTestId('add-field-button'))

      // Fill in field names
      const field0 = screen.getByTestId('field-name-0')
      const field1 = screen.getByTestId('field-name-1')

      await user.type(field0, 'firstName')
      await user.type(field1, 'lastName')

      // Fields should maintain their order
      expect(field0).toHaveValue('firstName')
      expect(field1).toHaveValue('lastName')
    })

    it('can create compound index with mixed directions', async () => {
      mockMutateAsync.mockResolvedValue('status_-1_createdAt_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter first field
      const field0 = screen.getByTestId('field-name-0')
      await user.type(field0, 'status')

      // Select descending for first field
      const direction0 = screen.getByTestId('field-direction-0')
      await user.click(direction0)
      const descOption = await screen.findByText('Descending (-1)')
      await user.click(descOption)

      // Add second field
      await user.click(screen.getByTestId('add-field-button'))
      const field1 = screen.getByTestId('field-name-1')
      await user.type(field1, 'createdAt')

      // Submit
      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { status: -1, createdAt: 1 },
          options: undefined,
        })
      })
    })

    it('updates index preview when adding compound fields', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter first field
      const field0 = screen.getByTestId('field-name-0')
      await user.type(field0, 'firstName')

      // Check preview shows first field
      const preview = screen.getByTestId('index-preview')
      expect(preview).toHaveTextContent('firstName')

      // Add second field
      await user.click(screen.getByTestId('add-field-button'))
      const field1 = screen.getByTestId('field-name-1')
      await user.type(field1, 'lastName')

      // Preview should show both fields
      expect(preview).toHaveTextContent('firstName')
      expect(preview).toHaveTextContent('lastName')
    })
  })

  // ===========================================================================
  // SECTION 5: Index Options
  // ===========================================================================
  describe('index options', () => {
    it('can enter custom index name', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const nameInput = screen.getByTestId('index-name-input')
      await user.type(nameInput, 'my_custom_index')

      expect(nameInput).toHaveValue('my_custom_index')
    })

    it('shows auto-generated name description', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      // Auto-generated name should be shown in description
      expect(screen.getByText(/auto-generated/i)).toBeInTheDocument()
    })

    it('can toggle unique option', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const uniqueCheckbox = screen.getByTestId('unique-checkbox')
      expect(uniqueCheckbox).not.toBeChecked()

      await user.click(uniqueCheckbox)
      expect(uniqueCheckbox).toBeChecked()

      await user.click(uniqueCheckbox)
      expect(uniqueCheckbox).not.toBeChecked()
    })

    it('shows warning when unique is enabled', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      await user.click(screen.getByTestId('unique-checkbox'))

      // Warning message should be visible (not the checkbox description)
      expect(screen.getByText(/creating a unique index will fail/i)).toBeInTheDocument()
    })

    it('can toggle sparse option', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const sparseCheckbox = screen.getByTestId('sparse-checkbox')
      expect(sparseCheckbox).not.toBeChecked()

      await user.click(sparseCheckbox)
      expect(sparseCheckbox).toBeChecked()
    })

    it('can toggle background option', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const backgroundCheckbox = screen.getByTestId('background-checkbox')
      expect(backgroundCheckbox).not.toBeChecked()

      await user.click(backgroundCheckbox)
      expect(backgroundCheckbox).toBeChecked()
    })

    it('can enable TTL index', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const ttlCheckbox = screen.getByTestId('ttl-checkbox')
      expect(ttlCheckbox).not.toBeChecked()

      await user.click(ttlCheckbox)
      expect(ttlCheckbox).toBeChecked()

      // TTL input should appear
      await waitFor(() => {
        expect(screen.getByTestId('ttl-input')).toBeInTheDocument()
      })
    })

    it('hides TTL input when TTL is disabled', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      // TTL should be off by default
      expect(screen.queryByTestId('ttl-input')).not.toBeInTheDocument()
    })

    it('can set TTL expireAfterSeconds value', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enable TTL first
      await user.click(screen.getByTestId('ttl-checkbox'))

      // TTL input should appear with default value
      const ttlInput = screen.getByTestId('ttl-input')
      expect(ttlInput).toBeInTheDocument()

      await user.clear(ttlInput)
      await user.type(ttlInput, '7200')

      // Number input has numeric value
      expect(ttlInput).toHaveValue(7200)
    })

    it('shows human-readable TTL duration', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enable TTL
      await user.click(screen.getByTestId('ttl-checkbox'))

      // Should show days/hours breakdown
      expect(screen.getByText(/days/i)).toBeInTheDocument()
      expect(screen.getByText(/hours/i)).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 6: Form Validation
  // ===========================================================================
  describe('form validation', () => {
    it('shows validation error when no fields have names', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Try to submit without entering field name
      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('validation-errors')).toBeInTheDocument()
        expect(screen.getByText(/all fields must have a name/i)).toBeInTheDocument()
      })

      // Mutation should not be called
      expect(mockMutateAsync).not.toHaveBeenCalled()
    })

    it('validates duplicate field names', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Add second field
      await user.click(screen.getByTestId('add-field-button'))

      // Enter same field name in both
      const field0 = screen.getByTestId('field-name-0')
      const field1 = screen.getByTestId('field-name-1')

      await user.type(field0, 'email')
      await user.type(field1, 'email')

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/duplicate field/i)).toBeInTheDocument()
      })
    })

    it('validates field name format - no special characters at start', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, '$invalidField')

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/invalid field name/i)).toBeInTheDocument()
      })
    })

    it('allows nested field paths with dot notation', async () => {
      mockMutateAsync.mockResolvedValue('address.city_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'address.city')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { 'address.city': 1 },
          options: undefined,
        })
      })
    })

    it('validates index name format', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter field name first
      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'validField')

      // Enter invalid index name (with spaces)
      const nameInput = screen.getByTestId('index-name-input')
      await user.type(nameInput, 'index with spaces')

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/index name must start with/i)).toBeInTheDocument()
      })
    })

    it('validates index name length', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter field name
      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'field')

      // Enter too long index name (>127 chars)
      const nameInput = screen.getByTestId('index-name-input')
      const longName = 'a'.repeat(130)
      await user.type(nameInput, longName)

      await waitFor(() => {
        expect(screen.getByText(/cannot exceed 127 characters/i)).toBeInTheDocument()
      })
    })

    it('validates TTL index on multiple fields', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter first field
      const field0 = screen.getByTestId('field-name-0')
      await user.type(field0, 'createdAt')

      // Add second field
      await user.click(screen.getByTestId('add-field-button'))
      const field1 = screen.getByTestId('field-name-1')
      await user.type(field1, 'updatedAt')

      // Enable TTL
      await user.click(screen.getByTestId('ttl-checkbox'))

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/TTL indexes can only be created on a single field/i)).toBeInTheDocument()
      })
    })

    it('validates TTL value must be non-negative', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter field
      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'expireAt')

      // Enable TTL
      await user.click(screen.getByTestId('ttl-checkbox'))

      // The TTL input has min={0}, so negative values are handled by HTML5 validation
      // The component also validates in validateIndexDefinition for non-negative values
      const ttlInput = screen.getByTestId('ttl-input')
      expect(ttlInput).toHaveAttribute('min', '0')
    })

    it('validates only one text field per index', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter first field with text type
      const field0 = screen.getByTestId('field-name-0')
      await user.type(field0, 'title')
      const direction0 = screen.getByTestId('field-direction-0')
      await user.click(direction0)
      const textOptions = await screen.findAllByText('Text')
      await user.click(textOptions[0])

      // Add second field with text type
      await user.click(screen.getByTestId('add-field-button'))
      const field1 = screen.getByTestId('field-name-1')
      await user.type(field1, 'content')
      const direction1 = screen.getByTestId('field-direction-1')
      await user.click(direction1)
      const textOptions2 = await screen.findAllByText('Text')
      // Click the second dropdown's Text option (not the one already selected in first dropdown)
      await user.click(textOptions2[textOptions2.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/only one text field is allowed/i)).toBeInTheDocument()
      })
    })

    it('disables submit button when validation fails', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Field is empty, so validation should fail
      const submitButton = screen.getByTestId('create-index-submit')

      // Try clicking - should not call mutation
      await user.click(submitButton)

      expect(mockMutateAsync).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SECTION 7: Form Submission
  // ===========================================================================
  describe('form submission', () => {
    it('calls mutation with correct keys for single field', async () => {
      mockMutateAsync.mockResolvedValue('username_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'username')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { username: 1 },
          options: undefined,
        })
      })
    })

    it('includes unique option when enabled', async () => {
      mockMutateAsync.mockResolvedValue('email_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'email')

      await user.click(screen.getByTestId('unique-checkbox'))

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { email: 1 },
          options: { unique: true },
        })
      })
    })

    it('includes sparse option when enabled', async () => {
      mockMutateAsync.mockResolvedValue('optionalField_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'optionalField')

      await user.click(screen.getByTestId('sparse-checkbox'))

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { optionalField: 1 },
          options: { sparse: true },
        })
      })
    })

    it('includes background option when enabled', async () => {
      mockMutateAsync.mockResolvedValue('field_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'field')

      await user.click(screen.getByTestId('background-checkbox'))

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { field: 1 },
          options: { background: true },
        })
      })
    })

    it('includes custom name in options', async () => {
      mockMutateAsync.mockResolvedValue('my_custom_index')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'status')

      const nameInput = screen.getByTestId('index-name-input')
      await user.type(nameInput, 'my_custom_index')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { status: 1 },
          options: { name: 'my_custom_index' },
        })
      })
    })

    it('includes expireAfterSeconds for TTL index', async () => {
      mockMutateAsync.mockResolvedValue('createdAt_1')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'createdAt')

      await user.click(screen.getByTestId('ttl-checkbox'))
      const ttlInput = screen.getByTestId('ttl-input')
      await user.clear(ttlInput)
      await user.type(ttlInput, '7200')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { createdAt: 1 },
          options: { expireAfterSeconds: 7200 },
        })
      })
    })

    it('creates text index with correct type value', async () => {
      mockMutateAsync.mockResolvedValue('content_text')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'content')

      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)
      const textOption = await screen.findByText('Text')
      await user.click(textOption)

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { content: 'text' },
          options: undefined,
        })
      })
    })

    it('creates 2dsphere index with correct type value', async () => {
      mockMutateAsync.mockResolvedValue('location_2dsphere')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'location')

      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)
      const geoOption = await screen.findByText('2dsphere')
      await user.click(geoOption)

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          keys: { location: '2dsphere' },
          options: undefined,
        })
      })
    })

    it('calls onSuccess after successful creation', async () => {
      mockMutateAsync.mockResolvedValue('test_index')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'test')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledWith('test_index')
      })
    })

    it('calls onClose after successful creation', async () => {
      mockMutateAsync.mockResolvedValue('test_index')
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'test')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('shows error message on mutation failure', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Index already exists'))
      const user = userEvent.setup()
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'test')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('create-index-error')).toHaveTextContent('Index already exists')
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('shows loading state during creation', () => {
      vi.mocked(useCreateIndexMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<CreateIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('create-index-submit')).toHaveTextContent('Creating...')
    })

    it('disables submit button when mutation is pending', () => {
      vi.mocked(useCreateIndexMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<CreateIndexDialog {...defaultProps} />)

      // Button should be disabled (aria-disabled)
      const submitButton = screen.getByTestId('create-index-submit')
      expect(submitButton).toHaveAttribute('aria-disabled', 'true')
    })
  })

  // ===========================================================================
  // SECTION 8: Cancel Behavior
  // ===========================================================================
  describe('cancel behavior', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const cancelButton = screen.getAllByRole('button').find(btn =>
        btn.textContent?.toLowerCase().includes('cancel')
      )
      expect(cancelButton).toBeTruthy()
      await user.click(cancelButton!)

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('resets form state when closed and reopened', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { rerender } = render(<CreateIndexDialog {...defaultProps} />)

      // Enter a field name
      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'myField')
      expect(fieldInput).toHaveValue('myField')

      // Close the modal
      rerender(<CreateIndexDialog {...defaultProps} open={false} />)

      // Reopen the modal
      rerender(<CreateIndexDialog {...defaultProps} open={true} />)

      // Field should be reset
      const newFieldInput = screen.getByTestId('field-name-0')
      expect(newFieldInput).toHaveValue('')
    })

    it('resets options when closed and reopened', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { rerender } = render(<CreateIndexDialog {...defaultProps} />)

      // Enable unique
      await user.click(screen.getByTestId('unique-checkbox'))
      expect(screen.getByTestId('unique-checkbox')).toBeChecked()

      // Close the modal
      rerender(<CreateIndexDialog {...defaultProps} open={false} />)

      // Reopen the modal
      rerender(<CreateIndexDialog {...defaultProps} open={true} />)

      // Option should be reset
      expect(screen.getByTestId('unique-checkbox')).not.toBeChecked()
    })

    it('does not call mutation when cancelled', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      // Enter a field name
      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'myField')

      // Click cancel
      const cancelButton = screen.getAllByRole('button').find(btn =>
        btn.textContent?.toLowerCase().includes('cancel')
      )
      await user.click(cancelButton!)

      expect(mockMutateAsync).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SECTION 9: Accessibility
  // ===========================================================================
  describe('accessibility', () => {
    it('has accessible field name input labels', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      expect(fieldInput).toHaveAttribute('aria-label')
    })

    it('has accessible direction select labels', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      const directionSelect = screen.getByTestId('field-direction-0')
      expect(directionSelect).toHaveAttribute('aria-label')
    })

    it('error messages have alert role', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Test error'))
      const user = userEvent.setup()
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'test')

      await user.click(screen.getByTestId('create-index-submit'))

      await waitFor(() => {
        const errorElement = screen.getByTestId('create-index-error')
        expect(errorElement).toHaveAttribute('role', 'alert')
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('checkbox options have descriptive labels', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      // Check that checkboxes have description text
      expect(screen.getByText(/reject documents with duplicate values/i)).toBeInTheDocument()
      expect(screen.getByText(/only index documents with the field/i)).toBeInTheDocument()
      expect(screen.getByText(/build index in background/i)).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 10: Index Preview
  // ===========================================================================
  describe('index preview', () => {
    it('shows JSON preview of index definition', () => {
      render(<CreateIndexDialog {...defaultProps} />)

      const preview = screen.getByTestId('index-preview')
      expect(preview).toBeInTheDocument()
      expect(preview).toHaveTextContent('keys')
    })

    it('updates preview when field is added', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'email')

      const preview = screen.getByTestId('index-preview')
      expect(preview).toHaveTextContent('email')
      expect(preview).toHaveTextContent('1')
    })

    it('updates preview when options are enabled', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      await user.click(screen.getByTestId('unique-checkbox'))

      const preview = screen.getByTestId('index-preview')
      expect(preview).toHaveTextContent('unique')
      expect(preview).toHaveTextContent('true')
    })

    it('updates preview when direction changes', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateIndexDialog {...defaultProps} />)

      const fieldInput = screen.getByTestId('field-name-0')
      await user.type(fieldInput, 'createdAt')

      const directionSelect = screen.getByTestId('field-direction-0')
      await user.click(directionSelect)
      const descOption = await screen.findByText('Descending (-1)')
      await user.click(descOption)

      const preview = screen.getByTestId('index-preview')
      expect(preview).toHaveTextContent('createdAt')
      expect(preview).toHaveTextContent('-1')
    })
  })
})

// ===========================================================================
// SECTION 11: validateIndexDefinition Unit Tests
// ===========================================================================
describe('validateIndexDefinition', () => {
  it('returns error when fields array is empty', () => {
    const definition: IndexDefinition = {
      fields: [],
      options: { unique: false, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('At least one field is required')
  })

  it('returns error when field name is empty', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: '', type: 1 }],
      options: { unique: false, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('All fields must have a name')
  })

  it('returns error for duplicate field names', () => {
    const definition: IndexDefinition = {
      fields: [
        { id: '1', name: 'email', type: 1 },
        { id: '2', name: 'email', type: -1 },
      ],
      options: { unique: false, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true)
  })

  it('returns error for invalid field name format', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: '$invalid', type: 1 }],
      options: { unique: false, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.includes('Invalid field name'))).toBe(true)
  })

  it('allows valid nested field paths', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: 'address.city', type: 1 }],
      options: { unique: false, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns error for multiple text fields', () => {
    const definition: IndexDefinition = {
      fields: [
        { id: '1', name: 'title', type: 'text' },
        { id: '2', name: 'content', type: 'text' },
      ],
      options: { unique: false, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Only one text field is allowed per index')
  })

  it('returns error for TTL on compound index', () => {
    const definition: IndexDefinition = {
      fields: [
        { id: '1', name: 'field1', type: 1 },
        { id: '2', name: 'field2', type: 1 },
      ],
      options: { unique: false, sparse: false, background: false, expireAfterSeconds: 3600 },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('TTL indexes can only be created on a single field')
  })

  it('returns error for negative TTL value', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: 'expireAt', type: 1 }],
      options: { unique: false, sparse: false, background: false, expireAfterSeconds: -1 },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('TTL value must be non-negative')
  })

  it('returns error for index name exceeding 127 characters', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: 'field', type: 1 }],
      options: {
        unique: false,
        sparse: false,
        background: false,
        name: 'a'.repeat(130),
      },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Index name cannot exceed 127 characters')
  })

  it('returns error for invalid index name format', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: 'field', type: 1 }],
      options: {
        unique: false,
        sparse: false,
        background: false,
        name: 'invalid name with spaces',
      },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.includes('Index name must start'))).toBe(true)
  })

  it('returns valid for correct single field index', () => {
    const definition: IndexDefinition = {
      fields: [{ id: '1', name: 'email', type: 1 }],
      options: { unique: true, sparse: false, background: false },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid for correct compound index', () => {
    const definition: IndexDefinition = {
      fields: [
        { id: '1', name: 'firstName', type: 1 },
        { id: '2', name: 'lastName', type: -1 },
      ],
      options: { unique: false, sparse: false, background: true },
    }

    const result = validateIndexDefinition(definition)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
