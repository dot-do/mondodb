import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsertDocumentDialog, JsonEditor, formatJson, parseJsonSafe } from '../InsertDocumentDialog'

describe('InsertDocumentDialog', () => {
  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    open: true,
    onClose: vi.fn(),
    onInsert: vi.fn(),
    onSuccess: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders dialog when open', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Insert Document')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<InsertDocumentDialog {...defaultProps} open={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows collection name in description', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByText(/testcoll/)).toBeInTheDocument()
    })

    it('renders Insert button', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('insert-button')).toBeInTheDocument()
      expect(screen.getByTestId('insert-button')).toHaveTextContent('Insert')
    })

    it('renders Cancel button', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
      expect(screen.getByTestId('cancel-button')).toHaveTextContent('Cancel')
    })

    it('renders format button', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('format-button')).toBeInTheDocument()
    })

    it('renders clear button', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('clear-button')).toBeInTheDocument()
    })

    it('renders editor container', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('insert-document-editor')).toBeInTheDocument()
    })

    it('renders json editor input', () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('json-editor-input')).toBeInTheDocument()
    })
  })

  describe('form submission', () => {
    it('calls onInsert when Insert button is clicked with valid JSON', async () => {
      defaultProps.onInsert.mockResolvedValue({ insertedId: 'new-id' })
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter valid JSON using fireEvent to avoid escaping issues
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } })

      await user.click(screen.getByTestId('insert-button'))

      await waitFor(() => {
        expect(defaultProps.onInsert).toHaveBeenCalled()
      })
    })

    it('calls onSuccess with insertedId after successful insert', async () => {
      defaultProps.onInsert.mockResolvedValue({ insertedId: 'abc123' })
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter valid JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } })

      await user.click(screen.getByTestId('insert-button'))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledWith('abc123')
      })
    })

    it('closes dialog after successful insert', async () => {
      defaultProps.onInsert.mockResolvedValue({ insertedId: 'abc123' })
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter valid JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"id": 1}' } })

      await user.click(screen.getByTestId('insert-button'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('shows error message on insert failure', async () => {
      defaultProps.onInsert.mockRejectedValue(new Error('Insert failed'))
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter valid JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } })

      await user.click(screen.getByTestId('insert-button'))

      await waitFor(() => {
        expect(screen.getByTestId('insert-error')).toHaveTextContent('Insert failed')
      })
    })

    it('shows loading state during insert', async () => {
      // Create a promise that we control
      let resolveInsert: (value: { insertedId: string }) => void
      const insertPromise = new Promise<{ insertedId: string }>((resolve) => {
        resolveInsert = resolve
      })
      defaultProps.onInsert.mockReturnValue(insertPromise)

      const user = userEvent.setup()
      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter valid JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"test": true}' } })

      // Click insert button
      await user.click(screen.getByTestId('insert-button'))

      // Check that button shows loading state
      expect(screen.getByTestId('insert-button')).toHaveTextContent('Inserting...')
      expect(screen.getByTestId('insert-button')).toBeDisabled()

      // Resolve the promise
      resolveInsert!({ insertedId: 'test-id' })
    })

    it('disables insert button for invalid JSON', async () => {
      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter invalid JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{invalid}' } })

      // Check that insert button is disabled
      expect(screen.getByTestId('insert-button')).toBeDisabled()
    })

    it('shows error when document is not an object', async () => {
      const user = userEvent.setup()
      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter a JSON array instead of object
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '[1, 2, 3]' } })

      // Click insert button
      await user.click(screen.getByTestId('insert-button'))

      await waitFor(() => {
        expect(screen.getByTestId('insert-error')).toHaveTextContent('Document must be a JSON object')
      })
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('cancel-button'))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('calls onClose when overlay is clicked', async () => {
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('insert-document-dialog-overlay'))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not close when dialog content is clicked', async () => {
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('insert-document-dialog'))

      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })
  })

  describe('keyboard shortcuts', () => {
    it('closes dialog on Escape key', async () => {
      render(<InsertDocumentDialog {...defaultProps} />)
      const dialog = screen.getByTestId('insert-document-dialog')

      fireEvent.keyDown(dialog, { key: 'Escape' })

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('submits form on Cmd+Enter', async () => {
      defaultProps.onInsert.mockResolvedValue({ insertedId: 'test-id' })

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter valid JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"key": "value"}' } })

      const dialog = screen.getByTestId('insert-document-dialog')
      fireEvent.keyDown(dialog, { key: 'Enter', metaKey: true })

      await waitFor(() => {
        expect(defaultProps.onInsert).toHaveBeenCalled()
      })
    })
  })

  describe('format and clear buttons', () => {
    it('format button formats JSON', async () => {
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter unformatted JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"name":"test","value":123}' } })

      const formatButton = screen.getByTestId('format-button')
      await user.click(formatButton)

      // Check that the value is formatted
      await waitFor(() => {
        expect(textarea).toHaveValue(`{
  "name": "test",
  "value": 123
}`)
      })
    })

    it('clear button resets editor', async () => {
      const user = userEvent.setup()

      render(<InsertDocumentDialog {...defaultProps} />)

      // Enter some JSON
      const textarea = screen.getByTestId('json-editor-input')
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } })

      const clearButton = screen.getByTestId('clear-button')
      await user.click(clearButton)

      // Check that the value is reset to default
      await waitFor(() => {
        expect(textarea).toHaveValue(`{

}`)
      })
    })
  })
})

