/**
 * PipelineCanvas Unit Tests
 *
 * RED Phase: These tests define the expected behavior for the PipelineCanvas component
 * which manages drag-drop, reorder, and delete operations for aggregation pipeline stages.
 *
 * The PipelineCanvas uses @dnd-kit/sortable for drag-and-drop functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { PipelineCanvas } from '../PipelineCanvas'
import type { AggregationStage, StageType } from '@components/olap/QueryBuilder'

// Mock @dnd-kit modules
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn(() => []),
    DndContext: ({ children, onDragStart, onDragEnd, onDragOver }: {
      children: React.ReactNode
      onDragStart?: (event: unknown) => void
      onDragEnd?: (event: unknown) => void
      onDragOver?: (event: unknown) => void
    }) => {
      // Expose handlers for testing
      (globalThis as Record<string, unknown>).__dndHandlers = { onDragStart, onDragEnd, onDragOver }
      return children
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="drag-overlay">{children}</div>
    ),
    closestCenter: vi.fn(),
    pointerWithin: vi.fn(),
    rectIntersection: vi.fn(),
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable')
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => children,
    useSortable: vi.fn((props: { id: string }) => ({
      attributes: { role: 'listitem', 'aria-roledescription': 'sortable' },
      listeners: {
        onPointerDown: vi.fn(),
        onKeyDown: vi.fn(),
      },
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    })),
    arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
      const result = [...arr]
      const [item] = result.splice(from, 1)
      result.splice(to, 0, item)
      return result
    }),
    verticalListSortingStrategy: vi.fn(),
  }
})

// Helper to create mock stages
function createMatchStage(id: string): AggregationStage {
  return {
    id,
    type: '$match',
    match: [{ field: 'status', operator: '$eq', value: 'active' }],
  }
}

function createProjectStage(id: string): AggregationStage {
  return {
    id,
    type: '$project',
    project: { name: 1, email: 1 },
  }
}

function createGroupStage(id: string): AggregationStage {
  return {
    id,
    type: '$group',
    groupBy: 'category',
    accumulators: [{ name: 'count', operator: '$sum', field: '1' }],
  }
}

function createSortStage(id: string): AggregationStage {
  return {
    id,
    type: '$sort',
    sort: { createdAt: -1 },
  }
}

function createLimitStage(id: string): AggregationStage {
  return {
    id,
    type: '$limit',
    limit: 10,
  }
}

describe('PipelineCanvas', () => {
  const mockStages: AggregationStage[] = [
    createMatchStage('stage-1'),
    createProjectStage('stage-2'),
    createGroupStage('stage-3'),
  ]

  const defaultProps = {
    stages: mockStages,
    onChange: vi.fn(),
    onStageSelect: vi.fn(),
    selectedStageId: null as string | null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the pipeline canvas container', () => {
      render(<PipelineCanvas {...defaultProps} />)
      expect(screen.getByTestId('pipeline-canvas')).toBeInTheDocument()
    })

    it('renders all stages in order', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stages = screen.getAllByTestId(/^stage-card-/)
      expect(stages).toHaveLength(3)

      expect(screen.getByTestId('stage-card-0')).toBeInTheDocument()
      expect(screen.getByTestId('stage-card-1')).toBeInTheDocument()
      expect(screen.getByTestId('stage-card-2')).toBeInTheDocument()
    })

    it('displays stage type labels', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByText('$match')).toBeInTheDocument()
      expect(screen.getByText('$project')).toBeInTheDocument()
      expect(screen.getByText('$group')).toBeInTheDocument()
    })

    it('displays stage index numbers', () => {
      render(<PipelineCanvas {...defaultProps} />)

      // Stage index numbers should be displayed (1-based)
      const stages = screen.getAllByTestId(/^stage-card-/)
      expect(within(stages[0]!).getByText('1')).toBeInTheDocument()
      expect(within(stages[1]!).getByText('2')).toBeInTheDocument()
      expect(within(stages[2]!).getByText('3')).toBeInTheDocument()
    })

    it('renders empty state when no stages', () => {
      render(<PipelineCanvas {...defaultProps} stages={[]} />)

      expect(screen.getByTestId('pipeline-empty-state')).toBeInTheDocument()
      expect(screen.getByText(/no stages/i)).toBeInTheDocument()
    })

    it('renders drag handle for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('stage-drag-handle-0')).toBeInTheDocument()
      expect(screen.getByTestId('stage-drag-handle-1')).toBeInTheDocument()
      expect(screen.getByTestId('stage-drag-handle-2')).toBeInTheDocument()
    })

    it('renders delete button for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('stage-remove-0')).toBeInTheDocument()
      expect(screen.getByTestId('stage-remove-1')).toBeInTheDocument()
      expect(screen.getByTestId('stage-remove-2')).toBeInTheDocument()
    })

    it('renders duplicate button for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('stage-duplicate-0')).toBeInTheDocument()
      expect(screen.getByTestId('stage-duplicate-1')).toBeInTheDocument()
      expect(screen.getByTestId('stage-duplicate-2')).toBeInTheDocument()
    })

    it('renders add stage button', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('add-stage-button')).toBeInTheDocument()
    })

    it('displays stage count', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByText('3 stages')).toBeInTheDocument()
    })

    it('displays singular stage count', () => {
      render(<PipelineCanvas {...defaultProps} stages={[createMatchStage('only-stage')]} />)

      expect(screen.getByText('1 stage')).toBeInTheDocument()
    })
  })

  describe('stage card display', () => {
    it('displays match stage preview with conditions', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-card-0')
      expect(within(matchStage).getByText(/status/)).toBeInTheDocument()
    })

    it('displays project stage preview with fields', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const projectStage = screen.getByTestId('stage-card-1')
      expect(within(projectStage).getByText(/name/)).toBeInTheDocument()
    })

    it('displays group stage preview', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const groupStage = screen.getByTestId('stage-card-2')
      expect(within(groupStage).getByText(/category|_id/)).toBeInTheDocument()
    })

    it('displays limit stage preview with number', () => {
      const stagesWithLimit = [createLimitStage('limit-1')]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithLimit} />)

      expect(screen.getByText('10')).toBeInTheDocument()
    })

    it('displays sort stage preview', () => {
      const stagesWithSort = [createSortStage('sort-1')]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithSort} />)

      expect(screen.getByText(/createdAt/)).toBeInTheDocument()
    })
  })

  describe('reorder stages via drag and drop', () => {
    it('reorders stages when drag ends on valid target', async () => {
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      // Simulate dnd-kit drag end event
      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-1' },
        over: { id: 'stage-3' },
      })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'stage-2' }),
          expect.objectContaining({ id: 'stage-3' }),
          expect.objectContaining({ id: 'stage-1' }),
        ])
      })
    })

    it('moves stage up when dropped before earlier stage', async () => {
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-3' },
        over: { id: 'stage-1' },
      })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'stage-3' }),
          expect.objectContaining({ id: 'stage-1' }),
          expect.objectContaining({ id: 'stage-2' }),
        ])
      })
    })

    it('does not change order when dropped on same position', async () => {
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-2' },
        over: { id: 'stage-2' },
      })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not change order when dropped outside valid target', async () => {
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-1' },
        over: null,
      })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('updates stage indices after reorder', async () => {
      const { rerender } = render(<PipelineCanvas {...defaultProps} />)

      // Simulate reordering
      const reorderedStages = [
        createProjectStage('stage-2'),
        createGroupStage('stage-3'),
        createMatchStage('stage-1'),
      ]

      rerender(<PipelineCanvas {...defaultProps} stages={reorderedStages} />)

      // Stage types should now be in new order
      const stages = screen.getAllByTestId(/^stage-card-/)
      expect(within(stages[0]!).getByText('$project')).toBeInTheDocument()
      expect(within(stages[1]!).getByText('$group')).toBeInTheDocument()
      expect(within(stages[2]!).getByText('$match')).toBeInTheDocument()
    })
  })

  describe('delete stages', () => {
    it('calls onChange without deleted stage when delete clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-remove-1'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('can delete first stage', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-remove-0'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('can delete last stage', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-remove-2'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-2' }),
      ])
    })

    it('can delete all stages leaving empty canvas', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <PipelineCanvas {...defaultProps} stages={[createMatchStage('only-stage')]} onChange={onChange} />
      )

      await user.click(screen.getByTestId('stage-remove-0'))

      expect(onChange).toHaveBeenCalledWith([])
    })

    it('clears selection when selected stage is deleted', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onStageSelect = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onChange={onChange}
          onStageSelect={onStageSelect}
          selectedStageId="stage-2"
        />
      )

      await user.click(screen.getByTestId('stage-remove-1'))

      expect(onStageSelect).toHaveBeenCalledWith(null)
    })

    it('does not clear selection when non-selected stage is deleted', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onStageSelect = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onChange={onChange}
          onStageSelect={onStageSelect}
          selectedStageId="stage-1"
        />
      )

      await user.click(screen.getByTestId('stage-remove-1'))

      expect(onStageSelect).not.toHaveBeenCalledWith(null)
    })
  })

  describe('stage selection', () => {
    it('calls onStageSelect when stage is clicked', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('stage-card-1'))

      expect(onStageSelect).toHaveBeenCalledWith('stage-2')
    })

    it('highlights selected stage with border', () => {
      render(<PipelineCanvas {...defaultProps} selectedStageId="stage-2" />)

      const selectedStage = screen.getByTestId('stage-card-1')
      // Selected stage should have visual distinction (border color)
      expect(selectedStage).toBeInTheDocument()
    })

    it('does not call onStageSelect when clicking delete button', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-remove-1'))

      // onStageSelect should not be called directly from delete click
      // (only potentially to clear selection if deleting selected stage)
      expect(onStageSelect).not.toHaveBeenCalledWith('stage-2')
    })

    it('does not call onStageSelect when clicking duplicate button', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-duplicate-1'))

      // onStageSelect should not be called from duplicate click
      expect(onStageSelect).not.toHaveBeenCalledWith('stage-2')
    })

    it('supports keyboard selection with Enter', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} />)

      const stage = screen.getByTestId('stage-card-0')
      stage.focus()
      await user.keyboard('{Enter}')

      expect(onStageSelect).toHaveBeenCalledWith('stage-1')
    })

    it('supports keyboard selection with Space', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} />)

      const stage = screen.getByTestId('stage-card-0')
      stage.focus()
      await user.keyboard(' ')

      expect(onStageSelect).toHaveBeenCalledWith('stage-1')
    })
  })

  describe('stage duplication', () => {
    it('duplicates stage when duplicate button clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-duplicate-1'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ type: '$project' }), // Duplicated stage
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('generates new unique id for duplicated stage', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-duplicate-1'))

      const call = onChange.mock.calls[0]![0] as AggregationStage[]
      const duplicatedStage = call[2]
      expect(duplicatedStage?.id).not.toBe('stage-2')
      expect(duplicatedStage?.id).toMatch(/^stage-/)
    })

    it('duplicates stage with all its properties', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-duplicate-1'))

      const call = onChange.mock.calls[0]![0] as AggregationStage[]
      const duplicatedStage = call[2]
      expect(duplicatedStage?.type).toBe('$project')
      expect(duplicatedStage?.project).toEqual({ name: 1, email: 1 })
    })

    it('inserts duplicated stage after original', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-duplicate-0'))

      const call = onChange.mock.calls[0]![0] as AggregationStage[]
      expect(call).toHaveLength(4)
      expect(call[0]?.id).toBe('stage-1')
      expect(call[1]?.type).toBe('$match') // Duplicated match stage
      expect(call[2]?.id).toBe('stage-2')
      expect(call[3]?.id).toBe('stage-3')
    })
  })

  describe('add new stage', () => {
    it('opens stage type menu when add button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      await user.click(screen.getByTestId('add-stage-button'))

      // Menu should show stage type options
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-match')).toBeInTheDocument()
      })
    })

    it('adds match stage when match option selected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-stage-button'))
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-match')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('add-stage-match'))

      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'stage-1' }),
          expect.objectContaining({ id: 'stage-2' }),
          expect.objectContaining({ id: 'stage-3' }),
          expect.objectContaining({ type: '$match' }),
        ])
      )
    })

    it('adds group stage when group option selected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-stage-button'))
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-group')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('add-stage-group'))

      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: '$group' }),
        ])
      )
    })

    it('adds limit stage when limit option selected', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-stage-button'))
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-limit')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('add-stage-limit'))

      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: '$limit', limit: 10 }),
        ])
      )
    })

    it('generates unique id for new stage', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-stage-button'))
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-match')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('add-stage-match'))

      const call = onChange.mock.calls[0]![0] as AggregationStage[]
      const newStage = call[call.length - 1]
      expect(newStage?.id).toMatch(/^stage-/)
      expect(newStage?.id).not.toBe('stage-1')
      expect(newStage?.id).not.toBe('stage-2')
      expect(newStage?.id).not.toBe('stage-3')
    })

    it('selects newly added stage', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('add-stage-button'))
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-match')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('add-stage-match'))

      expect(onStageSelect).toHaveBeenCalledWith(expect.stringMatching(/^stage-/))
    })

    it('adds stage to empty pipeline', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} stages={[]} onChange={onChange} />)

      await user.click(screen.getByTestId('add-stage-button'))
      await waitFor(() => {
        expect(screen.getByTestId('add-stage-match')).toBeInTheDocument()
      })
      await user.click(screen.getByTestId('add-stage-match'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ type: '$match' }),
      ])
    })
  })

  describe('accessibility', () => {
    it('stage cards have button role', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stages = screen.getAllByTestId(/^stage-card-/)
      stages.forEach((stage) => {
        expect(stage).toHaveAttribute('role', 'button')
      })
    })

    it('stage cards are focusable', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('stage-card-0')
      expect(stage).toHaveAttribute('tabindex', '0')
    })

    it('remove buttons have aria-label', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const removeButton = screen.getByTestId('stage-remove-0')
      const ariaLabel = removeButton.getAttribute('aria-label')
      expect(ariaLabel).toBeTruthy()
      expect(ariaLabel?.toLowerCase()).toMatch(/remove|delete/)
    })

    it('duplicate buttons have aria-label', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const duplicateButton = screen.getByTestId('stage-duplicate-0')
      const ariaLabel = duplicateButton.getAttribute('aria-label')
      expect(ariaLabel).toBeTruthy()
      expect(ariaLabel?.toLowerCase()).toMatch(/duplicate/)
    })

    it('drag handles are focusable', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const handle = screen.getByTestId('stage-drag-handle-0')
      expect(handle).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows empty state message', () => {
      render(<PipelineCanvas {...defaultProps} stages={[]} />)

      expect(screen.getByTestId('pipeline-empty-state')).toBeInTheDocument()
    })

    it('empty state contains helpful text', () => {
      render(<PipelineCanvas {...defaultProps} stages={[]} />)

      expect(screen.getByText(/no stages/i)).toBeInTheDocument()
      expect(screen.getByText(/add stages/i)).toBeInTheDocument()
    })

    it('does not render DndContext when no stages', () => {
      render(<PipelineCanvas {...defaultProps} stages={[]} />)

      // Empty state should be shown instead of drag context
      expect(screen.getByTestId('pipeline-empty-state')).toBeInTheDocument()
      expect(screen.queryByTestId('drag-overlay')).not.toBeInTheDocument()
    })
  })

  describe('connectors between stages', () => {
    it('renders connectors between stages', () => {
      render(<PipelineCanvas {...defaultProps} />)

      // With 3 stages, there should be 2 connectors (between stage 0-1 and 1-2)
      // The component doesn't add test IDs to connectors, so we check structure
      const canvas = screen.getByTestId('pipeline-canvas')
      expect(canvas).toBeInTheDocument()
    })

    it('does not render connector after last stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      // There should be n-1 connectors for n stages
      const stages = screen.getAllByTestId(/^stage-card-/)
      expect(stages).toHaveLength(3)
    })

    it('does not render connectors when only one stage', () => {
      render(<PipelineCanvas {...defaultProps} stages={[createMatchStage('only-stage')]} />)

      const stages = screen.getAllByTestId(/^stage-card-/)
      expect(stages).toHaveLength(1)
    })
  })

  describe('stage configuration display', () => {
    it('shows match conditions in preview', () => {
      const matchStage = createMatchStage('test-match')
      matchStage.match = [{ field: 'email', operator: '$regex', value: '@test.com' }]

      render(<PipelineCanvas {...defaultProps} stages={[matchStage]} />)

      expect(screen.getByText(/email/)).toBeInTheDocument()
    })

    it('shows empty object for match with no conditions', () => {
      const emptyMatch: AggregationStage = {
        id: 'empty-match',
        type: '$match',
        match: [],
      }

      render(<PipelineCanvas {...defaultProps} stages={[emptyMatch]} />)

      expect(screen.getByText('{ }')).toBeInTheDocument()
    })

    it('shows group accumulators in preview', () => {
      const groupStage: AggregationStage = {
        id: 'test-group',
        type: '$group',
        groupBy: 'department',
        accumulators: [
          { name: 'total', operator: '$sum', field: 'salary' },
        ],
      }

      render(<PipelineCanvas {...defaultProps} stages={[groupStage]} />)

      expect(screen.getByText(/department|total|_id/)).toBeInTheDocument()
    })

    it('shows sort fields in preview', () => {
      const sortStage: AggregationStage = {
        id: 'test-sort',
        type: '$sort',
        sort: { name: 1, date: -1 },
      }

      render(<PipelineCanvas {...defaultProps} stages={[sortStage]} />)

      expect(screen.getByText(/name.*date|date.*name/)).toBeInTheDocument()
    })

    it('shows unwind path in preview', () => {
      const unwindStage: AggregationStage = {
        id: 'test-unwind',
        type: '$unwind',
        unwindPath: 'items',
      }

      render(<PipelineCanvas {...defaultProps} stages={[unwindStage]} />)

      expect(screen.getByText(/items/)).toBeInTheDocument()
    })

    it('shows skip value in preview', () => {
      const skipStage: AggregationStage = {
        id: 'test-skip',
        type: '$skip',
        skip: 25,
      }

      render(<PipelineCanvas {...defaultProps} stages={[skipStage]} />)

      expect(screen.getByText('25')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // RED PHASE: Tests for features NOT YET IMPLEMENTED
  // These tests should FAIL until the component is updated
  // ============================================================================

  describe('stage enable/disable toggle (RED - not implemented)', () => {
    it('renders toggle button for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('stage-toggle-0')).toBeInTheDocument()
      expect(screen.getByTestId('stage-toggle-1')).toBeInTheDocument()
      expect(screen.getByTestId('stage-toggle-2')).toBeInTheDocument()
    })

    it('toggles stage enabled state when toggle clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      // Stage with enabled property
      const stagesWithEnabled = mockStages.map((s) => ({ ...s, enabled: true }))
      render(<PipelineCanvas {...defaultProps} stages={stagesWithEnabled} onChange={onChange} />)

      await user.click(screen.getByTestId('stage-toggle-0'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1', enabled: false }),
        expect.objectContaining({ id: 'stage-2', enabled: true }),
        expect.objectContaining({ id: 'stage-3', enabled: true }),
      ])
    })

    it('shows disabled visual state for disabled stages', () => {
      const stagesWithDisabled = [
        { ...createMatchStage('stage-1'), enabled: false },
        { ...createProjectStage('stage-2'), enabled: true },
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithDisabled} />)

      const disabledStage = screen.getByTestId('stage-card-0')
      expect(disabledStage).toHaveAttribute('data-disabled', 'true')
    })

    it('toggle button shows correct aria-pressed state', () => {
      const stagesWithEnabled = [
        { ...createMatchStage('stage-1'), enabled: false },
        { ...createProjectStage('stage-2'), enabled: true },
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithEnabled} />)

      const toggle1 = screen.getByTestId('stage-toggle-0')
      const toggle2 = screen.getByTestId('stage-toggle-1')

      expect(toggle1).toHaveAttribute('aria-pressed', 'false')
      expect(toggle2).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('context menu (RED - not implemented)', () => {
    it('opens context menu on right-click', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('stage-card-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('stage-context-menu')).toBeInTheDocument()
      })
    })

    it('context menu includes move up option', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('stage-card-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('context-menu-move-up')).toBeInTheDocument()
      })
    })

    it('context menu includes move down option', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('stage-card-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('context-menu-move-down')).toBeInTheDocument()
      })
    })

    it('disables move up for first stage', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('stage-card-0')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('context-menu-move-up')).toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('disables move down for last stage', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('stage-card-2')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('context-menu-move-down')).toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('moves stage up when move up clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      const stage = screen.getByTestId('stage-card-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('context-menu-move-up')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('context-menu-move-up'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('moves stage down when move down clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      const stage = screen.getByTestId('stage-card-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('context-menu-move-down')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('context-menu-move-down'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
        expect.objectContaining({ id: 'stage-2' }),
      ])
    })
  })

  describe('delete confirmation (RED - not implemented)', () => {
    it('shows confirmation dialog when confirmDelete prop is true', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} confirmDelete={true} />)

      await user.click(screen.getByTestId('stage-remove-0'))

      expect(screen.getByTestId('delete-confirmation-dialog')).toBeInTheDocument()
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })

    it('deletes stage when confirmation is accepted', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} confirmDelete={true} />)

      await user.click(screen.getByTestId('stage-remove-0'))
      await user.click(screen.getByTestId('confirm-delete-button'))

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('does not delete stage when confirmation is cancelled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} confirmDelete={true} />)

      await user.click(screen.getByTestId('stage-remove-0'))
      await user.click(screen.getByTestId('cancel-delete-button'))

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('read-only mode (RED - not implemented)', () => {
    it('hides drag handles in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('stage-drag-handle-0')).not.toBeInTheDocument()
    })

    it('hides remove buttons in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('stage-remove-0')).not.toBeInTheDocument()
    })

    it('hides duplicate buttons in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('stage-duplicate-0')).not.toBeInTheDocument()
    })

    it('hides add stage button in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('add-stage-button')).not.toBeInTheDocument()
    })

    it('allows stage selection in read-only mode', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} readOnly={true} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('stage-card-0'))

      expect(onStageSelect).toHaveBeenCalledWith('stage-1')
    })
  })

  describe('error indicators (RED - not implemented)', () => {
    it('shows error indicator for stage with validation errors', () => {
      const stagesWithErrors = [
        {
          ...createMatchStage('stage-1'),
          _hasError: true,
          _errorMessage: 'Invalid field name',
        },
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithErrors} />)

      expect(screen.getByTestId('stage-error-indicator-0')).toBeInTheDocument()
    })

    it('shows error tooltip on hover', async () => {
      const user = userEvent.setup()
      const stagesWithErrors = [
        {
          ...createMatchStage('stage-1'),
          _hasError: true,
          _errorMessage: 'Invalid field name',
        },
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithErrors} />)

      await user.hover(screen.getByTestId('stage-error-indicator-0'))

      await waitFor(() => {
        expect(screen.getByText('Invalid field name')).toBeInTheDocument()
      })
    })

    it('applies error styling to stage card', () => {
      const stagesWithErrors = [
        {
          ...createMatchStage('stage-1'),
          _hasError: true,
        },
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithErrors} />)

      const stageCard = screen.getByTestId('stage-card-0')
      expect(stageCard).toHaveAttribute('data-has-error', 'true')
    })
  })

  describe('expand/collapse stage details (RED - not implemented)', () => {
    it('renders expand button for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('stage-expand-0')).toBeInTheDocument()
      expect(screen.getByTestId('stage-expand-1')).toBeInTheDocument()
      expect(screen.getByTestId('stage-expand-2')).toBeInTheDocument()
    })

    it('expands stage details when expand button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      await user.click(screen.getByTestId('stage-expand-0'))

      expect(screen.getByTestId('stage-expanded-details-0')).toBeInTheDocument()
    })

    it('collapses stage details when collapse button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      await user.click(screen.getByTestId('stage-expand-0'))
      expect(screen.getByTestId('stage-expanded-details-0')).toBeInTheDocument()

      await user.click(screen.getByTestId('stage-collapse-0'))
      expect(screen.queryByTestId('stage-expanded-details-0')).not.toBeInTheDocument()
    })

    it('shows full stage JSON in expanded view', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      await user.click(screen.getByTestId('stage-expand-0'))

      // Should show full JSON representation
      expect(screen.getByTestId('stage-full-json-0')).toBeInTheDocument()
    })
  })

  describe('keyboard shortcuts (RED - not implemented)', () => {
    it('deletes selected stage with Delete key', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onChange={onChange}
          selectedStageId="stage-2"
        />
      )

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()
      await user.keyboard('{Delete}')

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('duplicates selected stage with Ctrl+D', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onChange={onChange}
          selectedStageId="stage-2"
        />
      )

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()
      await user.keyboard('{Control>}d{/Control}')

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ type: '$project' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('moves selected stage up with Ctrl+ArrowUp', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onChange={onChange}
          selectedStageId="stage-2"
        />
      )

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()
      await user.keyboard('{Control>}{ArrowUp}{/Control}')

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('moves selected stage down with Ctrl+ArrowDown', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onChange={onChange}
          selectedStageId="stage-2"
        />
      )

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()
      await user.keyboard('{Control>}{ArrowDown}{/Control}')

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
        expect.objectContaining({ id: 'stage-2' }),
      ])
    })

    it('navigates between stages with ArrowUp/ArrowDown', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onStageSelect={onStageSelect}
          selectedStageId="stage-1"
        />
      )

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()
      await user.keyboard('{ArrowDown}')

      expect(onStageSelect).toHaveBeenCalledWith('stage-2')
    })
  })

  describe('drop zones for external stages (RED - not implemented)', () => {
    it('renders drop zone at the beginning of the pipeline', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('drop-zone-start')).toBeInTheDocument()
    })

    it('renders drop zones between stages', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('drop-zone-after-0')).toBeInTheDocument()
      expect(screen.getByTestId('drop-zone-after-1')).toBeInTheDocument()
      expect(screen.getByTestId('drop-zone-after-2')).toBeInTheDocument()
    })

    it('highlights drop zone on drag over', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const dropZone = screen.getByTestId('drop-zone-after-0')
      fireEvent.dragEnter(dropZone)

      await waitFor(() => {
        expect(dropZone).toHaveAttribute('data-drag-over', 'true')
      })
    })

    it('accepts dropped stage from palette at specific position', async () => {
      const onChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onChange={onChange} />)

      const dropZone = screen.getByTestId('drop-zone-after-0')

      const dataTransfer = {
        getData: vi.fn().mockReturnValue(JSON.stringify({ type: '$sort' })),
        dropEffect: 'move',
      }
      fireEvent.drop(dropZone, { dataTransfer })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'stage-1' }),
          expect.objectContaining({ type: '$sort' }),
          expect.objectContaining({ id: 'stage-2' }),
          expect.objectContaining({ id: 'stage-3' }),
        ])
      })
    })
  })
})
