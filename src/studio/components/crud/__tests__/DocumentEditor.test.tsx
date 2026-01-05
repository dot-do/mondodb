/**
 * DocumentEditor Unit Tests
 *
 * Tests for the inline field editing document editor component.
 * Supports inline field editing, field validation, and diff preview before save.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentEditor } from '../DocumentEditor'

// Test utilities - wrap components in necessary providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui)
}

describe('DocumentEditor', () => {
  const mockDocument = {
    _id: 'doc123',
    name: 'Test Document',
    count: 42,
    active: true,
    tags: ['mongodb', 'test'],
    metadata: {
      created: '2024-01-01',
      author: 'tester',
    },
  }

  const defaultProps = {
    document: mockDocument,
    onSave: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the document editor container', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      expect(screen.getByTestId('document-editor')).toBeInTheDocument()
    })

    it('displays all top-level fields from the document', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      expect(screen.getByText('_id')).toBeInTheDocument()
      expect(screen.getByText('name')).toBeInTheDocument()
      expect(screen.getByText('count')).toBeInTheDocument()
      expect(screen.getByText('active')).toBeInTheDocument()
      expect(screen.getByText('tags')).toBeInTheDocument()
      expect(screen.getByText('metadata')).toBeInTheDocument()
    })

    it('shows field values with correct types', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      // String value
      expect(screen.getByDisplayValue('Test Document')).toBeInTheDocument()
      // Number value
      expect(screen.getByDisplayValue('42')).toBeInTheDocument()
    })

    it('renders _id field as read-only', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      const idField = screen.getByTestId('field-_id')
      const input = within(idField).getByRole('textbox')
      expect(input).toHaveAttribute('readonly')
    })

    it('renders save and cancel buttons', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  describe('inline field editing', () => {
    it('allows editing string fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Updated Name')

      expect(input).toHaveValue('Updated Name')
    })

    it('allows editing number fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const countField = screen.getByTestId('field-count')
      const input = within(countField).getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '100')

      // Verify the input displays the correct value
      expect(input).toHaveDisplayValue('100')
    })

    it('allows toggling boolean fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const activeField = screen.getByTestId('field-active')
      const toggle = within(activeField).getByRole('switch')

      expect(toggle).toBeChecked()
      await user.click(toggle)
      expect(toggle).not.toBeChecked()
    })

    it('shows expand button for nested objects', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const metadataField = screen.getByTestId('field-metadata')
      expect(within(metadataField).getByRole('button', { name: /expand/i })).toBeInTheDocument()
    })

    it('expands nested objects to show child fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const metadataField = screen.getByTestId('field-metadata')
      await user.click(within(metadataField).getByRole('button', { name: /expand/i }))

      expect(screen.getByText('created')).toBeInTheDocument()
      expect(screen.getByText('author')).toBeInTheDocument()
    })

    it('shows array length indicator for array fields', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const tagsField = screen.getByTestId('field-tags')
      expect(within(tagsField).getByText(/2 items/i)).toBeInTheDocument()
    })

    it('expands arrays to show items', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const tagsField = screen.getByTestId('field-tags')
      await user.click(within(tagsField).getByRole('button', { name: /expand/i }))

      expect(screen.getByDisplayValue('mongodb')).toBeInTheDocument()
      expect(screen.getByDisplayValue('test')).toBeInTheDocument()
    })
  })

  describe('field validation', () => {
    it('shows error for invalid number input', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const countField = screen.getByTestId('field-count')
      const input = within(countField).getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, 'not-a-number')

      await waitFor(() => {
        expect(screen.getByText(/invalid number/i)).toBeInTheDocument()
      })
    })

    it('disables save button when there are validation errors', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const countField = screen.getByTestId('field-count')
      const input = within(countField).getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, 'invalid')

      const saveButton = screen.getByRole('button', { name: /save/i })
      expect(saveButton).toBeDisabled()
    })

    it('validates required fields', async () => {
      const user = userEvent.setup()
      const propsWithRequired = {
        ...defaultProps,
        requiredFields: ['name'],
      }
      renderWithProviders(<DocumentEditor {...propsWithRequired} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.tab()

      await waitFor(() => {
        expect(screen.getByText(/required/i)).toBeInTheDocument()
      })
    })

    it('shows field type indicator', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      expect(within(nameField).getByText(/string/i)).toBeInTheDocument()

      const countField = screen.getByTestId('field-count')
      expect(within(countField).getByText(/number/i)).toBeInTheDocument()
    })
  })

  describe('diff preview', () => {
    it('shows diff preview when document is modified', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Modified Name')

      expect(screen.getByTestId('diff-preview')).toBeInTheDocument()
    })

    it('shows changed fields in diff with old and new values', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Modified Name')

      const diffPreview = screen.getByTestId('diff-preview')
      expect(within(diffPreview).getByText('Test Document')).toBeInTheDocument()
      expect(within(diffPreview).getByText('Modified Name')).toBeInTheDocument()
    })

    it('indicates removed values in diff', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      // Delete a field to test removal
      const nameField = screen.getByTestId('field-name')
      await user.hover(nameField)
      await user.click(within(nameField).getByRole('button', { name: /delete/i }))

      const diffPreview = screen.getByTestId('diff-preview')
      expect(within(diffPreview).getByTestId('removed-name')).toBeInTheDocument()
    })

    it('shows number of changes in diff summary', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      // Modify name
      const nameField = screen.getByTestId('field-name')
      const nameInput = within(nameField).getByRole('textbox')
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')

      // Modify count
      const countField = screen.getByTestId('field-count')
      const countInput = within(countField).getByRole('spinbutton')
      await user.clear(countInput)
      await user.type(countInput, '99')

      // Check in the diff preview section (there may be multiple instances)
      const diffPreview = screen.getByTestId('diff-preview')
      expect(within(diffPreview).getByText(/2 changes/i)).toBeInTheDocument()
    })

    it('hides diff preview when document is reset to original', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      // Make a change
      await user.clear(input)
      await user.type(input, 'Modified')
      expect(screen.getByTestId('diff-preview')).toBeInTheDocument()

      // Reset to original
      await user.clear(input)
      await user.type(input, 'Test Document')
      expect(screen.queryByTestId('diff-preview')).not.toBeInTheDocument()
    })
  })

  describe('save and cancel', () => {
    it('calls onSave with updated document', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      renderWithProviders(<DocumentEditor {...defaultProps} onSave={onSave} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Updated Name')
      await user.click(screen.getByRole('button', { name: /save/i }))

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'doc123',
          name: 'Updated Name',
          count: 42,
        })
      )
    })

    it('calls onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      renderWithProviders(<DocumentEditor {...defaultProps} onCancel={onCancel} />)

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(onCancel).toHaveBeenCalled()
    })

    it('shows confirmation dialog when canceling with changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Modified')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    })

    it('does not call onCancel if discard is not confirmed', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      renderWithProviders(<DocumentEditor {...defaultProps} onCancel={onCancel} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Modified')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      // Click "Keep editing"
      await user.click(screen.getByRole('button', { name: /keep editing/i }))

      expect(onCancel).not.toHaveBeenCalled()
    })

    it('disables save button when no changes are made', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      const saveButton = screen.getByRole('button', { name: /save/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('keyboard shortcuts', () => {
    it('saves on Ctrl+Enter', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      renderWithProviders(<DocumentEditor {...defaultProps} onSave={onSave} />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'Updated Name')
      await user.keyboard('{Control>}{Enter}{/Control}')

      expect(onSave).toHaveBeenCalled()
    })

    it('cancels on Escape when no changes', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      renderWithProviders(<DocumentEditor {...defaultProps} onCancel={onCancel} />)

      await user.keyboard('{Escape}')

      expect(onCancel).toHaveBeenCalled()
    })

    it('Tab navigates between fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      const nameInput = within(nameField).getByRole('textbox')

      await user.click(nameInput)
      await user.tab()

      // Should move focus to next focusable field
      expect(document.activeElement).not.toBe(nameInput)
    })
  })

  describe('add and remove fields', () => {
    it('shows add field button', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} />)
      expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument()
    })

    it('adds a new field when add field is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /add field/i }))

      // Should show new field input
      expect(screen.getByPlaceholderText(/field name/i)).toBeInTheDocument()
    })

    it('shows delete button on field hover', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      await user.hover(nameField)

      expect(within(nameField).getByRole('button', { name: /delete/i })).toBeInTheDocument()
    })

    it('does not show delete button for _id field', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const idField = screen.getByTestId('field-_id')
      await user.hover(idField)

      expect(within(idField).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    })

    it('removes field when delete is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DocumentEditor {...defaultProps} />)

      const nameField = screen.getByTestId('field-name')
      await user.hover(nameField)
      await user.click(within(nameField).getByRole('button', { name: /delete/i }))

      expect(screen.queryByTestId('field-name')).not.toBeInTheDocument()
    })
  })

  describe('readonly mode', () => {
    it('disables all inputs in readonly mode', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} readOnly />)

      const nameField = screen.getByTestId('field-name')
      const input = within(nameField).getByRole('textbox')
      expect(input).toBeDisabled()
    })

    it('hides save and cancel buttons in readonly mode', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} readOnly />)

      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    })

    it('hides add field button in readonly mode', () => {
      renderWithProviders(<DocumentEditor {...defaultProps} readOnly />)

      expect(screen.queryByRole('button', { name: /add field/i })).not.toBeInTheDocument()
    })
  })
})
