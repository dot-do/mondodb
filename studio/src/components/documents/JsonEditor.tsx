import { useEffect, useRef, useCallback, useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view'
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { lintKeymap, linter, Diagnostic } from '@codemirror/lint'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

const editorContainerStyles = css`
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  overflow: hidden;
  font-family: 'Source Code Pro', monospace;

  &:focus-within {
    border-color: ${palette.blue.base};
    box-shadow: 0 0 0 3px ${palette.blue.light3};
  }

  &[data-invalid='true'] {
    border-color: ${palette.red.base};

    &:focus-within {
      box-shadow: 0 0 0 3px ${palette.red.light3};
    }
  }
`

const editorStyles = css`
  .cm-editor {
    background: ${palette.white};
    font-size: 13px;
  }

  .cm-scroller {
    overflow: auto;
    font-family: 'Source Code Pro', 'Menlo', monospace;
  }

  .cm-gutters {
    background: ${palette.gray.light3};
    border-right: 1px solid ${palette.gray.light2};
    color: ${palette.gray.dark1};
  }

  .cm-activeLineGutter {
    background: ${palette.gray.light2};
  }

  .cm-activeLine {
    background: ${palette.blue.light3}20;
  }

  .cm-selectionMatch {
    background: ${palette.yellow.light3};
  }

  .cm-cursor {
    border-left-color: ${palette.gray.dark3};
  }

  .cm-lint-marker-error {
    content: '';
  }

  .cm-lintRange-error {
    background: ${palette.red.light3}40;
    text-decoration: underline wavy ${palette.red.base};
  }
`

const errorMessageStyles = css`
  padding: 8px 12px;
  background: ${palette.red.light3};
  color: ${palette.red.dark2};
  font-size: 12px;
  border-top: 1px solid ${palette.red.light2};
`

export interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  onValidChange?: (isValid: boolean) => void
  placeholder?: string
  readOnly?: boolean
  height?: string | number
  minHeight?: string | number
  maxHeight?: string | number
  className?: string
  'data-testid'?: string
}

export function JsonEditor({
  value,
  onChange,
  onValidChange,
  placeholder,
  readOnly = false,
  height = 300,
  minHeight,
  maxHeight,
  className,
  'data-testid': testId,
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const readOnlyCompartment = useRef(new Compartment())
  const [parseError, setParseError] = useState<string | null>(null)

  // Validate JSON and notify parent
  const validateJson = useCallback(
    (content: string): boolean => {
      if (!content.trim()) {
        setParseError(null)
        onValidChange?.(true)
        return true
      }

      try {
        JSON.parse(content)
        setParseError(null)
        onValidChange?.(true)
        return true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Invalid JSON'
        setParseError(message)
        onValidChange?.(false)
        return false
      }
    },
    [onValidChange]
  )

  // Create custom JSON linter that also updates our state
  const createJsonLinter = useCallback(() => {
    return linter((view): Diagnostic[] => {
      const content = view.state.doc.toString()
      if (!content.trim()) {
        return []
      }

      try {
        JSON.parse(content)
        return []
      } catch (error) {
        if (error instanceof SyntaxError) {
          // Try to extract position from error message
          const match = error.message.match(/position (\d+)/)
          const pos = match ? parseInt(match[1], 10) : 0
          return [
            {
              from: Math.min(pos, content.length),
              to: Math.min(pos + 1, content.length),
              severity: 'error',
              message: error.message,
            },
          ]
        }
        return []
      }
    })
  }, [])

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return

    const heightStyles = EditorView.theme({
      '&': {
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: minHeight
          ? typeof minHeight === 'number'
            ? `${minHeight}px`
            : minHeight
          : undefined,
        maxHeight: maxHeight
          ? typeof maxHeight === 'number'
            ? `${maxHeight}px`
            : maxHeight
          : undefined,
      },
      '.cm-scroller': {
        overflow: 'auto',
      },
    })

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString()
        onChange(content)
        validateJson(content)
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
        ]),
        json(),
        createJsonLinter(),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        heightStyles,
        updateListener,
        placeholder
          ? EditorView.contentAttributes.of({ 'aria-placeholder': placeholder })
          : [],
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    // Initial validation
    validateJson(value)

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // Only run once on mount

  // Update value when it changes externally
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      })
    }
  }, [value])

  // Update readOnly state
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    })
  }, [readOnly])

  return (
    <div
      className={`${editorContainerStyles} ${className ?? ''}`}
      data-invalid={!!parseError}
      data-testid={testId}
    >
      <div ref={containerRef} className={editorStyles} />
      {parseError && (
        <div className={errorMessageStyles} role="alert">
          {parseError}
        </div>
      )}
    </div>
  )
}

/**
 * Format JSON string with proper indentation
 */
export function formatJson(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return jsonString
  }
}

/**
 * Validate JSON and return parsed object or null
 */
export function parseJsonSafe<T = unknown>(
  jsonString: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(jsonString) as T
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    }
  }
}
