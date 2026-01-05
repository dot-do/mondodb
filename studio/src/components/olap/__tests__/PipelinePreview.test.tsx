import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { PipelinePreview } from '../PipelinePreview'
import type { AggregationStage } from '../QueryBuilder'

// Mock rpcClient
vi.mock('@lib/rpc-client', () => ({
  default: {
    aggregate: vi.fn(),
    sample: vi.fn(),
  },
}))

import rpcClient from '@lib/rpc-client'

const mockAggregateResults = {
  stage0: [
    { _id: '1', name: 'Alice', age: 30, department: 'Engineering' },
    { _id: '2', name: 'Bob', age: 25, department: 'Engineering' },
    { _id: '3', name: 'Charlie', age: 35, department: 'Sales' },
  ],
  stage1: [
    { _id: '1', name: 'Alice', age: 30, department: 'Engineering' },
    { _id: '2', name: 'Bob', age: 25, department: 'Engineering' },
  ],
  stage2: [
    { _id: 'Engineering', count: 2, avgAge: 27.5 },
  ],
}

const mockPipeline: AggregationStage[] = [
  {
    id: 'stage-1',
    type: '$match',
    match: [{ field: 'department', operator: '$eq', value: 'Engineering' }],
  },
  {
    id: 'stage-2',
    type: '$group',
    groupBy: 'department',
    accumulators: [
      { name: 'count', operator: '$count', field: '' },
      { name: 'avgAge', operator: '$avg', field: 'age' },
    ],
  },
]

