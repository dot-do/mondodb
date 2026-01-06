import { afterEach, beforeEach, vi } from 'vitest'

// Memory cleanup: Clear all mocks before each test to prevent memory accumulation
beforeEach(() => {
  vi.clearAllMocks()
})

// Mock LeafyGreen Modal to avoid focus-trap issues in jsdom
vi.mock('@leafygreen-ui/modal', async () => {
  const React = await import('react')
  let modalIdCounter = 0
  return {
    default: function Modal({
      children,
      open,
      setOpen,
      className,
    }: {
      children: React.ReactNode
      open: boolean
      setOpen?: (open: boolean) => void
      className?: string
    }) {
      // Generate unique ID for aria-labelledby
      const modalId = React.useMemo(() => `modal-title-${++modalIdCounter}`, [])

      // Handle Escape key to close modal
      React.useEffect(() => {
        if (!open) return
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && setOpen) {
            setOpen(false)
          }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
      }, [open, setOpen])

      if (!open) return null
      return React.createElement('div', {
        'data-testid': 'lg-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': modalId,
        className,
      }, children)
    },
    ModalSize: {
      Small: 'small',
      Default: 'default',
      Large: 'large',
    },
  }
})

// Mock LeafyGreen ConfirmationModal to avoid focus-trap issues in jsdom
vi.mock('@leafygreen-ui/confirmation-modal', async () => {
  const React = await import('react')
  return {
    default: function ConfirmationModal({
      children,
      open,
      onConfirm,
      onCancel,
      title,
      buttonText,
      variant,
      confirmButtonProps,
    }: {
      children: React.ReactNode
      open: boolean
      onConfirm: () => void
      onCancel: () => void
      title: string
      buttonText: string
      variant?: string
      confirmButtonProps?: Record<string, unknown>
    }) {
      if (!open) return null
      return React.createElement('div', {
        'data-testid': 'lg-confirmation-modal',
        role: 'dialog',
        'aria-modal': 'true',
      }, [
        React.createElement('h3', { key: 'title', role: 'heading' }, title),
        React.createElement('div', { key: 'content' }, children),
        React.createElement('div', { key: 'buttons', style: { display: 'flex', gap: '8px' } }, [
          React.createElement('button', {
            key: 'cancel',
            onClick: onCancel,
            type: 'button',
          }, 'Cancel'),
          React.createElement('button', {
            key: 'confirm',
            onClick: onConfirm,
            type: 'button',
            'data-testid': 'delete-document-confirm',
            disabled: confirmButtonProps?.disabled,
            'aria-disabled': confirmButtonProps?.disabled ? 'true' : 'false',
          }, buttonText),
        ]),
      ])
    },
  }
})

import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { PointerEventsCheckLevel } from '@testing-library/user-event/dist/esm/options.js'
import userEvent from '@testing-library/user-event'

// Configure user-event to skip pointer-events checking for LeafyGreen components
// LeafyGreen uses pointer-events: none on hidden inputs (checkboxes, etc.) which
// causes issues with userEvent's default pointer-events checking
const originalSetup = userEvent.setup.bind(userEvent)
userEvent.setup = (options = {}) => {
  return originalSetup({
    pointerEventsCheck: PointerEventsCheckLevel.Never,
    ...options,
  })
}

// Default clipboard mock for tests that don't set up their own
const clipboardMock = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}

// Set up clipboard mock on navigator
// Tests can override this in their own beforeEach using Object.defineProperty
Object.defineProperty(navigator, 'clipboard', {
  value: clipboardMock,
  writable: true,
  configurable: true,
})

// Expose the clipboard mock for tests to verify
;(globalThis as Record<string, unknown>).__clipboardMock = clipboardMock

// Cleanup after each test - critical for preventing memory leaks
afterEach(() => {
  // Clean up React Testing Library DOM
  cleanup()
  // Clear clipboard mock state
  clipboardMock.writeText.mockClear()
  clipboardMock.readText.mockClear()
  // Clear all timers to prevent memory retention
  vi.clearAllTimers()
  // Clear mock call history but preserve implementations
  vi.clearAllMocks()
})

// Mock matchMedia for LeafyGreen components (only in browser environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  root = null
  rootMargin = ''
  thresholds = []
  takeRecords() {
    return []
  }
}
