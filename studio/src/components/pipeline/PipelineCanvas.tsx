import { useCallback, useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, InlineCode, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import { Menu, MenuItem } from '@leafygreen-ui/menu'
import Tooltip from '@leafygreen-ui/tooltip'
import type { AggregationStage, StageType } from '../olap/QueryBuilder'

// Extended AggregationStage type to include error and enabled properties
type ExtendedAggregationStage = AggregationStage & {
  enabled?: boolean
  _hasError?: boolean
  _errorMessage?: string
}

// Styles
const canvasStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 16px;
  background: ${palette.gray.light3};
  border-radius: 8px;
  overflow: auto;
`

const pipelineContainerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 200px;
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  border: 2px dashed ${palette.gray.light2};
  border-radius: 8px;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 12px;
  flex: 1;
`

const stageCardStyles = css`
  display: flex;
  flex-direction: column;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.2s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`

const stageCardDraggingStyles = css`
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  transform: scale(1.02);
  opacity: 0.9;
`

const stageCardOverlayStyles = css`
  ${stageCardStyles}
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  cursor: grabbing;
`

const stageCardDisabledStyles = css`
  opacity: 0.5;
  background: ${palette.gray.light3};
`

const stageCardErrorStyles = css`
  border-color: ${palette.red.base};
`

const stageHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${palette.gray.light3};
  border-bottom: 1px solid ${palette.gray.light2};
`

const stageHeaderLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const dragHandleStyles = css`
  cursor: grab;
  color: ${palette.gray.base};
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s ease;

  &:hover {
    background: ${palette.gray.light2};
    color: ${palette.gray.dark2};
  }

  &:active {
    cursor: grabbing;
  }
`

const stageActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const stageContentStyles = css`
  padding: 16px;
  font-family: 'Source Code Pro', monospace;
  font-size: 13px;
  color: ${palette.gray.dark2};
  background: ${palette.white};
  white-space: pre-wrap;
  word-break: break-all;
`

const connectorStyles = css`
  display: flex;
  justify-content: center;
  padding: 4px 0;
`

const connectorLineStyles = css`
  width: 2px;
  height: 20px;
  background: ${palette.green.base};
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid ${palette.green.base};
  }
`

const toolbarStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
`

const stageIndexStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${palette.green.dark1};
  color: ${palette.white};
  font-size: 12px;
  font-weight: 600;
`

const contextMenuStyles = css`
  position: fixed;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  min-width: 160px;
  z-index: 1000;
  padding: 4px 0;
`

const contextMenuItemStyles = css`
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const contextMenuItemDisabledStyles = css`
  opacity: 0.5;
  cursor: not-allowed;

  &:hover {
    background: transparent;
  }
`

const dropZoneStyles = css`
  height: 8px;
  margin: 4px 0;
  border-radius: 4px;
  transition: background 0.2s ease, height 0.2s ease;

  &[data-drag-over='true'] {
    height: 24px;
    background: ${palette.green.light2};
    border: 2px dashed ${palette.green.base};
  }
`

const expandedDetailsStyles = css`
  padding: 16px;
  background: ${palette.gray.light3};
  border-top: 1px solid ${palette.gray.light2};
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
`

const errorIndicatorStyles = css`
  display: flex;
  align-items: center;
  color: ${palette.red.base};
  cursor: help;
`

const toggleButtonStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;

  &[aria-pressed='true'] {
    background: ${palette.green.light2};
    color: ${palette.green.dark1};
  }

  &[aria-pressed='false'] {
    background: ${palette.gray.light2};
    color: ${palette.gray.dark1};
  }

  &:hover {
    opacity: 0.8;
  }