describe('JsonEditor', () => {
  it('renders textarea with value', () => {
    render(<JsonEditor value='{"test": true}' onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('{"test": true}')
  })

  it('calls onChange when value changes', async () => {
    const onChange = vi.fn()

    render(<JsonEditor value="" onChange={onChange} data-testid="editor" />)
    const textarea = screen.getByTestId('editor')

    fireEvent.change(textarea, { target: { value: '{"a": 1}' } })

    expect(onChange).toHaveBeenCalledWith('{"a": 1}')
  })

  it('calls onValidChange with true for valid JSON', async () => {
    const onValidChange = vi.fn()

    render(<JsonEditor value="" onChange={() => {}} onValidChange={onValidChange} data-testid="editor" />)
    const textarea = screen.getByTestId('editor')

    fireEvent.change(textarea, { target: { value: '{}' } })

    expect(onValidChange).toHaveBeenCalledWith(true)
  })

  it('calls onValidChange with false for invalid JSON', async () => {
    const onValidChange = vi.fn()

    render(<JsonEditor value="" onChange={() => {}} onValidChange={onValidChange} data-testid="editor" />)
    const textarea = screen.getByTestId('editor')

    fireEvent.change(textarea, { target: { value: '{invalid}' } })

    expect(onValidChange).toHaveBeenCalledWith(false)
  })

  it('applies custom height', () => {
    render(<JsonEditor value="" onChange={() => {}} height={500} data-testid="editor" />)
    const textarea = screen.getByTestId('editor')

    expect(textarea).toHaveStyle({ height: '500px' })
  })
})

describe('formatJson', () => {
  it('formats valid JSON with proper indentation', () => {
    const input = '{"name":"test","value":123}'
    const expected = `{
  "name": "test",
  "value": 123
}`
    expect(formatJson(input)).toBe(expected)
  })

  it('returns original string for invalid JSON', () => {
    const input = '{invalid json}'
    expect(formatJson(input)).toBe(input)
  })

  it('handles nested objects', () => {
    const input = '{"outer":{"inner":"value"}}'
    const expected = `{
  "outer": {
    "inner": "value"
  }
}`
    expect(formatJson(input)).toBe(expected)
  })

  it('handles arrays', () => {
    const input = '{"items":[1,2,3]}'
    const expected = `{
  "items": [
    1,
    2,
    3
  ]
}`
    expect(formatJson(input)).toBe(expected)
  })
})

describe('parseJsonSafe', () => {
  it('successfully parses valid JSON', () => {
    const input = '{"name": "test", "value": 123}'
    const result = parseJsonSafe(input)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: 'test', value: 123 })
    }
  })

  it('returns error for invalid JSON', () => {
    const input = '{invalid}'
    const result = parseJsonSafe(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
    }
  })

  it('handles empty object', () => {
    const result = parseJsonSafe('{}')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({})
    }
  })

  it('handles arrays', () => {
    const result = parseJsonSafe('[1, 2, 3]')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3])
    }
  })

  it('handles null', () => {
    const result = parseJsonSafe('null')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeNull()
    }
  })

  it('handles boolean values', () => {
    const result = parseJsonSafe('true')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(true)
    }
  })

  it('handles numeric values', () => {
    const result = parseJsonSafe('42')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(42)
    }
  })

  it('handles string values', () => {
    const result = parseJsonSafe('"hello"')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('hello')
    }
  })
})
