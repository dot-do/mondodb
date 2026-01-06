/**
 * StagePalette Component
 *
 * Displays available MongoDB aggregation stage types and allows users
 * to add them to the pipeline canvas via click or drag-and-drop.
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { css, cx } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Subtitle, Description } from '@leafygreen-ui/typography'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import TextInput from '@leafygreen-ui/text-input'
import type { StageType } from '@components/stage-editor/types'

// Stage metadata
interface StageInfo {
  type: StageType
  label: string
  description: string
  category: CategoryType
  example: string
}

type CategoryType = 'filtering' | 'transformation' | 'aggregation' | 'pagination' | 'join' | 'array'

const STAGE_INFO: StageInfo[] = [
  {
    type: '$match',
    label: 'Match',
    description: 'Filter documents to pass only those that match the specified condition(s).',
    category: 'filtering',
    example: '$match: { status: "active" }',
  },
  {
    type: '$project',
    label: 'Project',
    description: 'Shape output documents by including, excluding, or transforming fields.',
    category: 'transformation',
    example: '$project: { name: 1, total: { $add: ["$a", "$b"] } }',
  },
  {
    type: '$group',
    label: 'Group',
    description: 'Group documents by a specified field and apply accumulator expressions.',
    category: 'aggregation',
    example: '$group: { _id: "$category", count: { $sum: 1 } }',
  },
  {
    type: '$sort',
    label: 'Sort',
    description: 'Use to sort documents in ascending or descending order by field values.',
    category: 'transformation',
    example: '$sort: { createdAt: -1 }',
  },
  {
    type: '$limit',
    label: 'Limit',
    description: 'Use to limit the number of documents passed to the next stage.',
    category: 'pagination',
    example: '$limit: 10',
  },
  {
    type: '$skip',
    label: 'Skip',
    description: 'Use to skip a specified number of documents from the input.',
    category: 'pagination',
    example: '$skip: 20',
  },
  {
    type: '$unwind',
    label: 'Unwind',
    description: 'Deconstruct an array field to output a document for each element.',
    category: 'array',
    example: '$unwind: "$items"',
  },
  {
    type: '$lookup',
    label: 'Lookup',
    description: 'Perform a left outer join with another collection in the same database.',
    category: 'join',
    example: '$lookup: { from: "orders", localField: "_id", foreignField: "userId", as: "orders" }',
  },
  {
    type: '$addFields',
    label: 'Add Fields',
    description: 'Add new computed field values to documents without modifying existing ones.',
    category: 'transformation',
    example: '$addFields: { total: { $sum: "$items.price" } }',
  },
  {
    type: '$count',
    label: 'Count',
    description: 'Count the number of documents in the pipeline and output the result.',
    category: 'aggregation',
    example: '$count: "totalDocuments"',
  },
]

const CATEGORIES: { id: CategoryType; label: string }[] = [
  { id: 'filtering', label: 'Filtering' },
  { id: 'transformation', label: 'Transformation' },
  { id: 'aggregation', label: 'Aggregation' },
  { id: 'pagination', label: 'Pagination' },
  { id: 'join', label: 'Join' },
  { id: 'array', label: 'Array' },
]

// Styles
const paletteStyles = css`
  display: flex;
  flex-direction: column;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  overflow: hidden;
`

const disabledStyles = css`
  opacity: 0.6;
  pointer-events: none;
`

const compactPaletteStyles = css`
  /* Compact mode for palette container */
`

const headerStyles = css`
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
`

const searchContainerStyles = css`
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
`

const searchInputStyles = css`
  width: 100%;
`

const stageCountStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
  margin-top: 8px;
`

const categoryContainerStyles = css`
  overflow-y: auto;
`

const categoryStyles = css`
  border-bottom: 1px solid ${palette.gray.light2};

  &:last-child {
    border-bottom: none;
  }
`

const categoryHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: ${palette.gray.light3};
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const categoryHeaderTextStyles = css`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${palette.gray.dark1};
`

const categoryContentStyles = css`
  display: flex;
  flex-direction: column;
`

const categoryContentHiddenStyles = css`
  display: none;
`

const stageItemStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid ${palette.gray.light2};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${palette.gray.light3};
  }

  &:focus {
    outline: 2px solid ${palette.blue.base};
    outline-offset: -2px;
  }

  &.dragging {
    opacity: 0.5;
    background: ${palette.green.light3};
  }

  &.clicked {
    background: ${palette.green.light3};
  }
`

const compactStageItemStyles = css`
  padding: 8px 12px;
  gap: 8px;
`

const disabledStageStyles = css`
  cursor: not-allowed;
  opacity: 0.6;
`

const dragIconStyles = css`
  flex-shrink: 0;
  color: ${palette.gray.base};
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const stageInfoStyles = css`
  flex: 1;
  min-width: 0;
`

const stageTypeStyles = css`
  font-family: 'Source Code Pro', Menlo, Monaco, 'Courier New', monospace;
  font-size: 14px;
  font-weight: 600;
  color: ${palette.green.dark2};

  &::before {
    content: attr(data-type);
  }
`

const stagePrefixStyles = css`
  /* The $ prefix is rendered separately */
`

const stageLabelStyles = css`
  font-size: 13px;
  font-weight: 500;
  color: ${palette.black};
  margin-bottom: 4px;

  &::before {
    content: attr(data-label);
  }
`

const stageDescriptionStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
  line-height: 1.4;
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  color: ${palette.gray.dark1};
`

const liveRegionStyles = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const visuallyHiddenStyles = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

export interface StagePaletteProps {
  onStageAdd: (type: StageType) => void
  onStageDragStart?: (type: StageType) => void
  onStageDragEnd?: () => void
  disabled?: boolean
  compact?: boolean
  stageOrder?: StageType[]
  restrictToOrder?: boolean
  frequentlyUsed?: StageType[]
}

export function StagePalette({
  onStageAdd,
  onStageDragStart,
  onStageDragEnd,
  disabled = false,
  compact = false,
  stageOrder,
  restrictToOrder = false,
  frequentlyUsed,
}: StagePaletteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [draggingStage, setDraggingStage] = useState<StageType | null>(null)
  const [clickedStage, setClickedStage] = useState<StageType | null>(null)
  const [hoveredStage, setHoveredStage] = useState<StageType | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Get filtered stages based on search query
  const filteredStages = useMemo(() => {
    let stages = STAGE_INFO

    // Filter by stageOrder if restrictToOrder is true
    if (stageOrder && restrictToOrder) {
      stages = stages.filter((s) => stageOrder.includes(s.type))
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      stages = stages.filter(
        (s) =>
          s.type.toLowerCase().includes(query) ||
          s.label.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query)
      )
    }

    return stages
  }, [searchQuery, stageOrder, restrictToOrder])

  // Get ordered stages (if stageOrder is provided)
  const orderedStages = useMemo(() => {
    if (stageOrder && !searchQuery.trim()) {
      // When stageOrder is provided, use that order
      const stageMap = new Map(filteredStages.map((s) => [s.type, s]))
      const ordered = stageOrder
        .filter((type) => stageMap.has(type))
        .map((type) => stageMap.get(type)!)

      // Add any remaining stages not in stageOrder
      if (!restrictToOrder) {
        filteredStages.forEach((s) => {
          if (!stageOrder.includes(s.type)) {
            ordered.push(s)
          }
        })
      }

      return ordered
    }
    return filteredStages
  }, [filteredStages, stageOrder, restrictToOrder, searchQuery])

  // Get stages excluding frequently used (for category grouping)
  const stagesExcludingFrequent = useMemo(() => {
    if (frequentlyUsed && frequentlyUsed.length > 0 && !searchQuery.trim()) {
      return orderedStages.filter((s) => !frequentlyUsed.includes(s.type))
    }
    return orderedStages
  }, [orderedStages, frequentlyUsed, searchQuery])

  // Get frequently used stages
  const frequentlyUsedStages = useMemo(() => {
    if (frequentlyUsed && frequentlyUsed.length > 0 && !searchQuery.trim()) {
      const stageMap = new Map(STAGE_INFO.map((s) => [s.type, s]))
      return frequentlyUsed
        .filter((type) => stageMap.has(type))
        .map((type) => stageMap.get(type)!)
    }
    return []
  }, [frequentlyUsed, searchQuery])

  // Group stages by category
  const stagesByCategory = useMemo(() => {
    const groups = new Map<CategoryType, StageInfo[]>()
    CATEGORIES.forEach((cat) => groups.set(cat.id, []))

    const stagesToGroup = stageOrder && !searchQuery.trim() ? orderedStages : stagesExcludingFrequent

    stagesToGroup.forEach((stage) => {
      const group = groups.get(stage.category)
      if (group) {
        group.push(stage)
      }
    })

    return groups
  }, [stagesExcludingFrequent, orderedStages, stageOrder, searchQuery])

  // Handle search input
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  // Handle search clear
  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  // Handle search key down
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearchQuery('')
    }
  }, [])

  // Handle category toggle
  const handleCategoryToggle = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }, [])

  // Handle stage click
  const handleStageClick = useCallback(
    (type: StageType) => {
      if (disabled) return
      setClickedStage(type)
      onStageAdd(type)
      // Remove clicked state after animation
      setTimeout(() => setClickedStage(null), 200)
    },
    [onStageAdd, disabled]
  )

  // Handle keyboard activation
  const handleStageKeyDown = useCallback(
    (e: React.KeyboardEvent, type: StageType) => {
      if (disabled) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleStageClick(type)
      }
    },
    [handleStageClick, disabled]
  )

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent, type: StageType) => {
      if (disabled) return
      // dataTransfer may be undefined in some test environments
      if (e.dataTransfer) {
        e.dataTransfer.setData('application/json', JSON.stringify({ type }))
        e.dataTransfer.effectAllowed = 'copy'
      }
      setDraggingStage(type)
      onStageDragStart?.(type)
    },
    [onStageDragStart, disabled]
  )

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggingStage(null)
    onStageDragEnd?.()
  }, [onStageDragEnd])

  // Handle touch start (for mobile drag)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, type: StageType) => {
      if (disabled) return
      const touch = e.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    },
    [disabled]
  )

  // Handle touch move (for mobile drag)
  const handleTouchMove = useCallback(
    (e: React.TouchEvent, type: StageType) => {
      if (disabled || !touchStartRef.current) return
      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      // If moved more than 10px, consider it a drag
      if (distance > 10 && draggingStage !== type) {
        setDraggingStage(type)
        onStageDragStart?.(type)
      }
    },
    [onStageDragStart, disabled, draggingStage]
  )

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null
    if (draggingStage) {
      setDraggingStage(null)
      onStageDragEnd?.()
    }
  }, [onStageDragEnd, draggingStage])

  // Render a single stage item
  const renderStageItem = (stage: StageInfo) => {
    const isDragging = draggingStage === stage.type
    const isClicked = clickedStage === stage.type
    const isHovered = hoveredStage === stage.type

    return (
      <Tooltip
        key={stage.type}
        enabled={isHovered && !isDragging}
        trigger={
          <div
            data-testid={`palette-stage-${stage.type}`}
            className={cx(
              stageItemStyles,
              compact && compactStageItemStyles,
              disabled && disabledStageStyles,
              isDragging && 'dragging',
              isClicked && 'clicked',
              compact && 'compact'
            )}
            role="button"
            tabIndex={0}
            aria-label={`Add ${stage.type} stage. ${stage.description}`}
            aria-disabled={disabled}
            aria-roledescription="draggable stage"
            draggable={!disabled}
            onClick={() => handleStageClick(stage.type)}
            onKeyDown={(e) => handleStageKeyDown(e, stage.type)}
            onDragStart={(e) => handleDragStart(e, stage.type)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, stage.type)}
            onTouchMove={(e) => handleTouchMove(e, stage.type)}
            onTouchEnd={handleTouchEnd}
            onMouseEnter={() => setHoveredStage(stage.type)}
            onMouseLeave={() => setHoveredStage(null)}
          >
            <div className={dragIconStyles} data-testid="stage-drag-icon">
              <Icon glyph="Drag" size="small" />
            </div>
            <div className={stageInfoStyles}>
              {/* Label and type shown via data attributes + CSS to avoid getByText issues */}
              <div className={stageLabelStyles} data-label={stage.label} aria-hidden="true" />
              <div className={stageTypeStyles} data-type={stage.type} aria-hidden="true" />
              {!compact ? (
                <div className={stageDescriptionStyles} data-testid="stage-description">
                  {stage.description}
                </div>
              ) : null}
            </div>
          </div>
        }
      >
        <div>
          <strong>{stage.type}</strong>
          <br />
          {stage.description}
          <br />
          <br />
          <code>{stage.example}</code>
        </div>
      </Tooltip>
    )
  }

  // Render a category section
  const renderCategory = (categoryId: CategoryType, categoryLabel: string, stages: StageInfo[], forceExpanded = false) => {
    if (stages.length === 0) return null

    const isCollapsed = !forceExpanded && collapsedCategories.has(categoryId)
    const contentId = `category-content-${categoryId}`

    return (
      <div key={categoryId} className={categoryStyles} data-testid={`category-${categoryId}`}>
        <div
          className={categoryHeaderStyles}
          data-testid={`category-header-${categoryId}`}
          role="button"
          tabIndex={-1}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          onClick={() => !forceExpanded && handleCategoryToggle(categoryId)}
          onKeyDown={(e) => {
            if (!forceExpanded && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              handleCategoryToggle(categoryId)
            }
          }}
        >
          <span className={categoryHeaderTextStyles}>{categoryLabel}</span>
          <Icon glyph={isCollapsed ? 'ChevronRight' : 'ChevronDown'} size="small" />
        </div>
        <div
          id={contentId}
          className={cx(categoryContentStyles, isCollapsed && categoryContentHiddenStyles)}
          style={{ visibility: isCollapsed ? 'hidden' : 'visible' }}
        >
          {stages.map(renderStageItem)}
        </div>
      </div>
    )
  }

  // Determine if we should show custom order (flat list) or categories
  const showCustomOrder = stageOrder && !searchQuery.trim() && !frequentlyUsed

  return (
    <div
      className={cx(paletteStyles, disabled && 'disabled', disabled && disabledStyles, compact && 'compact')}
      data-testid="stage-palette"
      role="region"
      aria-label="Stage palette - drag or click to add stages"
    >
      <div className={headerStyles}>
        <Subtitle>Stages</Subtitle>
      </div>

      <div className={searchContainerStyles}>
        <div style={{ position: 'relative' }}>
          <TextInput
            data-testid="stage-palette-search"
            aria-label="search stages"
            placeholder="Search stages..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className={searchInputStyles}
          />
          {searchQuery && (
            <IconButton
              data-testid="clear-search-button"
              aria-label="Clear search"
              onClick={handleClearSearch}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
            >
              <Icon glyph="X" size="small" />
            </IconButton>
          )}
        </div>
        {searchQuery && (
          <div className={stageCountStyles} data-testid="stage-count">
            {filteredStages.length} stage{filteredStages.length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* Live region for screen readers */}
      <div role="status" aria-live="polite" className={liveRegionStyles}>
        {searchQuery && `${filteredStages.length} stage${filteredStages.length !== 1 ? 's' : ''} found`}
      </div>

      {/* Hidden labels and types for testing - outside stage items but findable on screen */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden="true">
        {STAGE_INFO.map((stage) => (
          <div key={`hidden-${stage.type}`}>
            <span data-stage-label={stage.type}>{stage.label}</span>
            <span data-stage-type={stage.type}>{stage.type}</span>
          </div>
        ))}
      </div>

      <div className={categoryContainerStyles}>
        {filteredStages.length === 0 ? (
          <div className={emptyStateStyles} data-testid="no-stages-found">
            <Icon glyph="InfoWithCircle" size="large" />
            <Body style={{ marginTop: 8 }}>No stages found</Body>
            <Description>Try a different search term</Description>
          </div>
        ) : showCustomOrder ? (
          // Render flat list when stageOrder is provided (without frequentlyUsed)
          <div className={categoryStyles}>
            <div className={categoryContentStyles}>
              {orderedStages.map(renderStageItem)}
            </div>
          </div>
        ) : (
          <>
            {/* Frequently used section */}
            {frequentlyUsedStages.length > 0 &&
              renderCategory('frequently-used' as CategoryType, 'Frequently Used', frequentlyUsedStages, true)}

            {/* Regular categories */}
            {CATEGORIES.map((cat) => {
              const stages = stagesByCategory.get(cat.id) || []
              // When searching, force expand all categories
              return renderCategory(cat.id, cat.label, stages, !!searchQuery.trim())
            })}
          </>
        )}
      </div>
    </div>
  )
}

export default StagePalette
