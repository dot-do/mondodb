/**
 * Aggregation Pipeline Builder Unit Tests
 *
 * RED Phase: These tests define the expected behavior for the Aggregation Pipeline Builder
 * component which is the main interface for building MongoDB aggregation pipelines.
 *
 * The Aggregation Pipeline Builder should:
 * 1. Provide a complete UI for building aggregation pipelines
 * 2. Support all major stage types ($match, $group, $sort, $project, $limit, $skip, $lookup, $unwind)
 * 3. Allow stage reordering via drag-drop or buttons
 * 4. Allow stage deletion
 * 5. Preview/run pipeline and show results
 * 6. Export pipeline as JSON
 * 7. Save/load pipeline templates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { AggregationPipelineBuilder } from '../AggregationPipelineBuilder'
import type { AggregationStage } from '@components/stage-editor/types'

// Mock the API for running pipelines
const mockRunPipeline = vi.fn()
const mockSaveTemplate = vi.fn()
const mockLoadTemplate = vi.fn()
const mockListTemplates = vi.fn()
const mockDeleteTemplate = vi.fn()

// Helper to convert stages to MongoDB pipeline format
// Note: This is simplified for testing - the actual implementation handles enabled filtering differently
function mockStagesToPipeline(stages: AggregationStage[]): Record<string, unknown>[] {
  return stages
    .map((stage) => {
      switch (stage.type) {
        case '$match':
          return { $match: {} }
        case '$group':
          return { $group: { _id: null } }
        case '$limit':
          return { $limit: (stage as any).limit }
        case '$skip':
          return { $skip: (stage as any).skip }
        case '$sort':
          return { $sort: {} }
        case '$project':
          return { $project: {} }
        case '$lookup':
          return { $lookup: (stage as any).config }
        case '$unwind':
          return { $unwind: (stage as any).config?.path || '' }
        case '$addFields':
          return { $addFields: {} }
        case '$count':
          return { $count: (stage as any).outputField || 'count' }
        default:
          return {}
      }
    })
}

vi.mock('@/api/aggregation', () => ({
  runPipeline: (...args: unknown[]) => mockRunPipeline(...args),
  saveTemplate: (...args: unknown[]) => mockSaveTemplate(...args),
  loadTemplate: (...args: unknown[]) => mockLoadTemplate(...args),
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  stagesToPipeline: (stages: AggregationStage[]) => mockStagesToPipeline(stages),
}))

describe('AggregationPipelineBuilder', () => {
  const defaultProps = {
    database: 'testdb',
    collection: 'users',
    onPipelineChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockListTemplates.mockResolvedValue([])
  })

  describe('rendering', () => {
    it('renders the aggregation pipeline builder container', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('aggregation-pipeline-builder')).toBeInTheDocument()
    })

    it('renders the header with title', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByText('Aggregation Pipeline Builder')).toBeInTheDocument()
    })

    it('renders the stage palette panel', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('stage-palette-panel')).toBeInTheDocument()
    })

    it('renders the pipeline canvas panel', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('pipeline-canvas-panel')).toBeInTheDocument()
    })

    it('renders the stage editor panel', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('stage-editor-panel')).toBeInTheDocument()
    })

    it('renders the results preview panel', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('results-preview-panel')).toBeInTheDocument()
    })

    it('shows collection context in header', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByText('testdb.users')).toBeInTheDocument()
    })

    it('renders toolbar with action buttons', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('run-pipeline-button')).toBeInTheDocument()
      expect(screen.getByTestId('export-json-button')).toBeInTheDocument()
      expect(screen.getByTestId('save-template-button')).toBeInTheDocument()
      expect(screen.getByTestId('load-template-button')).toBeInTheDocument()
    })

    it('renders clear pipeline button', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('clear-pipeline-button')).toBeInTheDocument()
    })
  })

  describe('stage management', () => {
    it('starts with empty pipeline', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('empty-pipeline-message')).toBeInTheDocument()
      expect(screen.getByText(/add a stage to get started/i)).toBeInTheDocument()
    })

    it('adds stage when clicking stage in palette', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('pipeline-stage-0')).toBeInTheDocument()
      expect(screen.getAllByText('$match').length).toBeGreaterThan(0)
    })

    it('adds stage at end of pipeline', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$group'))

      const stages = screen.getAllByTestId(/^pipeline-stage-/)
      expect(stages).toHaveLength(2)
      expect(within(stages[0]).getByText('$match')).toBeInTheDocument()
      expect(within(stages[1]).getByText('$group')).toBeInTheDocument()
    })

    it('selects newly added stage for editing', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      const editorPanel = screen.getByTestId('stage-editor-panel')
      expect(within(editorPanel).getByText('$match')).toBeInTheDocument()
      expect(screen.getByTestId('match-stage-editor')).toBeInTheDocument()
    })

    it('deletes stage when delete button clicked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      expect(screen.getByTestId('pipeline-stage-0')).toBeInTheDocument()

      await user.click(screen.getByTestId('delete-stage-0'))

      expect(screen.queryByTestId('pipeline-stage-0')).not.toBeInTheDocument()
      expect(screen.getByTestId('empty-pipeline-message')).toBeInTheDocument()
    })

    it('reorders stages via drag and drop', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      // Add multiple stages
      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$group'))
      await user.click(screen.getByTestId('stage-item-$sort'))

      // Verify initial order
      const stagesBefore = screen.getAllByTestId(/^pipeline-stage-/)
      expect(within(stagesBefore[0]).getByText('$match')).toBeInTheDocument()
      expect(within(stagesBefore[1]).getByText('$group')).toBeInTheDocument()
      expect(within(stagesBefore[2]).getByText('$sort')).toBeInTheDocument()

      // Simulate drag stage-0 to position after stage-2
      const dragHandle = screen.getByTestId('drag-handle-0')
      const dropTarget = screen.getByTestId('pipeline-stage-2')

      fireEvent.dragStart(dragHandle)
      fireEvent.dragOver(dropTarget)
      fireEvent.drop(dropTarget)
      fireEvent.dragEnd(dragHandle)

      // Verify new order
      await waitFor(() => {
        const stagesAfter = screen.getAllByTestId(/^pipeline-stage-/)
        expect(within(stagesAfter[0]).getByText('$group')).toBeInTheDocument()
        expect(within(stagesAfter[1]).getByText('$sort')).toBeInTheDocument()
        expect(within(stagesAfter[2]).getByText('$match')).toBeInTheDocument()
      })
    })

    it('moves stage up via move up button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$group'))

      await user.click(screen.getByTestId('move-up-button-1'))

      const stages = screen.getAllByTestId(/^pipeline-stage-/)
      expect(within(stages[0]).getByText('$group')).toBeInTheDocument()
      expect(within(stages[1]).getByText('$match')).toBeInTheDocument()
    })

    it('moves stage down via move down button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$group'))

      await user.click(screen.getByTestId('move-down-button-0'))

      const stages = screen.getAllByTestId(/^pipeline-stage-/)
      expect(within(stages[0]).getByText('$group')).toBeInTheDocument()
      expect(within(stages[1]).getByText('$match')).toBeInTheDocument()
    })

    it('disables move up button for first stage', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('move-up-button-0')).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables move down button for last stage', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('move-down-button-0')).toHaveAttribute('aria-disabled', 'true')
    })

    it('duplicates stage when duplicate button clicked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('duplicate-stage-0'))

      const stages = screen.getAllByTestId(/^pipeline-stage-/)
      expect(stages).toHaveLength(2)
      expect(within(stages[0]).getByText('$match')).toBeInTheDocument()
      expect(within(stages[1]).getByText('$match')).toBeInTheDocument()
    })

    it('clears all stages when clear button clicked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$group'))

      expect(screen.getAllByTestId(/^pipeline-stage-/)).toHaveLength(2)

      await user.click(screen.getByTestId('clear-pipeline-button'))

      // Confirm dialog
      await user.click(screen.getByTestId('confirm-clear-button'))

      expect(screen.queryByTestId('pipeline-stage-0')).not.toBeInTheDocument()
      expect(screen.getByTestId('empty-pipeline-message')).toBeInTheDocument()
    })

    it('toggles stage enabled/disabled', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      const toggleButton = screen.getByTestId('toggle-stage-0')
      expect(toggleButton).toHaveAttribute('aria-pressed', 'true')

      await user.click(toggleButton)

      expect(toggleButton).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByTestId('pipeline-stage-0')).toHaveClass('disabled')
    })
  })

  describe('stage type support', () => {
    it.each([
      ['$match', 'match-stage-editor'],
      ['$group', 'group-stage-editor'],
      ['$sort', 'sort-stage-editor'],
      ['$project', 'project-stage-editor'],
      ['$limit', 'limit-stage-editor'],
      ['$skip', 'skip-stage-editor'],
      ['$lookup', 'lookup-stage-editor'],
      ['$unwind', 'unwind-stage-editor'],
    ])('supports %s stage with dedicated editor', async (stageType, editorTestId) => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId(`stage-item-${stageType}`))

      expect(screen.getByTestId(editorTestId)).toBeInTheDocument()
    })

    it('shows $addFields stage option', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('stage-item-$addFields')).toBeInTheDocument()
    })

    it('shows $count stage option', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)
      expect(screen.getByTestId('stage-item-$count')).toBeInTheDocument()
    })
  })

  describe('$match stage editor', () => {
    it('renders field input for match condition', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('match-field-input-0')).toBeInTheDocument()
    })

    it('renders operator selector for match condition', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('match-operator-select-0')).toBeInTheDocument()
    })

    it('renders value input for match condition', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('match-value-input-0')).toBeInTheDocument()
    })

    it('supports all comparison operators', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('match-operator-select-0'))

      const operators = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex', '$exists']
      for (const op of operators) {
        // Use word boundary to avoid matching $lt when looking for $lte, etc.
        const escapedOp = op.replace('$', '\\$')
        const options = screen.getAllByRole('option', { name: new RegExp(`${escapedOp}[^e]|${escapedOp}$`) })
        expect(options.length).toBeGreaterThan(0)
      }
    })

    it('adds multiple conditions with AND button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('add-match-condition-button'))

      expect(screen.getByTestId('match-field-input-1')).toBeInTheDocument()
    })

    it('removes condition with remove button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('add-match-condition-button'))

      expect(screen.getByTestId('match-field-input-1')).toBeInTheDocument()

      await user.click(screen.getByTestId('remove-match-condition-1'))

      expect(screen.queryByTestId('match-field-input-1')).not.toBeInTheDocument()
    })

    it('supports raw JSON mode toggle', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('toggle-raw-json-mode'))

      expect(screen.getByTestId('raw-json-editor')).toBeInTheDocument()
    })
  })

  describe('$group stage editor', () => {
    it('renders group by field selector', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$group'))

      expect(screen.getByTestId('group-by-field-input')).toBeInTheDocument()
    })

    it('renders add accumulator button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$group'))

      expect(screen.getByTestId('add-accumulator-button')).toBeInTheDocument()
    })

    it('adds accumulator with name, operator, and field', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$group'))
      await user.click(screen.getByTestId('add-accumulator-button'))

      expect(screen.getByTestId('accumulator-name-input-0')).toBeInTheDocument()
      expect(screen.getByTestId('accumulator-operator-select-0')).toBeInTheDocument()
      expect(screen.getByTestId('accumulator-field-input-0')).toBeInTheDocument()
    })

    it('supports all accumulator operators', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$group'))
      await user.click(screen.getByTestId('add-accumulator-button'))
      await user.click(screen.getByTestId('accumulator-operator-select-0'))

      const operators = ['$sum', '$avg', '$min', '$max', '$first', '$last', '$push', '$addToSet', '$count']
      for (const op of operators) {
        expect(screen.getByRole('option', { name: new RegExp(op.replace('$', '\\$')) })).toBeInTheDocument()
      }
    })
  })

  describe('$sort stage editor', () => {
    it('renders add sort field button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$sort'))

      expect(screen.getByTestId('add-sort-field-button')).toBeInTheDocument()
    })

    it('adds sort field with name and direction', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$sort'))
      await user.click(screen.getByTestId('add-sort-field-button'))

      expect(screen.getByTestId('sort-field-input-0')).toBeInTheDocument()
      expect(screen.getByTestId('sort-direction-toggle-0')).toBeInTheDocument()
    })

    it('toggles sort direction between ascending and descending', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$sort'))
      await user.click(screen.getByTestId('add-sort-field-button'))

      const toggle = screen.getByTestId('sort-direction-toggle-0')
      expect(toggle).toHaveTextContent('Ascending')

      await user.click(toggle)

      expect(toggle).toHaveTextContent('Descending')
    })
  })

  describe('$project stage editor', () => {
    it('renders add field button', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$project'))

      expect(screen.getByTestId('add-project-field-button')).toBeInTheDocument()
    })

    it('adds field with name and include/exclude toggle', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$project'))
      await user.click(screen.getByTestId('add-project-field-button'))

      expect(screen.getByTestId('project-field-input-0')).toBeInTheDocument()
      expect(screen.getByTestId('project-include-toggle-0')).toBeInTheDocument()
    })

    it('supports expression mode for computed fields', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$project'))
      await user.click(screen.getByTestId('add-project-field-button'))
      await user.click(screen.getByTestId('project-expression-toggle-0'))

      expect(screen.getByTestId('project-expression-input-0')).toBeInTheDocument()
    })
  })

  describe('$limit stage editor', () => {
    it('renders limit number input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$limit'))

      expect(screen.getByTestId('limit-value-input')).toBeInTheDocument()
    })

    it('defaults to limit of 10', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$limit'))

      expect(screen.getByTestId('limit-value-input')).toHaveValue(10)
    })

    it('validates limit is positive number', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$limit'))
      await user.clear(screen.getByTestId('limit-value-input'))
      await user.type(screen.getByTestId('limit-value-input'), '-5')

      expect(screen.getByTestId('limit-validation-error')).toBeInTheDocument()
    })
  })

  describe('$skip stage editor', () => {
    it('renders skip number input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$skip'))

      expect(screen.getByTestId('skip-value-input')).toBeInTheDocument()
    })

    it('defaults to skip of 0', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$skip'))

      expect(screen.getByTestId('skip-value-input')).toHaveValue(0)
    })
  })

  describe('$lookup stage editor', () => {
    it('renders from collection input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$lookup'))

      expect(screen.getByTestId('lookup-from-input')).toBeInTheDocument()
    })

    it('renders localField input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$lookup'))

      expect(screen.getByTestId('lookup-local-field-input')).toBeInTheDocument()
    })

    it('renders foreignField input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$lookup'))

      expect(screen.getByTestId('lookup-foreign-field-input')).toBeInTheDocument()
    })

    it('renders as (output field) input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$lookup'))

      expect(screen.getByTestId('lookup-as-input')).toBeInTheDocument()
    })

    it('supports pipeline mode for advanced lookups', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$lookup'))
      await user.click(screen.getByTestId('lookup-pipeline-mode-toggle'))

      expect(screen.getByTestId('lookup-pipeline-editor')).toBeInTheDocument()
    })
  })

  describe('$unwind stage editor', () => {
    it('renders path input', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$unwind'))

      expect(screen.getByTestId('unwind-path-input')).toBeInTheDocument()
    })

    it('renders includeArrayIndex checkbox', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$unwind'))

      expect(screen.getByTestId('unwind-include-array-index-checkbox')).toBeInTheDocument()
    })

    it('renders preserveNullAndEmptyArrays checkbox', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$unwind'))

      expect(screen.getByTestId('unwind-preserve-null-checkbox')).toBeInTheDocument()
    })

    it('shows array index field name input when includeArrayIndex checked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$unwind'))
      await user.click(screen.getByTestId('unwind-include-array-index-checkbox'))

      expect(screen.getByTestId('unwind-array-index-field-input')).toBeInTheDocument()
    })
  })

  describe('run pipeline and preview results', () => {
    it('runs pipeline when run button clicked', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(mockRunPipeline).toHaveBeenCalled()
      })
    })

    it('passes correct pipeline to run API', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$limit'))
      await user.clear(screen.getByTestId('limit-value-input'))
      await user.type(screen.getByTestId('limit-value-input'), '5')

      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(mockRunPipeline).toHaveBeenCalledWith(
          expect.objectContaining({
            database: 'testdb',
            collection: 'users',
            pipeline: expect.arrayContaining([
              expect.objectContaining({ $limit: 5 }),
            ]),
          })
        )
      })
    })

    it('shows loading state while running', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockImplementation(() => new Promise(() => {})) // Never resolves

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('run-pipeline-button'))

      expect(screen.getByTestId('pipeline-running-indicator')).toBeInTheDocument()
      expect(screen.getByTestId('run-pipeline-button')).toHaveAttribute('aria-disabled', 'true')
    })

    it('displays results in preview panel', async () => {
      const user = userEvent.setup()
      const mockResults = {
        documents: [
          { _id: '1', name: 'Alice' },
          { _id: '2', name: 'Bob' },
        ],
        count: 2,
      }
      mockRunPipeline.mockResolvedValue(mockResults)

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(screen.getByTestId('results-preview-panel')).toHaveTextContent('Alice')
        expect(screen.getByTestId('results-preview-panel')).toHaveTextContent('Bob')
      })
    })

    it('shows result count', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [{}, {}, {}], count: 3 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(screen.getByTestId('result-count')).toHaveTextContent('3')
      })
    })

    it('shows error when pipeline execution fails', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockRejectedValue(new Error('Invalid pipeline'))

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(screen.getByTestId('pipeline-error')).toBeInTheDocument()
        expect(screen.getByText(/Invalid pipeline/)).toBeInTheDocument()
      })
    })

    it('excludes disabled stages from execution', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$limit'))

      // Disable the $match stage
      await user.click(screen.getByTestId('toggle-stage-0'))

      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(mockRunPipeline).toHaveBeenCalledWith(
          expect.objectContaining({
            pipeline: expect.not.arrayContaining([
              expect.objectContaining({ $match: expect.anything() }),
            ]),
          })
        )
      })
    })

    it('supports auto-run when stage changes with toggle enabled', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      // Enable auto-run
      await user.click(screen.getByTestId('auto-run-toggle'))

      await user.click(screen.getByTestId('stage-item-$limit'))

      await waitFor(() => {
        expect(mockRunPipeline).toHaveBeenCalled()
      })
    })

    it('limits preview results with sample size option', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      // Set sample size to 5
      await user.click(screen.getByTestId('sample-size-select'))
      await user.click(screen.getByRole('option', { name: '5' }))

      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(mockRunPipeline).toHaveBeenCalledWith(
          expect.objectContaining({
            sampleSize: 5,
          })
        )
      })
    })
  })

  describe('export pipeline as JSON', () => {
    it('opens export dialog when export button clicked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('export-json-button'))

      expect(screen.getByTestId('export-json-dialog')).toBeInTheDocument()
    })

    it('displays pipeline as formatted JSON', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$limit'))
      await user.click(screen.getByTestId('export-json-button'))

      const jsonContent = screen.getByTestId('export-json-content')
      expect(jsonContent).toHaveTextContent('$limit')
    })

    it('copies JSON to clipboard when copy button clicked', async () => {
      const user = userEvent.setup()
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
      })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('export-json-button'))
      await user.click(screen.getByTestId('copy-json-button'))

      expect(writeTextMock).toHaveBeenCalled()
    })

    it('shows copy success message', async () => {
      const user = userEvent.setup()
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        writable: true,
      })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('export-json-button'))
      await user.click(screen.getByTestId('copy-json-button'))

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })
    })

    it('supports download as file', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('export-json-button'))

      expect(screen.getByTestId('download-json-button')).toBeInTheDocument()
    })

    it('excludes disabled stages from export by default', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('stage-item-$limit'))

      // Disable the $match stage
      await user.click(screen.getByTestId('toggle-stage-0'))

      await user.click(screen.getByTestId('export-json-button'))

      const jsonContent = screen.getByTestId('export-json-content')
      expect(jsonContent).not.toHaveTextContent('$match')
      expect(jsonContent).toHaveTextContent('$limit')
    })

    it('includes disabled stages when option selected', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('toggle-stage-0'))

      await user.click(screen.getByTestId('export-json-button'))
      await user.click(screen.getByTestId('include-disabled-stages-checkbox'))

      const jsonContent = screen.getByTestId('export-json-content')
      expect(jsonContent).toHaveTextContent('$match')
    })
  })

  describe('save/load pipeline templates', () => {
    it('opens save dialog when save button clicked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('save-template-button'))

      expect(screen.getByTestId('save-template-dialog')).toBeInTheDocument()
    })

    it('requires template name to save', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('save-template-button'))

      const saveButton = screen.getByTestId('confirm-save-template-button')
      expect(saveButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('saves template with name and description', async () => {
      const user = userEvent.setup()
      mockSaveTemplate.mockResolvedValue({ id: 'template-1' })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('save-template-button'))

      await user.type(screen.getByTestId('template-name-input'), 'My Pipeline')
      await user.type(screen.getByTestId('template-description-input'), 'A test pipeline')

      await user.click(screen.getByTestId('confirm-save-template-button'))

      await waitFor(() => {
        expect(mockSaveTemplate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'My Pipeline',
            description: 'A test pipeline',
            pipeline: expect.any(Array),
          })
        )
      })
    })

    it('shows success message after saving template', async () => {
      const user = userEvent.setup()
      mockSaveTemplate.mockResolvedValue({ id: 'template-1' })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('save-template-button'))

      await user.type(screen.getByTestId('template-name-input'), 'My Pipeline')
      await user.click(screen.getByTestId('confirm-save-template-button'))

      await waitFor(() => {
        expect(screen.getByText(/template saved/i)).toBeInTheDocument()
      })
    })

    it('opens load dialog when load button clicked', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('load-template-button'))

      expect(screen.getByTestId('load-template-dialog')).toBeInTheDocument()
    })

    it('lists available templates', async () => {
      const user = userEvent.setup()
      mockListTemplates.mockResolvedValue([
        { id: '1', name: 'Template 1', description: 'First template' },
        { id: '2', name: 'Template 2', description: 'Second template' },
      ])

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByText('Template 1')).toBeInTheDocument()
        expect(screen.getByText('Template 2')).toBeInTheDocument()
      })
    })

    it('loads selected template', async () => {
      const user = userEvent.setup()
      mockListTemplates.mockResolvedValue([
        { id: '1', name: 'Template 1', description: 'First template' },
      ])
      mockLoadTemplate.mockResolvedValue({
        id: '1',
        name: 'Template 1',
        pipeline: [{ $match: { status: 'active' } }],
      })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByText('Template 1')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('template-item-1'))
      await user.click(screen.getByTestId('confirm-load-template-button'))

      await waitFor(() => {
        expect(mockLoadTemplate).toHaveBeenCalledWith('1')
      })
    })

    it('replaces current pipeline when loading template', async () => {
      const user = userEvent.setup()
      mockListTemplates.mockResolvedValue([
        { id: '1', name: 'Template 1' },
      ])
      mockLoadTemplate.mockResolvedValue({
        id: '1',
        name: 'Template 1',
        pipeline: [{ $limit: 100 }],
      })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      // Add a stage first
      await user.click(screen.getByTestId('stage-item-$match'))
      expect(screen.getByTestId('pipeline-stage-0')).toBeInTheDocument()

      // Load template
      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByText('Template 1')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('template-item-1'))
      await user.click(screen.getByTestId('confirm-load-template-button'))

      // Shows warning since there are existing stages
      await waitFor(() => {
        expect(screen.getByTestId('replace-pipeline-warning')).toBeInTheDocument()
      })

      // Click again to confirm replacement
      await user.click(screen.getByTestId('confirm-load-template-button'))

      // Should now have $limit instead of $match
      await waitFor(() => {
        const stage = screen.getByTestId('pipeline-stage-0')
        expect(within(stage).getByText('$limit')).toBeInTheDocument()
        expect(within(stage).queryByText('$match')).not.toBeInTheDocument()
      })
    })

    it('warns before replacing non-empty pipeline', async () => {
      const user = userEvent.setup()
      mockListTemplates.mockResolvedValue([
        { id: '1', name: 'Template 1' },
      ])

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByText('Template 1')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('template-item-1'))
      await user.click(screen.getByTestId('confirm-load-template-button'))

      expect(screen.getByTestId('replace-pipeline-warning')).toBeInTheDocument()
    })

    it('shows empty state when no templates exist', async () => {
      const user = userEvent.setup()
      mockListTemplates.mockResolvedValue([])

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByTestId('no-templates-message')).toBeInTheDocument()
      })
    })

    it('supports deleting templates', async () => {
      const user = userEvent.setup()
      mockDeleteTemplate.mockResolvedValue(undefined)

      mockListTemplates.mockResolvedValue([
        { id: '1', name: 'Template 1' },
      ])

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByText('Template 1')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('delete-template-1'))

      expect(screen.getByTestId('confirm-delete-template-dialog')).toBeInTheDocument()
    })

    it('supports template search/filter', async () => {
      const user = userEvent.setup()
      mockListTemplates.mockResolvedValue([
        { id: '1', name: 'User Analytics' },
        { id: '2', name: 'Sales Report' },
      ])

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('load-template-button'))

      await waitFor(() => {
        expect(screen.getByText('User Analytics')).toBeInTheDocument()
        expect(screen.getByText('Sales Report')).toBeInTheDocument()
      })

      await user.type(screen.getByTestId('template-search-input'), 'User')

      expect(screen.getByText('User Analytics')).toBeInTheDocument()
      expect(screen.queryByText('Sales Report')).not.toBeInTheDocument()
    })
  })

  describe('pipeline validation', () => {
    it('shows validation errors for invalid stage configuration', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$group'))

      // $group requires _id field
      expect(screen.getByTestId('stage-validation-error-0')).toBeInTheDocument()
    })

    it('disables run button when pipeline has errors', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$lookup'))

      // $lookup requires all fields - LeafyGreen uses aria-disabled
      expect(screen.getByTestId('run-pipeline-button')).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows overall pipeline status indicator', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$limit'))

      expect(screen.getByTestId('pipeline-status-valid')).toBeInTheDocument()
    })

    it('shows warning for potentially slow operations', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      // $match without index might be slow
      await user.click(screen.getByTestId('stage-item-$match'))

      expect(screen.getByTestId('stage-warning-0')).toBeInTheDocument()
    })
  })

  describe('keyboard shortcuts', () => {
    it('supports Ctrl+Enter to run pipeline', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.keyboard('{Control>}{Enter}{/Control}')

      await waitFor(() => {
        expect(mockRunPipeline).toHaveBeenCalled()
      })
    })

    it('supports Ctrl+S to save template', async () => {
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.keyboard('{Control>}s{/Control}')

      expect(screen.getByTestId('save-template-dialog')).toBeInTheDocument()
    })

    it('supports Ctrl+E to export JSON', async () => {
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.keyboard('{Control>}e{/Control}')

      expect(screen.getByTestId('export-json-dialog')).toBeInTheDocument()
    })

    it('supports Delete to remove selected stage', async () => {
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('pipeline-stage-0'))

      await user.keyboard('{Delete}')

      expect(screen.queryByTestId('pipeline-stage-0')).not.toBeInTheDocument()
    })

    it('supports Ctrl+D to duplicate selected stage', async () => {
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('pipeline-stage-0'))

      await user.keyboard('{Control>}d{/Control}')

      expect(screen.getAllByTestId(/^pipeline-stage-/)).toHaveLength(2)
    })
  })

  describe('accessibility', () => {
    it('has proper ARIA labels on main regions', () => {
      render(<AggregationPipelineBuilder {...defaultProps} />)

      expect(screen.getByTestId('stage-palette-panel')).toHaveAttribute('aria-label')
      expect(screen.getByTestId('pipeline-canvas-panel')).toHaveAttribute('aria-label')
      expect(screen.getByTestId('stage-editor-panel')).toHaveAttribute('aria-label')
      expect(screen.getByTestId('results-preview-panel')).toHaveAttribute('aria-label')
    })

    it('supports keyboard navigation between panels', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      // Tab should move focus to interactive elements (toolbar buttons first, then panels)
      await user.tab()
      // First tab focuses toolbar - run button is first focusable element
      expect(document.activeElement).toHaveAttribute('data-testid', 'run-pipeline-button')
    })

    it('announces stage additions to screen readers', async () => {
      const user = userEvent.setup()
      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      // Check for live region update
      expect(screen.getByRole('status')).toHaveTextContent(/stage added/i)
    })

    it('announces pipeline run results to screen readers', async () => {
      const user = userEvent.setup()
      mockRunPipeline.mockResolvedValue({ documents: [], count: 0 })

      render(<AggregationPipelineBuilder {...defaultProps} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      await user.click(screen.getByTestId('run-pipeline-button'))

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(/pipeline executed/i)
      })
    })
  })

  describe('responsive layout', () => {
    it('collapses panels on smaller screens', () => {
      // Mock smaller viewport
      Object.defineProperty(window, 'innerWidth', { value: 768, writable: true })
      window.dispatchEvent(new Event('resize'))

      render(<AggregationPipelineBuilder {...defaultProps} />)

      expect(screen.getByTestId('panel-collapse-button')).toBeInTheDocument()
    })

    it('shows panel tabs on mobile', () => {
      Object.defineProperty(window, 'innerWidth', { value: 480, writable: true })
      window.dispatchEvent(new Event('resize'))

      render(<AggregationPipelineBuilder {...defaultProps} />)

      expect(screen.getByTestId('mobile-panel-tabs')).toBeInTheDocument()
    })
  })

  describe('onPipelineChange callback', () => {
    it('calls onPipelineChange when stage added', async () => {
      const onPipelineChange = vi.fn()
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} onPipelineChange={onPipelineChange} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(onPipelineChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: '$match' }),
        ])
      )
    })

    it('calls onPipelineChange when stage modified', async () => {
      const onPipelineChange = vi.fn()
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} onPipelineChange={onPipelineChange} />)

      await user.click(screen.getByTestId('stage-item-$limit'))
      onPipelineChange.mockClear()

      await user.clear(screen.getByTestId('limit-value-input'))
      await user.type(screen.getByTestId('limit-value-input'), '20')

      expect(onPipelineChange).toHaveBeenCalled()
    })

    it('calls onPipelineChange when stage deleted', async () => {
      const onPipelineChange = vi.fn()
      const user = userEvent.setup()

      render(<AggregationPipelineBuilder {...defaultProps} onPipelineChange={onPipelineChange} />)

      await user.click(screen.getByTestId('stage-item-$match'))
      onPipelineChange.mockClear()

      await user.click(screen.getByTestId('delete-stage-0'))

      expect(onPipelineChange).toHaveBeenCalledWith([])
    })
  })

  describe('initial pipeline prop', () => {
    it('renders initial pipeline stages', () => {
      const initialPipeline = [
        { $match: { status: 'active' } },
        { $limit: 10 },
      ]

      render(<AggregationPipelineBuilder {...defaultProps} initialPipeline={initialPipeline} />)

      expect(screen.getByTestId('pipeline-stage-0')).toBeInTheDocument()
      expect(screen.getByTestId('pipeline-stage-1')).toBeInTheDocument()
    })

    it('parses initial pipeline into editable stages', () => {
      const initialPipeline = [
        { $match: { name: 'Alice' } },
      ]

      render(<AggregationPipelineBuilder {...defaultProps} initialPipeline={initialPipeline} />)

      // Click on the stage to see editor
      const stage = screen.getByTestId('pipeline-stage-0')
      fireEvent.click(stage)

      expect(screen.getByTestId('match-field-input-0')).toHaveValue('name')
    })
  })
})
