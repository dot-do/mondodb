import { Component, type ReactNode, type ErrorInfo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'

const errorContainerStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  min-height: 200px;
  border: 1px solid ${palette.red.light2};
  border-radius: 8px;
  background: ${palette.red.light3};
`

const iconStyles = css`
  color: ${palette.red.dark2};
  margin-bottom: 16px;
`

const messageStyles = css`
  color: ${palette.gray.dark2};
  margin-top: 8px;
  margin-bottom: 16px;
`

const detailsStyles = css`
  background: ${palette.gray.light3};
  padding: 12px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: ${palette.red.dark2};
  max-width: 600px;
  overflow: auto;
  text-align: left;
  margin-top: 16px;
`

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className={errorContainerStyles} data-testid="error-boundary">
          <Icon glyph="Warning" size="xlarge" className={iconStyles} />
          <H3>Something went wrong</H3>
          <Body className={messageStyles}>
            An unexpected error occurred. Please try again.
          </Body>
          <Button
            variant="primary"
            leftGlyph={<Icon glyph="Refresh" />}
            onClick={this.handleReset}
            data-testid="error-boundary-retry"
          >
            Try Again
          </Button>

          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className={detailsStyles} data-testid="error-details">
              <strong>{this.state.error.name}:</strong> {this.state.error.message}
              {this.state.errorInfo?.componentStack && (
                <pre>{this.state.errorInfo.componentStack}</pre>
              )}
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

// Convenience wrapper for functional components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}
