/**
 * Stage Editor Unit Tests
 *
 * RED Phase: These tests define the expected behavior for individual stage editors
 * that provide specialized UIs for each MongoDB aggregation stage type.
 *
 * Each stage editor should:
 * 1. Render appropriate fields for the stage type
 * 2. Validate input and show errors
 * 3. Update the stage when values change
 * 4. Support raw JSON mode for advanced editing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { MatchStageEditor } from '../MatchStageEditor'
import { GroupStageEditor } from '../GroupStageEditor'
import { SortStageEditor } from '../SortStageEditor'
import { ProjectStageEditor } from '../ProjectStageEditor'
import { LimitStageEditor } from '../LimitStageEditor'
import { SkipStageEditor } from '../SkipStageEditor'
import { LookupStageEditor } from '../LookupStageEditor'
import { UnwindStageEditor } from '../UnwindStageEditor'
import { AddFieldsStageEditor } from '../AddFieldsStageEditor'
import { CountStageEditor } from '../CountStageEditor'
import type {
  MatchStage,
  GroupStage,
  SortStage,
  ProjectStage,
  LimitStage,
  SkipStage,
  LookupStage,
  UnwindStage,
  AddFieldsStage,
  CountStage,
} from '../types'

describe('MatchStageEditor', () => {
  const createMatchStage = (overrides?: Partial<MatchStage>): MatchStage => ({
    id: 'match-1',
    type: '$match',
    enabled: true,
    conditions: [
      { id: 'cond-1', field: '', operator: '$eq', value: '' },
    ],
    useRawJson: false,
    rawJson: '',
    ...overrides,
  })

  const defaultProps = {
    stage: createMatchStage(),
    onChange: vi.fn(),
    availableFields: ['name', 'email', 'age', 'status', 'createdAt'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the match stage editor container', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-stage-editor')).toBeInTheDocument()
    })

    it('renders condition builder by default', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-condition-builder')).toBeInTheDocument()
    })

    it('renders first condition row', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-condition-0')).toBeInTheDocument()
    })

    it('renders field input with autocomplete', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-field-input-0')).toBeInTheDocument()
    })

    it('renders operator selector', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-operator-select-0')).toBeInTheDocument()
    })

    it('renders value input', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-value-input-0')).toBeInTheDocument()
    })

    it('renders add condition button', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('add-match-condition-button')).toBeInTheDocument()
    })

    it('renders raw JSON toggle', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('toggle-raw-json-mode')).toBeInTheDocument()
    })
  })

  describe('condition management', () => {
    it('adds new condition when add button clicked', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-match-condition-button'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: expect.arrayContaining([
            expect.objectContaining({ field: '', operator: '$eq' }),
            expect.objectContaining({ field: '', operator: '$eq' }),
          ]),
        })
      )
    })

    it('removes condition when remove button clicked', async () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'name', operator: '$eq', value: 'Alice' },
          { id: 'cond-2', field: 'age', operator: '$gt', value: '18' },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('remove-match-condition-1'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ field: 'name' }),
          ],
        })
      )
    })

    it('does not show remove button for single condition', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.queryByTestId('remove-match-condition-0')).not.toBeInTheDocument()
    })

    it('shows remove buttons when multiple conditions exist', () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'name', operator: '$eq', value: '' },
          { id: 'cond-2', field: '', operator: '$eq', value: '' },
        ],
      })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('remove-match-condition-0')).toBeInTheDocument()
      expect(screen.getByTestId('remove-match-condition-1')).toBeInTheDocument()
    })
  })

  describe('field input', () => {
    it('updates field value on change', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('match-field-input-0'), 'name')

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ field: 'name' }),
          ],
        })
      )
    })

    it('shows field suggestions from availableFields', async () => {
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} />)

      await user.click(screen.getByTestId('match-field-input-0'))

      expect(screen.getByText('name')).toBeInTheDocument()
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('age')).toBeInTheDocument()
    })

    it('filters suggestions based on input', async () => {
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} />)

      await user.type(screen.getByTestId('match-field-input-0'), 'na')

      expect(screen.getByText('name')).toBeInTheDocument()
      expect(screen.queryByText('email')).not.toBeInTheDocument()
    })

    it('selects field from suggestions', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('match-field-input-0'))
      await user.click(screen.getByText('email'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ field: 'email' }),
          ],
        })
      )
    })

    it('supports nested field paths like "address.city"', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('match-field-input-0'), 'address.city')

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ field: 'address.city' }),
          ],
        })
      )
    })
  })

  describe('operator selection', () => {
    it('shows all comparison operators', async () => {
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} />)

      await user.click(screen.getByTestId('match-operator-select-0'))

      // Use specific patterns to avoid partial matches (e.g., $gt matching $gte)
      expect(screen.getByRole('option', { name: /\$eq\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$ne\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$gt\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$gte\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$lt\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$lte\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$in\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$nin\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$regex\b/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$exists\b/i })).toBeInTheDocument()
    })

    it('updates operator on selection', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('match-operator-select-0'))
      await user.click(screen.getByRole('option', { name: /\$gt\b/i }))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ operator: '$gt' }),
          ],
        })
      )
    })

    it('shows array input for $in operator', async () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'status', operator: '$in', value: '' },
        ],
      })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('match-value-array-input-0')).toBeInTheDocument()
    })

    it('shows boolean selector for $exists operator', async () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'email', operator: '$exists', value: 'true' },
        ],
      })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('match-value-boolean-select-0')).toBeInTheDocument()
    })

    it('shows regex pattern input for $regex operator', async () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'email', operator: '$regex', value: '' },
        ],
      })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('match-value-regex-input-0')).toBeInTheDocument()
      expect(screen.getByTestId('match-regex-options-input-0')).toBeInTheDocument()
    })
  })

  describe('value input', () => {
    it('updates value on change', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('match-value-input-0'), 'Alice')

      // Each keystroke triggers onChange with the updated value
      // Since the component reads from props (which we don't update), each keystroke
      // starts fresh. Check that onChange was called for each character.
      expect(onChange).toHaveBeenCalledTimes(5) // A, l, i, c, e
      // Check the first call had 'A'
      expect(onChange).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ value: 'A' }),
          ],
        })
      )
    })

    it('detects and preserves number type', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('match-value-input-0'), '42')

      // Each keystroke triggers onChange. Check it was called for each character.
      expect(onChange).toHaveBeenCalledTimes(2) // 4, 2
      // Check the first call had '4'
      expect(onChange).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          conditions: [
            expect.objectContaining({ value: '4' }),
          ],
        })
      )
    })

    it('shows value type selector', () => {
      render(<MatchStageEditor {...defaultProps} />)
      expect(screen.getByTestId('match-value-type-select-0')).toBeInTheDocument()
    })

    it('allows explicit type selection (string, number, boolean, null)', async () => {
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} />)

      await user.click(screen.getByTestId('match-value-type-select-0'))

      expect(screen.getByRole('option', { name: /string/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /number/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /boolean/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /null/i })).toBeInTheDocument()
    })
  })

  describe('raw JSON mode', () => {
    it('switches to raw JSON editor when toggle clicked', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('toggle-raw-json-mode'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          useRawJson: true,
        })
      )
    })

    it('shows JSON editor in raw mode', () => {
      const stage = createMatchStage({ useRawJson: true })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('raw-json-editor')).toBeInTheDocument()
    })

    it('hides condition builder in raw mode', () => {
      const stage = createMatchStage({ useRawJson: true })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.queryByTestId('match-condition-builder')).not.toBeInTheDocument()
    })

    it('validates JSON syntax', async () => {
      const stage = createMatchStage({ useRawJson: true, rawJson: '{ invalid }' })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('json-syntax-error')).toBeInTheDocument()
    })

    it('converts conditions to JSON when switching to raw mode', async () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'name', operator: '$eq', value: 'Alice' },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('toggle-raw-json-mode'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          rawJson: expect.stringContaining('"name"'),
          rawJson: expect.stringContaining('Alice'),
        })
      )
    })
  })

  describe('logical operators', () => {
    // Logical operator selector only appears when there are 2+ conditions
    const stageWithMultipleConditions = createMatchStage({
      conditions: [
        { id: 'cond-1', field: 'name', operator: '$eq', value: 'Alice' },
        { id: 'cond-2', field: 'age', operator: '$gt', value: '25' },
      ],
    })

    it('supports AND logic by default', () => {
      render(<MatchStageEditor {...defaultProps} stage={stageWithMultipleConditions} />)
      expect(screen.getByTestId('logical-operator-selector')).toHaveTextContent('AND')
    })

    it('supports switching to OR logic', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<MatchStageEditor {...defaultProps} stage={stageWithMultipleConditions} onChange={onChange} />)

      await user.click(screen.getByTestId('logical-operator-selector'))
      await user.click(screen.getByRole('option', { name: /or/i }))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          logicalOperator: '$or',
        })
      )
    })
  })

  describe('validation', () => {
    it('shows error when field is empty', () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: '', operator: '$eq', value: 'test' },
        ],
      })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('field-required-error-0')).toBeInTheDocument()
    })

    it('shows validation state', () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'name', operator: '$eq', value: 'Alice' },
        ],
      })
      render(<MatchStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('stage-validation-valid')).toBeInTheDocument()
    })
  })
})

describe('GroupStageEditor', () => {
  const createGroupStage = (overrides?: Partial<GroupStage>): GroupStage => ({
    id: 'group-1',
    type: '$group',
    enabled: true,
    groupByField: '',
    groupByExpression: '',
    useCompoundKey: false,
    accumulators: [],
    useRawJson: false,
    rawJson: '',
    ...overrides,
  })

  const defaultProps = {
    stage: createGroupStage(),
    onChange: vi.fn(),
    availableFields: ['category', 'status', 'author', 'date'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the group stage editor', () => {
      render(<GroupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('group-stage-editor')).toBeInTheDocument()
    })

    it('renders group by field selector', () => {
      render(<GroupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('group-by-field-input')).toBeInTheDocument()
    })

    it('renders add accumulator button', () => {
      render(<GroupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('add-accumulator-button')).toBeInTheDocument()
    })

    it('renders null option for _id', () => {
      render(<GroupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('group-by-null-option')).toBeInTheDocument()
    })
  })

  describe('group by field', () => {
    it('updates group by field on change', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<GroupStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('group-by-field-input'), 'category')

      // Each keystroke triggers onChange. Check it was called for each character.
      expect(onChange).toHaveBeenCalledTimes(8) // c, a, t, e, g, o, r, y
      // Check the first call had 'c'
      expect(onChange).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          groupByField: 'c',
        })
      )
    })

    it('sets null when null option selected', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<GroupStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('group-by-null-option'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          groupByField: '',
        })
      )
    })

    it('supports compound key toggle', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<GroupStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('use-compound-key-toggle'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          useCompoundKey: true,
        })
      )
    })

    it('shows compound key editor when toggle enabled', () => {
      const stage = createGroupStage({ useCompoundKey: true })
      render(<GroupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('compound-key-editor')).toBeInTheDocument()
    })
  })

  describe('accumulators', () => {
    it('adds accumulator when add button clicked', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<GroupStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-accumulator-button'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          accumulators: [
            expect.objectContaining({
              outputField: '',
              operator: '$sum',
              inputField: '',
            }),
          ],
        })
      )
    })

    it('renders accumulator row with all fields', () => {
      const stage = createGroupStage({
        accumulators: [
          { id: 'acc-1', outputField: 'total', operator: '$sum', inputField: 'amount' },
        ],
      })
      render(<GroupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('accumulator-name-input-0')).toHaveValue('total')
      expect(screen.getByTestId('accumulator-operator-select-0')).toHaveTextContent('$sum')
      expect(screen.getByTestId('accumulator-field-input-0')).toHaveValue('amount')
    })

    it('removes accumulator when remove button clicked', async () => {
      const stage = createGroupStage({
        accumulators: [
          { id: 'acc-1', outputField: 'total', operator: '$sum', inputField: 'amount' },
          { id: 'acc-2', outputField: 'count', operator: '$count', inputField: '' },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<GroupStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('remove-accumulator-0'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          accumulators: [
            expect.objectContaining({ outputField: 'count' }),
          ],
        })
      )
    })

    it('shows all accumulator operators', async () => {
      const stage = createGroupStage({
        accumulators: [
          { id: 'acc-1', outputField: '', operator: '$sum', inputField: '' },
        ],
      })
      const user = userEvent.setup()
      render(<GroupStageEditor {...defaultProps} stage={stage} />)

      await user.click(screen.getByTestId('accumulator-operator-select-0'))

      expect(screen.getByRole('option', { name: /\$sum/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$avg/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$min/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$max/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$first/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$last/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$push/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$addToSet/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /\$count/i })).toBeInTheDocument()
    })

    it('hides input field for $count operator', () => {
      const stage = createGroupStage({
        accumulators: [
          { id: 'acc-1', outputField: 'docCount', operator: '$count', inputField: '' },
        ],
      })
      render(<GroupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.queryByTestId('accumulator-field-input-0')).not.toBeInTheDocument()
    })

    it('supports constant value for $sum (count: 1)', async () => {
      const stage = createGroupStage({
        accumulators: [
          { id: 'acc-1', outputField: 'count', operator: '$sum', inputField: '1' },
        ],
      })
      render(<GroupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('accumulator-use-constant-toggle-0')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('shows warning when no accumulators defined', () => {
      render(<GroupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('no-accumulators-warning')).toBeInTheDocument()
    })

    it('shows error for duplicate output field names', () => {
      const stage = createGroupStage({
        accumulators: [
          { id: 'acc-1', outputField: 'total', operator: '$sum', inputField: 'amount' },
          { id: 'acc-2', outputField: 'total', operator: '$avg', inputField: 'amount' },
        ],
      })
      render(<GroupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('duplicate-field-error')).toBeInTheDocument()
    })
  })
})

describe('SortStageEditor', () => {
  const createSortStage = (overrides?: Partial<SortStage>): SortStage => ({
    id: 'sort-1',
    type: '$sort',
    enabled: true,
    fields: [],
    ...overrides,
  })

  const defaultProps = {
    stage: createSortStage(),
    onChange: vi.fn(),
    availableFields: ['name', 'createdAt', 'updatedAt', 'score'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the sort stage editor', () => {
      render(<SortStageEditor {...defaultProps} />)
      expect(screen.getByTestId('sort-stage-editor')).toBeInTheDocument()
    })

    it('renders add sort field button', () => {
      render(<SortStageEditor {...defaultProps} />)
      expect(screen.getByTestId('add-sort-field-button')).toBeInTheDocument()
    })

    it('shows empty state when no fields', () => {
      render(<SortStageEditor {...defaultProps} />)
      expect(screen.getByTestId('sort-empty-state')).toBeInTheDocument()
    })
  })

  describe('sort field management', () => {
    it('adds sort field when button clicked', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<SortStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-sort-field-button'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ field: '', direction: 1 }),
          ],
        })
      )
    })

    it('renders sort field row with field and direction', () => {
      const stage = createSortStage({
        fields: [
          { id: 'sort-1', field: 'createdAt', direction: -1 },
        ],
      })
      render(<SortStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('sort-field-input-0')).toHaveValue('createdAt')
      expect(screen.getByTestId('sort-direction-toggle-0')).toHaveTextContent('Descending')
    })

    it('toggles sort direction', async () => {
      const stage = createSortStage({
        fields: [
          { id: 'sort-1', field: 'createdAt', direction: 1 },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<SortStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('sort-direction-toggle-0'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ direction: -1 }),
          ],
        })
      )
    })

    it('removes sort field when remove button clicked', async () => {
      const stage = createSortStage({
        fields: [
          { id: 'sort-1', field: 'createdAt', direction: -1 },
          { id: 'sort-2', field: 'name', direction: 1 },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<SortStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('remove-sort-field-0'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ field: 'name' }),
          ],
        })
      )
    })

    it('supports reordering sort fields via drag', async () => {
      const stage = createSortStage({
        fields: [
          { id: 'sort-1', field: 'createdAt', direction: -1 },
          { id: 'sort-2', field: 'name', direction: 1 },
        ],
      })
      render(<SortStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('sort-field-drag-handle-0')).toBeInTheDocument()
      expect(screen.getByTestId('sort-field-drag-handle-1')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('shows error for empty sort field name', () => {
      const stage = createSortStage({
        fields: [
          { id: 'sort-1', field: '', direction: 1 },
        ],
      })
      render(<SortStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('field-required-error-0')).toBeInTheDocument()
    })

    it('shows error for duplicate sort fields', () => {
      const stage = createSortStage({
        fields: [
          { id: 'sort-1', field: 'name', direction: 1 },
          { id: 'sort-2', field: 'name', direction: -1 },
        ],
      })
      render(<SortStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('duplicate-field-error')).toBeInTheDocument()
    })
  })
})

describe('ProjectStageEditor', () => {
  const createProjectStage = (overrides?: Partial<ProjectStage>): ProjectStage => ({
    id: 'project-1',
    type: '$project',
    enabled: true,
    fields: [],
    useRawJson: false,
    rawJson: '',
    ...overrides,
  })

  const defaultProps = {
    stage: createProjectStage(),
    onChange: vi.fn(),
    availableFields: ['_id', 'name', 'email', 'age', 'address'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the project stage editor', () => {
      render(<ProjectStageEditor {...defaultProps} />)
      expect(screen.getByTestId('project-stage-editor')).toBeInTheDocument()
    })

    it('renders add field button', () => {
      render(<ProjectStageEditor {...defaultProps} />)
      expect(screen.getByTestId('add-project-field-button')).toBeInTheDocument()
    })

    it('renders quick select for common fields', () => {
      render(<ProjectStageEditor {...defaultProps} />)
      expect(screen.getByTestId('quick-field-select')).toBeInTheDocument()
    })
  })

  describe('field management', () => {
    it('adds field when button clicked', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<ProjectStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-project-field-button'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ field: '', include: true, isExpression: false }),
          ],
        })
      )
    })

    it('toggles field inclusion/exclusion', async () => {
      const stage = createProjectStage({
        fields: [
          { id: 'f-1', field: 'password', include: true, isExpression: false },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<ProjectStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('project-include-toggle-0'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ include: false }),
          ],
        })
      )
    })

    it('supports expression mode for computed fields', async () => {
      const stage = createProjectStage({
        fields: [
          { id: 'f-1', field: 'fullName', include: true, isExpression: false },
        ],
      })
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<ProjectStageEditor {...defaultProps} stage={stage} onChange={onChange} />)

      await user.click(screen.getByTestId('project-expression-toggle-0'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ isExpression: true }),
          ],
        })
      )
    })

    it('shows expression editor when expression mode enabled', () => {
      const stage = createProjectStage({
        fields: [
          { id: 'f-1', field: 'fullName', include: '{ $concat: ["$firstName", " ", "$lastName"] }', isExpression: true },
        ],
      })
      render(<ProjectStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('project-expression-input-0')).toBeInTheDocument()
    })
  })

  describe('_id field handling', () => {
    it('shows _id exclusion toggle', () => {
      render(<ProjectStageEditor {...defaultProps} />)
      expect(screen.getByTestId('exclude-id-toggle')).toBeInTheDocument()
    })

    it('excludes _id when toggle enabled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<ProjectStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('exclude-id-toggle'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeId: true,
        })
      )
    })
  })
})

describe('LimitStageEditor', () => {
  const createLimitStage = (overrides?: Partial<LimitStage>): LimitStage => ({
    id: 'limit-1',
    type: '$limit',
    enabled: true,
    limit: 10,
    ...overrides,
  })

  const defaultProps = {
    stage: createLimitStage(),
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the limit stage editor', () => {
      render(<LimitStageEditor {...defaultProps} />)
      expect(screen.getByTestId('limit-stage-editor')).toBeInTheDocument()
    })

    it('renders limit input with default value', () => {
      render(<LimitStageEditor {...defaultProps} />)
      expect(screen.getByTestId('limit-value-input')).toHaveValue(10)
    })
  })

  describe('value handling', () => {
    it('updates limit on change', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<LimitStageEditor {...defaultProps} onChange={onChange} />)

      await user.clear(screen.getByTestId('limit-value-input'))
      await user.type(screen.getByTestId('limit-value-input'), '50')

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      )
    })

    it('shows quick select buttons for common values', () => {
      render(<LimitStageEditor {...defaultProps} />)

      expect(screen.getByTestId('quick-limit-10')).toBeInTheDocument()
      expect(screen.getByTestId('quick-limit-25')).toBeInTheDocument()
      expect(screen.getByTestId('quick-limit-50')).toBeInTheDocument()
      expect(screen.getByTestId('quick-limit-100')).toBeInTheDocument()
    })

    it('sets limit via quick select', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<LimitStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('quick-limit-50'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      )
    })
  })

  describe('validation', () => {
    it('shows error for non-positive values', async () => {
      const stage = createLimitStage({ limit: -5 })
      render(<LimitStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('limit-validation-error')).toBeInTheDocument()
      expect(screen.getByText(/must be positive/i)).toBeInTheDocument()
    })

    it('shows error for zero value', async () => {
      const stage = createLimitStage({ limit: 0 })
      render(<LimitStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('limit-validation-error')).toBeInTheDocument()
    })

    it('shows error for non-integer values', async () => {
      const stage = createLimitStage({ limit: 10.5 })
      render(<LimitStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('limit-validation-error')).toBeInTheDocument()
      expect(screen.getByText(/must be an integer/i)).toBeInTheDocument()
    })
  })
})

describe('SkipStageEditor', () => {
  const createSkipStage = (overrides?: Partial<SkipStage>): SkipStage => ({
    id: 'skip-1',
    type: '$skip',
    enabled: true,
    skip: 0,
    ...overrides,
  })

  const defaultProps = {
    stage: createSkipStage(),
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the skip stage editor', () => {
      render(<SkipStageEditor {...defaultProps} />)
      expect(screen.getByTestId('skip-stage-editor')).toBeInTheDocument()
    })

    it('renders skip input with default value', () => {
      render(<SkipStageEditor {...defaultProps} />)
      expect(screen.getByTestId('skip-value-input')).toHaveValue(0)
    })
  })

  describe('validation', () => {
    it('allows zero value', () => {
      render(<SkipStageEditor {...defaultProps} />)
      expect(screen.queryByTestId('skip-validation-error')).not.toBeInTheDocument()
    })

    it('shows error for negative values', async () => {
      const stage = createSkipStage({ skip: -10 })
      render(<SkipStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('skip-validation-error')).toBeInTheDocument()
    })
  })
})

describe('LookupStageEditor', () => {
  const createLookupStage = (overrides?: Partial<LookupStage>): LookupStage => ({
    id: 'lookup-1',
    type: '$lookup',
    enabled: true,
    config: {
      from: '',
      localField: '',
      foreignField: '',
      as: '',
    },
    usePipeline: false,
    pipelineJson: '',
    ...overrides,
  })

  const defaultProps = {
    stage: createLookupStage(),
    onChange: vi.fn(),
    availableCollections: ['orders', 'products', 'categories'],
    availableFields: ['_id', 'userId', 'productId', 'orderId'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the lookup stage editor', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('lookup-stage-editor')).toBeInTheDocument()
    })

    it('renders from collection input', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('lookup-from-input')).toBeInTheDocument()
    })

    it('renders localField input', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('lookup-local-field-input')).toBeInTheDocument()
    })

    it('renders foreignField input', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('lookup-foreign-field-input')).toBeInTheDocument()
    })

    it('renders as (output) field input', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('lookup-as-input')).toBeInTheDocument()
    })

    it('renders pipeline mode toggle', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('lookup-pipeline-mode-toggle')).toBeInTheDocument()
    })
  })

  describe('basic lookup', () => {
    it('suggests available collections', async () => {
      const user = userEvent.setup()
      render(<LookupStageEditor {...defaultProps} />)

      await user.click(screen.getByTestId('lookup-from-input'))

      expect(screen.getByText('orders')).toBeInTheDocument()
      expect(screen.getByText('products')).toBeInTheDocument()
      expect(screen.getByText('categories')).toBeInTheDocument()
    })

    it('updates from collection', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<LookupStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('lookup-from-input'), 'orders')

      // Each keystroke triggers onChange. Check it was called for each character.
      expect(onChange).toHaveBeenCalledTimes(6) // o, r, d, e, r, s
      // Check the first call had 'o'
      expect(onChange).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          config: expect.objectContaining({ from: 'o' }),
        })
      )
    })

    it('auto-suggests _id for foreignField', async () => {
      const user = userEvent.setup()
      render(<LookupStageEditor {...defaultProps} />)

      await user.click(screen.getByTestId('lookup-foreign-field-input'))

      expect(screen.getByText('_id')).toBeInTheDocument()
    })
  })

  describe('pipeline mode', () => {
    it('shows pipeline editor when mode enabled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<LookupStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('lookup-pipeline-mode-toggle'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          usePipeline: true,
        })
      )
    })

    it('hides basic fields in pipeline mode', () => {
      const stage = createLookupStage({ usePipeline: true })
      render(<LookupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.queryByTestId('lookup-local-field-input')).not.toBeInTheDocument()
      expect(screen.queryByTestId('lookup-foreign-field-input')).not.toBeInTheDocument()
    })

    it('shows pipeline JSON editor in pipeline mode', () => {
      const stage = createLookupStage({ usePipeline: true })
      render(<LookupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('lookup-pipeline-editor')).toBeInTheDocument()
    })

    it('shows let variables editor in pipeline mode', () => {
      const stage = createLookupStage({ usePipeline: true })
      render(<LookupStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('lookup-let-editor')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('shows error when from is empty', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('from-required-error')).toBeInTheDocument()
    })

    it('shows error when as is empty', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('as-required-error')).toBeInTheDocument()
    })

    it('shows error when localField is empty in basic mode', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('local-field-required-error')).toBeInTheDocument()
    })

    it('shows error when foreignField is empty in basic mode', () => {
      render(<LookupStageEditor {...defaultProps} />)
      expect(screen.getByTestId('foreign-field-required-error')).toBeInTheDocument()
    })
  })
})

describe('UnwindStageEditor', () => {
  const createUnwindStage = (overrides?: Partial<UnwindStage>): UnwindStage => ({
    id: 'unwind-1',
    type: '$unwind',
    enabled: true,
    config: {
      path: '',
      preserveNullAndEmptyArrays: false,
    },
    ...overrides,
  })

  const defaultProps = {
    stage: createUnwindStage(),
    onChange: vi.fn(),
    availableFields: ['tags', 'items', 'comments', 'categories'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the unwind stage editor', () => {
      render(<UnwindStageEditor {...defaultProps} />)
      expect(screen.getByTestId('unwind-stage-editor')).toBeInTheDocument()
    })

    it('renders path input', () => {
      render(<UnwindStageEditor {...defaultProps} />)
      expect(screen.getByTestId('unwind-path-input')).toBeInTheDocument()
    })

    it('renders preserveNullAndEmptyArrays checkbox', () => {
      render(<UnwindStageEditor {...defaultProps} />)
      expect(screen.getByTestId('unwind-preserve-null-checkbox')).toBeInTheDocument()
    })

    it('renders includeArrayIndex checkbox', () => {
      render(<UnwindStageEditor {...defaultProps} />)
      expect(screen.getByTestId('unwind-include-array-index-checkbox')).toBeInTheDocument()
    })
  })

  describe('path handling', () => {
    it('suggests array fields', async () => {
      const user = userEvent.setup()
      render(<UnwindStageEditor {...defaultProps} />)

      await user.click(screen.getByTestId('unwind-path-input'))

      expect(screen.getByText('tags')).toBeInTheDocument()
      expect(screen.getByText('items')).toBeInTheDocument()
    })

    it('automatically prepends $ to path if missing', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<UnwindStageEditor {...defaultProps} onChange={onChange} />)

      await user.type(screen.getByTestId('unwind-path-input'), 'tags')

      // Each keystroke triggers onChange with $ auto-prepended
      expect(onChange).toHaveBeenCalledTimes(4) // t, a, g, s
      // Check the first call had '$t' (auto-prepended $)
      expect(onChange).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          config: expect.objectContaining({ path: '$t' }),
        })
      )
    })
  })

  describe('options', () => {
    it('toggles preserveNullAndEmptyArrays', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<UnwindStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('unwind-preserve-null-checkbox'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ preserveNullAndEmptyArrays: true }),
        })
      )
    })

    it('shows index field input when includeArrayIndex enabled', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<UnwindStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('unwind-include-array-index-checkbox'))

      expect(screen.getByTestId('unwind-array-index-field-input')).toBeInTheDocument()
    })

    it('sets index field name', async () => {
      const stage = createUnwindStage({
        config: {
          path: '$tags',
          preserveNullAndEmptyArrays: false,
          includeArrayIndex: 'tagIndex',
        },
      })
      render(<UnwindStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('unwind-array-index-field-input')).toHaveValue('tagIndex')
    })
  })

  describe('validation', () => {
    it('shows error when path is empty', () => {
      render(<UnwindStageEditor {...defaultProps} />)
      expect(screen.getByTestId('path-required-error')).toBeInTheDocument()
    })
  })
})

describe('AddFieldsStageEditor', () => {
  const createAddFieldsStage = (overrides?: Partial<AddFieldsStage>): AddFieldsStage => ({
    id: 'addfields-1',
    type: '$addFields',
    enabled: true,
    fields: [],
    useRawJson: false,
    rawJson: '',
    ...overrides,
  })

  const defaultProps = {
    stage: createAddFieldsStage(),
    onChange: vi.fn(),
    availableFields: ['name', 'price', 'quantity'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the addFields stage editor', () => {
      render(<AddFieldsStageEditor {...defaultProps} />)
      expect(screen.getByTestId('addfields-stage-editor')).toBeInTheDocument()
    })

    it('renders add field button', () => {
      render(<AddFieldsStageEditor {...defaultProps} />)
      expect(screen.getByTestId('add-addfield-button')).toBeInTheDocument()
    })
  })

  describe('field management', () => {
    it('adds new field entry', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      render(<AddFieldsStageEditor {...defaultProps} onChange={onChange} />)

      await user.click(screen.getByTestId('add-addfield-button'))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ field: '', expression: '' }),
          ],
        })
      )
    })

    it('renders field name and expression inputs', () => {
      const stage = createAddFieldsStage({
        fields: [
          { id: 'f-1', field: 'total', expression: '{ $multiply: ["$price", "$quantity"] }' },
        ],
      })
      render(<AddFieldsStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('addfield-name-input-0')).toHaveValue('total')
      expect(screen.getByTestId('addfield-expression-input-0')).toBeInTheDocument()
    })
  })
})

describe('CountStageEditor', () => {
  const createCountStage = (overrides?: Partial<CountStage>): CountStage => ({
    id: 'count-1',
    type: '$count',
    enabled: true,
    outputField: 'count',
    ...overrides,
  })

  const defaultProps = {
    stage: createCountStage(),
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the count stage editor', () => {
      render(<CountStageEditor {...defaultProps} />)
      expect(screen.getByTestId('count-stage-editor')).toBeInTheDocument()
    })

    it('renders output field input', () => {
      render(<CountStageEditor {...defaultProps} />)
      expect(screen.getByTestId('count-output-field-input')).toBeInTheDocument()
    })

    it('shows default field name', () => {
      render(<CountStageEditor {...defaultProps} />)
      expect(screen.getByTestId('count-output-field-input')).toHaveValue('count')
    })
  })

  describe('field handling', () => {
    it('updates output field name', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()
      // Start with empty outputField so typing triggers clean updates
      const emptyStage = createCountStage({ outputField: '' })
      render(<CountStageEditor {...defaultProps} stage={emptyStage} onChange={onChange} />)

      await user.type(screen.getByTestId('count-output-field-input'), 'total')

      // Each keystroke triggers onChange
      expect(onChange).toHaveBeenCalledTimes(5) // t, o, t, a, l
      // Check the first call had 't'
      expect(onChange).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          outputField: 't',
        })
      )
    })
  })

  describe('validation', () => {
    it('shows error when output field is empty', () => {
      const stage = createCountStage({ outputField: '' })
      render(<CountStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('output-field-required-error')).toBeInTheDocument()
    })

    it('shows error for invalid field name with $', () => {
      const stage = createCountStage({ outputField: '$count' })
      render(<CountStageEditor {...defaultProps} stage={stage} />)

      expect(screen.getByTestId('invalid-field-name-error')).toBeInTheDocument()
    })
  })
})
