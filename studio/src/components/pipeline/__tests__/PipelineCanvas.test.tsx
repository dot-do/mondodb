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
import type { AggregationStage, MatchStage, ProjectStage, GroupStage, SortStage, LimitStage } from '@components/stage-editor/types'

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
function createMatchStage(id: string, enabled = true): MatchStage {
  return {
    id,
    type: '$match',
    enabled,
    conditions: [{ id: 'cond1', field: 'status', operator: '$eq', value: 'active' }],
    useRawJson: false,
    rawJson: '',
  }
}

function createProjectStage(id: string, enabled = true): ProjectStage {
  return {
    id,
    type: '$project',
    enabled,
    fields: [{ id: 'f1', field: 'name', include: true, isExpression: false }],
    useRawJson: false,
    rawJson: '',
  }
}

function createGroupStage(id: string, enabled = true): GroupStage {
  return {
    id,
    type: '$group',
    enabled,
    groupByField: 'category',
    groupByExpression: '',
    useCompoundKey: false,
    accumulators: [{ id: 'acc1', outputField: 'count', operator: '$sum', inputField: '1' }],
    useRawJson: false,
    rawJson: '',
  }
}

function createSortStage(id: string, enabled = true): SortStage {
  return {
    id,
    type: '$sort',
    enabled,
    fields: [{ id: 's1', field: 'createdAt', direction: -1 }],
  }
}

