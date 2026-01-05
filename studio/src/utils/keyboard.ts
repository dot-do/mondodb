import { KeyboardEvent } from 'react'

/**
 * Creates a keyboard event handler that triggers the provided callback
 * when Enter or Space keys are pressed. This is useful for making
 * clickable non-button elements accessible via keyboard.
 *
 * @param callback - The function to call when Enter or Space is pressed
 * @returns A keyboard event handler function
 *
 * @example
 * ```tsx
 * <div
 *   role="button"
 *   tabIndex={0}
 *   onClick={handleClick}
 *   onKeyDown={handleKeyboardClick(handleClick)}
 * >
 *   Clickable content
 * </div>
 * ```
 */
export function handleKeyboardClick<T extends HTMLElement>(
  callback: () => void
): (event: KeyboardEvent<T>) => void {
  return (event: KeyboardEvent<T>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // Prevent default scroll behavior for Space key
      event.preventDefault()
      callback()
    }
  }
}

/**
 * Props to spread onto a clickable div to make it keyboard accessible.
 * Use this helper to ensure consistent accessibility patterns.
 *
 * @param onClick - The click handler function
 * @returns Object with role, tabIndex, and onKeyDown props
 *
 * @example
 * ```tsx
 * <div
 *   onClick={handleClick}
 *   {...getClickableProps(handleClick)}
 * >
 *   Clickable content
 * </div>
 * ```
 */
export function getClickableProps<T extends HTMLElement>(
  onClick: () => void
): {
  role: 'button'
  tabIndex: 0
  onKeyDown: (event: KeyboardEvent<T>) => void
} {
  return {
    role: 'button' as const,
    tabIndex: 0 as const,
    onKeyDown: handleKeyboardClick<T>(onClick),
  }
}
