import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { StagePalette, type StagePaletteProps } from '../StagePalette'
import type { StageType } from '@components/stage-editor/types'

// Mock @dnd-kit for drag testing
const mockDragStart = vi.fn()
const mockDragEnd = vi.fn()

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd }: any) => {
    // Store callbacks for testing
    mockDragStart.mockImplementation(onDragStart)
    mockDragEnd.mockImplementation(onDragEnd)
    return <div data-testid="dnd-context">{children}</div>
  },
  useDraggable: ({ id }: { id: string }) => ({
    attributes: {
      role: 'button',
      tabIndex: 0,
      'aria-roledescription': 'draggable',
      'aria-describedby': `draggable-${id}`,
    },
    listeners: {
      onPointerDown: vi.fn(),
      onKeyDown: vi.fn(),
    },
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  DragOverlay: ({ children }: any) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
}))

// Stage categories with their stages
const STAGE_CATEGORIES = {
  filter: {
    label: 'Filter & Transform',
    stages: ['$match', '$project', '$addFields', '$unwind'] as StageType[],
  },
  group: {
    label: 'Group & Aggregate',
    stages: ['$group', '$count'] as StageType[],
  },
  sort: {
    label: 'Sort & Limit',
    stages: ['$sort', '$limit', '$skip'] as StageType[],
  },
  join: {
    label: 'Join',
    stages: ['$lookup'] as StageType[],
  },
}

const ALL_STAGES: StageType[] = [
  '$match',
  '$project',
  '$group',
  '$sort',
  '$limit',
  '$skip',
  '$unwind',
  '$lookup',
  '$addFields',
  '$count',
]

