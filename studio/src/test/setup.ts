import { afterEach, vi } from 'vitest'

// Mock LeafyGreen Modal to avoid focus-trap issues in jsdom
vi.mock('@leafygreen-ui/modal', async () => {
  const React = await import('react')
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
      if (!open) return null
      return React.createElement('div', {
        'data-testid': 'lg-modal',
        role: 'dialog',
        'aria-modal': 'true',
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

// Mock clipboard API globally for all tests
// We need to create a persistent mock that doesn't get cleared by vi.clearAllMocks()
const clipboardMock = {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(''),
}
Object.defineProperty(navigator, 'clipboard', {
  value: clipboardMock,
  writable: true,
  configurable: true,
})

// Expose the clipboard mock for tests to verify
;(globalThis as Record<string, unknown>).__clipboardMock = clipboardMock

// Cleanup after each test
afterEach(() => {
  cleanup()
  clipboardMock.writeText.mockClear()
  clipboardMock.readText.mockClear()
})

// Mock matchMedia for LeafyGreen components
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