describe('PipelinePreview', () => {
  const defaultProps = {
    database: 'testdb',
    collection: 'users',
    pipeline: mockPipeline,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the pipeline preview container', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('pipeline-preview')).toBeInTheDocument()
    })

    it('displays the collection name in header', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByText('users')).toBeInTheDocument()
    })

    it('shows run preview button', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('run-preview-button')).toBeInTheDocument()
    })

    it('shows sample size selector', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('sample-size-selector')).toBeInTheDocument()
    })

    it('displays empty state when no pipeline stages', () => {
      render(<PipelinePreview {...defaultProps} pipeline={[]} />)
      expect(screen.getByTestId('empty-pipeline-state')).toBeInTheDocument()
      expect(screen.getByText(/add stages to preview/i)).toBeInTheDocument()
    })

    it('displays pipeline stage count', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByText('2 stages')).toBeInTheDocument()
    })
  })

  describe('intermediate results display', () => {
    beforeEach(() => {
      // Mock aggregate to return results for each stage
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(mockAggregateResults.stage1) // After $match
        .mockResolvedValueOnce(mockAggregateResults.stage2) // After $group
    })

    it('shows intermediate results for each stage after execution', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
        expect(screen.getByTestId('stage-results-1')).toBeInTheDocument()
      })
    })

    it('displays document count for each stage result', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-0-count')).toHaveTextContent('2 documents')
        expect(screen.getByTestId('stage-1-count')).toHaveTextContent('1 document')
      })
    })

    it('shows stage type label for each intermediate result', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-0-label')).toHaveTextContent('$match')
        expect(screen.getByTestId('stage-1-label')).toHaveTextContent('$group')
      })
    })

    it('expands stage results when stage header clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))

      expect(screen.getByTestId('stage-results-expanded-0')).toBeInTheDocument()
    })

    it('shows document preview in expanded stage', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))

      // Should show first few documents from intermediate results
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })

    it('collapses stage when header clicked again', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))
      expect(screen.getByTestId('stage-results-expanded-0')).toBeInTheDocument()

      await user.click(screen.getByTestId('stage-header-0'))
      expect(screen.queryByTestId('stage-results-expanded-0')).not.toBeInTheDocument()
    })

    it('calls aggregate for each stage prefix', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        // Should call aggregate twice - once for each stage
        expect(rpcClient.aggregate).toHaveBeenCalledTimes(2)
      })

      // First call should be with just the first stage
      expect(rpcClient.aggregate).toHaveBeenNthCalledWith(
        1,
        'testdb',
        'users',
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
        ])
      )

      // Second call should include both stages
      expect(rpcClient.aggregate).toHaveBeenNthCalledWith(
        2,
        'testdb',
        'users',
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
          expect.objectContaining({ $group: expect.any(Object) }),
        ])
      )
    })
  })

  describe('sampling functionality', () => {
    beforeEach(() => {
      vi.mocked(rpcClient.sample).mockResolvedValue(mockAggregateResults.stage0)
      vi.mocked(rpcClient.aggregate).mockResolvedValue(mockAggregateResults.stage1)
    })

    it('displays sample size options', () => {
      render(<PipelinePreview {...defaultProps} />)

      expect(screen.getByTestId('sample-size-selector')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '500' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: '1000' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument()
    })

    it('defaults to 100 sample size', () => {
      render(<PipelinePreview {...defaultProps} />)

      const selector = screen.getByTestId('sample-size-selector')
      expect(selector).toHaveValue('100')
    })

    it('allows changing sample size', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      const selector = screen.getByTestId('sample-size-selector')
      await user.selectOptions(selector, '500')

      expect(selector).toHaveValue('500')
    })

    it('uses $sample stage when sample size is not "All"', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(rpcClient.aggregate).toHaveBeenCalled()
      })

      // Should include $sample stage at the beginning
      expect(rpcClient.aggregate).toHaveBeenCalledWith(
        'testdb',
        'users',
        expect.arrayContaining([
          expect.objectContaining({ $sample: { size: 100 } }),
        ])
      )
    })

    it('does not include $sample when "All" is selected', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.selectOptions(screen.getByTestId('sample-size-selector'), 'all')
      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(rpcClient.aggregate).toHaveBeenCalled()
      })

      // Should NOT include $sample stage
      const calls = vi.mocked(rpcClient.aggregate).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall).toBeDefined()

      const pipeline = lastCall?.[2]
      expect(pipeline).toBeDefined()

      const hasSampleStage = pipeline?.some(
        (stage: Record<string, unknown>) => '$sample' in stage
      )
      expect(hasSampleStage).toBe(false)
    })

    it('displays sample indicator when sampling is active', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('sample-indicator')).toBeInTheDocument()
        expect(screen.getByText(/sampled: 100 documents/i)).toBeInTheDocument()
      })
    })

    it('hides sample indicator when "All" is selected', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.selectOptions(screen.getByTestId('sample-size-selector'), 'all')
      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('sample-indicator')).not.toBeInTheDocument()
      })
    })

    it('allows custom sample size input', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      const customOption = screen.getByRole('option', { name: 'Custom' })
      await user.selectOptions(screen.getByTestId('sample-size-selector'), customOption)

      const customInput = screen.getByTestId('custom-sample-input')
      expect(customInput).toBeInTheDocument()

      await user.clear(customInput)
      await user.type(customInput, '250')

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(rpcClient.aggregate).toHaveBeenCalledWith(
          'testdb',
          'users',
          expect.arrayContaining([
            expect.objectContaining({ $sample: { size: 250 } }),
          ])
        )
      })
    })
  })

  describe('loading states', () => {
    it('shows loading spinner while executing preview', async () => {
      // Make aggregate hang to test loading state
      vi.mocked(rpcClient.aggregate).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 1000))
      )

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      expect(screen.getByTestId('preview-loading')).toBeInTheDocument()
      expect(screen.getByTestId('run-preview-button')).toBeDisabled()
    })

    it('shows individual stage loading indicators', async () => {
      let resolveFirst: (value: unknown[]) => void = () => {}
      let resolveSecond: (value: unknown[]) => void = () => {}

      vi.mocked(rpcClient.aggregate)
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveFirst = resolve
        }))
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveSecond = resolve
        }))

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      // Should show loading for stages
      expect(screen.getByTestId('stage-loading-0')).toBeInTheDocument()

      // Resolve first stage
      resolveFirst(mockAggregateResults.stage1)

      await waitFor(() => {
        expect(screen.queryByTestId('stage-loading-0')).not.toBeInTheDocument()
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      // Second stage still loading
      expect(screen.getByTestId('stage-loading-1')).toBeInTheDocument()

      // Resolve second stage
      resolveSecond(mockAggregateResults.stage2)

      await waitFor(() => {
        expect(screen.queryByTestId('stage-loading-1')).not.toBeInTheDocument()
        expect(screen.getByTestId('stage-results-1')).toBeInTheDocument()
      })
    })
  })

  describe('error handling', () => {
    it('displays error message when preview fails', async () => {
      vi.mocked(rpcClient.aggregate).mockRejectedValue(new Error('Query failed'))

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('preview-error')).toBeInTheDocument()
        expect(screen.getByText('Query failed')).toBeInTheDocument()
      })
    })

    it('shows error for specific stage that failed', async () => {
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(mockAggregateResults.stage1)
        .mockRejectedValueOnce(new Error('Invalid $group stage'))

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
        expect(screen.getByTestId('stage-error-1')).toBeInTheDocument()
        expect(screen.getByText('Invalid $group stage')).toBeInTheDocument()
      })
    })

    it('allows retry after error', async () => {
      vi.mocked(rpcClient.aggregate)
        .mockRejectedValueOnce(new Error('Query failed'))
        .mockResolvedValueOnce(mockAggregateResults.stage1)
        .mockResolvedValueOnce(mockAggregateResults.stage2)

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('preview-error')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('retry-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('preview-error')).not.toBeInTheDocument()
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })
    })
  })

  describe('auto-refresh', () => {
    it('shows auto-refresh toggle', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('auto-refresh-toggle')).toBeInTheDocument()
    })

    it('auto-refresh is off by default', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('auto-refresh-toggle')).not.toBeChecked()
    })

    it('automatically runs preview when pipeline changes with auto-refresh enabled', async () => {
      vi.mocked(rpcClient.aggregate).mockResolvedValue(mockAggregateResults.stage1)

      const user = userEvent.setup()
      const { rerender } = render(<PipelinePreview {...defaultProps} />)

      // Enable auto-refresh
      await user.click(screen.getByTestId('auto-refresh-toggle'))
      expect(screen.getByTestId('auto-refresh-toggle')).toBeChecked()

      // Change pipeline
      const newPipeline: AggregationStage[] = [
        ...mockPipeline,
        { id: 'stage-3', type: '$limit', limit: 10 },
      ]

      rerender(<PipelinePreview {...defaultProps} pipeline={newPipeline} />)

      await waitFor(() => {
        expect(rpcClient.aggregate).toHaveBeenCalled()
      })
    })

    it('debounces auto-refresh calls', async () => {
      vi.mocked(rpcClient.aggregate).mockResolvedValue(mockAggregateResults.stage1)
      vi.useFakeTimers()

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { rerender } = render(<PipelinePreview {...defaultProps} />)

      // Enable auto-refresh
      await user.click(screen.getByTestId('auto-refresh-toggle'))

      // Rapid pipeline changes
      for (let i = 0; i < 5; i++) {
        rerender(
          <PipelinePreview
            {...defaultProps}
            pipeline={[
              ...mockPipeline,
              { id: `stage-${i}`, type: '$limit', limit: i + 1 },
            ]}
          />
        )
      }

      // Should not have called yet due to debouncing
      expect(rpcClient.aggregate).not.toHaveBeenCalled()

      // Advance past debounce time (default 500ms)
      vi.advanceTimersByTime(600)

      await waitFor(() => {
        // Should only call once after debounce
        expect(rpcClient.aggregate).toHaveBeenCalledTimes(3) // Once per stage
      })

      vi.useRealTimers()
    })
  })

  describe('keyboard accessibility', () => {
    it('allows keyboard navigation between stages', async () => {
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(mockAggregateResults.stage1)
        .mockResolvedValueOnce(mockAggregateResults.stage2)

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-header-0')).toBeInTheDocument()
      })

      const stageHeader0 = screen.getByTestId('stage-header-0')
      stageHeader0.focus()

      await user.keyboard('{Enter}')
      expect(screen.getByTestId('stage-results-expanded-0')).toBeInTheDocument()

      await user.keyboard('{ArrowDown}')
      expect(screen.getByTestId('stage-header-1')).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(screen.getByTestId('stage-results-expanded-1')).toBeInTheDocument()
    })

    it('stages have proper ARIA attributes', async () => {
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(mockAggregateResults.stage1)
        .mockResolvedValueOnce(mockAggregateResults.stage2)

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-header-0')).toBeInTheDocument()
      })

      const stageHeader = screen.getByTestId('stage-header-0')
      expect(stageHeader).toHaveAttribute('aria-expanded', 'false')
      expect(stageHeader).toHaveAttribute('role', 'button')

      await user.click(stageHeader)
      expect(stageHeader).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('result formatting', () => {
    it('formats large numbers with locale string', async () => {
      vi.mocked(rpcClient.aggregate).mockResolvedValue([
        { _id: 'total', count: 1234567 },
      ])

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))

      // Should format as "1,234,567" (locale-dependent)
      expect(screen.getByText(/1,234,567|1.234.567/)).toBeInTheDocument()
    })

    it('truncates long string values', async () => {
      const longString = 'a'.repeat(200)
      vi.mocked(rpcClient.aggregate).mockResolvedValue([
        { _id: '1', description: longString },
      ])

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))

      // Should show truncated value with ellipsis
      expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument()
    })

    it('shows expandable nested objects', async () => {
      vi.mocked(rpcClient.aggregate).mockResolvedValue([
        { _id: '1', nested: { deep: { value: 42 } } },
      ])

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-results-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))

      expect(screen.getByTestId('expand-nested-0')).toBeInTheDocument()
    })
  })

  describe('pipeline comparison', () => {
    it('shows delta between stages', async () => {
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce([
          { _id: '1' }, { _id: '2' }, { _id: '3' },
          { _id: '4' }, { _id: '5' },
        ])
        .mockResolvedValueOnce([
          { _id: '1' }, { _id: '2' },
        ])

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        // Should show that stage 1 reduced docs from 5 to 2
        expect(screen.getByTestId('stage-delta-1')).toHaveTextContent('-3')
      })
    })

    it('shows percentage change indicator', async () => {
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(Array(100).fill({ _id: 1 }))
        .mockResolvedValueOnce(Array(25).fill({ _id: 1 }))

      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-percentage-1')).toHaveTextContent('-75%')
      })
    })
  })

  describe('callbacks', () => {
    it('calls onPreviewComplete when all stages finish', async () => {
      const onPreviewComplete = vi.fn()
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(mockAggregateResults.stage1)
        .mockResolvedValueOnce(mockAggregateResults.stage2)

      const user = userEvent.setup()
      render(
        <PipelinePreview
          {...defaultProps}
          onPreviewComplete={onPreviewComplete}
        />
      )

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(onPreviewComplete).toHaveBeenCalledWith({
          stageResults: [
            mockAggregateResults.stage1,
            mockAggregateResults.stage2,
          ],
          totalTime: expect.any(Number),
        })
      })
    })

    it('calls onStageSelect when stage is clicked', async () => {
      const onStageSelect = vi.fn()
      vi.mocked(rpcClient.aggregate)
        .mockResolvedValueOnce(mockAggregateResults.stage1)
        .mockResolvedValueOnce(mockAggregateResults.stage2)

      const user = userEvent.setup()
      render(
        <PipelinePreview
          {...defaultProps}
          onStageSelect={onStageSelect}
        />
      )

      await user.click(screen.getByTestId('run-preview-button'))

      await waitFor(() => {
        expect(screen.getByTestId('stage-header-0')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('stage-header-0'))

      expect(onStageSelect).toHaveBeenCalledWith(0, mockPipeline[0])
    })
  })
})