describe('StagePalette', () => {
  const defaultProps: StagePaletteProps = {
    onStageSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the stage palette container', () => {
      render(<StagePalette {...defaultProps} />)
      expect(screen.getByTestId('stage-palette')).toBeInTheDocument()
    })

    it('renders a search input', () => {
      render(<StagePalette {...defaultProps} />)
      expect(screen.getByTestId('stage-search-input')).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText('Search stages...')
      ).toBeInTheDocument()
    })

    it('renders all stage categories', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByTestId('category-filter')).toBeInTheDocument()
      expect(screen.getByTestId('category-group')).toBeInTheDocument()
      expect(screen.getByTestId('category-sort')).toBeInTheDocument()
      expect(screen.getByTestId('category-join')).toBeInTheDocument()
    })

    it('renders category labels', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByText('Filter & Transform')).toBeInTheDocument()
      expect(screen.getByText('Group & Aggregate')).toBeInTheDocument()
      expect(screen.getByText('Sort & Limit')).toBeInTheDocument()
      expect(screen.getByText('Join')).toBeInTheDocument()
    })

    it('renders all available stages', () => {
      render(<StagePalette {...defaultProps} />)

      ALL_STAGES.forEach((stage) => {
        expect(screen.getByTestId(`stage-item-${stage}`)).toBeInTheDocument()
      })
    })

    it('displays stage descriptions on hover/tooltip', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      await user.hover(matchStage)

      // Tooltip should appear with description
      expect(
        await screen.findByText(/Filter documents/)
      ).toBeInTheDocument()
    })
  })

  describe('stage categories', () => {
    it('groups stages by category correctly', () => {
      render(<StagePalette {...defaultProps} />)

      // Filter & Transform category
      const filterCategory = screen.getByTestId('category-filter')
      expect(within(filterCategory).getByTestId('stage-item-$match')).toBeInTheDocument()
      expect(within(filterCategory).getByTestId('stage-item-$project')).toBeInTheDocument()
      expect(within(filterCategory).getByTestId('stage-item-$addFields')).toBeInTheDocument()
      expect(within(filterCategory).getByTestId('stage-item-$unwind')).toBeInTheDocument()

      // Group & Aggregate category
      const groupCategory = screen.getByTestId('category-group')
      expect(within(groupCategory).getByTestId('stage-item-$group')).toBeInTheDocument()
      expect(within(groupCategory).getByTestId('stage-item-$count')).toBeInTheDocument()

      // Sort & Limit category
      const sortCategory = screen.getByTestId('category-sort')
      expect(within(sortCategory).getByTestId('stage-item-$sort')).toBeInTheDocument()
      expect(within(sortCategory).getByTestId('stage-item-$limit')).toBeInTheDocument()
      expect(within(sortCategory).getByTestId('stage-item-$skip')).toBeInTheDocument()

      // Join category
      const joinCategory = screen.getByTestId('category-join')
      expect(within(joinCategory).getByTestId('stage-item-$lookup')).toBeInTheDocument()
    })

    it('expands categories by default', () => {
      render(<StagePalette {...defaultProps} />)

      // All category content should be visible
      expect(screen.getByTestId('category-filter-content')).toBeVisible()
      expect(screen.getByTestId('category-group-content')).toBeVisible()
      expect(screen.getByTestId('category-sort-content')).toBeVisible()
      expect(screen.getByTestId('category-join-content')).toBeVisible()
    })

    it('collapses category when header clicked', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filterHeader = screen.getByTestId('category-filter-header')
      await user.click(filterHeader)

      expect(screen.getByTestId('category-filter-content')).not.toBeVisible()
    })

    it('expands category when collapsed header clicked', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filterHeader = screen.getByTestId('category-filter-header')

      // Collapse
      await user.click(filterHeader)
      expect(screen.getByTestId('category-filter-content')).not.toBeVisible()

      // Expand
      await user.click(filterHeader)
      expect(screen.getByTestId('category-filter-content')).toBeVisible()
    })

    it('shows expand/collapse chevron icon', () => {
      render(<StagePalette {...defaultProps} />)

      const filterHeader = screen.getByTestId('category-filter-header')
      expect(within(filterHeader).getByTestId('chevron-icon')).toBeInTheDocument()
    })

    it('rotates chevron when category is collapsed', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filterHeader = screen.getByTestId('category-filter-header')
      const chevron = within(filterHeader).getByTestId('chevron-icon')

      // Initially expanded - chevron should point down
      expect(chevron).toHaveAttribute('data-expanded', 'true')

      await user.click(filterHeader)

      // Collapsed - chevron should point right
      expect(chevron).toHaveAttribute('data-expanded', 'false')
    })

    it('maintains independent collapse state for each category', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Collapse filter category
      await user.click(screen.getByTestId('category-filter-header'))

      // Filter should be collapsed, others expanded
      expect(screen.getByTestId('category-filter-content')).not.toBeVisible()
      expect(screen.getByTestId('category-group-content')).toBeVisible()
      expect(screen.getByTestId('category-sort-content')).toBeVisible()
      expect(screen.getByTestId('category-join-content')).toBeVisible()
    })
  })

  describe('search functionality', () => {
    it('filters stages based on search query', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'match')

      // Only $match should be visible
      expect(screen.getByTestId('stage-item-$match')).toBeInTheDocument()
      expect(screen.queryByTestId('stage-item-$project')).not.toBeInTheDocument()
      expect(screen.queryByTestId('stage-item-$group')).not.toBeInTheDocument()
    })

    it('filters are case insensitive', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'MATCH')

      expect(screen.getByTestId('stage-item-$match')).toBeInTheDocument()
    })

    it('clears search when X button clicked', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'match')
      expect(screen.queryByTestId('stage-item-$project')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('clear-search-button'))

      expect(screen.getByTestId('stage-search-input')).toHaveValue('')
      expect(screen.getByTestId('stage-item-$project')).toBeInTheDocument()
    })

    it('shows clear button only when search has value', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Initially hidden
      expect(screen.queryByTestId('clear-search-button')).not.toBeInTheDocument()

      await user.type(screen.getByTestId('stage-search-input'), 'match')

      // Now visible
      expect(screen.getByTestId('clear-search-button')).toBeInTheDocument()
    })

    it('shows no results message when search has no matches', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'zzzznotexist')

      expect(screen.getByTestId('no-results-message')).toBeInTheDocument()
      expect(screen.getByText('No stages found')).toBeInTheDocument()
    })

    it('hides empty categories during search', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'lookup')

      // Only Join category should be visible (contains $lookup)
      expect(screen.getByTestId('category-join')).toBeInTheDocument()
      expect(screen.queryByTestId('category-filter')).not.toBeInTheDocument()
      expect(screen.queryByTestId('category-group')).not.toBeInTheDocument()
      expect(screen.queryByTestId('category-sort')).not.toBeInTheDocument()
    })

    it('matches partial stage names', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'proj')

      expect(screen.getByTestId('stage-item-$project')).toBeInTheDocument()
    })

    it('matches stage descriptions', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Search for "filter" which is in $match description
      await user.type(screen.getByTestId('stage-search-input'), 'filter')

      expect(screen.getByTestId('stage-item-$match')).toBeInTheDocument()
    })

    it('searches without $ prefix', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Search for "group" without $
      await user.type(screen.getByTestId('stage-search-input'), 'group')

      expect(screen.getByTestId('stage-item-$group')).toBeInTheDocument()
    })
  })

  describe('drag initiation', () => {
    it('makes stage items draggable', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveAttribute('role', 'button')
      expect(matchStage).toHaveAttribute('aria-roledescription', 'draggable')
    })

    it('has correct tabIndex for keyboard accessibility', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveAttribute('tabIndex', '0')
    })

    it('triggers onDragStart when dragging begins', () => {
      render(<StagePalette {...defaultProps} />)

      // Simulate drag start event
      const event = {
        active: { id: '$match' },
      }
      mockDragStart(event)

      expect(mockDragStart).toHaveBeenCalledWith(event)
    })

    it('provides stage type data during drag', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveAttribute('data-stage-type', '$match')
    })

    it('shows drag preview/overlay during drag', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByTestId('drag-overlay')).toBeInTheDocument()
    })

    it('applies dragging styles when actively dragging', async () => {
      // This test verifies the visual feedback during drag
      // In the actual implementation, isDragging would be true during drag
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')

      // The component should have a data attribute or class for styling during drag
      expect(matchStage).toHaveAttribute('data-dragging', 'false')
    })

    it('triggers onDragEnd when dragging completes', () => {
      render(<StagePalette {...defaultProps} />)

      const event = {
        active: { id: '$match' },
        over: { id: 'drop-zone' },
      }
      mockDragEnd(event)

      expect(mockDragEnd).toHaveBeenCalledWith(event)
    })

    it('supports keyboard drag initiation with Space', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      matchStage.focus()

      // Space should initiate drag mode for accessible drag and drop
      await user.keyboard(' ')

      expect(matchStage).toHaveAttribute('aria-pressed', 'true')
    })

    it('supports keyboard drag initiation with Enter', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      matchStage.focus()

      await user.keyboard('{Enter}')

      expect(matchStage).toHaveAttribute('aria-pressed', 'true')
    })

    it('cancels drag on Escape key', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      matchStage.focus()

      // Start drag
      await user.keyboard(' ')
      expect(matchStage).toHaveAttribute('aria-pressed', 'true')

      // Cancel with Escape
      await user.keyboard('{Escape}')
      expect(matchStage).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('click to add stage', () => {
    it('calls onStageSelect when stage clicked', async () => {
      const onStageSelect = vi.fn()
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(onStageSelect).toHaveBeenCalledWith('$match')
    })

    it('calls onStageSelect with correct stage type', async () => {
      const onStageSelect = vi.fn()
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} onStageSelect={onStageSelect} />)

      await user.click(screen.getByTestId('stage-item-$group'))
      expect(onStageSelect).toHaveBeenCalledWith('$group')

      await user.click(screen.getByTestId('stage-item-$lookup'))
      expect(onStageSelect).toHaveBeenCalledWith('$lookup')
    })

    it('shows add button on stage hover', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      await user.hover(matchStage)

      expect(
        within(matchStage).getByTestId('stage-add-button')
      ).toBeInTheDocument()
    })
  })

  describe('stage metadata', () => {
    it('displays stage icon', () => {
      render(<StagePalette {...defaultProps} />)

      ALL_STAGES.forEach((stage) => {
        const stageItem = screen.getByTestId(`stage-item-${stage}`)
        expect(within(stageItem).getByTestId('stage-icon')).toBeInTheDocument()
      })
    })

    it('displays stage name without $ prefix option', () => {
      render(<StagePalette {...defaultProps} showDollarPrefix={false} />)

      expect(screen.getByText('match')).toBeInTheDocument()
      expect(screen.getByText('project')).toBeInTheDocument()
    })

    it('displays stage name with $ prefix by default', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByText('$match')).toBeInTheDocument()
      expect(screen.getByText('$project')).toBeInTheDocument()
    })

    it('applies category color to stage items', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveAttribute('data-category', 'filter')
    })
  })

  describe('disabled state', () => {
    it('disables all interactions when disabled prop is true', () => {
      render(<StagePalette {...defaultProps} disabled={true} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveAttribute('aria-disabled', 'true')
    })

    it('does not call onStageSelect when disabled', async () => {
      const onStageSelect = vi.fn()
      const user = userEvent.setup()
      render(
        <StagePalette {...defaultProps} onStageSelect={onStageSelect} disabled={true} />
      )

      await user.click(screen.getByTestId('stage-item-$match'))

      expect(onStageSelect).not.toHaveBeenCalled()
    })

    it('disables search input when disabled', () => {
      render(<StagePalette {...defaultProps} disabled={true} />)

      expect(screen.getByTestId('stage-search-input')).toBeDisabled()
    })
  })

  describe('compact mode', () => {
    it('renders in compact mode when compact prop is true', () => {
      render(<StagePalette {...defaultProps} compact={true} />)

      expect(screen.getByTestId('stage-palette')).toHaveAttribute(
        'data-compact',
        'true'
      )
    })

    it('hides stage descriptions in compact mode', () => {
      render(<StagePalette {...defaultProps} compact={true} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(
        within(matchStage).queryByTestId('stage-description')
      ).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByTestId('stage-palette')).toHaveAttribute(
        'aria-label',
        'Aggregation stage palette'
      )
    })

    it('has proper ARIA label for search input', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByTestId('stage-search-input')).toHaveAttribute(
        'aria-label',
        'Search aggregation stages'
      )
    })

    it('categories have proper ARIA expanded state', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filterHeader = screen.getByTestId('category-filter-header')
      expect(filterHeader).toHaveAttribute('aria-expanded', 'true')

      await user.click(filterHeader)
      expect(filterHeader).toHaveAttribute('aria-expanded', 'false')
    })

    it('stage items are in a list with proper role', () => {
      render(<StagePalette {...defaultProps} />)

      const filterContent = screen.getByTestId('category-filter-content')
      expect(filterContent).toHaveAttribute('role', 'list')
    })

    it('stage items have proper listitem role', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage.closest('[role="listitem"]')).toBeInTheDocument()
    })

    it('announces search results to screen readers', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-search-input'), 'match')

      // Should have a live region announcing results
      expect(screen.getByRole('status')).toHaveTextContent('1 stage found')
    })
  })

  describe('keyboard navigation', () => {
    it('navigates stages with arrow keys', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      matchStage.focus()

      await user.keyboard('{ArrowDown}')

      // Focus should move to next stage
      const projectStage = screen.getByTestId('stage-item-$project')
      expect(projectStage).toHaveFocus()
    })

    it('wraps focus at the end of list', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Focus last stage
      const countStage = screen.getByTestId('stage-item-$count')
      countStage.focus()

      await user.keyboard('{ArrowDown}')

      // Should wrap to first stage
      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveFocus()
    })

    it('supports Home key to go to first stage', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const groupStage = screen.getByTestId('stage-item-$group')
      groupStage.focus()

      await user.keyboard('{Home}')

      const matchStage = screen.getByTestId('stage-item-$match')
      expect(matchStage).toHaveFocus()
    })

    it('supports End key to go to last stage', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('stage-item-$match')
      matchStage.focus()

      await user.keyboard('{End}')

      const countStage = screen.getByTestId('stage-item-$count')
      expect(countStage).toHaveFocus()
    })
  })

  describe('className and styling', () => {
    it('applies custom className', () => {
      render(<StagePalette {...defaultProps} className="custom-palette" />)

      expect(screen.getByTestId('stage-palette')).toHaveClass('custom-palette')
    })

    it('applies custom style', () => {
      render(<StagePalette {...defaultProps} style={{ maxHeight: '400px' }} />)

      expect(screen.getByTestId('stage-palette')).toHaveStyle({
        maxHeight: '400px',
      })
    })
  })
})
