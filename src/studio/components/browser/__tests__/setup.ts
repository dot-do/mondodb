/**
 * Test setup file for browser component tests
 */

import '@testing-library/jest-dom'

// Add CSS animation keyframes for tests
const style = document.createElement('style')
style.innerHTML = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`
document.head.appendChild(style)
