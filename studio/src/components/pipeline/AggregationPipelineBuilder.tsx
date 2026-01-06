/**
 * Aggregation Pipeline Builder
 * Main component for building MongoDB aggregation pipelines
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, H3, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import Modal from '@leafygreen-ui/modal'
import TextInput from '@leafygreen-ui/text-input'
import TextArea from '@leafygreen-ui/text-area'
import Checkbox from '@leafygreen-ui/checkbox'
import { Select, Option } from '@leafygreen-ui/select'
import Toggle from '@leafygreen-ui/toggle'

import {
  runPipeline,
  saveTemplate,
  loadTemplate,
  listTemplates,
  deleteTemplate,
  stagesToPipeline,
  type PipelineTemplate,
} from '@/api/aggregation'

import {
  MatchStageEditor,
  GroupStageEditor,
  SortStageEditor,
  ProjectStageEditor,
  LimitStageEditor,
  SkipStageEditor,
  LookupStageEditor,
  UnwindStageEditor,
  AddFieldsStageEditor,
  CountStageEditor,
  type AggregationStage,
  type StageType,
  type MatchStage,
  type GroupStage,
  type SortStage,
  type ProjectStage,
  type LimitStage,
  type SkipStage,
  type LookupStage,
  type UnwindStage,
  type AddFieldsStage,
  type CountStage,
} from '@components/stage-editor'

// Stage type metadata
const STAGE_TYPES: { type: StageType; label: string; description: string }[] = [
  { type: '$match', label: 'Match', description: 'Filter documents' },
  { type: '$group', label: 'Group', description: 'Group by field' },
  { type: '$sort', label: 'Sort', description: 'Sort documents' },
  { type: '$project', label: 'Project', description: 'Shape output' },
  { type: '$limit', label: 'Limit', description: 'Limit results' },
  { type: '$skip', label: 'Skip', description: 'Skip documents' },
  { type: '$lookup', label: 'Lookup', description: 'Join collections' },
  { type: '$unwind', label: 'Unwind', description: 'Flatten arrays' },
  { type: '$addFields', label: 'Add Fields', description: 'Add computed fields' },
  { type: '$count', label: 'Count', description: 'Count documents' },
]

// Helper to get label from stage type
function getStageLabelFromType(type: StageType): string {
  const stageInfo = STAGE_TYPES.find((s) => s.type === type)
  return stageInfo?.label || type.replace('$', '')
}

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${palette.white};
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 16px;
`

const headerRightStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const toolbarStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-bottom: 1px solid ${palette.gray.light2};
`

const mainContentStyles = css`
  display: flex;
  flex: 1;
  overflow: hidden;
`

const palettePanelStyles = css`
  width: 200px;
  border-right: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
  overflow-y: auto;
  padding: 16px;
`

const canvasPanelStyles = css`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: ${palette.white};
`

const editorPanelStyles = css`
  width: 350px;
  border-left: 1px solid ${palette.gray.light2};
  overflow-y: auto;
  padding: 16px;
  background: ${palette.white};
`

const resultsPanelStyles = css`
  width: 350px;
  border-left: 1px solid ${palette.gray.light2};
  overflow-y: auto;
  padding: 16px;
  background: ${palette.gray.light3};
`

const stageItemStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${palette.green.base};
    background: ${palette.green.light3};
  }
`

const pipelineStageStyles = css`
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.15s ease;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
`

const pipelineStageDisabledStyles = css`
  opacity: 0.5;
`

const pipelineStageSelectedStyles = css`
  border-color: ${palette.green.base};
  box-shadow: 0 0 0 2px ${palette.green.light3};
`

const stageHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: ${palette.gray.light3};
  border-bottom: 1px solid ${palette.gray.light2};
`

const stageHeaderLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const stageActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const dragHandleStyles = css`
  cursor: grab;
  color: ${palette.gray.base};
  display: flex;
  align-items: center;

  &:hover {
    color: ${palette.gray.dark2};
  }

  &:active {
    cursor: grabbing;
  }
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: ${palette.gray.dark1};
  gap: 12px;
`

const resultsContainerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const resultCountStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.green.light3};
  border-radius: 6px;
  font-size: 14px;
`

const resultDocumentStyles = css`
  padding: 12px;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
`

const errorStyles = css`
  padding: 12px;
  background: ${palette.red.light3};
  border: 1px solid ${palette.red.light2};
  border-radius: 6px;
  color: ${palette.red.dark2};
`

const loadingStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: ${palette.gray.dark1};
`

const warningStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.yellow.light3};
  border: 1px solid ${palette.yellow.light2};
  border-radius: 6px;
  color: ${palette.yellow.dark2};
  font-size: 13px;
`

const validationErrorStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border: 1px solid ${palette.red.light2};
  border-radius: 6px;
  color: ${palette.red.dark2};
  font-size: 13px;
  margin-top: 4px;
`

const validStatusStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.green.light3};
  border: 1px solid ${palette.green.light2};
  border-radius: 6px;
  color: ${palette.green.dark2};
  font-size: 13px;
`

const dialogContentStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const jsonContentStyles = css`
  padding: 16px;
  background: ${palette.gray.light3};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  font-family: 'Source Code Pro', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
`

const templateListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
`

const templateItemStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const templateItemSelectedStyles = css`
  border-color: ${palette.green.base};
  background: ${palette.green.light3};
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

const collapseButtonStyles = css`
  display: none;
  @media (max-width: 768px) {
    display: flex;
  }
`

const mobileTabsStyles = css`
  display: none;
  @media (max-width: 480px) {
    display: flex;
    gap: 4px;
    padding: 8px;
    background: ${palette.gray.light3};
    border-bottom: 1px solid ${palette.gray.light2};
  }
`

const autoRunRowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const sampleSizeRowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

// Props
export interface AggregationPipelineBuilderProps {
  database: string
  collection: string
  onPipelineChange?: (stages: AggregationStage[]) => void
  initialPipeline?: Record<string, unknown>[]
}

export function AggregationPipelineBuilder({
  database,
  collection,
  onPipelineChange,
  initialPipeline,
}: AggregationPipelineBuilderProps) {
  // State
  const [stages, setStages] = useState<AggregationStage[]>([])
  const [selectedStageIndex, setSelectedStageIndex] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null)
  const [resultCount, setResultCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoRun, setAutoRun] = useState(false)
  const [sampleSize, setSampleSize] = useState(20)

  // Dialogs
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showReplaceWarning, setShowReplaceWarning] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Template state
  const [templates, setTemplates] = useState<PipelineTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateSearch, setTemplateSearch] = useState('')
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null)
  const [includeDisabledInExport, setIncludeDisabledInExport] = useState(false)
  const [pendingTemplateLoad, setPendingTemplateLoad] = useState<string | null>(null)

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // Accessibility announcements
  const [announcement, setAnnouncement] = useState('')

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)

  // Generate unique ID
  const generateId = () => `stage-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Create default stage based on type
  const createDefaultStage = useCallback((type: StageType): AggregationStage => {
    const id = generateId()
    const base = { id, type, enabled: true }

    switch (type) {
      case '$match':
        return {
          ...base,
          type: '$match',
          conditions: [{ id: generateId(), field: '', operator: '$eq', value: '' }],
          useRawJson: false,
          rawJson: '',
        } as MatchStage

      case '$group':
        return {
          ...base,
          type: '$group',
          groupByField: '',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [],
          useRawJson: false,
          rawJson: '',
        } as GroupStage

      case '$sort':
        return {
          ...base,
          type: '$sort',
          fields: [],
        } as SortStage

      case '$project':
        return {
          ...base,
          type: '$project',
          fields: [],
          useRawJson: false,
          rawJson: '',
        } as ProjectStage

      case '$limit':
        return {
          ...base,
          type: '$limit',
          limit: 10,
        } as LimitStage

      case '$skip':
        return {
          ...base,
          type: '$skip',
          skip: 0,
        } as SkipStage

      case '$lookup':
        return {
          ...base,
          type: '$lookup',
          config: { from: '', localField: '', foreignField: '', as: '' },
          usePipeline: false,
          pipelineJson: '',
        } as LookupStage

      case '$unwind':
        return {
          ...base,
          type: '$unwind',
          config: { path: '', preserveNullAndEmptyArrays: false },
        } as UnwindStage

      case '$addFields':
        return {
          ...base,
          type: '$addFields',
          fields: [],
          useRawJson: false,
          rawJson: '',
        } as AddFieldsStage

      case '$count':
        return {
          ...base,
          type: '$count',
          outputField: 'count',
        } as CountStage

      default:
        throw new Error(`Unknown stage type: ${type}`)
    }
  }, [])

  // Parse initial pipeline
  useEffect(() => {
    if (initialPipeline && initialPipeline.length > 0) {
      const parsedStages = initialPipeline.map((stageObj) => {
        const type = Object.keys(stageObj)[0] as StageType
        const value = stageObj[type]
        const stage = createDefaultStage(type)

        // Parse stage-specific values
        if (type === '$match') {
          const matchStage = stage as MatchStage
          const conditions = Object.entries(value as Record<string, unknown>).map(
            ([field, val]) => {
              if (typeof val === 'object' && val !== null) {
                const operator = Object.keys(val)[0] as any
                const opValue = (val as Record<string, unknown>)[operator]
                return {
                  id: generateId(),
                  field,
                  operator,
                  value: String(opValue),
                }
              }
              return {
                id: generateId(),
                field,
                operator: '$eq' as const,
                value: String(val),
              }
            }
          )
          return { ...matchStage, conditions }
        }

        if (type === '$limit') {
          return { ...stage, limit: value as number } as LimitStage
        }

        if (type === '$skip') {
          return { ...stage, skip: value as number } as SkipStage
        }

        return stage
      })

      setStages(parsedStages)
    }
  }, [initialPipeline, createDefaultStage])

  // Add stage
  const addStage = useCallback(
    (type: StageType) => {
      const newStage = createDefaultStage(type)
      const newStages = [...stages, newStage]
      setStages(newStages)
      setSelectedStageIndex(newStages.length - 1)
      onPipelineChange?.(newStages)
      setAnnouncement(`${type} stage added`)

      if (autoRun) {
        executeRunPipeline(newStages)
      }
    },
    [stages, createDefaultStage, onPipelineChange, autoRun]
  )

  // Delete stage
  const deleteStage = useCallback(
    (index: number) => {
      const newStages = stages.filter((_, i) => i !== index)
      setStages(newStages)
      if (selectedStageIndex === index) {
        setSelectedStageIndex(null)
      } else if (selectedStageIndex !== null && selectedStageIndex > index) {
        setSelectedStageIndex(selectedStageIndex - 1)
      }
      onPipelineChange?.(newStages)
    },
    [stages, selectedStageIndex, onPipelineChange]
  )

  // Duplicate stage
  const duplicateStage = useCallback(
    (index: number) => {
      const stageToDuplicate = stages[index]
      const newStage = {
        ...structuredClone(stageToDuplicate),
        id: generateId(),
      }
      const newStages = [...stages]
      newStages.splice(index + 1, 0, newStage)
      setStages(newStages)
      onPipelineChange?.(newStages)
    },
    [stages, onPipelineChange]
  )

  // Move stage up
  const moveStageUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const newStages = [...stages]
      ;[newStages[index - 1], newStages[index]] = [newStages[index], newStages[index - 1]]
      setStages(newStages)
      if (selectedStageIndex === index) {
        setSelectedStageIndex(index - 1)
      } else if (selectedStageIndex === index - 1) {
        setSelectedStageIndex(index)
      }
      onPipelineChange?.(newStages)
    },
    [stages, selectedStageIndex, onPipelineChange]
  )

  // Move stage down
  const moveStageDown = useCallback(
    (index: number) => {
      if (index === stages.length - 1) return
      const newStages = [...stages]
      ;[newStages[index], newStages[index + 1]] = [newStages[index + 1], newStages[index]]
      setStages(newStages)
      if (selectedStageIndex === index) {
        setSelectedStageIndex(index + 1)
      } else if (selectedStageIndex === index + 1) {
        setSelectedStageIndex(index)
      }
      onPipelineChange?.(newStages)
    },
    [stages, selectedStageIndex, onPipelineChange]
  )

  // Toggle stage enabled
  const toggleStageEnabled = useCallback(
    (index: number) => {
      const newStages = [...stages]
      newStages[index] = { ...newStages[index], enabled: !newStages[index].enabled }
      setStages(newStages)
      onPipelineChange?.(newStages)
    },
    [stages, onPipelineChange]
  )

  // Update stage
  const updateStage = useCallback(
    (index: number, updatedStage: AggregationStage) => {
      const newStages = [...stages]
      newStages[index] = updatedStage
      setStages(newStages)
      onPipelineChange?.(newStages)

      if (autoRun) {
        executeRunPipeline(newStages)
      }
    },
    [stages, onPipelineChange, autoRun]
  )

  // Clear pipeline
  const clearPipeline = useCallback(() => {
    setStages([])
    setSelectedStageIndex(null)
    setResults(null)
    setResultCount(null)
    setError(null)
    onPipelineChange?.([])
    setShowClearConfirm(false)
  }, [onPipelineChange])

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault()
      if (draggedIndex === null || draggedIndex === targetIndex) return

      const newStages = [...stages]
      const [draggedStage] = newStages.splice(draggedIndex, 1)
      newStages.splice(targetIndex, 0, draggedStage)
      setStages(newStages)
      setDraggedIndex(targetIndex)

      if (selectedStageIndex === draggedIndex) {
        setSelectedStageIndex(targetIndex)
      }
    },
    [draggedIndex, stages, selectedStageIndex]
  )

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
    onPipelineChange?.(stages)
  }, [stages, onPipelineChange])

  // Validate pipeline
  const validation = useMemo(() => {
    const errors: { index: number; message: string }[] = []
    const warnings: { index: number; message: string }[] = []

    stages.forEach((stage, index) => {
      if (!stage.enabled) return

      switch (stage.type) {
        case '$group':
          if ((stage as GroupStage).accumulators.length === 0 && !(stage as GroupStage).groupByField) {
            errors.push({ index, message: 'Group stage requires _id field' })
          }
          break
        case '$lookup':
          const lookup = stage as LookupStage
          if (!lookup.config.from || !lookup.config.as) {
            errors.push({ index, message: 'Lookup requires from and as fields' })
          }
          if (!lookup.usePipeline && (!lookup.config.localField || !lookup.config.foreignField)) {
            errors.push({ index, message: 'Lookup requires localField and foreignField' })
          }
          break
        case '$match':
          warnings.push({ index, message: 'Consider adding index for better performance' })
          break
      }
    })

    return { errors, warnings, isValid: errors.length === 0 }
  }, [stages])

  // Execute pipeline
  const executeRunPipeline = useCallback(
    async (stagesToRun?: AggregationStage[]) => {
      const allStages = stagesToRun || stages
      // Filter to only enabled stages for running
      const pipelineStages = allStages.filter((s) => s.enabled)
      if (pipelineStages.length === 0) return

      setIsRunning(true)
      setError(null)

      try {
        const pipeline = stagesToPipeline(pipelineStages)
        const result = await runPipeline({
          database,
          collection,
          pipeline,
          sampleSize,
        })

        setResults(result.documents)
        setResultCount(result.count)
        setAnnouncement(`Pipeline executed successfully. ${result.count} documents returned.`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Pipeline execution failed'
        setError(errorMessage)
        setResults(null)
        setResultCount(null)
      } finally {
        setIsRunning(false)
      }
    },
    [stages, database, collection, sampleSize]
  )

  // Export pipeline as JSON
  const getExportJson = useCallback(() => {
    const stagesToExport = includeDisabledInExport
      ? stages
      : stages.filter((s) => s.enabled)
    return JSON.stringify(stagesToPipeline(stagesToExport), null, 2)
  }, [stages, includeDisabledInExport])

  // Copy JSON to clipboard
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getExportJson())
      setCopiedMessage('Copied to clipboard!')
      setTimeout(() => setCopiedMessage(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [getExportJson])

  // Download JSON file
  const downloadJson = useCallback(() => {
    const blob = new Blob([getExportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pipeline-${database}-${collection}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [getExportJson, database, collection])

  // Save template
  const handleSaveTemplate = useCallback(async () => {
    try {
      await saveTemplate({
        name: templateName,
        description: templateDescription,
        pipeline: stagesToPipeline(stages),
      })
      setSavedMessage('Template saved successfully!')
      setTimeout(() => setSavedMessage(null), 2000)
      setShowSaveDialog(false)
      setTemplateName('')
      setTemplateDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }, [templateName, templateDescription, stages])

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      const templateList = await listTemplates()
      setTemplates(templateList)
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
  }, [])

  // Open load dialog
  const openLoadDialog = useCallback(() => {
    loadTemplates()
    setShowLoadDialog(true)
  }, [loadTemplates])

  // Load selected template
  const handleLoadTemplate = useCallback(async () => {
    if (!selectedTemplateId) return

    if (stages.length > 0 && !showReplaceWarning) {
      setPendingTemplateLoad(selectedTemplateId)
      setShowReplaceWarning(true)
      return
    }

    try {
      const template = await loadTemplate(pendingTemplateLoad || selectedTemplateId)
      // Parse template pipeline into stages
      const parsedStages = template.pipeline.map((stageObj) => {
        const type = Object.keys(stageObj)[0] as StageType
        return createDefaultStage(type)
      })
      setStages(parsedStages)
      setSelectedStageIndex(null)
      setShowLoadDialog(false)
      setShowReplaceWarning(false)
      setPendingTemplateLoad(null)
      setSelectedTemplateId(null)
      onPipelineChange?.(parsedStages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template')
    }
  }, [selectedTemplateId, stages.length, showReplaceWarning, pendingTemplateLoad, createDefaultStage, onPipelineChange])

  // Confirm replace
  const confirmReplace = useCallback(() => {
    handleLoadTemplate()
  }, [handleLoadTemplate])

  // Cancel replace
  const cancelReplace = useCallback(() => {
    setShowReplaceWarning(false)
    setPendingTemplateLoad(null)
  }, [])

  // Filter templates
  const filteredTemplates = useMemo(() => {
    if (!templateSearch) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(templateSearch.toLowerCase()))
    )
  }, [templates, templateSearch])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // Only prevent default for save shortcut
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          if (stages.length > 0) {
            setShowSaveDialog(true)
          }
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!isRunning && stages.length > 0 && validation.isValid) {
          executeRunPipeline()
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (stages.length > 0) {
          setShowSaveDialog(true)
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        if (stages.length > 0) {
          setShowExportDialog(true)
        }
      }

      if (e.key === 'Delete' && selectedStageIndex !== null) {
        e.preventDefault()
        deleteStage(selectedStageIndex)
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedStageIndex !== null) {
        e.preventDefault()
        duplicateStage(selectedStageIndex)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [stages, selectedStageIndex, isRunning, validation.isValid, executeRunPipeline, deleteStage, duplicateStage])

  // Render stage editor
  const renderStageEditor = useCallback(() => {
    if (selectedStageIndex === null) {
      return (
        <div className={emptyStateStyles}>
          <Body>Select a stage to edit</Body>
        </div>
      )
    }

    const stage = stages[selectedStageIndex]
    const handleChange = (updated: AggregationStage) => updateStage(selectedStageIndex, updated)

    switch (stage.type) {
      case '$match':
        return <MatchStageEditor stage={stage as MatchStage} onChange={handleChange as any} />
      case '$group':
        return <GroupStageEditor stage={stage as GroupStage} onChange={handleChange as any} />
      case '$sort':
        return <SortStageEditor stage={stage as SortStage} onChange={handleChange as any} />
      case '$project':
        return <ProjectStageEditor stage={stage as ProjectStage} onChange={handleChange as any} />
      case '$limit':
        return <LimitStageEditor stage={stage as LimitStage} onChange={handleChange as any} />
      case '$skip':
        return <SkipStageEditor stage={stage as SkipStage} onChange={handleChange as any} />
      case '$lookup':
        return <LookupStageEditor stage={stage as LookupStage} onChange={handleChange as any} />
      case '$unwind':
        return <UnwindStageEditor stage={stage as UnwindStage} onChange={handleChange as any} />
      case '$addFields':
        return <AddFieldsStageEditor stage={stage as AddFieldsStage} onChange={handleChange as any} />
      case '$count':
        return <CountStageEditor stage={stage as CountStage} onChange={handleChange as any} />
      default:
        return <Body>Unknown stage type</Body>
    }
  }, [selectedStageIndex, stages, updateStage])

  return (
    <div
      ref={containerRef}
      className={containerStyles}
      data-testid="aggregation-pipeline-builder"
      tabIndex={-1}
    >
      {/* Live region for accessibility announcements */}
      <div role="status" aria-live="polite" className={liveRegionStyles}>
        {announcement}
      </div>

      {/* Header */}
      <div className={headerStyles}>
        <div className={headerLeftStyles}>
          <H3>Aggregation Pipeline Builder</H3>
          <Body>{database}.{collection}</Body>
        </div>
        <div className={headerRightStyles}>
          {validation.isValid ? (
            <div className={validStatusStyles} data-testid="pipeline-status-valid">
              <Icon glyph="Checkmark" size="small" />
              Valid
            </div>
          ) : (
            <div className={errorStyles}>
              <Icon glyph="Warning" size="small" />
              {validation.errors.length} error(s)
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className={toolbarStyles}>
        <Button
          variant="primary"
          leftGlyph={<Icon glyph="Play" />}
          onClick={() => executeRunPipeline()}
          disabled={isRunning || stages.length === 0 || !validation.isValid}
          data-testid="run-pipeline-button"
        >
          {isRunning ? 'Running...' : 'Run'}
        </Button>

        <Button
          variant="default"
          leftGlyph={<Icon glyph="Export" />}
          onClick={() => setShowExportDialog(true)}
          disabled={stages.length === 0}
          data-testid="export-json-button"
        >
          Export JSON
        </Button>

        <Button
          variant="default"
          leftGlyph={<Icon glyph="Save" />}
          onClick={() => setShowSaveDialog(true)}
          disabled={stages.length === 0}
          data-testid="save-template-button"
        >
          Save
        </Button>

        <Button
          variant="default"
          leftGlyph={<Icon glyph="Folder" />}
          onClick={openLoadDialog}
          data-testid="load-template-button"
        >
          Load
        </Button>

        <Button
          variant="dangerOutline"
          leftGlyph={<Icon glyph="Trash" />}
          onClick={() => setShowClearConfirm(true)}
          disabled={stages.length === 0}
          data-testid="clear-pipeline-button"
        >
          Clear
        </Button>

        {savedMessage && (
          <Body style={{ color: palette.green.dark2, marginLeft: 8 }}>{savedMessage}</Body>
        )}

        <div style={{ flex: 1 }} />

        <div className={autoRunRowStyles}>
          <Toggle
            aria-label="Auto-run"
            checked={autoRun}
            onChange={() => setAutoRun(!autoRun)}
            data-testid="auto-run-toggle"
          />
          <Body>Auto-run</Body>
        </div>

        <div className={sampleSizeRowStyles}>
          <Body>Sample:</Body>
          <Select
            aria-label="Sample size"
            value={String(sampleSize)}
            onChange={(val) => setSampleSize(Number(val))}
            data-testid="sample-size-select"
          >
            <Option value="5">5</Option>
            <Option value="10">10</Option>
            <Option value="20">20</Option>
            <Option value="50">50</Option>
            <Option value="100">100</Option>
          </Select>
        </div>

        <div className={collapseButtonStyles} data-testid="panel-collapse-button">
          <IconButton aria-label="Toggle panels">
            <Icon glyph="Menu" />
          </IconButton>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className={mobileTabsStyles} data-testid="mobile-panel-tabs">
        <Button size="small">Stages</Button>
        <Button size="small">Editor</Button>
        <Button size="small">Results</Button>
      </div>

      {/* Main content */}
      <div className={mainContentStyles}>
        {/* Stage palette */}
        <div
          className={palettePanelStyles}
          data-testid="stage-palette-panel"
          aria-label="Stage palette"
        >
          <Subtitle>Stages</Subtitle>
          {STAGE_TYPES.map(({ type, label, description }) => (
            <div
              key={type}
              className={stageItemStyles}
              onClick={() => addStage(type)}
              data-testid={`stage-item-${type}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  addStage(type)
                }
              }}
            >
              <Body weight="medium">{label}</Body>
            </div>
          ))}
        </div>

        {/* Pipeline canvas */}
        <div
          className={canvasPanelStyles}
          data-testid="pipeline-canvas-panel"
          aria-label="Pipeline canvas"
        >
          {stages.length === 0 ? (
            <div className={emptyStateStyles} data-testid="empty-pipeline-message">
              <Icon glyph="Diagram2" size="xlarge" />
              <Subtitle>No stages yet</Subtitle>
              <Body>Add a stage to get started</Body>
            </div>
          ) : (
            stages.map((stage, index) => (
              <div
                key={stage.id}
                className={`${pipelineStageStyles} ${
                  !stage.enabled ? pipelineStageDisabledStyles : ''
                } ${selectedStageIndex === index ? pipelineStageSelectedStyles : ''} ${
                  !stage.enabled ? 'disabled' : ''
                }`}
                data-testid={`pipeline-stage-${index}`}
                onClick={() => setSelectedStageIndex(index)}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
              >
                <div className={stageHeaderStyles}>
                  <div className={stageHeaderLeftStyles}>
                    <div
                      className={dragHandleStyles}
                      data-testid={`drag-handle-${index}`}
                    >
                      <Icon glyph="Drag" />
                    </div>
                    <Body weight="medium">{stage.type}</Body>
                  </div>

                  <div className={stageActionsStyles}>
                    <IconButton
                      aria-label="Toggle stage"
                      aria-pressed={stage.enabled}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleStageEnabled(index)
                      }}
                      data-testid={`toggle-stage-${index}`}
                    >
                      <Icon glyph={stage.enabled ? 'Visibility' : 'VisibilityOff'} />
                    </IconButton>

                    <IconButton
                      aria-label="Move up"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveStageUp(index)
                      }}
                      disabled={index === 0}
                      data-testid={`move-up-button-${index}`}
                    >
                      <Icon glyph="ChevronUp" />
                    </IconButton>

                    <IconButton
                      aria-label="Move down"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveStageDown(index)
                      }}
                      disabled={index === stages.length - 1}
                      data-testid={`move-down-button-${index}`}
                    >
                      <Icon glyph="ChevronDown" />
                    </IconButton>

                    <IconButton
                      aria-label="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicateStage(index)
                      }}
                      data-testid={`duplicate-stage-${index}`}
                    >
                      <Icon glyph="Clone" />
                    </IconButton>

                    <IconButton
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteStage(index)
                      }}
                      data-testid={`delete-stage-${index}`}
                    >
                      <Icon glyph="Trash" />
                    </IconButton>
                  </div>
                </div>

                {/* Stage validation errors */}
                {validation.errors.filter((e) => e.index === index).map((error, i) => (
                  <div key={i} className={validationErrorStyles} data-testid={`stage-validation-error-${index}`}>
                    <Icon glyph="Warning" size="small" />
                    {error.message}
                  </div>
                ))}

                {/* Stage warnings */}
                {validation.warnings.filter((w) => w.index === index).map((warning, i) => (
                  <div key={i} className={warningStyles} data-testid={`stage-warning-${index}`}>
                    <Icon glyph="InfoWithCircle" size="small" />
                    {warning.message}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Stage editor panel */}
        <div
          className={editorPanelStyles}
          data-testid="stage-editor-panel"
          aria-label="Stage editor"
        >
          <Subtitle>Stage Editor</Subtitle>
          {renderStageEditor()}
        </div>

        {/* Results preview panel */}
        <div
          className={resultsPanelStyles}
          data-testid="results-preview-panel"
          aria-label="Results preview"
        >
          <Subtitle>Results</Subtitle>

          <div className={resultsContainerStyles}>
            {isRunning && (
              <div className={loadingStyles} data-testid="pipeline-running-indicator">
                <Icon glyph="Refresh" />
                Running pipeline...
              </div>
            )}

            {error && (
              <div className={errorStyles} data-testid="pipeline-error">
                <Icon glyph="Warning" />
                {error}
              </div>
            )}

            {resultCount !== null && !isRunning && (
              <div className={resultCountStyles} data-testid="result-count">
                <Icon glyph="File" size="small" />
                {resultCount} document{resultCount !== 1 ? 's' : ''}
              </div>
            )}

            {results && results.map((doc, i) => (
              <div key={i} className={resultDocumentStyles}>
                {JSON.stringify(doc, null, 2)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export JSON Dialog */}
      <Modal open={showExportDialog} setOpen={setShowExportDialog}>
        <div className={dialogContentStyles} data-testid="export-json-dialog">
          <H3>Export Pipeline</H3>

          <Checkbox
            label="Include disabled stages"
            checked={includeDisabledInExport}
            onChange={(e) => setIncludeDisabledInExport(e.target.checked)}
            data-testid="include-disabled-stages-checkbox"
          />

          <div className={jsonContentStyles} data-testid="export-json-content">
            {getExportJson()}
          </div>

          {copiedMessage && <Body style={{ color: palette.green.dark2 }}>{copiedMessage}</Body>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="default" onClick={copyToClipboard} data-testid="copy-json-button">
              Copy
            </Button>
            <Button variant="default" onClick={downloadJson} data-testid="download-json-button">
              Download
            </Button>
            <Button variant="primary" onClick={() => setShowExportDialog(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Save Template Dialog */}
      <Modal open={showSaveDialog} setOpen={setShowSaveDialog}>
        <div className={dialogContentStyles} data-testid="save-template-dialog">
          <H3>Save Pipeline Template</H3>

          <TextInput
            label="Template Name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            data-testid="template-name-input"
          />

          <TextArea
            label="Description (optional)"
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.target.value)}
            data-testid="template-description-input"
          />

          {savedMessage && <Body style={{ color: palette.green.dark2 }}>{savedMessage}</Body>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="default" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              data-testid="confirm-save-template-button"
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Load Template Dialog */}
      <Modal open={showLoadDialog} setOpen={setShowLoadDialog}>
        <div className={dialogContentStyles} data-testid="load-template-dialog">
          <H3>Load Pipeline Template</H3>

          <TextInput
            placeholder="Search templates..."
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            data-testid="template-search-input"
          />

          {filteredTemplates.length === 0 ? (
            <div className={emptyStateStyles} data-testid="no-templates-message">
              <Body>No templates found</Body>
            </div>
          ) : (
            <div className={templateListStyles}>
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className={`${templateItemStyles} ${
                    selectedTemplateId === template.id ? templateItemSelectedStyles : ''
                  }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                  data-testid={`template-item-${template.id}`}
                >
                  <div>
                    <Body weight="medium">{template.name}</Body>
                    {template.description && (
                      <Body style={{ color: palette.gray.dark1 }}>{template.description}</Body>
                    )}
                  </div>
                  <IconButton
                    aria-label="Delete template"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeleteConfirm(true)
                    }}
                    data-testid={`delete-template-${template.id}`}
                  >
                    <Icon glyph="Trash" />
                  </IconButton>
                </div>
              ))}
            </div>
          )}

          {showReplaceWarning && (
            <div className={warningStyles} data-testid="replace-pipeline-warning">
              <Icon glyph="Warning" />
              This will replace your current pipeline. Continue?
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="default" onClick={() => {
              setShowLoadDialog(false)
              setShowReplaceWarning(false)
              setPendingTemplateLoad(null)
            }}>
              Cancel
            </Button>
            {showReplaceWarning ? (
              <Button variant="primary" onClick={confirmReplace} data-testid="confirm-load-template-button">
                Confirm Replace
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleLoadTemplate}
                disabled={!selectedTemplateId}
                data-testid="confirm-load-template-button"
              >
                Load
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Clear Confirmation Dialog */}
      <Modal open={showClearConfirm} setOpen={setShowClearConfirm}>
        <div className={dialogContentStyles}>
          <H3>Clear Pipeline</H3>
          <Body>Are you sure you want to clear all stages? This cannot be undone.</Body>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="default" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clearPipeline} data-testid="confirm-clear-button">
              Clear
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Template Confirmation */}
      <Modal open={showDeleteConfirm} setOpen={setShowDeleteConfirm}>
        <div className={dialogContentStyles} data-testid="confirm-delete-template-dialog">
          <H3>Delete Template</H3>
          <Body>Are you sure you want to delete this template?</Body>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="default" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (selectedTemplateId) {
                  await deleteTemplate(selectedTemplateId)
                  loadTemplates()
                  setShowDeleteConfirm(false)
                  setSelectedTemplateId(null)
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AggregationPipelineBuilder
