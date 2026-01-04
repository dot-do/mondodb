import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary, withErrorBoundary } from '../ErrorBoundary'

// Component that throws an error
function ThrowingComponent(): JSX.Element {
  throw new Error('Test error')
}

// Component that works normally
function WorkingComponent(): JSX.Element {
  return <div data-testid="working">Works!</div>
}

// Suppress console.error during tests
const originalError = console.error
beforeEach(() => {
  console.error = vi.fn()
  return () => {
    console.error = originalError
  }
})

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('working')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary')).not.toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary')).not.toBeInTheDocument()
  })

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    )
  })

  it('shows retry button that resets error state', async () => {
    const user = userEvent.setup()
    let shouldThrow = true

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Test error')
      }
      return <div data-testid="recovered">Recovered!</div>
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    )

    // Initially shows error
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()

    // Click retry (after fixing the error condition)
    shouldThrow = false
    await user.click(screen.getByTestId('error-boundary-retry'))

    // Should now render the working component
    expect(screen.getByTestId('recovered')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary')).not.toBeInTheDocument()
  })

  it('shows error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('error-details')).toBeInTheDocument()
    expect(screen.getByText(/Test error/)).toBeInTheDocument()

    process.env.NODE_ENV = originalEnv
  })
})

describe('withErrorBoundary', () => {
  it('wraps component with error boundary', () => {
    const WrappedComponent = withErrorBoundary(ThrowingComponent)

    render(<WrappedComponent />)

    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
  })

  it('allows custom fallback', () => {
    const WrappedComponent = withErrorBoundary(
      ThrowingComponent,
      <div data-testid="hoc-fallback">HOC Fallback</div>
    )

    render(<WrappedComponent />)

    expect(screen.getByTestId('hoc-fallback')).toBeInTheDocument()
  })

  it('passes props through to wrapped component', () => {
    interface Props {
      message: string
    }

    function PropsComponent({ message }: Props) {
      return <div data-testid="props-component">{message}</div>
    }

    const WrappedComponent = withErrorBoundary(PropsComponent)

    render(<WrappedComponent message="Hello" />)

    expect(screen.getByTestId('props-component')).toHaveTextContent('Hello')
  })
})
