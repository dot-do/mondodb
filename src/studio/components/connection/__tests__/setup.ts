/**
 * Test setup file for connection component tests
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.confirm for deletion confirmations
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: vi.fn().mockImplementation(() => true),
})