`

// Stage type configurations
const STAGE_TYPES: { value: StageType; label: string; description: string }[] = [
  { value: '$match', label: 'Match', description: 'Filter documents' },
  { value: '$group', label: 'Group', description: 'Aggregate by field' },
  { value: '$project', label: 'Project', description: 'Shape output' },
  { value: '$sort', label: 'Sort', description: 'Order results' },
  { value: '$limit', label: 'Limit', description: 'Limit count' },
  { value: '$skip', label: 'Skip', description: 'Skip documents' },
  { value: '$unwind', label: 'Unwind', description: 'Deconstruct arrays' },
]

export interface PipelineCanvasProps {
  stages: ExtendedAggregationStage[]
  onChange: (stages: ExtendedAggregationStage[]) => void
  onStageSelect?: (stageId: string | null) => void
  selectedStageId?: string | null
  confirmDelete?: boolean
  readOnly?: boolean
}

export function PipelineCanvas({
  stages,
  onChange,
  onStageSelect,
  selectedStageId,
  confirmDelete = false,
  readOnly = false,
}: PipelineCanvasProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stageIndex: number } | null>(null)
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null)
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set())
  const [dragOverZone, setDragOverZone] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      setActiveId(null)

      if (over && active.id !== over.id) {
        const oldIndex = stages.findIndex((s) => s.id === active.id)
        const newIndex = stages.findIndex((s) => s.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1) {
          onChange(arrayMove(stages, oldIndex, newIndex))
        }
      }
    },
    [stages, onChange]
  )

  const addStage = useCallback(
    (type: StageType) => {
      const newStage: ExtendedAggregationStage = {
        id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        enabled: true,
        ...(type === '$match' && { match: [{ field: '', operator: '$eq' as const, value: '' }] }),
        ...(type === '$group' && { groupBy: '', accumulators: [] }),
        ...(type === '$project' && { project: {} }),
        ...(type === '$sort' && { sort: {} }),
        ...(type === '$limit' && { limit: 10 }),
        ...(type === '$skip' && { skip: 0 }),
        ...(type === '$unwind' && { unwindPath: '' }),
      }
      onChange([...stages, newStage])
      onStageSelect?.(newStage.id)
    },
    [stages, onChange, onStageSelect]
  )

  const removeStage = useCallback(
    (index: number) => {
      const stageId = stages[index]?.id
      if (!stageId) return

      if (confirmDelete && deleteConfirmIndex === null) {
        setDeleteConfirmIndex(index)
        return
      }

      onChange(stages.filter((_, i) => i !== index))
      if (selectedStageId === stageId) {
        onStageSelect?.(null)
      }
      setDeleteConfirmIndex(null)
    },
    [stages, onChange, selectedStageId, onStageSelect, confirmDelete, deleteConfirmIndex]
  )

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirmIndex !== null) {
      const stageId = stages[deleteConfirmIndex]?.id
      onChange(stages.filter((_, i) => i !== deleteConfirmIndex))
      if (selectedStageId === stageId) {
        onStageSelect?.(null)
      }
      setDeleteConfirmIndex(null)
    }
  }, [deleteConfirmIndex, stages, onChange, selectedStageId, onStageSelect])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmIndex(null)
  }, [])

  const duplicateStage = useCallback(
    (index: number) => {
      const originalStage = stages[index]
      if (!originalStage) return

      const newStage: ExtendedAggregationStage = {
        ...structuredClone(originalStage),
        id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }

      const newStages = [...stages]
      newStages.splice(index + 1, 0, newStage)
      onChange(newStages)
    },
    [stages, onChange]
  )

  const toggleStage = useCallback(
    (index: number) => {
      const newStages = stages.map((stage, i) => {
        if (i === index) {
          return { ...stage, enabled: !(stage.enabled ?? true) }
        }
        return stage
      })
      onChange(newStages)
    },
    [stages, onChange]
  )

  const moveStageUp = useCallback(
    (index: number) => {
      if (index <= 0) return
      onChange(arrayMove(stages, index, index - 1))
      setContextMenu(null)
    },
    [stages, onChange]
  )

  const moveStageDown = useCallback(
    (index: number) => {
      if (index >= stages.length - 1) return
      onChange(arrayMove(stages, index, index + 1))
      setContextMenu(null)
    },
    [stages, onChange]
  )

  const toggleExpand = useCallback((index: number) => {
    setExpandedStages((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, index: number) => {
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY, stageIndex: index })
    },
    []
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selectedStageId) return

      const selectedIndex = stages.findIndex((s) => s.id === selectedStageId)
      if (selectedIndex === -1) return

      // Handle Delete key
      if (event.key === 'Delete') {
        event.preventDefault()
        removeStage(selectedIndex)
        return
      }

      // Handle Ctrl+D for duplicate
      if (event.ctrlKey && event.key === 'd') {
        event.preventDefault()
        duplicateStage(selectedIndex)
        return
      }

      // Handle Ctrl+ArrowUp for move up
      if (event.ctrlKey && event.key === 'ArrowUp') {
        event.preventDefault()
        moveStageUp(selectedIndex)
        return
      }

      // Handle Ctrl+ArrowDown for move down
      if (event.ctrlKey && event.key === 'ArrowDown') {
        event.preventDefault()
        moveStageDown(selectedIndex)
        return
      }

      // Handle ArrowUp/ArrowDown for navigation
      if (event.key === 'ArrowDown' && !event.ctrlKey) {
        event.preventDefault()
        const nextStageId = stages[selectedIndex + 1]?.id
        if (selectedIndex < stages.length - 1 && nextStageId) {
          onStageSelect?.(nextStageId)
        }
        return
      }

      if (event.key === 'ArrowUp' && !event.ctrlKey) {
        event.preventDefault()
        const prevStageId = stages[selectedIndex - 1]?.id
        if (selectedIndex > 0 && prevStageId) {
          onStageSelect?.(prevStageId)
        }
        return
      }
    },
    [selectedStageId, stages, removeStage, duplicateStage, moveStageUp, moveStageDown, onStageSelect]
  )

  const handleDropZoneDragEnter = useCallback((zoneId: string) => {
    setDragOverZone(zoneId)
  }, [])

  const handleDropZoneDragLeave = useCallback(() => {
    setDragOverZone(null)
  }, [])

  const handleDropZoneDrop = useCallback(
    (event: React.DragEvent, insertIndex: number) => {
      event.preventDefault()
      setDragOverZone(null)

      try {
        const data = event.dataTransfer.getData('text/plain')
        if (!data) return

        const stageData = JSON.parse(data)
        if (!stageData.type) return

        const newStage: ExtendedAggregationStage = {
          id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          type: stageData.type,
          enabled: true,
          ...(stageData.type === '$match' && { match: [{ field: '', operator: '$eq' as const, value: '' }] }),
          ...(stageData.type === '$group' && { groupBy: '', accumulators: [] }),
          ...(stageData.type === '$project' && { project: {} }),
          ...(stageData.type === '$sort' && { sort: {} }),
          ...(stageData.type === '$limit' && { limit: 10 }),
          ...(stageData.type === '$skip' && { skip: 0 }),
          ...(stageData.type === '$unwind' && { unwindPath: '' }),
        }

        const newStages = [...stages]
        newStages.splice(insertIndex, 0, newStage)
        onChange(newStages)
      } catch {
        // Invalid JSON, ignore
      }
    },
    [stages, onChange]
  )

  const activeStage = activeId ? stages.find((s) => s.id === activeId) : null

  // Render drop zone
  const renderDropZone = (id: string, insertIndex: number) => (
    <div
      key={id}
      data-testid={id}
      className={dropZoneStyles}
      data-drag-over={dragOverZone === id ? 'true' : undefined}
      onDragEnter={() => handleDropZoneDragEnter(id)}
      onDragLeave={handleDropZoneDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => handleDropZoneDrop(e, insertIndex)}
    />
  )

  return (
    <div
      ref={canvasRef}
      className={canvasStyles}
      data-testid="pipeline-canvas"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Subtitle>Pipeline Stages</Subtitle>

      <div className={pipelineContainerStyles}>
        {stages.length === 0 ? (
          <div className={emptyStateStyles} data-testid="pipeline-empty-state">
            <Icon glyph="Diagram2" size="xlarge" />
            <Body weight="medium">No stages in pipeline</Body>
            <Body>Add stages below to build your aggregation pipeline</Body>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {renderDropZone('drop-zone-start', 0)}
              {stages.map((stage, index) => (
                <div key={stage.id}>
                  <SortableStageCard
                    stage={stage}
                    index={index}
                    isSelected={selectedStageId === stage.id}
                    isExpanded={expandedStages.has(index)}
                    onSelect={() => onStageSelect?.(stage.id)}
                    onRemove={() => removeStage(index)}
                    onDuplicate={() => duplicateStage(index)}
                    onToggle={() => toggleStage(index)}
                    onExpand={() => toggleExpand(index)}
                    onCollapse={() => toggleExpand(index)}
                    onContextMenu={(e) => handleContextMenu(e, index)}
                    readOnly={readOnly}
                  />
                  {renderDropZone(`drop-zone-after-${index}`, index + 1)}
                  {index < stages.length - 1 && (
                    <div className={connectorStyles}>
                      <div className={connectorLineStyles} />
                    </div>
                  )}
                </div>
              ))}
            </SortableContext>

            <DragOverlay>
              {activeStage && (
                <StageCard
                  stage={activeStage}
                  index={stages.findIndex((s) => s.id === activeStage.id)}
                  isOverlay
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {!readOnly && (
        <div className={toolbarStyles}>
          <Menu
            trigger={
              <Button
                variant="primary"
                leftGlyph={<Icon glyph="Plus" />}
                data-testid="add-stage-button"
              >
                Add Stage
              </Button>
            }
          >
            {STAGE_TYPES.map(({ value, label, description }) => (
              <MenuItem
                key={value}
                onClick={() => addStage(value)}
                description={description}
                data-testid={`add-stage-${value.slice(1)}`}
              >
                {label} ({value})
              </MenuItem>
            ))}
          </Menu>

          {stages.length > 0 && (
            <Body style={{ color: palette.gray.dark1 }}>
              {stages.length} stage{stages.length === 1 ? '' : 's'}
            </Body>
          )}
        </div>
      )}

      {readOnly && stages.length > 0 && (
        <div className={toolbarStyles}>
          <Body style={{ color: palette.gray.dark1 }}>
            {stages.length} stage{stages.length === 1 ? '' : 's'}
          </Body>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className={contextMenuStyles}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="stage-context-menu"
        >
          <div
            className={`${contextMenuItemStyles} ${contextMenu.stageIndex === 0 ? contextMenuItemDisabledStyles : ''}`}
            onClick={() => contextMenu.stageIndex > 0 && moveStageUp(contextMenu.stageIndex)}
            data-testid="context-menu-move-up"
            aria-disabled={contextMenu.stageIndex === 0 ? 'true' : 'false'}
          >
            <Icon glyph="ChevronUp" size="small" />
            Move Up
          </div>
          <div
            className={`${contextMenuItemStyles} ${contextMenu.stageIndex === stages.length - 1 ? contextMenuItemDisabledStyles : ''}`}
            onClick={() => contextMenu.stageIndex < stages.length - 1 && moveStageDown(contextMenu.stageIndex)}
            data-testid="context-menu-move-down"
            aria-disabled={contextMenu.stageIndex === stages.length - 1 ? 'true' : 'false'}
          >
            <Icon glyph="ChevronDown" size="small" />
            Move Down
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmIndex !== null && (
        <div
          data-testid="delete-confirmation-dialog"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleCancelDelete}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: 24,
              borderRadius: 8,
              maxWidth: 400,
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Body>Are you sure you want to delete this stage?</Body>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button
                onClick={handleCancelDelete}
                data-testid="cancel-delete-button"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                data-testid="confirm-delete-button"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sortable stage card wrapper
interface SortableStageCardProps {
  stage: ExtendedAggregationStage
  index: number
  isSelected: boolean
  isExpanded: boolean
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
  onToggle: () => void
  onExpand: () => void
  onCollapse: () => void
  onContextMenu: (e: React.MouseEvent) => void
  readOnly: boolean
}

function SortableStageCard({
  stage,
  index,
  isSelected,
  isExpanded,
  onSelect,
  onRemove,
  onDuplicate,
  onToggle,
  onExpand,
  onCollapse,
  onContextMenu,
  readOnly,
}: SortableStageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <StageCard
        stage={stage}
        index={index}
        isSelected={isSelected}
        isDragging={isDragging}
        isExpanded={isExpanded}
        dragHandleProps={readOnly ? undefined : { ...attributes, ...listeners }}
        onSelect={onSelect}
        onRemove={readOnly ? undefined : onRemove}
        onDuplicate={readOnly ? undefined : onDuplicate}
        onToggle={readOnly ? undefined : onToggle}
        onExpand={onExpand}
        onCollapse={onCollapse}
        onContextMenu={onContextMenu}
      />
    </div>
  )
}

// Stage card component
interface StageCardProps {
  stage: ExtendedAggregationStage
  index: number
  isSelected?: boolean
  isDragging?: boolean
  isOverlay?: boolean
  isExpanded?: boolean
  dragHandleProps?: Record<string, unknown>
  onSelect?: () => void
  onRemove?: () => void
  onDuplicate?: () => void
  onToggle?: () => void
  onExpand?: () => void
  onCollapse?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function StageCard({
  stage,
  index,
  isSelected,
  isDragging,
  isOverlay,
  isExpanded,
  dragHandleProps,
  onSelect,
  onRemove,
  onDuplicate,
  onToggle,
  onExpand,
  onCollapse,
  onContextMenu,
}: StageCardProps) {
  const isEnabled = stage.enabled ?? true
  const hasError = stage._hasError ?? false

  const cardClassName = [
    isOverlay ? stageCardOverlayStyles : stageCardStyles,
    isDragging && !isOverlay ? stageCardDraggingStyles : '',
    !isEnabled ? stageCardDisabledStyles : '',
    hasError ? stageCardErrorStyles : '',
    isSelected
      ? css`
          border-color: ${palette.green.base};
          border-width: 2px;
        `
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const stagePreview = getStagePreview(stage)

  return (
    <div
      className={cardClassName}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      data-testid={`stage-card-${index}`}
      data-disabled={!isEnabled ? 'true' : undefined}
      data-has-error={hasError ? 'true' : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.()
        }
      }}
    >
      <div className={stageHeaderStyles}>
        <div className={stageHeaderLeftStyles}>
          {dragHandleProps && (
            <div
              className={dragHandleStyles}
              {...dragHandleProps}
              data-testid={`stage-drag-handle-${index}`}
            >
              <Icon glyph="Drag" />
            </div>
          )}
          <div className={stageIndexStyles}>{index + 1}</div>
          <InlineCode>{stage.type}</InlineCode>
          {hasError && (
            <Tooltip
              trigger={
                <div className={errorIndicatorStyles} data-testid={`stage-error-indicator-${index}`}>
                  <Icon glyph="Warning" />
                </div>
              }
            >
              {stage._errorMessage || 'Stage has errors'}
            </Tooltip>
          )}
        </div>

        <div className={stageActionsStyles}>
          {onToggle && (
            <button
              className={toggleButtonStyles}
              aria-label="Toggle stage"
              aria-pressed={isEnabled ? 'true' : 'false'}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              data-testid={`stage-toggle-${index}`}
            >
              <Icon glyph={isEnabled ? 'Visibility' : 'VisibilityOff'} size="small" />
            </button>
          )}
          {onExpand && !isExpanded && (
            <IconButton
              aria-label="Expand stage"
              onClick={(e) => {
                e.stopPropagation()
                onExpand()
              }}
              data-testid={`stage-expand-${index}`}
            >
              <Icon glyph="ChevronDown" />
            </IconButton>
          )}
          {onCollapse && isExpanded && (
            <IconButton
              aria-label="Collapse stage"
              onClick={(e) => {
                e.stopPropagation()
                onCollapse()
              }}
              data-testid={`stage-collapse-${index}`}
            >
              <Icon glyph="ChevronUp" />
            </IconButton>
          )}
          {onDuplicate && (
            <IconButton
              aria-label="Duplicate stage"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
              data-testid={`stage-duplicate-${index}`}
            >
              <Icon glyph="Clone" />
            </IconButton>
          )}
          {onRemove && (
            <IconButton
              aria-label="Remove stage"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              data-testid={`stage-remove-${index}`}
            >
              <Icon glyph="X" />
            </IconButton>
          )}
        </div>
      </div>

      <div className={stageContentStyles}>{stagePreview}</div>

      {isExpanded && (
        <div className={expandedDetailsStyles} data-testid={`stage-expanded-details-${index}`}>
          <pre data-testid={`stage-full-json-${index}`}>{JSON.stringify(stage, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

// Generate preview text for a stage
function getStagePreview(stage: ExtendedAggregationStage): string {
  switch (stage.type) {
    case '$match': {
      if (!stage.match || stage.match.length === 0) {
        return '{ }'
      }
      const conditions = stage.match
        .filter((c) => c.field)
        .map((c) => {
          if (c.operator === '$eq') {
            return `${c.field}: ${JSON.stringify(c.value)}`
          }
          return `${c.field}: { ${c.operator}: ${JSON.stringify(c.value)} }`
        })
      return `{ ${conditions.join(', ')} }`
    }

    case '$group': {
      const idPart = stage.groupBy ? `"$${stage.groupBy.replace(/^\$/, '')}"` : 'null'
      const accParts =
        stage.accumulators?.map((acc) => {
          if (acc.operator === '$count') {
            return `${acc.name}: { $sum: 1 }`
          }
          return `${acc.name}: { ${acc.operator}: "${acc.field}" }`
        }) || []
      return `{ _id: ${idPart}${accParts.length > 0 ? ', ' + accParts.join(', ') : ''} }`
    }

    case '$project': {
      const fields = Object.entries(stage.project || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return `{ ${fields || '...'} }`
    }

    case '$sort': {
      const fields = Object.entries(stage.sort || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return `{ ${fields || '...'} }`
    }

    case '$limit':
      return String(stage.limit ?? 10)

    case '$skip':
      return String(stage.skip ?? 0)

    case '$unwind':
      return `"$${stage.unwindPath || '...'}"`

    default:
      return '{ }'
  }
}

export default PipelineCanvas
