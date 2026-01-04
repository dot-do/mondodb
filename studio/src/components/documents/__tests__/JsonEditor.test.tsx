import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { JsonEditor, formatJson, parseJsonSafe } from '../JsonEditor'

describe('JsonEditor', () => {
  const defaultProps = {
    value: '{}',
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the editor container', () => {
      render(<JsonEditor {...defaultProps} data-testid="json-editor" />)
      expect(screen.getByTestId('json-editor')).toBeInTheDocument()
    })

    it('displays initial value', () => {
      const value = '{"name": "test"}'
      render(<JsonEditor {...defaultProps} value={value} />)
      // CodeMirror should contain the text
      expect(screen.getByText(/name/)).toBeInTheDocument()
    })

    it('applies custom height', () => {
      render(
        <JsonEditor {...defaultProps} height={500} data-testid="json-editor" />
      )
      const container = screen.getByTestId('json-editor')
      expect(container).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('calls onValidChange with true for valid JSON', async () => {
      const onValidChange = vi.fn()
      render(
        <JsonEditor
          {...defaultProps}
          value='{"valid": true}'
          onValidChange={onValidChange}
        />
      )

      await waitFor(() => {
        expect(onValidChange).toHaveBeenCalledWith(true)
      })
    })

    it('calls onValidChange with false for invalid JSON', async () => {
      const onValidChange = vi.fn()
      render(
        <JsonEditor
          {...defaultProps}
          value='{invalid json}'
          onValidChange={onValidChange}
        />
      )

      await waitFor(() => {
        expect(onValidChange).toHaveBeenCalledWith(false)
      })
    })

    it('shows error message for invalid JSON', async () => {
      render(
        <JsonEditor
          {...defaultProps}
          value='{invalid}'
          data-testid="json-editor"
        />
      )

      await waitFor(() => {
        const container = screen.getByTestId('json-editor')
        expect(container).toHaveAttribute('data-invalid', 'true')
      })
    })

    it('treats empty string as valid', async () => {
      const onValidChange = vi.fn()
      render(
        <JsonEditor
          {...defaultProps}
          value=""
          onValidChange={onValidChange}
        />
      )

      await waitFor(() => {
        expect(onValidChange).toHaveBeenCalledWith(true)
      })
    })
  })

  describe('readOnly mode', () => {
    it('renders in readOnly mode without errors', () => {
      render(
        <JsonEditor
          {...defaultProps}
          readOnly={true}
          data-testid="json-editor"
        />
      )
      expect(screen.getByTestId('json-editor')).toBeInTheDocument()
    })
  })
})

describe('formatJson', () => {
  it('formats valid JSON with proper indentation', () => {
    const input = '{"a":1,"b":2}'
    const result = formatJson(input)
    expect(result).toBe('{\n  "a": 1,\n  "b": 2\n}')
  })

  it('formats nested objects', () => {
    const input = '{"a":{"b":1}}'
    const result = formatJson(input)
    expect(result).toContain('"a":')
    expect(result).toContain('"b": 1')
  })

  it('returns original string for invalid JSON', () => {
    const input = '{invalid}'
    const result = formatJson(input)
    expect(result).toBe(input)
  })

  it('formats arrays', () => {
    const input = '[1,2,3]'
    const result = formatJson(input)
    expect(result).toBe('[\n  1,\n  2,\n  3\n]')
  })
})

describe('parseJsonSafe', () => {
  it('returns success with parsed data for valid JSON', () => {
    const result = parseJsonSafe('{"name": "test"}')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ name: 'test' })
    }
  })

  it('returns failure with error for invalid JSON', () => {
    const result = parseJsonSafe('{invalid}')
    expect(result.success).toBe(false)
    if (!result.success) {
      // Error message varies between JS engines, just check it's a parse error
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('parses arrays correctly', () => {
    const result = parseJsonSafe('[1, 2, 3]')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3])
    }
  })

  it('parses null correctly', () => {
    const result = parseJsonSafe('null')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeNull()
    }
  })

  it('parses primitives correctly', () => {
    expect(parseJsonSafe('42')).toEqual({ success: true, data: 42 })
    expect(parseJsonSafe('"hello"')).toEqual({ success: true, data: 'hello' })
    expect(parseJsonSafe('true')).toEqual({ success: true, data: true })
  })
})
