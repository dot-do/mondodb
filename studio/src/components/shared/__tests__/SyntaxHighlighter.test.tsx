/**
 * SyntaxHighlighter Component Tests - RED Phase (TDD)
 *
 * These tests define the expected behavior of a reusable SyntaxHighlighter component
 * for displaying code with syntax highlighting. They are written BEFORE the implementation,
 * so they should FAIL initially.
 *
 * Test Coverage:
 * 1. Basic rendering with code content
 * 2. Different language support (JavaScript, Python, JSON)
 * 3. Line numbers display
 * 4. Copy functionality
 * 5. Accessibility features
 * 6. Theme/styling support
 * 7. Edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { SyntaxHighlighter } from '../SyntaxHighlighter'

describe('SyntaxHighlighter', () => {
  const defaultProps = {
    code: 'const x = 1;',
    language: 'javascript' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ===========================================================================
  // SECTION 1: Basic Rendering
  // ===========================================================================
  describe('basic rendering', () => {
    it('renders the code content', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      expect(screen.getByText('const x = 1;')).toBeInTheDocument()
    })

    it('renders with data-testid attribute', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument()
    })

    it('renders code in a pre element', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const preElement = screen.getByTestId('syntax-highlighter-code')
      expect(preElement.tagName).toBe('PRE')
    })

    it('renders code in a code element inside pre', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toBeInTheDocument()
    })

    it('applies language class to code element', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-javascript')
    })

    it('renders multi-line code correctly', () => {
      const multiLineCode = `function hello() {
  return 'world';
}`
      render(<SyntaxHighlighter code={multiLineCode} language="javascript" />)

      expect(screen.getByText(/function hello/)).toBeInTheDocument()
      expect(screen.getByText(/return/)).toBeInTheDocument()
    })

    it('preserves whitespace in code', () => {
      const codeWithSpaces = '  const indented = true;'
      render(<SyntaxHighlighter code={codeWithSpaces} language="javascript" />)

      const preElement = screen.getByTestId('syntax-highlighter-code')
      expect(preElement).toHaveStyle({ whiteSpace: 'pre' })
    })

    it('renders empty code gracefully', () => {
      render(<SyntaxHighlighter code="" language="javascript" />)

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 2: JavaScript Language Support
  // ===========================================================================
  describe('JavaScript language support', () => {
    it('highlights JavaScript keywords', () => {
      const jsCode = 'const x = 1; let y = 2; var z = 3;'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      // Keywords should be highlighted with specific class or styling
      const highlightedKeywords = screen.getAllByTestId('syntax-keyword')
      expect(highlightedKeywords.length).toBeGreaterThan(0)
    })

    it('highlights JavaScript strings', () => {
      const jsCode = 'const message = "hello world";'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      const highlightedStrings = screen.getAllByTestId('syntax-string')
      expect(highlightedStrings.length).toBeGreaterThan(0)
    })

    it('highlights JavaScript numbers', () => {
      const jsCode = 'const num = 42;'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      const highlightedNumbers = screen.getAllByTestId('syntax-number')
      expect(highlightedNumbers.length).toBeGreaterThan(0)
    })

    it('highlights JavaScript comments', () => {
      const jsCode = '// This is a comment\nconst x = 1;'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      const highlightedComments = screen.getAllByTestId('syntax-comment')
      expect(highlightedComments.length).toBeGreaterThan(0)
    })

    it('highlights JavaScript function calls', () => {
      const jsCode = 'console.log("hello");'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      const highlightedFunctions = screen.getAllByTestId('syntax-function')
      expect(highlightedFunctions.length).toBeGreaterThan(0)
    })

    it('supports arrow functions', () => {
      const jsCode = 'const add = (a, b) => a + b;'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      expect(screen.getByText(/=>/)).toBeInTheDocument()
    })

    it('supports async/await syntax', () => {
      const jsCode = 'async function fetch() { await getData(); }'
      render(<SyntaxHighlighter code={jsCode} language="javascript" />)

      const keywords = screen.getAllByTestId('syntax-keyword')
      expect(keywords.some(el => el.textContent?.includes('async'))).toBe(true)
      expect(keywords.some(el => el.textContent?.includes('await'))).toBe(true)
    })
  })

  // ===========================================================================
  // SECTION 3: Python Language Support
  // ===========================================================================
  describe('Python language support', () => {
    it('highlights Python keywords', () => {
      const pythonCode = 'def hello():\n    return "world"'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      const highlightedKeywords = screen.getAllByTestId('syntax-keyword')
      expect(highlightedKeywords.length).toBeGreaterThan(0)
    })

    it('highlights Python strings', () => {
      const pythonCode = 'message = "hello world"'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      const highlightedStrings = screen.getAllByTestId('syntax-string')
      expect(highlightedStrings.length).toBeGreaterThan(0)
    })

    it('highlights Python comments', () => {
      const pythonCode = '# This is a comment\nx = 1'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      const highlightedComments = screen.getAllByTestId('syntax-comment')
      expect(highlightedComments.length).toBeGreaterThan(0)
    })

    it('highlights Python class definitions', () => {
      const pythonCode = 'class MyClass:\n    pass'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      const keywords = screen.getAllByTestId('syntax-keyword')
      expect(keywords.some(el => el.textContent?.includes('class'))).toBe(true)
    })

    it('highlights Python import statements', () => {
      const pythonCode = 'from pymongo import MongoClient'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      const keywords = screen.getAllByTestId('syntax-keyword')
      expect(keywords.some(el => el.textContent?.includes('from'))).toBe(true)
      expect(keywords.some(el => el.textContent?.includes('import'))).toBe(true)
    })

    it('supports triple-quoted strings', () => {
      const pythonCode = '"""This is a docstring"""'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      const highlightedStrings = screen.getAllByTestId('syntax-string')
      expect(highlightedStrings.length).toBeGreaterThan(0)
    })

    it('supports f-strings', () => {
      const pythonCode = 'f"Hello {name}"'
      render(<SyntaxHighlighter code={pythonCode} language="python" />)

      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('f"Hello {name}"')
    })
  })

  // ===========================================================================
  // SECTION 4: JSON Language Support
  // ===========================================================================
  describe('JSON language support', () => {
    it('highlights JSON keys', () => {
      const jsonCode = '{"name": "value"}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      const highlightedKeys = screen.getAllByTestId('syntax-property')
      expect(highlightedKeys.length).toBeGreaterThan(0)
    })

    it('highlights JSON string values', () => {
      const jsonCode = '{"key": "string value"}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      const highlightedStrings = screen.getAllByTestId('syntax-string')
      expect(highlightedStrings.length).toBeGreaterThan(0)
    })

    it('highlights JSON number values', () => {
      const jsonCode = '{"count": 42}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      const highlightedNumbers = screen.getAllByTestId('syntax-number')
      expect(highlightedNumbers.length).toBeGreaterThan(0)
    })

    it('highlights JSON boolean values', () => {
      const jsonCode = '{"active": true, "deleted": false}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      const highlightedBooleans = screen.getAllByTestId('syntax-boolean')
      expect(highlightedBooleans.length).toBeGreaterThan(0)
    })

    it('highlights JSON null values', () => {
      const jsonCode = '{"data": null}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      const highlightedNulls = screen.getAllByTestId('syntax-null')
      expect(highlightedNulls.length).toBeGreaterThan(0)
    })

    it('handles nested JSON objects', () => {
      const jsonCode = '{"outer": {"inner": "value"}}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('outer')
      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('inner')
    })

    it('handles JSON arrays', () => {
      const jsonCode = '{"items": [1, 2, 3]}'
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('[1, 2, 3]')
    })

    it('formats multi-line JSON', () => {
      const jsonCode = `{
  "name": "test",
  "value": 123
}`
      render(<SyntaxHighlighter code={jsonCode} language="json" />)

      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('name')
      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('value')
    })
  })

  // ===========================================================================
  // SECTION 5: Line Numbers
  // ===========================================================================
  describe('line numbers', () => {
    it('shows line numbers when showLineNumbers is true', () => {
      render(<SyntaxHighlighter {...defaultProps} showLineNumbers={true} />)

      expect(screen.getByTestId('line-numbers')).toBeInTheDocument()
    })

    it('hides line numbers when showLineNumbers is false', () => {
      render(<SyntaxHighlighter {...defaultProps} showLineNumbers={false} />)

      expect(screen.queryByTestId('line-numbers')).not.toBeInTheDocument()
    })

    it('shows line numbers by default', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      expect(screen.getByTestId('line-numbers')).toBeInTheDocument()
    })

    it('shows correct number of line numbers for single line', () => {
      render(<SyntaxHighlighter code="const x = 1;" language="javascript" showLineNumbers />)

      expect(screen.getByTestId('line-numbers')).toHaveTextContent('1')
    })

    it('shows correct number of line numbers for multiple lines', () => {
      const multiLineCode = 'line1\nline2\nline3'
      render(<SyntaxHighlighter code={multiLineCode} language="javascript" showLineNumbers />)

      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers).toHaveTextContent('1')
      expect(lineNumbers).toHaveTextContent('2')
      expect(lineNumbers).toHaveTextContent('3')
    })

    it('aligns line numbers with code lines', () => {
      const multiLineCode = 'line1\nline2'
      render(<SyntaxHighlighter code={multiLineCode} language="javascript" showLineNumbers />)

      const lineNumbers = screen.getByTestId('line-numbers')
      const codeBlock = screen.getByTestId('syntax-highlighter-code')

      // Both should have the same line height
      const lineNumbersStyle = getComputedStyle(lineNumbers)
      const codeStyle = getComputedStyle(codeBlock)
      expect(lineNumbersStyle.lineHeight).toBe(codeStyle.lineHeight)
    })

    it('applies line number styling', () => {
      render(<SyntaxHighlighter {...defaultProps} showLineNumbers />)

      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers).toHaveStyle({ userSelect: 'none' })
    })

    it('supports custom starting line number', () => {
      render(<SyntaxHighlighter code="const x = 1;" language="javascript" showLineNumbers startingLineNumber={10} />)

      expect(screen.getByTestId('line-numbers')).toHaveTextContent('10')
    })

    it('handles many lines gracefully', () => {
      const manyLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
      render(<SyntaxHighlighter code={manyLines} language="javascript" showLineNumbers />)

      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers).toHaveTextContent('100')
    })
  })

  // ===========================================================================
  // SECTION 6: Copy Functionality
  // ===========================================================================
  describe('copy functionality', () => {
    it('renders copy button when showCopyButton is true', () => {
      render(<SyntaxHighlighter {...defaultProps} showCopyButton={true} />)

      expect(screen.getByTestId('copy-code-button')).toBeInTheDocument()
    })

    it('hides copy button when showCopyButton is false', () => {
      render(<SyntaxHighlighter {...defaultProps} showCopyButton={false} />)

      expect(screen.queryByTestId('copy-code-button')).not.toBeInTheDocument()
    })

    it('shows copy button by default', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      expect(screen.getByTestId('copy-code-button')).toBeInTheDocument()
    })

    it('copies code to clipboard when copy button is clicked', async () => {
      const user = userEvent.setup()
      const code = 'const x = 1;'
      render(<SyntaxHighlighter code={code} language="javascript" showCopyButton />)

      await user.click(screen.getByTestId('copy-code-button'))

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code)
    })

    it('shows success indicator after copying', async () => {
      const user = userEvent.setup()
      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        expect(screen.getByTestId('copy-success-icon')).toBeInTheDocument()
      })
    })

    it('resets copy success indicator after timeout', async () => {
      const user = userEvent.setup()
      vi.useFakeTimers()

      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        expect(screen.getByTestId('copy-success-icon')).toBeInTheDocument()
      })

      vi.advanceTimersByTime(3000)

      await waitFor(() => {
        expect(screen.queryByTestId('copy-success-icon')).not.toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('shows error state when copy fails', async () => {
      const user = userEvent.setup()
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('Copy failed'))

      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        expect(screen.getByTestId('copy-error-icon')).toBeInTheDocument()
      })
    })

    it('copy button has accessible label', () => {
      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      const copyButton = screen.getByTestId('copy-code-button')
      expect(copyButton).toHaveAttribute('aria-label', 'Copy code')
    })

    it('copy button is keyboard accessible', async () => {
      const user = userEvent.setup()
      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      const copyButton = screen.getByTestId('copy-code-button')
      copyButton.focus()
      await user.keyboard('{Enter}')

      expect(navigator.clipboard.writeText).toHaveBeenCalled()
    })

    it('calls onCopy callback when copy succeeds', async () => {
      const user = userEvent.setup()
      const onCopy = vi.fn()

      render(<SyntaxHighlighter {...defaultProps} showCopyButton onCopy={onCopy} />)

      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        expect(onCopy).toHaveBeenCalledWith(defaultProps.code)
      })
    })
  })

  // ===========================================================================
  // SECTION 7: Accessibility
  // ===========================================================================
  describe('accessibility', () => {
    it('has proper aria role', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const preElement = screen.getByTestId('syntax-highlighter-code')
      expect(preElement).toHaveAttribute('role', 'code')
    })

    it('has aria-label for code block', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const preElement = screen.getByTestId('syntax-highlighter-code')
      expect(preElement).toHaveAttribute('aria-label')
    })

    it('supports custom aria-label', () => {
      render(<SyntaxHighlighter {...defaultProps} ariaLabel="Example JavaScript code" />)

      const preElement = screen.getByTestId('syntax-highlighter-code')
      expect(preElement).toHaveAttribute('aria-label', 'Example JavaScript code')
    })

    it('code block is focusable for keyboard navigation', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveAttribute('tabIndex', '0')
    })

    it('line numbers are not read by screen readers', () => {
      render(<SyntaxHighlighter {...defaultProps} showLineNumbers />)

      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers).toHaveAttribute('aria-hidden', 'true')
    })

    it('copy button status is announced to screen readers', async () => {
      const user = userEvent.setup()
      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      await user.click(screen.getByTestId('copy-code-button'))

      await waitFor(() => {
        const status = screen.getByRole('status')
        expect(status).toBeInTheDocument()
      })
    })

    it('supports high contrast mode', () => {
      render(<SyntaxHighlighter {...defaultProps} highContrast />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveAttribute('data-high-contrast', 'true')
    })

    it('maintains focus after copy operation', async () => {
      const user = userEvent.setup()
      render(<SyntaxHighlighter {...defaultProps} showCopyButton />)

      const copyButton = screen.getByTestId('copy-code-button')
      await user.click(copyButton)

      expect(document.activeElement).toBe(copyButton)
    })
  })

  // ===========================================================================
  // SECTION 8: Theming
  // ===========================================================================
  describe('theming', () => {
    it('applies dark theme by default', () => {
      render(<SyntaxHighlighter {...defaultProps} />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveAttribute('data-theme', 'dark')
    })

    it('supports light theme', () => {
      render(<SyntaxHighlighter {...defaultProps} theme="light" />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveAttribute('data-theme', 'light')
    })

    it('supports custom className', () => {
      render(<SyntaxHighlighter {...defaultProps} className="custom-class" />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveClass('custom-class')
    })

    it('supports custom inline styles', () => {
      const customStyle = { borderRadius: '8px' }
      render(<SyntaxHighlighter {...defaultProps} style={customStyle} />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveStyle({ borderRadius: '8px' })
    })

    it('applies proper background color for dark theme', () => {
      render(<SyntaxHighlighter {...defaultProps} theme="dark" />)

      const container = screen.getByTestId('syntax-highlighter')
      const style = getComputedStyle(container)
      expect(style.backgroundColor).toBeTruthy()
    })

    it('applies proper text color for dark theme', () => {
      render(<SyntaxHighlighter {...defaultProps} theme="dark" />)

      const container = screen.getByTestId('syntax-highlighter')
      const style = getComputedStyle(container)
      expect(style.color).toBeTruthy()
    })
  })

  // ===========================================================================
  // SECTION 9: Edge Cases
  // ===========================================================================
  describe('edge cases', () => {
    it('handles very long lines without breaking layout', () => {
      const longLine = 'x'.repeat(1000)
      render(<SyntaxHighlighter code={longLine} language="javascript" />)

      const container = screen.getByTestId('syntax-highlighter')
      expect(container).toHaveStyle({ overflow: 'auto' })
    })

    it('handles special characters in code', () => {
      const codeWithSpecialChars = 'const x = "<>&";'
      render(<SyntaxHighlighter code={codeWithSpecialChars} language="javascript" />)

      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('<>&')
    })

    it('handles unicode characters', () => {
      const unicodeCode = 'const emoji = "Hello World!";'
      render(<SyntaxHighlighter code={unicodeCode} language="javascript" />)

      expect(screen.getByTestId('syntax-highlighter-code')).toHaveTextContent('Hello World!')
    })

    it('handles code with tab characters', () => {
      const tabbedCode = 'function test() {\n\treturn true;\n}'
      render(<SyntaxHighlighter code={tabbedCode} language="javascript" />)

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument()
    })

    it('handles empty lines in code', () => {
      const codeWithEmptyLines = 'line1\n\nline3'
      render(<SyntaxHighlighter code={codeWithEmptyLines} language="javascript" showLineNumbers />)

      const lineNumbers = screen.getByTestId('line-numbers')
      expect(lineNumbers).toHaveTextContent('3')
    })

    it('handles code ending with newline', () => {
      const codeWithTrailingNewline = 'const x = 1;\n'
      render(<SyntaxHighlighter code={codeWithTrailingNewline} language="javascript" />)

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument()
    })

    it('handles unknown language gracefully', () => {
      render(<SyntaxHighlighter code="some code" language={'unknown' as 'javascript'} />)

      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument()
      expect(screen.getByText('some code')).toBeInTheDocument()
    })

    it('updates when code prop changes', () => {
      const { rerender } = render(<SyntaxHighlighter code="initial" language="javascript" />)

      expect(screen.getByText('initial')).toBeInTheDocument()

      rerender(<SyntaxHighlighter code="updated" language="javascript" />)

      expect(screen.queryByText('initial')).not.toBeInTheDocument()
      expect(screen.getByText('updated')).toBeInTheDocument()
    })

    it('updates when language prop changes', () => {
      const { rerender } = render(<SyntaxHighlighter code="def hello():" language="python" />)

      let codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-python')

      rerender(<SyntaxHighlighter code="def hello():" language="javascript" />)

      codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-javascript')
    })

    it('handles rapid prop changes', () => {
      const { rerender } = render(<SyntaxHighlighter code="code1" language="javascript" />)

      for (let i = 2; i <= 10; i++) {
        rerender(<SyntaxHighlighter code={`code${i}`} language="javascript" />)
      }

      expect(screen.getByText('code10')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 10: Additional Language Support
  // ===========================================================================
  describe('additional language support', () => {
    it('supports TypeScript', () => {
      const tsCode = 'const x: number = 1;'
      render(<SyntaxHighlighter code={tsCode} language="typescript" />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-typescript')
    })

    it('supports JSX', () => {
      const jsxCode = '<Component prop="value" />'
      render(<SyntaxHighlighter code={jsxCode} language="jsx" />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-jsx')
    })

    it('supports CSS', () => {
      const cssCode = '.class { color: red; }'
      render(<SyntaxHighlighter code={cssCode} language="css" />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-css')
    })

    it('supports bash/shell', () => {
      const bashCode = 'npm install package'
      render(<SyntaxHighlighter code={bashCode} language="bash" />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-bash')
    })

    it('supports SQL', () => {
      const sqlCode = 'SELECT * FROM users WHERE id = 1;'
      render(<SyntaxHighlighter code={sqlCode} language="sql" />)

      const codeElement = screen.getByTestId('syntax-highlighter-code').querySelector('code')
      expect(codeElement).toHaveClass('language-sql')
    })
  })
})
