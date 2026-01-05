import { useCallback, useState } from 'react'
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
import type { AggregationStage, StageType } from '../olap/QueryBuilder'

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
  stages: AggregationStage[]
  onChange: (stages: AggregationStage[]) => void
  onStageSelect?: (stageId: string | null) => void
  selectedStageId?: string | null
}

export function PipelineCanvas({
  stages,
  onChange,
  onStageSelect,
  selectedStageId,
}: PipelineCanvasProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

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
      const newStage: AggregationStage = {
        id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
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
    (id: string) => {
      onChange(stages.filter((s) => s.id !== id))
      if (selectedStageId === id) {
        onStageSelect?.(null)
      }
    },
    [stages, onChange, selectedStageId, onStageSelect]
  )

  const duplicateStage = useCallback(
    (id: string) => {
      const stageIndex = stages.findIndex((s) => s.id === id)
      if (stageIndex === -1) return

      const originalStage = stages[stageIndex]
      const newStage: AggregationStage = {
        ...JSON.parse(JSON.stringify(originalStage)),
        id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }

      const newStages = [...stages]
      newStages.splice(stageIndex + 1, 0, newStage)
      onChange(newStages)
    },
    [stages, onChange]
  )

  const activeStage = activeId ? stages.find((s) => s.id === activeId) : null

  return (
    <div className={canvasStyles} data-testid="pipeline-canvas">
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
              {stages.map((stage, index) => (
                <div key={stage.id}>
                  <SortableStageCard
                    stage={stage}
                    index={index}
                    isSelected={selectedStageId === stage.id}
                    onSelect={() => onStageSelect?.(stage.id)}
                    onRemove={() => removeStage(stage.id)}
                    onDuplicate={() => duplicateStage(stage.id)}
                  />
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
    </div>
  )
}

// Sortable stage card wrapper
interface SortableStageCardProps {
  stage: AggregationStage
  index: number
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
  onDuplicate: () => void
}

function SortableStageCard({
  stage,
  index,
  isSelected,
  onSelect,
  onRemove,
  onDuplicate,
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
        dragHandleProps={{ ...attributes, ...listeners }}
        onSelect={onSelect}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
      />
    </div>
  )
}

// Stage card component
interface StageCardProps {
  stage: AggregationStage
  index: number
  isSelected?: boolean
  isDragging?: boolean
  isOverlay?: boolean
  dragHandleProps?: Record<string, unknown>
  onSelect?: () => void
  onRemove?: () => void
  onDuplicate?: () => void
}

function StageCard({
  stage,
  index,
  isSelected,
  isDragging,
  isOverlay,
  dragHandleProps,
  onSelect,
  onRemove,
  onDuplicate,
}: StageCardProps) {
  const cardClassName = [
    isOverlay ? stageCardOverlayStyles : stageCardStyles,
    isDragging && !isOverlay ? stageCardDraggingStyles : '',
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
      data-testid={`stage-card-${index}`}
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
        </div>

        <div className={stageActionsStyles}>
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
    </div>
  )
}

// Generate preview text for a stage
function getStagePreview(stage: AggregationStage): string {
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