function createLimitStage(id: string, enabled = true): LimitStage {
  return {
    id,
    type: '$limit',
    enabled,
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
    onStagesChange: vi.fn(),
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

      const stages = screen.getAllByTestId(/^pipeline-stage-/)
      expect(stages).toHaveLength(3)

      expect(screen.getByTestId('pipeline-stage-stage-1')).toBeInTheDocument()
      expect(screen.getByTestId('pipeline-stage-stage-2')).toBeInTheDocument()
      expect(screen.getByTestId('pipeline-stage-stage-3')).toBeInTheDocument()
    })

    it('displays stage type labels', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByText('$match')).toBeInTheDocument()
      expect(screen.getByText('$project')).toBeInTheDocument()
      expect(screen.getByText('$group')).toBeInTheDocument()
    })

    it('displays stage index numbers', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('stage-index-0')).toHaveTextContent('1')
      expect(screen.getByTestId('stage-index-1')).toHaveTextContent('2')
      expect(screen.getByTestId('stage-index-2')).toHaveTextContent('3')
    })

    it('renders empty state when no stages', () => {
      render(<PipelineCanvas {...defaultProps} stages={[]} />)

      expect(screen.getByTestId('pipeline-canvas-empty')).toBeInTheDocument()
      expect(screen.getByText(/drag a stage here/i)).toBeInTheDocument()
    })

    it('renders drag handle for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('drag-handle-stage-1')).toBeInTheDocument()
      expect(screen.getByTestId('drag-handle-stage-2')).toBeInTheDocument()
      expect(screen.getByTestId('drag-handle-stage-3')).toBeInTheDocument()
    })

    it('renders delete button for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('delete-stage-stage-1')).toBeInTheDocument()
      expect(screen.getByTestId('delete-stage-stage-2')).toBeInTheDocument()
      expect(screen.getByTestId('delete-stage-stage-3')).toBeInTheDocument()
    })

    it('renders toggle enabled button for each stage', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('toggle-stage-stage-1')).toBeInTheDocument()
      expect(screen.getByTestId('toggle-stage-stage-2')).toBeInTheDocument()
      expect(screen.getByTestId('toggle-stage-stage-3')).toBeInTheDocument()
    })
  })

  describe('drop zones', () => {
    it('renders drop zone at the beginning of the pipeline', () => {
      render(<PipelineCanvas {...defaultProps} />)

      expect(screen.getByTestId('drop-zone-start')).toBeInTheDocument()
    })

    it('renders drop zones between stages', () => {
      render(<PipelineCanvas {...defaultProps} />)

      // Drop zones after each stage
      expect(screen.getByTestId('drop-zone-after-stage-1')).toBeInTheDocument()
      expect(screen.getByTestId('drop-zone-after-stage-2')).toBeInTheDocument()
      expect(screen.getByTestId('drop-zone-after-stage-3')).toBeInTheDocument()
    })

    it('highlights drop zone on drag over', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const dropZone = screen.getByTestId('drop-zone-after-stage-1')

      // Simulate drag over
      fireEvent.dragEnter(dropZone)

      await waitFor(() => {
        expect(dropZone).toHaveClass('drop-zone-active')
      })
    })

    it('removes highlight when drag leaves', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const dropZone = screen.getByTestId('drop-zone-after-stage-1')

      fireEvent.dragEnter(dropZone)
      fireEvent.dragLeave(dropZone)

      await waitFor(() => {
        expect(dropZone).not.toHaveClass('drop-zone-active')
      })
    })

    it('accepts dropped stage from palette at start position', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const dropZone = screen.getByTestId('drop-zone-start')

      // Simulate drop event with stage data
      const dataTransfer = {
        getData: vi.fn().mockReturnValue(JSON.stringify({ type: '$sort' })),
        dropEffect: 'move',
      }
      fireEvent.drop(dropZone, { dataTransfer })

      await waitFor(() => {
        expect(onStagesChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ type: '$sort' }),
            expect.objectContaining({ id: 'stage-1' }),
            expect.objectContaining({ id: 'stage-2' }),
            expect.objectContaining({ id: 'stage-3' }),
          ])
        )
      })
    })

    it('accepts dropped stage from palette at middle position', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const dropZone = screen.getByTestId('drop-zone-after-stage-1')

      const dataTransfer = {
        getData: vi.fn().mockReturnValue(JSON.stringify({ type: '$limit' })),
        dropEffect: 'move',
      }
      fireEvent.drop(dropZone, { dataTransfer })

      await waitFor(() => {
        expect(onStagesChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'stage-1' }),
            expect.objectContaining({ type: '$limit' }),
            expect.objectContaining({ id: 'stage-2' }),
            expect.objectContaining({ id: 'stage-3' }),
          ])
        )
      })
    })

    it('accepts dropped stage from palette at end position', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const dropZone = screen.getByTestId('drop-zone-after-stage-3')

      const dataTransfer = {
        getData: vi.fn().mockReturnValue(JSON.stringify({ type: '$count' })),
        dropEffect: 'move',
      }
      fireEvent.drop(dropZone, { dataTransfer })

      await waitFor(() => {
        expect(onStagesChange).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'stage-1' }),
            expect.objectContaining({ id: 'stage-2' }),
            expect.objectContaining({ id: 'stage-3' }),
            expect.objectContaining({ type: '$count' }),
          ])
        )
      })
    })

    it('generates unique id for dropped stage', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const dropZone = screen.getByTestId('drop-zone-start')

      const dataTransfer = {
        getData: vi.fn().mockReturnValue(JSON.stringify({ type: '$sort' })),
        dropEffect: 'move',
      }
      fireEvent.drop(dropZone, { dataTransfer })

      await waitFor(() => {
        const call = onStagesChange.mock.calls[0]![0] as AggregationStage[]
        const newStage = call[0]
        expect(newStage?.id).toMatch(/^stage-/)
        expect(newStage?.id).not.toBe('stage-1')
        expect(newStage?.id).not.toBe('stage-2')
        expect(newStage?.id).not.toBe('stage-3')
      })
    })
  })

  describe('reorder stages', () => {
    it('reorders stages when drag ends on valid target', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      // Simulate dnd-kit drag end event
      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-1' },
        over: { id: 'stage-3' },
      })

      await waitFor(() => {
        expect(onStagesChange).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'stage-2' }),
          expect.objectContaining({ id: 'stage-3' }),
          expect.objectContaining({ id: 'stage-1' }),
        ])
      })
    })

    it('moves stage up when dropped before earlier stage', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-3' },
        over: { id: 'stage-1' },
      })

      await waitFor(() => {
        expect(onStagesChange).toHaveBeenCalledWith([
          expect.objectContaining({ id: 'stage-3' }),
          expect.objectContaining({ id: 'stage-1' }),
          expect.objectContaining({ id: 'stage-2' }),
        ])
      })
    })

    it('does not change order when dropped on same position', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-2' },
        over: { id: 'stage-2' },
      })

      expect(onStagesChange).not.toHaveBeenCalled()
    })

    it('does not change order when dropped outside valid target', async () => {
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragEnd?: (event: { active: { id: string }; over: { id: string } | null }) => void
      }

      handlers.onDragEnd?.({
        active: { id: 'stage-1' },
        over: null,
      })

      expect(onStagesChange).not.toHaveBeenCalled()
    })

    it('shows visual feedback during drag', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const handlers = (globalThis as Record<string, unknown>).__dndHandlers as {
        onDragStart?: (event: { active: { id: string } }) => void
      }

      handlers.onDragStart?.({
        active: { id: 'stage-1' },
      })

      await waitFor(() => {
        const stage = screen.getByTestId('pipeline-stage-stage-1')
        expect(stage).toHaveClass('dragging')
      })
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

      expect(screen.getByTestId('stage-index-0')).toHaveTextContent('1')
      expect(screen.getByTestId('stage-index-1')).toHaveTextContent('2')
      expect(screen.getByTestId('stage-index-2')).toHaveTextContent('3')

      // Stage types should now be in new order
      const stageTypes = screen.getAllByTestId(/^stage-type-/)
      expect(stageTypes[0]).toHaveTextContent('$project')
      expect(stageTypes[1]).toHaveTextContent('$group')
      expect(stageTypes[2]).toHaveTextContent('$match')
    })
  })

  describe('delete stages', () => {
    it('calls onStagesChange without deleted stage when delete clicked', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      await user.click(screen.getByTestId('delete-stage-stage-2'))

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('shows confirmation dialog before delete when confirmDelete is true', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} confirmDelete={true} />)

      await user.click(screen.getByTestId('delete-stage-stage-1'))

      expect(screen.getByTestId('delete-confirmation-dialog')).toBeInTheDocument()
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })

    it('deletes stage when confirmation is accepted', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} confirmDelete={true} />)

      await user.click(screen.getByTestId('delete-stage-stage-1'))
      await user.click(screen.getByTestId('confirm-delete-button'))

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('does not delete stage when confirmation is cancelled', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} confirmDelete={true} />)

      await user.click(screen.getByTestId('delete-stage-stage-1'))
      await user.click(screen.getByTestId('cancel-delete-button'))

      expect(onStagesChange).not.toHaveBeenCalled()
    })

    it('can delete all stages leaving empty canvas', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      const { rerender } = render(
        <PipelineCanvas {...defaultProps} stages={[createMatchStage('only-stage')]} onStagesChange={onStagesChange} />
      )

      await user.click(screen.getByTestId('delete-stage-only-stage'))

      expect(onStagesChange).toHaveBeenCalledWith([])
    })

    it('supports keyboard delete with Delete key', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onStagesChange={onStagesChange}
          selectedStageId="stage-2"
        />
      )

      // Focus the stage and press Delete
      const stage = screen.getByTestId('pipeline-stage-stage-2')
      stage.focus()
      await user.keyboard('{Delete}')

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('supports keyboard delete with Backspace key', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(
        <PipelineCanvas
          {...defaultProps}
          onStagesChange={onStagesChange}
          selectedStageId="stage-2"
        />
      )

      const stage = screen.getByTestId('pipeline-stage-stage-2')
      stage.focus()
      await user.keyboard('{Backspace}')

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })
  })

  describe('stage selection', () => {
    it('calls onStageSelect when stage is clicked', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('pipeline-stage-stage-2'))

      expect(onStageSelect).toHaveBeenCalledWith('stage-2')
    })

    it('highlights selected stage', () => {
      render(<PipelineCanvas {...defaultProps} selectedStageId="stage-2" />)

      const selectedStage = screen.getByTestId('pipeline-stage-stage-2')
      expect(selectedStage).toHaveClass('selected')
      expect(selectedStage).toHaveAttribute('aria-selected', 'true')
    })

    it('deselects stage when clicking outside', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} selectedStageId="stage-1" />)

      await user.click(screen.getByTestId('pipeline-canvas'))

      expect(onStageSelect).toHaveBeenCalledWith(null)
    })

    it('navigates between stages with arrow keys', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStageSelect={onStageSelect} selectedStageId="stage-1" />)

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()

      await user.keyboard('{ArrowDown}')
      expect(onStageSelect).toHaveBeenCalledWith('stage-2')

      onStageSelect.mockClear()
      await user.keyboard('{ArrowUp}')
      expect(onStageSelect).toHaveBeenCalledWith('stage-1')
    })
  })

  describe('stage toggle (enable/disable)', () => {
    it('toggles stage enabled state when toggle clicked', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      await user.click(screen.getByTestId('toggle-stage-stage-1'))

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1', enabled: false }),
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('shows disabled visual state for disabled stages', () => {
      const stagesWithDisabled = [
        { ...createMatchStage('stage-1'), enabled: false },
        createProjectStage('stage-2'),
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithDisabled} />)

      const disabledStage = screen.getByTestId('pipeline-stage-stage-1')
      expect(disabledStage).toHaveClass('disabled')
      expect(disabledStage).toHaveAttribute('aria-disabled', 'true')
    })

    it('toggle button shows correct state', () => {
      const stagesWithDisabled = [
        { ...createMatchStage('stage-1'), enabled: false },
        createProjectStage('stage-2'),
      ]
      render(<PipelineCanvas {...defaultProps} stages={stagesWithDisabled} />)

      const toggle1 = screen.getByTestId('toggle-stage-stage-1')
      const toggle2 = screen.getByTestId('toggle-stage-stage-2')

      expect(toggle1).toHaveAttribute('aria-pressed', 'false')
      expect(toggle2).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('stage duplication', () => {
    it('duplicates stage when duplicate button clicked', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      await user.click(screen.getByTestId('duplicate-stage-stage-2'))

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ type: '$project' }), // Duplicated stage
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('generates new unique id for duplicated stage', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      await user.click(screen.getByTestId('duplicate-stage-stage-2'))

      const call = onStagesChange.mock.calls[0]![0] as AggregationStage[]
      const duplicatedStage = call[2]
      expect(duplicatedStage?.id).not.toBe('stage-2')
      expect(duplicatedStage?.id).toMatch(/^stage-/)
    })
  })

  describe('accessibility', () => {
    it('has proper role and aria-label for canvas', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const canvas = screen.getByTestId('pipeline-canvas')
      expect(canvas).toHaveAttribute('role', 'list')
      expect(canvas).toHaveAttribute('aria-label', 'Aggregation pipeline stages')
    })

    it('stages have listitem role', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stages = screen.getAllByRole('listitem')
      expect(stages).toHaveLength(3)
    })

    it('drag handles have proper aria labels', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const handle = screen.getByTestId('drag-handle-stage-1')
      expect(handle).toHaveAttribute('aria-label', expect.stringContaining('Drag'))
    })

    it('delete buttons have proper aria labels', () => {
      render(<PipelineCanvas {...defaultProps} />)

      const deleteBtn = screen.getByTestId('delete-stage-stage-1')
      expect(deleteBtn).toHaveAttribute('aria-label', expect.stringContaining('Delete'))
    })

    it('supports keyboard focus navigation', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      const canvas = screen.getByTestId('pipeline-canvas')
      canvas.focus()

      await user.tab()
      expect(screen.getByTestId('pipeline-stage-stage-1')).toHaveFocus()

      await user.tab()
      // Should focus drag handle or next interactive element
    })

    it('announces drag operations to screen readers', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      // Check for live region
      const liveRegion = screen.getByRole('status', { hidden: true })
      expect(liveRegion).toBeInTheDocument()
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('read-only mode', () => {
    it('hides drag handles in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('drag-handle-stage-1')).not.toBeInTheDocument()
    })

    it('hides delete buttons in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('delete-stage-stage-1')).not.toBeInTheDocument()
    })

    it('hides toggle buttons in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('toggle-stage-stage-1')).not.toBeInTheDocument()
    })

    it('hides drop zones in read-only mode', () => {
      render(<PipelineCanvas {...defaultProps} readOnly={true} />)

      expect(screen.queryByTestId('drop-zone-start')).not.toBeInTheDocument()
    })

    it('allows stage selection in read-only mode', async () => {
      const user = userEvent.setup()
      const onStageSelect = vi.fn()
      render(<PipelineCanvas {...defaultProps} readOnly={true} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('pipeline-stage-stage-1'))

      expect(onStageSelect).toHaveBeenCalledWith('stage-1')
    })
  })

  describe('stage preview', () => {
    it('shows stage summary in collapsed view', () => {
      render(<PipelineCanvas {...defaultProps} />)

      // Match stage should show condition summary
      const matchStage = screen.getByTestId('pipeline-stage-stage-1')
      expect(within(matchStage).getByTestId('stage-summary')).toHaveTextContent(/status.*active/i)
    })

    it('expands stage details on expand button click', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      await user.click(screen.getByTestId('expand-stage-stage-1'))

      expect(screen.getByTestId('stage-details-stage-1')).toBeInTheDocument()
    })

    it('collapses stage details on collapse button click', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      await user.click(screen.getByTestId('expand-stage-stage-1'))
      await user.click(screen.getByTestId('collapse-stage-stage-1'))

      expect(screen.queryByTestId('stage-details-stage-1')).not.toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('shows error indicator for invalid stage configuration', () => {
      const invalidStages: AggregationStage[] = [
        {
          ...createMatchStage('stage-1'),
          conditions: [], // Invalid: empty conditions
        },
      ]
      render(<PipelineCanvas {...defaultProps} stages={invalidStages} />)

      expect(screen.getByTestId('stage-error-stage-1')).toBeInTheDocument()
    })

    it('does not prevent drag for invalid stages', () => {
      const invalidStages: AggregationStage[] = [
        {
          ...createMatchStage('stage-1'),
          conditions: [],
        },
      ]
      render(<PipelineCanvas {...defaultProps} stages={invalidStages} />)

      expect(screen.getByTestId('drag-handle-stage-1')).toBeInTheDocument()
    })
  })

  describe('stage actions menu', () => {
    it('opens actions menu on right-click', async () => {
      const user = userEvent.setup()
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('pipeline-stage-stage-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('stage-actions-menu')).toBeInTheDocument()
      })
    })

    it('menu includes move up option', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('pipeline-stage-stage-2')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('menu-move-up')).toBeInTheDocument()
      })
    })

    it('menu includes move down option', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('pipeline-stage-stage-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('menu-move-down')).toBeInTheDocument()
      })
    })

    it('disables move up for first stage', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('pipeline-stage-stage-1')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('menu-move-up')).toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('disables move down for last stage', async () => {
      render(<PipelineCanvas {...defaultProps} />)

      const stage = screen.getByTestId('pipeline-stage-stage-3')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('menu-move-down')).toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('moves stage up when move up clicked', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const stage = screen.getByTestId('pipeline-stage-stage-2')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('menu-move-up')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('menu-move-up'))

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-2' }),
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
      ])
    })

    it('moves stage down when move down clicked', async () => {
      const user = userEvent.setup()
      const onStagesChange = vi.fn()
      render(<PipelineCanvas {...defaultProps} onStagesChange={onStagesChange} />)

      const stage = screen.getByTestId('pipeline-stage-stage-2')
      fireEvent.contextMenu(stage)

      await waitFor(() => {
        expect(screen.getByTestId('menu-move-down')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('menu-move-down'))

      expect(onStagesChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'stage-1' }),
        expect.objectContaining({ id: 'stage-3' }),
        expect.objectContaining({ id: 'stage-2' }),
      ])
    })
  })
})
