/**
 * StagePalette Unit Tests
 *
 * RED Phase: These tests define the expected behavior for the StagePalette component
 * which displays available aggregation stage types and allows users to add them
 * to the pipeline canvas via click or drag-and-drop.
 *
 * The StagePalette should:
 * 1. Display all supported MongoDB aggregation stage types
 * 2. Allow filtering/searching stages by name
 * 3. Support clicking to add a stage to the pipeline
 * 4. Support drag-and-drop to add stages at specific positions
 * 5. Show stage descriptions/tooltips
 * 6. Group stages by category (filtering, transformation, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { StagePalette } from '../StagePalette'
import type { StageType } from '@components/stage-editor/types'

describe('StagePalette', () => {
  const defaultProps = {
    onStageAdd: vi.fn(),
    onStageDragStart: vi.fn(),
    onStageDragEnd: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the stage palette container', () => {
      render(<StagePalette {...defaultProps} />)
      expect(screen.getByTestId('stage-palette')).toBeInTheDocument()
    })

    it('renders the palette title', () => {
      render(<StagePalette {...defaultProps} />)
      expect(screen.getByText(/stages/i)).toBeInTheDocument()
    })

    it('renders search/filter input', () => {
      render(<StagePalette {...defaultProps} />)
      expect(screen.getByTestId('stage-palette-search')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/search stages/i)).toBeInTheDocument()
    })

    it('renders all supported stage types', () => {
      render(<StagePalette {...defaultProps} />)

      // All 10 stage types should be visible
      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$project')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$group')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$sort')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$limit')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$skip')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$unwind')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$lookup')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$addFields')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$count')).toBeInTheDocument()
    })

    it('displays stage type names', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByText('$match')).toBeInTheDocument()
      expect(screen.getByText('$project')).toBeInTheDocument()
      expect(screen.getByText('$group')).toBeInTheDocument()
      expect(screen.getByText('$sort')).toBeInTheDocument()
      expect(screen.getByText('$limit')).toBeInTheDocument()
      expect(screen.getByText('$skip')).toBeInTheDocument()
      expect(screen.getByText('$unwind')).toBeInTheDocument()
      expect(screen.getByText('$lookup')).toBeInTheDocument()
      expect(screen.getByText('$addFields')).toBeInTheDocument()
      expect(screen.getByText('$count')).toBeInTheDocument()
    })

    it('displays friendly labels for stages', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByText('Match')).toBeInTheDocument()
      expect(screen.getByText('Project')).toBeInTheDocument()
      expect(screen.getByText('Group')).toBeInTheDocument()
      expect(screen.getByText('Sort')).toBeInTheDocument()
      expect(screen.getByText('Limit')).toBeInTheDocument()
      expect(screen.getByText('Skip')).toBeInTheDocument()
      expect(screen.getByText('Unwind')).toBeInTheDocument()
      expect(screen.getByText('Lookup')).toBeInTheDocument()
      expect(screen.getByText('Add Fields')).toBeInTheDocument()
      expect(screen.getByText('Count')).toBeInTheDocument()
    })
  })

  describe('stage list display', () => {
    it('renders stages in a list format', () => {
      render(<StagePalette {...defaultProps} />)

      const stageItems = screen.getAllByTestId(/^palette-stage-/)
      expect(stageItems.length).toBeGreaterThanOrEqual(10)
    })

    it('each stage has a drag handle icon', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(within(matchStage).getByTestId('stage-drag-icon')).toBeInTheDocument()
    })

    it('each stage item is draggable', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).toHaveAttribute('draggable', 'true')
    })

    it('displays stage count when filtered', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'match')

      expect(screen.getByTestId('stage-count')).toHaveTextContent(/1 stage/i)
    })
  })

  describe('search/filter functionality', () => {
    it('filters stages by stage type name', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'match')

      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
      expect(screen.queryByTestId('palette-stage-$group')).not.toBeInTheDocument()
      expect(screen.queryByTestId('palette-stage-$project')).not.toBeInTheDocument()
    })

    it('filters stages by friendly label', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'Group')

      expect(screen.getByTestId('palette-stage-$group')).toBeInTheDocument()
      expect(screen.queryByTestId('palette-stage-$match')).not.toBeInTheDocument()
    })

    it('filter is case insensitive', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'MATCH')

      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
    })

    it('filters by stage description', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'filter')

      // $match description contains "filter"
      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
    })

    it('shows empty state when no stages match filter', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'nonexistent')

      expect(screen.getByTestId('no-stages-found')).toBeInTheDocument()
      expect(screen.getByText(/no stages found/i)).toBeInTheDocument()
    })

    it('clears filter when clear button clicked', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'match')

      expect(screen.queryByTestId('palette-stage-$group')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('clear-search-button'))

      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$group')).toBeInTheDocument()
      expect(screen.getByTestId('stage-palette-search')).toHaveValue('')
    })

    it('clears filter with Escape key', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const searchInput = screen.getByTestId('stage-palette-search')
      await user.type(searchInput, 'match')

      await user.keyboard('{Escape}')

      expect(searchInput).toHaveValue('')
      expect(screen.getByTestId('palette-stage-$group')).toBeInTheDocument()
    })

    it('matches partial stage names', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'proj')

      expect(screen.getByTestId('palette-stage-$project')).toBeInTheDocument()
    })

    it('matches multiple stages with common terms', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Both $limit and $skip might match "number" or similar
      await user.type(screen.getByTestId('stage-palette-search'), 'limit')

      expect(screen.getByTestId('palette-stage-$limit')).toBeInTheDocument()
    })
  })

  describe('click to add stage', () => {
    it('calls onStageAdd when stage is clicked', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$match'))

      expect(onStageAdd).toHaveBeenCalledWith('$match')
    })

    it('calls onStageAdd with correct stage type for $group', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$group'))

      expect(onStageAdd).toHaveBeenCalledWith('$group')
    })

    it('calls onStageAdd with correct stage type for $project', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$project'))

      expect(onStageAdd).toHaveBeenCalledWith('$project')
    })

    it('calls onStageAdd with correct stage type for $sort', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$sort'))

      expect(onStageAdd).toHaveBeenCalledWith('$sort')
    })

    it('calls onStageAdd with correct stage type for $limit', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$limit'))

      expect(onStageAdd).toHaveBeenCalledWith('$limit')
    })

    it('calls onStageAdd with correct stage type for $skip', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$skip'))

      expect(onStageAdd).toHaveBeenCalledWith('$skip')
    })

    it('calls onStageAdd with correct stage type for $lookup', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$lookup'))

      expect(onStageAdd).toHaveBeenCalledWith('$lookup')
    })

    it('calls onStageAdd with correct stage type for $unwind', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$unwind'))

      expect(onStageAdd).toHaveBeenCalledWith('$unwind')
    })

    it('calls onStageAdd with correct stage type for $addFields', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$addFields'))

      expect(onStageAdd).toHaveBeenCalledWith('$addFields')
    })

    it('calls onStageAdd with correct stage type for $count', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      await user.click(screen.getByTestId('palette-stage-$count'))

      expect(onStageAdd).toHaveBeenCalledWith('$count')
    })

    it('supports keyboard activation with Enter key', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      matchStage.focus()
      await user.keyboard('{Enter}')

      expect(onStageAdd).toHaveBeenCalledWith('$match')
    })

    it('supports keyboard activation with Space key', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      matchStage.focus()
      await user.keyboard(' ')

      expect(onStageAdd).toHaveBeenCalledWith('$match')
    })

    it('shows visual feedback when stage is clicked', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      await user.click(matchStage)

      // Check for click animation or visual feedback
      await waitFor(() => {
        expect(matchStage).toHaveClass('clicked')
      })
    })
  })

  describe('drag to canvas', () => {
    it('calls onStageDragStart when drag begins', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      fireEvent.dragStart(matchStage)

      expect(defaultProps.onStageDragStart).toHaveBeenCalledWith('$match')
    })

    it('sets dataTransfer data on drag start', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      const dataTransfer = {
        setData: vi.fn(),
        effectAllowed: '',
      }

      fireEvent.dragStart(matchStage, { dataTransfer })

      expect(dataTransfer.setData).toHaveBeenCalledWith(
        'application/json',
        JSON.stringify({ type: '$match' })
      )
    })

    it('sets effectAllowed to copy on drag start', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      const dataTransfer = {
        setData: vi.fn(),
        effectAllowed: '',
      }

      fireEvent.dragStart(matchStage, { dataTransfer })

      expect(dataTransfer.effectAllowed).toBe('copy')
    })

    it('calls onStageDragEnd when drag ends', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      fireEvent.dragStart(matchStage)
      fireEvent.dragEnd(matchStage)

      expect(defaultProps.onStageDragEnd).toHaveBeenCalled()
    })

    it('shows dragging visual state during drag', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      fireEvent.dragStart(matchStage)

      expect(matchStage).toHaveClass('dragging')
    })

    it('removes dragging visual state after drag ends', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      fireEvent.dragStart(matchStage)
      fireEvent.dragEnd(matchStage)

      expect(matchStage).not.toHaveClass('dragging')
    })

    it('includes stage type in drag data for $group', () => {
      render(<StagePalette {...defaultProps} />)

      const groupStage = screen.getByTestId('palette-stage-$group')
      const dataTransfer = {
        setData: vi.fn(),
        effectAllowed: '',
      }

      fireEvent.dragStart(groupStage, { dataTransfer })

      expect(dataTransfer.setData).toHaveBeenCalledWith(
        'application/json',
        JSON.stringify({ type: '$group' })
      )
    })

    it('supports touch-based drag on mobile devices', async () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')

      fireEvent.touchStart(matchStage, {
        touches: [{ clientX: 100, clientY: 100 }],
      })

      fireEvent.touchMove(matchStage, {
        touches: [{ clientX: 150, clientY: 150 }],
      })

      await waitFor(() => {
        expect(defaultProps.onStageDragStart).toHaveBeenCalledWith('$match')
      })
    })
  })

  describe('stage categories/grouping', () => {
    it('renders category headers', () => {
      render(<StagePalette {...defaultProps} />)

      expect(screen.getByText(/filtering/i)).toBeInTheDocument()
      expect(screen.getByText(/transformation/i)).toBeInTheDocument()
      expect(screen.getByText(/aggregation/i)).toBeInTheDocument()
    })

    it('groups $match under Filtering category', () => {
      render(<StagePalette {...defaultProps} />)

      const filteringCategory = screen.getByTestId('category-filtering')
      expect(within(filteringCategory).getByTestId('palette-stage-$match')).toBeInTheDocument()
    })

    it('groups $group under Aggregation category', () => {
      render(<StagePalette {...defaultProps} />)

      const aggregationCategory = screen.getByTestId('category-aggregation')
      expect(within(aggregationCategory).getByTestId('palette-stage-$group')).toBeInTheDocument()
    })

    it('groups $project under Transformation category', () => {
      render(<StagePalette {...defaultProps} />)

      const transformationCategory = screen.getByTestId('category-transformation')
      expect(within(transformationCategory).getByTestId('palette-stage-$project')).toBeInTheDocument()
    })

    it('groups $sort under Transformation category', () => {
      render(<StagePalette {...defaultProps} />)

      const transformationCategory = screen.getByTestId('category-transformation')
      expect(within(transformationCategory).getByTestId('palette-stage-$sort')).toBeInTheDocument()
    })

    it('groups $limit and $skip under Pagination category', () => {
      render(<StagePalette {...defaultProps} />)

      const paginationCategory = screen.getByTestId('category-pagination')
      expect(within(paginationCategory).getByTestId('palette-stage-$limit')).toBeInTheDocument()
      expect(within(paginationCategory).getByTestId('palette-stage-$skip')).toBeInTheDocument()
    })

    it('groups $lookup under Join category', () => {
      render(<StagePalette {...defaultProps} />)

      const joinCategory = screen.getByTestId('category-join')
      expect(within(joinCategory).getByTestId('palette-stage-$lookup')).toBeInTheDocument()
    })

    it('groups $unwind under Array category', () => {
      render(<StagePalette {...defaultProps} />)

      const arrayCategory = screen.getByTestId('category-array')
      expect(within(arrayCategory).getByTestId('palette-stage-$unwind')).toBeInTheDocument()
    })

    it('allows collapsing category sections', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filteringHeader = screen.getByTestId('category-header-filtering')
      await user.click(filteringHeader)

      expect(screen.queryByTestId('palette-stage-$match')).not.toBeVisible()
    })

    it('allows expanding collapsed category sections', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filteringHeader = screen.getByTestId('category-header-filtering')

      // Collapse
      await user.click(filteringHeader)
      expect(screen.queryByTestId('palette-stage-$match')).not.toBeVisible()

      // Expand
      await user.click(filteringHeader)
      expect(screen.getByTestId('palette-stage-$match')).toBeVisible()
    })

    it('persists category collapse state', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const filteringHeader = screen.getByTestId('category-header-filtering')
      await user.click(filteringHeader)

      // Check collapsed indicator
      expect(filteringHeader).toHaveAttribute('aria-expanded', 'false')
    })

    it('filter ignores collapsed categories and shows all matching stages', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      // Collapse filtering category
      await user.click(screen.getByTestId('category-header-filtering'))

      // Search should still show $match
      await user.type(screen.getByTestId('stage-palette-search'), 'match')

      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
    })
  })

  describe('stage descriptions/tooltips', () => {
    it('shows description text for $match stage', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(within(matchStage).getByText(/filter documents/i)).toBeInTheDocument()
    })

    it('shows description text for $group stage', () => {
      render(<StagePalette {...defaultProps} />)

      const groupStage = screen.getByTestId('palette-stage-$group')
      expect(within(groupStage).getByText(/group.*field/i)).toBeInTheDocument()
    })

    it('shows description text for $project stage', () => {
      render(<StagePalette {...defaultProps} />)

      const projectStage = screen.getByTestId('palette-stage-$project')
      expect(within(projectStage).getByText(/shape output/i)).toBeInTheDocument()
    })

    it('shows description text for $sort stage', () => {
      render(<StagePalette {...defaultProps} />)

      const sortStage = screen.getByTestId('palette-stage-$sort')
      expect(within(sortStage).getByText(/sort/i)).toBeInTheDocument()
    })

    it('shows description text for $limit stage', () => {
      render(<StagePalette {...defaultProps} />)

      const limitStage = screen.getByTestId('palette-stage-$limit')
      expect(within(limitStage).getByText(/limit/i)).toBeInTheDocument()
    })

    it('shows description text for $skip stage', () => {
      render(<StagePalette {...defaultProps} />)

      const skipStage = screen.getByTestId('palette-stage-$skip')
      expect(within(skipStage).getByText(/skip/i)).toBeInTheDocument()
    })

    it('shows description text for $lookup stage', () => {
      render(<StagePalette {...defaultProps} />)

      const lookupStage = screen.getByTestId('palette-stage-$lookup')
      expect(within(lookupStage).getByText(/join/i)).toBeInTheDocument()
    })

    it('shows description text for $unwind stage', () => {
      render(<StagePalette {...defaultProps} />)

      const unwindStage = screen.getByTestId('palette-stage-$unwind')
      expect(within(unwindStage).getByText(/array/i)).toBeInTheDocument()
    })

    it('shows description text for $addFields stage', () => {
      render(<StagePalette {...defaultProps} />)

      const addFieldsStage = screen.getByTestId('palette-stage-$addFields')
      expect(within(addFieldsStage).getByText(/add.*field/i)).toBeInTheDocument()
    })

    it('shows description text for $count stage', () => {
      render(<StagePalette {...defaultProps} />)

      const countStage = screen.getByTestId('palette-stage-$count')
      expect(within(countStage).getByText(/count/i)).toBeInTheDocument()
    })

    it('shows tooltip on hover with extended description', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      await user.hover(matchStage)

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument()
      })
    })

    it('tooltip contains stage usage example', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      await user.hover(matchStage)

      await waitFor(() => {
        const tooltip = screen.getByRole('tooltip')
        expect(tooltip).toHaveTextContent(/\$match.*:/i)
      })
    })

    it('hides tooltip when hover ends', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      await user.hover(matchStage)

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument()
      })

      await user.unhover(matchStage)

      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      })
    })
  })

  describe('accessibility', () => {
    it('has proper role for palette container', () => {
      render(<StagePalette {...defaultProps} />)

      const palette = screen.getByTestId('stage-palette')
      expect(palette).toHaveAttribute('role', 'region')
      expect(palette).toHaveAttribute('aria-label', expect.stringContaining('stage'))
    })

    it('stage items have button role', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).toHaveAttribute('role', 'button')
    })

    it('stage items have proper aria-label', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).toHaveAttribute('aria-label', expect.stringContaining('$match'))
    })

    it('stage items are focusable', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).toHaveAttribute('tabIndex', '0')
    })

    it('supports keyboard navigation between stages', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      const searchInput = screen.getByTestId('stage-palette-search')
      searchInput.focus()

      await user.tab()
      expect(screen.getByTestId('palette-stage-$match')).toHaveFocus()

      await user.tab()
      // Next stage should be focused
    })

    it('announces drag operation to screen readers', () => {
      render(<StagePalette {...defaultProps} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).toHaveAttribute('aria-roledescription', expect.stringContaining('draggable'))
    })

    it('category headers have proper aria attributes', () => {
      render(<StagePalette {...defaultProps} />)

      const filteringHeader = screen.getByTestId('category-header-filtering')
      expect(filteringHeader).toHaveAttribute('aria-expanded', 'true')
      expect(filteringHeader).toHaveAttribute('aria-controls')
    })

    it('search input has proper aria-label', () => {
      render(<StagePalette {...defaultProps} />)

      const searchInput = screen.getByTestId('stage-palette-search')
      expect(searchInput).toHaveAttribute('aria-label', expect.stringContaining('search'))
    })

    it('announces filter results to screen readers', async () => {
      const user = userEvent.setup()
      render(<StagePalette {...defaultProps} />)

      await user.type(screen.getByTestId('stage-palette-search'), 'match')

      const liveRegion = screen.getByRole('status')
      expect(liveRegion).toHaveTextContent(/1 stage found/i)
    })
  })

  describe('disabled state', () => {
    it('disables all stages when disabled prop is true', () => {
      render(<StagePalette {...defaultProps} disabled={true} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).toHaveAttribute('aria-disabled', 'true')
    })

    it('does not call onStageAdd when disabled', async () => {
      const user = userEvent.setup()
      const onStageAdd = vi.fn()
      render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} disabled={true} />)

      await user.click(screen.getByTestId('palette-stage-$match'))

      expect(onStageAdd).not.toHaveBeenCalled()
    })

    it('prevents drag when disabled', () => {
      render(<StagePalette {...defaultProps} disabled={true} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(matchStage).not.toHaveAttribute('draggable', 'true')
    })

    it('shows disabled visual state', () => {
      render(<StagePalette {...defaultProps} disabled={true} />)

      const palette = screen.getByTestId('stage-palette')
      expect(palette).toHaveClass('disabled')
    })
  })

  describe('compact mode', () => {
    it('renders in compact mode when compact prop is true', () => {
      render(<StagePalette {...defaultProps} compact={true} />)

      const palette = screen.getByTestId('stage-palette')
      expect(palette).toHaveClass('compact')
    })

    it('hides descriptions in compact mode', () => {
      render(<StagePalette {...defaultProps} compact={true} />)

      const matchStage = screen.getByTestId('palette-stage-$match')
      expect(within(matchStage).queryByTestId('stage-description')).not.toBeInTheDocument()
    })

    it('shows only stage type names in compact mode', () => {
      render(<StagePalette {...defaultProps} compact={true} />)

      expect(screen.getByText('$match')).toBeInTheDocument()
      expect(screen.queryByText(/filter documents/i)).not.toBeInTheDocument()
    })

    it('uses smaller spacing in compact mode', () => {
      render(<StagePalette {...defaultProps} compact={true} />)

      const stageItems = screen.getAllByTestId(/^palette-stage-/)
      // Check that compact class affects styling
      stageItems.forEach((item) => {
        expect(item).toHaveClass('compact')
      })
    })
  })

  describe('custom stage order', () => {
    it('accepts custom stage order via stageOrder prop', () => {
      render(
        <StagePalette
          {...defaultProps}
          stageOrder={['$limit', '$skip', '$match']}
        />
      )

      const stageItems = screen.getAllByTestId(/^palette-stage-/)
      expect(stageItems[0]).toHaveAttribute('data-testid', 'palette-stage-$limit')
      expect(stageItems[1]).toHaveAttribute('data-testid', 'palette-stage-$skip')
      expect(stageItems[2]).toHaveAttribute('data-testid', 'palette-stage-$match')
    })

    it('hides stages not in stageOrder when restrictToOrder is true', () => {
      render(
        <StagePalette
          {...defaultProps}
          stageOrder={['$match', '$group']}
          restrictToOrder={true}
        />
      )

      expect(screen.getByTestId('palette-stage-$match')).toBeInTheDocument()
      expect(screen.getByTestId('palette-stage-$group')).toBeInTheDocument()
      expect(screen.queryByTestId('palette-stage-$project')).not.toBeInTheDocument()
    })
  })

  describe('$vectorSearch and $search stages', () => {
    describe('$vectorSearch stage', () => {
      it('renders $vectorSearch in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$vectorSearch')).toBeInTheDocument()
      })

      it('displays $vectorSearch stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$vectorSearch')).toBeInTheDocument()
      })

      it('displays Vector Search friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Vector Search')).toBeInTheDocument()
      })

      it('shows description text for $vectorSearch stage', () => {
        render(<StagePalette {...defaultProps} />)
        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        expect(within(vectorSearchStage).getByText(/vector.*search|semantic.*search|embedding/i)).toBeInTheDocument()
      })

      it('has a drag handle icon for $vectorSearch', () => {
        render(<StagePalette {...defaultProps} />)
        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        expect(within(vectorSearchStage).getByTestId('stage-drag-icon')).toBeInTheDocument()
      })

      it('$vectorSearch stage is draggable', () => {
        render(<StagePalette {...defaultProps} />)
        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        expect(vectorSearchStage).toHaveAttribute('draggable', 'true')
      })

      it('calls onStageAdd with $vectorSearch when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$vectorSearch'))

        expect(onStageAdd).toHaveBeenCalledWith('$vectorSearch')
      })

      it('sets correct dataTransfer data when dragging $vectorSearch', () => {
        render(<StagePalette {...defaultProps} />)

        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        const dataTransfer = {
          setData: vi.fn(),
          effectAllowed: '',
        }

        fireEvent.dragStart(vectorSearchStage, { dataTransfer })

        expect(dataTransfer.setData).toHaveBeenCalledWith(
          'application/json',
          JSON.stringify({ type: '$vectorSearch' })
        )
      })

      it('groups $vectorSearch under Search category', () => {
        render(<StagePalette {...defaultProps} />)

        const searchCategory = screen.getByTestId('category-search')
        expect(within(searchCategory).getByTestId('palette-stage-$vectorSearch')).toBeInTheDocument()
      })

      it('filters to show $vectorSearch when searching for "vector"', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        await user.type(screen.getByTestId('stage-palette-search'), 'vector')

        expect(screen.getByTestId('palette-stage-$vectorSearch')).toBeInTheDocument()
      })

      it('filters to show $vectorSearch when searching for "semantic"', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        await user.type(screen.getByTestId('stage-palette-search'), 'semantic')

        expect(screen.getByTestId('palette-stage-$vectorSearch')).toBeInTheDocument()
      })
    })

    describe('$search stage', () => {
      it('renders $search in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$search')).toBeInTheDocument()
      })

      it('displays $search stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$search')).toBeInTheDocument()
      })

      it('displays Search friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Search')).toBeInTheDocument()
      })

      it('shows description text for $search stage', () => {
        render(<StagePalette {...defaultProps} />)
        const searchStage = screen.getByTestId('palette-stage-$search')
        expect(within(searchStage).getByText(/full.?text.*search|atlas.*search|search.*index/i)).toBeInTheDocument()
      })

      it('has a drag handle icon for $search', () => {
        render(<StagePalette {...defaultProps} />)
        const searchStage = screen.getByTestId('palette-stage-$search')
        expect(within(searchStage).getByTestId('stage-drag-icon')).toBeInTheDocument()
      })

      it('$search stage is draggable', () => {
        render(<StagePalette {...defaultProps} />)
        const searchStage = screen.getByTestId('palette-stage-$search')
        expect(searchStage).toHaveAttribute('draggable', 'true')
      })

      it('calls onStageAdd with $search when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$search'))

        expect(onStageAdd).toHaveBeenCalledWith('$search')
      })

      it('sets correct dataTransfer data when dragging $search', () => {
        render(<StagePalette {...defaultProps} />)

        const searchStage = screen.getByTestId('palette-stage-$search')
        const dataTransfer = {
          setData: vi.fn(),
          effectAllowed: '',
        }

        fireEvent.dragStart(searchStage, { dataTransfer })

        expect(dataTransfer.setData).toHaveBeenCalledWith(
          'application/json',
          JSON.stringify({ type: '$search' })
        )
      })

      it('groups $search under Search category', () => {
        render(<StagePalette {...defaultProps} />)

        const searchCategory = screen.getByTestId('category-search')
        expect(within(searchCategory).getByTestId('palette-stage-$search')).toBeInTheDocument()
      })

      it('filters to show $search when searching for "fulltext"', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        await user.type(screen.getByTestId('stage-palette-search'), 'fulltext')

        expect(screen.getByTestId('palette-stage-$search')).toBeInTheDocument()
      })

      it('filters to show $search when searching for "atlas"', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        await user.type(screen.getByTestId('stage-palette-search'), 'atlas')

        expect(screen.getByTestId('palette-stage-$search')).toBeInTheDocument()
      })
    })

    describe('Search category', () => {
      it('renders Search category header', () => {
        render(<StagePalette {...defaultProps} />)
        // Use getByTestId since there are multiple elements containing "search"
        expect(screen.getByTestId('category-header-search')).toBeInTheDocument()
      })

      it('Search category contains both $search and $vectorSearch', () => {
        render(<StagePalette {...defaultProps} />)

        const searchCategory = screen.getByTestId('category-search')
        expect(within(searchCategory).getByTestId('palette-stage-$search')).toBeInTheDocument()
        expect(within(searchCategory).getByTestId('palette-stage-$vectorSearch')).toBeInTheDocument()
      })

      it('allows collapsing Search category section', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const searchHeader = screen.getByTestId('category-header-search')
        await user.click(searchHeader)

        expect(screen.queryByTestId('palette-stage-$search')).not.toBeVisible()
        expect(screen.queryByTestId('palette-stage-$vectorSearch')).not.toBeVisible()
      })
    })

    describe('tooltips for search stages', () => {
      it('shows tooltip on hover for $vectorSearch with extended description', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        await user.hover(vectorSearchStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$vectorSearch.*:/i)
        })
      })

      it('shows tooltip on hover for $search with extended description', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const searchStage = screen.getByTestId('palette-stage-$search')
        await user.hover(searchStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$search.*:/i)
        })
      })
    })

    describe('keyboard accessibility for search stages', () => {
      it('$vectorSearch supports keyboard activation with Enter key', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        vectorSearchStage.focus()
        await user.keyboard('{Enter}')

        expect(onStageAdd).toHaveBeenCalledWith('$vectorSearch')
      })

      it('$search supports keyboard activation with Enter key', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        const searchStage = screen.getByTestId('palette-stage-$search')
        searchStage.focus()
        await user.keyboard('{Enter}')

        expect(onStageAdd).toHaveBeenCalledWith('$search')
      })

      it('$vectorSearch has proper aria-label', () => {
        render(<StagePalette {...defaultProps} />)

        const vectorSearchStage = screen.getByTestId('palette-stage-$vectorSearch')
        expect(vectorSearchStage).toHaveAttribute('aria-label', expect.stringContaining('$vectorSearch'))
      })

      it('$search has proper aria-label', () => {
        render(<StagePalette {...defaultProps} />)

        const searchStage = screen.getByTestId('palette-stage-$search')
        expect(searchStage).toHaveAttribute('aria-label', expect.stringContaining('$search'))
      })
    })
  })

  describe('frequently used stages', () => {
    it('shows frequently used section when frequentlyUsed prop provided', () => {
      render(
        <StagePalette
          {...defaultProps}
          frequentlyUsed={['$match', '$group', '$project']}
        />
      )

      expect(screen.getByTestId('category-frequently-used')).toBeInTheDocument()
    })

    it('displays frequently used stages at the top', () => {
      render(
        <StagePalette
          {...defaultProps}
          frequentlyUsed={['$match', '$group']}
        />
      )

      const frequentlyUsedSection = screen.getByTestId('category-frequently-used')
      expect(within(frequentlyUsedSection).getByTestId('palette-stage-$match')).toBeInTheDocument()
      expect(within(frequentlyUsedSection).getByTestId('palette-stage-$group')).toBeInTheDocument()
    })

    it('does not duplicate stages in frequently used and category sections', () => {
      render(
        <StagePalette
          {...defaultProps}
          frequentlyUsed={['$match']}
        />
      )

      // $match should only appear once (in frequently used, not in filtering)
      const allMatchStages = screen.getAllByTestId('palette-stage-$match')
      expect(allMatchStages).toHaveLength(1)
    })
  })

  // RED PHASE: Tests for new MongoDB aggregation stages
  // These tests will FAIL until the implementation is added
  describe('NEW STAGES - RED PHASE', () => {
    describe('$facet stage - Multi-faceted aggregation', () => {
      it('renders $facet in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$facet')).toBeInTheDocument()
      })

      it('displays $facet stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$facet')).toBeInTheDocument()
      })

      it('displays Facet friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Facet')).toBeInTheDocument()
      })

      it('shows description text for $facet stage', () => {
        render(<StagePalette {...defaultProps} />)
        const facetStage = screen.getByTestId('palette-stage-$facet')
        expect(within(facetStage).getByText(/multi.*facet|multiple.*pipeline|facet.*aggregation/i)).toBeInTheDocument()
      })

      it('has a drag handle icon for $facet', () => {
        render(<StagePalette {...defaultProps} />)
        const facetStage = screen.getByTestId('palette-stage-$facet')
        expect(within(facetStage).getByTestId('stage-drag-icon')).toBeInTheDocument()
      })

      it('$facet stage is draggable', () => {
        render(<StagePalette {...defaultProps} />)
        const facetStage = screen.getByTestId('palette-stage-$facet')
        expect(facetStage).toHaveAttribute('draggable', 'true')
      })

      it('calls onStageAdd with $facet when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$facet'))

        expect(onStageAdd).toHaveBeenCalledWith('$facet')
      })

      it('groups $facet under Aggregation category', () => {
        render(<StagePalette {...defaultProps} />)

        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$facet')).toBeInTheDocument()
      })

      it('tooltip contains $facet usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const facetStage = screen.getByTestId('palette-stage-$facet')
        await user.hover(facetStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$facet.*:/i)
        })
      })
    })

    describe('$bucket stage - Group into buckets', () => {
      it('renders $bucket in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$bucket')).toBeInTheDocument()
      })

      it('displays $bucket stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$bucket')).toBeInTheDocument()
      })

      it('displays Bucket friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Bucket')).toBeInTheDocument()
      })

      it('shows description text for $bucket stage', () => {
        render(<StagePalette {...defaultProps} />)
        const bucketStage = screen.getByTestId('palette-stage-$bucket')
        expect(within(bucketStage).getByText(/bucket|categori[zs]e.*value|group.*range/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $bucket when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$bucket'))

        expect(onStageAdd).toHaveBeenCalledWith('$bucket')
      })

      it('groups $bucket under Aggregation category', () => {
        render(<StagePalette {...defaultProps} />)

        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$bucket')).toBeInTheDocument()
      })

      it('tooltip contains $bucket usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const bucketStage = screen.getByTestId('palette-stage-$bucket')
        await user.hover(bucketStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$bucket.*:/i)
          expect(tooltip).toHaveTextContent(/boundaries/i)
        })
      })
    })

    describe('$bucketAuto stage - Auto-bucketing', () => {
      it('renders $bucketAuto in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$bucketAuto')).toBeInTheDocument()
      })

      it('displays $bucketAuto stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$bucketAuto')).toBeInTheDocument()
      })

      it('displays Bucket Auto friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Bucket Auto')).toBeInTheDocument()
      })

      it('shows description text for $bucketAuto stage', () => {
        render(<StagePalette {...defaultProps} />)
        const bucketAutoStage = screen.getByTestId('palette-stage-$bucketAuto')
        expect(within(bucketAutoStage).getByText(/auto.*bucket|automatic.*bucket|bucket.*automatic/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $bucketAuto when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$bucketAuto'))

        expect(onStageAdd).toHaveBeenCalledWith('$bucketAuto')
      })

      it('groups $bucketAuto under Aggregation category', () => {
        render(<StagePalette {...defaultProps} />)

        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$bucketAuto')).toBeInTheDocument()
      })

      it('tooltip contains $bucketAuto usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const bucketAutoStage = screen.getByTestId('palette-stage-$bucketAuto')
        await user.hover(bucketAutoStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$bucketAuto.*:/i)
          expect(tooltip).toHaveTextContent(/buckets/i)
        })
      })
    })

    describe('$graphLookup stage - Recursive lookup', () => {
      it('renders $graphLookup in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$graphLookup')).toBeInTheDocument()
      })

      it('displays $graphLookup stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$graphLookup')).toBeInTheDocument()
      })

      it('displays Graph Lookup friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Graph Lookup')).toBeInTheDocument()
      })

      it('shows description text for $graphLookup stage', () => {
        render(<StagePalette {...defaultProps} />)
        const graphLookupStage = screen.getByTestId('palette-stage-$graphLookup')
        expect(within(graphLookupStage).getByText(/recursive.*search|graph.*traversal|hierarchi/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $graphLookup when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$graphLookup'))

        expect(onStageAdd).toHaveBeenCalledWith('$graphLookup')
      })

      it('groups $graphLookup under Join category', () => {
        render(<StagePalette {...defaultProps} />)

        const joinCategory = screen.getByTestId('category-join')
        expect(within(joinCategory).getByTestId('palette-stage-$graphLookup')).toBeInTheDocument()
      })

      it('tooltip contains $graphLookup usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const graphLookupStage = screen.getByTestId('palette-stage-$graphLookup')
        await user.hover(graphLookupStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$graphLookup.*:/i)
          expect(tooltip).toHaveTextContent(/connectFromField/i)
        })
      })
    })

    describe('$replaceRoot stage - Replace document root', () => {
      it('renders $replaceRoot in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$replaceRoot')).toBeInTheDocument()
      })

      it('displays $replaceRoot stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$replaceRoot')).toBeInTheDocument()
      })

      it('displays Replace Root friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Replace Root')).toBeInTheDocument()
      })

      it('shows description text for $replaceRoot stage', () => {
        render(<StagePalette {...defaultProps} />)
        const replaceRootStage = screen.getByTestId('palette-stage-$replaceRoot')
        expect(within(replaceRootStage).getByText(/replace.*root|promote.*field|nested.*document/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $replaceRoot when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$replaceRoot'))

        expect(onStageAdd).toHaveBeenCalledWith('$replaceRoot')
      })

      it('groups $replaceRoot under Transformation category', () => {
        render(<StagePalette {...defaultProps} />)

        const transformationCategory = screen.getByTestId('category-transformation')
        expect(within(transformationCategory).getByTestId('palette-stage-$replaceRoot')).toBeInTheDocument()
      })

      it('tooltip contains $replaceRoot usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const replaceRootStage = screen.getByTestId('palette-stage-$replaceRoot')
        await user.hover(replaceRootStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$replaceRoot.*:/i)
          expect(tooltip).toHaveTextContent(/newRoot/i)
        })
      })
    })

    describe('$replaceWith stage - Replace document', () => {
      it('renders $replaceWith in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$replaceWith')).toBeInTheDocument()
      })

      it('displays $replaceWith stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$replaceWith')).toBeInTheDocument()
      })

      it('displays Replace With friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Replace With')).toBeInTheDocument()
      })

      it('shows description text for $replaceWith stage', () => {
        render(<StagePalette {...defaultProps} />)
        const replaceWithStage = screen.getByTestId('palette-stage-$replaceWith')
        expect(within(replaceWithStage).getByText(/replace.*document|alias.*replaceRoot/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $replaceWith when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$replaceWith'))

        expect(onStageAdd).toHaveBeenCalledWith('$replaceWith')
      })

      it('groups $replaceWith under Transformation category', () => {
        render(<StagePalette {...defaultProps} />)

        const transformationCategory = screen.getByTestId('category-transformation')
        expect(within(transformationCategory).getByTestId('palette-stage-$replaceWith')).toBeInTheDocument()
      })

      it('tooltip contains $replaceWith usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const replaceWithStage = screen.getByTestId('palette-stage-$replaceWith')
        await user.hover(replaceWithStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$replaceWith.*:/i)
        })
      })
    })

    describe('$merge stage - Merge results', () => {
      it('renders $merge in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$merge')).toBeInTheDocument()
      })

      it('displays $merge stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$merge')).toBeInTheDocument()
      })

      it('displays Merge friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Merge')).toBeInTheDocument()
      })

      it('shows description text for $merge stage', () => {
        render(<StagePalette {...defaultProps} />)
        const mergeStage = screen.getByTestId('palette-stage-$merge')
        expect(within(mergeStage).getByText(/merge.*result|write.*collection|output.*collection/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $merge when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$merge'))

        expect(onStageAdd).toHaveBeenCalledWith('$merge')
      })

      it('groups $merge under Aggregation category', () => {
        render(<StagePalette {...defaultProps} />)

        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$merge')).toBeInTheDocument()
      })

      it('tooltip contains $merge usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const mergeStage = screen.getByTestId('palette-stage-$merge')
        await user.hover(mergeStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$merge.*:/i)
          expect(tooltip).toHaveTextContent(/into/i)
        })
      })
    })

    describe('$out stage - Output to collection', () => {
      it('renders $out in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$out')).toBeInTheDocument()
      })

      it('displays $out stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$out')).toBeInTheDocument()
      })

      it('displays Out friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Out')).toBeInTheDocument()
      })

      it('shows description text for $out stage', () => {
        render(<StagePalette {...defaultProps} />)
        const outStage = screen.getByTestId('palette-stage-$out')
        expect(within(outStage).getByText(/write.*collection|output.*collection|replace.*collection/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $out when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$out'))

        expect(onStageAdd).toHaveBeenCalledWith('$out')
      })

      it('groups $out under Aggregation category', () => {
        render(<StagePalette {...defaultProps} />)

        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$out')).toBeInTheDocument()
      })

      it('tooltip contains $out usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const outStage = screen.getByTestId('palette-stage-$out')
        await user.hover(outStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$out.*:/i)
        })
      })
    })

    describe('$sample stage - Random sample', () => {
      it('renders $sample in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$sample')).toBeInTheDocument()
      })

      it('displays $sample stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$sample')).toBeInTheDocument()
      })

      it('displays Sample friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Sample')).toBeInTheDocument()
      })

      it('shows description text for $sample stage', () => {
        render(<StagePalette {...defaultProps} />)
        const sampleStage = screen.getByTestId('palette-stage-$sample')
        expect(within(sampleStage).getByText(/random.*sample|randomly.*select/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $sample when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$sample'))

        expect(onStageAdd).toHaveBeenCalledWith('$sample')
      })

      it('groups $sample under Aggregation category', () => {
        render(<StagePalette {...defaultProps} />)

        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$sample')).toBeInTheDocument()
      })

      it('tooltip contains $sample usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const sampleStage = screen.getByTestId('palette-stage-$sample')
        await user.hover(sampleStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$sample.*:/i)
          expect(tooltip).toHaveTextContent(/size/i)
        })
      })
    })

    describe('$set stage - Add/update fields (alias for $addFields)', () => {
      it('renders $set in the available stages', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByTestId('palette-stage-$set')).toBeInTheDocument()
      })

      it('displays $set stage type name', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('$set')).toBeInTheDocument()
      })

      it('displays Set friendly label', () => {
        render(<StagePalette {...defaultProps} />)
        expect(screen.getByText('Set')).toBeInTheDocument()
      })

      it('shows description text for $set stage', () => {
        render(<StagePalette {...defaultProps} />)
        const setStage = screen.getByTestId('palette-stage-$set')
        expect(within(setStage).getByText(/add.*field|set.*field|alias.*addFields/i)).toBeInTheDocument()
      })

      it('calls onStageAdd with $set when clicked', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        await user.click(screen.getByTestId('palette-stage-$set'))

        expect(onStageAdd).toHaveBeenCalledWith('$set')
      })

      it('groups $set under Transformation category', () => {
        render(<StagePalette {...defaultProps} />)

        const transformationCategory = screen.getByTestId('category-transformation')
        expect(within(transformationCategory).getByTestId('palette-stage-$set')).toBeInTheDocument()
      })

      it('tooltip contains $set usage example', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const setStage = screen.getByTestId('palette-stage-$set')
        await user.hover(setStage)

        await waitFor(() => {
          const tooltip = screen.getByRole('tooltip')
          expect(tooltip).toHaveTextContent(/\$set.*:/i)
        })
      })
    })

    describe('comprehensive new stages verification', () => {
      it('renders all 10 new stages in the palette', () => {
        render(<StagePalette {...defaultProps} />)

        // Verify all new stages are present
        expect(screen.getByTestId('palette-stage-$facet')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$bucket')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$bucketAuto')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$graphLookup')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$replaceRoot')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$replaceWith')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$merge')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$out')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$sample')).toBeInTheDocument()
        expect(screen.getByTestId('palette-stage-$set')).toBeInTheDocument()
      })

      it('all new stages are clickable and call onStageAdd', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        const newStages = [
          '$facet',
          '$bucket',
          '$bucketAuto',
          '$graphLookup',
          '$replaceRoot',
          '$replaceWith',
          '$merge',
          '$out',
          '$sample',
          '$set',
        ]

        for (const stage of newStages) {
          await user.click(screen.getByTestId(`palette-stage-${stage}`))
        }

        expect(onStageAdd).toHaveBeenCalledTimes(10)
        newStages.forEach((stage) => {
          expect(onStageAdd).toHaveBeenCalledWith(stage)
        })
      })

      it('all new stages have proper category grouping', () => {
        render(<StagePalette {...defaultProps} />)

        // Aggregation category stages
        const aggregationCategory = screen.getByTestId('category-aggregation')
        expect(within(aggregationCategory).getByTestId('palette-stage-$facet')).toBeInTheDocument()
        expect(within(aggregationCategory).getByTestId('palette-stage-$bucket')).toBeInTheDocument()
        expect(within(aggregationCategory).getByTestId('palette-stage-$bucketAuto')).toBeInTheDocument()
        expect(within(aggregationCategory).getByTestId('palette-stage-$merge')).toBeInTheDocument()
        expect(within(aggregationCategory).getByTestId('palette-stage-$out')).toBeInTheDocument()
        expect(within(aggregationCategory).getByTestId('palette-stage-$sample')).toBeInTheDocument()

        // Transformation category stages
        const transformationCategory = screen.getByTestId('category-transformation')
        expect(within(transformationCategory).getByTestId('palette-stage-$replaceRoot')).toBeInTheDocument()
        expect(within(transformationCategory).getByTestId('palette-stage-$replaceWith')).toBeInTheDocument()
        expect(within(transformationCategory).getByTestId('palette-stage-$set')).toBeInTheDocument()

        // Join category stages
        const joinCategory = screen.getByTestId('category-join')
        expect(within(joinCategory).getByTestId('palette-stage-$graphLookup')).toBeInTheDocument()
      })

      it('all new stages are searchable by name', async () => {
        const user = userEvent.setup()
        render(<StagePalette {...defaultProps} />)

        const searchTests = [
          { query: 'facet', expectedStage: '$facet' },
          { query: 'bucket', expectedStage: '$bucket' },
          { query: 'bucketAuto', expectedStage: '$bucketAuto' },
          { query: 'graphLookup', expectedStage: '$graphLookup' },
          { query: 'replaceRoot', expectedStage: '$replaceRoot' },
          { query: 'replaceWith', expectedStage: '$replaceWith' },
          { query: 'merge', expectedStage: '$merge' },
          { query: 'out', expectedStage: '$out' },
          { query: 'sample', expectedStage: '$sample' },
          { query: 'set', expectedStage: '$set' },
        ]

        for (const { query, expectedStage } of searchTests) {
          const searchInput = screen.getByTestId('stage-palette-search')
          await user.clear(searchInput)
          await user.type(searchInput, query)

          expect(screen.getByTestId(`palette-stage-${expectedStage}`)).toBeInTheDocument()

          // Clear for next search
          await user.clear(searchInput)
        }
      })

      it('all new stages support keyboard accessibility', async () => {
        const user = userEvent.setup()
        const onStageAdd = vi.fn()
        render(<StagePalette {...defaultProps} onStageAdd={onStageAdd} />)

        const newStages = [
          '$facet',
          '$bucket',
          '$bucketAuto',
          '$graphLookup',
          '$replaceRoot',
          '$replaceWith',
          '$merge',
          '$out',
          '$sample',
          '$set',
        ]

        for (const stage of newStages) {
          const stageElement = screen.getByTestId(`palette-stage-${stage}`)
          expect(stageElement).toHaveAttribute('role', 'button')
          expect(stageElement).toHaveAttribute('tabIndex', '0')
          expect(stageElement).toHaveAttribute('aria-label', expect.stringContaining(stage))

          // Test keyboard activation
          stageElement.focus()
          await user.keyboard('{Enter}')
        }

        expect(onStageAdd).toHaveBeenCalledTimes(10)
      })

      it('all new stages are draggable with correct data transfer', () => {
        render(<StagePalette {...defaultProps} />)

        const newStages = [
          '$facet',
          '$bucket',
          '$bucketAuto',
          '$graphLookup',
          '$replaceRoot',
          '$replaceWith',
          '$merge',
          '$out',
          '$sample',
          '$set',
        ]

        newStages.forEach((stage) => {
          const stageElement = screen.getByTestId(`palette-stage-${stage}`)
          expect(stageElement).toHaveAttribute('draggable', 'true')

          const dataTransfer = {
            setData: vi.fn(),
            effectAllowed: '',
          }

          fireEvent.dragStart(stageElement, { dataTransfer })

          expect(dataTransfer.setData).toHaveBeenCalledWith(
            'application/json',
            JSON.stringify({ type: stage })
          )
        })
      })
    })
  })
})
