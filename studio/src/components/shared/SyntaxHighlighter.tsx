/**
 * SyntaxHighlighter Component - STUB (TDD Red Phase)
 *
 * This is a placeholder component that throws "not implemented" to verify
 * that tests fail properly before implementation.
 *
 * Expected Props:
 * - code: string - The code to display
 * - language: 'javascript' | 'typescript' | 'python' | 'json' | 'jsx' | 'css' | 'bash' | 'sql'
 * - showLineNumbers?: boolean - Whether to show line numbers (default: true)
 * - showCopyButton?: boolean - Whether to show copy button (default: true)
 * - startingLineNumber?: number - Starting line number (default: 1)
 * - theme?: 'dark' | 'light' - Color theme (default: 'dark')
 * - highContrast?: boolean - Enable high contrast mode
 * - className?: string - Additional CSS class
 * - style?: React.CSSProperties - Inline styles
 * - ariaLabel?: string - Custom aria-label for accessibility
 * - onCopy?: (code: string) => void - Callback when code is copied
 */

export interface SyntaxHighlighterProps {
  code: string
  language: 'javascript' | 'typescript' | 'python' | 'json' | 'jsx' | 'css' | 'bash' | 'sql'
  showLineNumbers?: boolean
  showCopyButton?: boolean
  startingLineNumber?: number
  theme?: 'dark' | 'light'
  highContrast?: boolean
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
  onCopy?: (code: string) => void
}

export function SyntaxHighlighter(_props: SyntaxHighlighterProps): JSX.Element {
  throw new Error('not implemented')
}
