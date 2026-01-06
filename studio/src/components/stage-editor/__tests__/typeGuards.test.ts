/**
 * Type Guard Functions Tests
 *
 * RED Phase - Issue: mondodb-k9z0
 *
 * These tests verify the type guard functions for MongoDB aggregation pipeline stages.
 * Type guards are functions that return boolean and narrow TypeScript types.
 *
 * Each type guard should:
 * 1. Return true only for its corresponding stage type
 * 2. Return false for all other stage types
 * 3. Handle null/undefined gracefully (return false)
 * 4. Properly narrow the TypeScript type when used in conditionals
 */

import { describe, it, expect } from 'vitest'
import { expectTypeOf } from 'vitest'

// Import types from the types module
import type {
  AggregationStage,
  MatchStage,
  GroupStage,
  SortStage,
  ProjectStage,
  LimitStage,
  SkipStage,
  UnwindStage,
  LookupStage,
  AddFieldsStage,
  CountStage,
} from '../types'

// Import the type guard functions that don't exist yet (RED phase)
import {
  isMatchStage,
  isGroupStage,
  isSortStage,
  isProjectStage,
  isLimitStage,
  isSkipStage,
  isUnwindStage,
  isLookupStage,
  isAddFieldsStage,
  isCountStage,
} from '../typeGuards'

// ============================================================================
// Mock Stage Factories
// ============================================================================

const createMatchStage = (overrides?: Partial<MatchStage>): MatchStage => ({
  id: 'match-1',
  type: '$match',
  enabled: true,
  conditions: [],
  useRawJson: false,
  rawJson: '',
  ...overrides,
})

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

const createSortStage = (overrides?: Partial<SortStage>): SortStage => ({
  id: 'sort-1',
  type: '$sort',
  enabled: true,
  fields: [],
  ...overrides,
})

const createProjectStage = (overrides?: Partial<ProjectStage>): ProjectStage => ({
  id: 'project-1',
  type: '$project',
  enabled: true,
  fields: [],
  useRawJson: false,
  rawJson: '',
  ...overrides,
})

const createLimitStage = (overrides?: Partial<LimitStage>): LimitStage => ({
  id: 'limit-1',
  type: '$limit',
  enabled: true,
  limit: 10,
  ...overrides,
})

const createSkipStage = (overrides?: Partial<SkipStage>): SkipStage => ({
  id: 'skip-1',
  type: '$skip',
  enabled: true,
  skip: 0,
  ...overrides,
})

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

const createAddFieldsStage = (overrides?: Partial<AddFieldsStage>): AddFieldsStage => ({
  id: 'addfields-1',
  type: '$addFields',
  enabled: true,
  fields: [],
  useRawJson: false,
  rawJson: '',
  ...overrides,
})

const createCountStage = (overrides?: Partial<CountStage>): CountStage => ({
  id: 'count-1',
  type: '$count',
  enabled: true,
  outputField: 'count',
  ...overrides,
})

// Array of all stage types for cross-testing
const allStages: AggregationStage[] = [
  createMatchStage(),
  createGroupStage(),
  createSortStage(),
  createProjectStage(),
  createLimitStage(),
  createSkipStage(),
  createUnwindStage(),
  createLookupStage(),
  createAddFieldsStage(),
  createCountStage(),
]

// ============================================================================
// isMatchStage Tests
// ============================================================================

describe('isMatchStage', () => {
  describe('returns true for MatchStage', () => {
    it('returns true for a basic MatchStage', () => {
      const stage = createMatchStage()
      expect(isMatchStage(stage)).toBe(true)
    })

    it('returns true for MatchStage with conditions', () => {
      const stage = createMatchStage({
        conditions: [
          { id: 'cond-1', field: 'name', operator: '$eq', value: 'Alice' },
        ],
      })
      expect(isMatchStage(stage)).toBe(true)
    })

    it('returns true for MatchStage with rawJson enabled', () => {
      const stage = createMatchStage({
        useRawJson: true,
        rawJson: '{ "status": "active" }',
      })
      expect(isMatchStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for GroupStage', () => {
      const stage = createGroupStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for SortStage', () => {
      const stage = createSortStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      const stage = createProjectStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for LimitStage', () => {
      const stage = createLimitStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for SkipStage', () => {
      const stage = createSkipStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      const stage = createUnwindStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for LookupStage', () => {
      const stage = createLookupStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      const stage = createAddFieldsStage()
      expect(isMatchStage(stage)).toBe(false)
    })

    it('returns false for CountStage', () => {
      const stage = createCountStage()
      expect(isMatchStage(stage)).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isMatchStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isMatchStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createMatchStage()

      if (isMatchStage(stage)) {
        // TypeScript should know this is a MatchStage
        expectTypeOf(stage).toEqualTypeOf<MatchStage>()
        // Should be able to access MatchStage-specific properties
        expect(stage.conditions).toBeDefined()
        expect(stage.useRawJson).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isGroupStage Tests
// ============================================================================

describe('isGroupStage', () => {
  describe('returns true for GroupStage', () => {
    it('returns true for a basic GroupStage', () => {
      const stage = createGroupStage()
      expect(isGroupStage(stage)).toBe(true)
    })

    it('returns true for GroupStage with accumulators', () => {
      const stage = createGroupStage({
        groupByField: 'category',
        accumulators: [
          { id: 'acc-1', outputField: 'total', operator: '$sum', inputField: 'amount' },
        ],
      })
      expect(isGroupStage(stage)).toBe(true)
    })

    it('returns true for GroupStage with compound key', () => {
      const stage = createGroupStage({
        useCompoundKey: true,
        groupByExpression: '{ year: { $year: "$date" }, month: { $month: "$date" } }',
      })
      expect(isGroupStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      const stage = createMatchStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for SortStage', () => {
      const stage = createSortStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      const stage = createProjectStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for LimitStage', () => {
      const stage = createLimitStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for SkipStage', () => {
      const stage = createSkipStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      const stage = createUnwindStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for LookupStage', () => {
      const stage = createLookupStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      const stage = createAddFieldsStage()
      expect(isGroupStage(stage)).toBe(false)
    })

    it('returns false for CountStage', () => {
      const stage = createCountStage()
      expect(isGroupStage(stage)).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isGroupStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isGroupStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createGroupStage()

      if (isGroupStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<GroupStage>()
        expect(stage.accumulators).toBeDefined()
        expect(stage.groupByField).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isSortStage Tests
// ============================================================================

describe('isSortStage', () => {
  describe('returns true for SortStage', () => {
    it('returns true for a basic SortStage', () => {
      const stage = createSortStage()
      expect(isSortStage(stage)).toBe(true)
    })

    it('returns true for SortStage with fields', () => {
      const stage = createSortStage({
        fields: [
          { id: 'f-1', field: 'createdAt', direction: -1 },
          { id: 'f-2', field: 'name', direction: 1 },
        ],
      })
      expect(isSortStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isSortStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isSortStage(createGroupStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isSortStage(createProjectStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isSortStage(createLimitStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isSortStage(createSkipStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isSortStage(createUnwindStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isSortStage(createLookupStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isSortStage(createAddFieldsStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isSortStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isSortStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isSortStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createSortStage()

      if (isSortStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<SortStage>()
        expect(stage.fields).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isProjectStage Tests
// ============================================================================

describe('isProjectStage', () => {
  describe('returns true for ProjectStage', () => {
    it('returns true for a basic ProjectStage', () => {
      const stage = createProjectStage()
      expect(isProjectStage(stage)).toBe(true)
    })

    it('returns true for ProjectStage with fields', () => {
      const stage = createProjectStage({
        fields: [
          { id: 'f-1', field: 'name', include: true, isExpression: false },
          { id: 'f-2', field: 'email', include: true, isExpression: false },
        ],
        excludeId: true,
      })
      expect(isProjectStage(stage)).toBe(true)
    })

    it('returns true for ProjectStage with expression fields', () => {
      const stage = createProjectStage({
        fields: [
          { id: 'f-1', field: 'fullName', include: '{ $concat: ["$firstName", " ", "$lastName"] }', isExpression: true },
        ],
      })
      expect(isProjectStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isProjectStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isProjectStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isProjectStage(createSortStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isProjectStage(createLimitStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isProjectStage(createSkipStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isProjectStage(createUnwindStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isProjectStage(createLookupStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isProjectStage(createAddFieldsStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isProjectStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isProjectStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isProjectStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createProjectStage()

      if (isProjectStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<ProjectStage>()
        expect(stage.fields).toBeDefined()
        expect(stage.excludeId).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isLimitStage Tests
// ============================================================================

describe('isLimitStage', () => {
  describe('returns true for LimitStage', () => {
    it('returns true for a basic LimitStage', () => {
      const stage = createLimitStage()
      expect(isLimitStage(stage)).toBe(true)
    })

    it('returns true for LimitStage with custom limit', () => {
      const stage = createLimitStage({ limit: 100 })
      expect(isLimitStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isLimitStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isLimitStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isLimitStage(createSortStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isLimitStage(createProjectStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isLimitStage(createSkipStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isLimitStage(createUnwindStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isLimitStage(createLookupStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isLimitStage(createAddFieldsStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isLimitStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isLimitStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isLimitStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createLimitStage()

      if (isLimitStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<LimitStage>()
        expect(stage.limit).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isSkipStage Tests
// ============================================================================

describe('isSkipStage', () => {
  describe('returns true for SkipStage', () => {
    it('returns true for a basic SkipStage', () => {
      const stage = createSkipStage()
      expect(isSkipStage(stage)).toBe(true)
    })

    it('returns true for SkipStage with custom skip', () => {
      const stage = createSkipStage({ skip: 50 })
      expect(isSkipStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isSkipStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isSkipStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isSkipStage(createSortStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isSkipStage(createProjectStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isSkipStage(createLimitStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isSkipStage(createUnwindStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isSkipStage(createLookupStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isSkipStage(createAddFieldsStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isSkipStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isSkipStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isSkipStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createSkipStage()

      if (isSkipStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<SkipStage>()
        expect(stage.skip).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isUnwindStage Tests
// ============================================================================

describe('isUnwindStage', () => {
  describe('returns true for UnwindStage', () => {
    it('returns true for a basic UnwindStage', () => {
      const stage = createUnwindStage()
      expect(isUnwindStage(stage)).toBe(true)
    })

    it('returns true for UnwindStage with path', () => {
      const stage = createUnwindStage({
        config: {
          path: '$tags',
          preserveNullAndEmptyArrays: false,
        },
      })
      expect(isUnwindStage(stage)).toBe(true)
    })

    it('returns true for UnwindStage with all options', () => {
      const stage = createUnwindStage({
        config: {
          path: '$items',
          preserveNullAndEmptyArrays: true,
          includeArrayIndex: 'itemIndex',
        },
      })
      expect(isUnwindStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isUnwindStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isUnwindStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isUnwindStage(createSortStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isUnwindStage(createProjectStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isUnwindStage(createLimitStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isUnwindStage(createSkipStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isUnwindStage(createLookupStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isUnwindStage(createAddFieldsStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isUnwindStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isUnwindStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isUnwindStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createUnwindStage()

      if (isUnwindStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<UnwindStage>()
        expect(stage.config).toBeDefined()
        expect(stage.config.path).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isLookupStage Tests
// ============================================================================

describe('isLookupStage', () => {
  describe('returns true for LookupStage', () => {
    it('returns true for a basic LookupStage', () => {
      const stage = createLookupStage()
      expect(isLookupStage(stage)).toBe(true)
    })

    it('returns true for LookupStage with config', () => {
      const stage = createLookupStage({
        config: {
          from: 'orders',
          localField: 'userId',
          foreignField: '_id',
          as: 'userOrders',
        },
      })
      expect(isLookupStage(stage)).toBe(true)
    })

    it('returns true for LookupStage with pipeline mode', () => {
      const stage = createLookupStage({
        usePipeline: true,
        pipelineJson: '[{ "$match": { "status": "active" } }]',
        letVariables: '{ "userId": "$_id" }',
      })
      expect(isLookupStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isLookupStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isLookupStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isLookupStage(createSortStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isLookupStage(createProjectStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isLookupStage(createLimitStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isLookupStage(createSkipStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isLookupStage(createUnwindStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isLookupStage(createAddFieldsStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isLookupStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isLookupStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isLookupStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createLookupStage()

      if (isLookupStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<LookupStage>()
        expect(stage.config).toBeDefined()
        expect(stage.usePipeline).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isAddFieldsStage Tests
// ============================================================================

describe('isAddFieldsStage', () => {
  describe('returns true for AddFieldsStage', () => {
    it('returns true for a basic AddFieldsStage', () => {
      const stage = createAddFieldsStage()
      expect(isAddFieldsStage(stage)).toBe(true)
    })

    it('returns true for AddFieldsStage with fields', () => {
      const stage = createAddFieldsStage({
        fields: [
          { id: 'f-1', field: 'total', expression: '{ $multiply: ["$price", "$quantity"] }' },
          { id: 'f-2', field: 'fullName', expression: '{ $concat: ["$firstName", " ", "$lastName"] }' },
        ],
      })
      expect(isAddFieldsStage(stage)).toBe(true)
    })

    it('returns true for AddFieldsStage with rawJson', () => {
      const stage = createAddFieldsStage({
        useRawJson: true,
        rawJson: '{ "total": { "$multiply": ["$price", "$quantity"] } }',
      })
      expect(isAddFieldsStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isAddFieldsStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isAddFieldsStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isAddFieldsStage(createSortStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isAddFieldsStage(createProjectStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isAddFieldsStage(createLimitStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isAddFieldsStage(createSkipStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isAddFieldsStage(createUnwindStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isAddFieldsStage(createLookupStage())).toBe(false)
    })

    it('returns false for CountStage', () => {
      expect(isAddFieldsStage(createCountStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isAddFieldsStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isAddFieldsStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createAddFieldsStage()

      if (isAddFieldsStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<AddFieldsStage>()
        expect(stage.fields).toBeDefined()
        expect(stage.useRawJson).toBeDefined()
      }
    })
  })
})

// ============================================================================
// isCountStage Tests
// ============================================================================

describe('isCountStage', () => {
  describe('returns true for CountStage', () => {
    it('returns true for a basic CountStage', () => {
      const stage = createCountStage()
      expect(isCountStage(stage)).toBe(true)
    })

    it('returns true for CountStage with custom outputField', () => {
      const stage = createCountStage({ outputField: 'totalDocuments' })
      expect(isCountStage(stage)).toBe(true)
    })
  })

  describe('returns false for other stage types', () => {
    it('returns false for MatchStage', () => {
      expect(isCountStage(createMatchStage())).toBe(false)
    })

    it('returns false for GroupStage', () => {
      expect(isCountStage(createGroupStage())).toBe(false)
    })

    it('returns false for SortStage', () => {
      expect(isCountStage(createSortStage())).toBe(false)
    })

    it('returns false for ProjectStage', () => {
      expect(isCountStage(createProjectStage())).toBe(false)
    })

    it('returns false for LimitStage', () => {
      expect(isCountStage(createLimitStage())).toBe(false)
    })

    it('returns false for SkipStage', () => {
      expect(isCountStage(createSkipStage())).toBe(false)
    })

    it('returns false for UnwindStage', () => {
      expect(isCountStage(createUnwindStage())).toBe(false)
    })

    it('returns false for LookupStage', () => {
      expect(isCountStage(createLookupStage())).toBe(false)
    })

    it('returns false for AddFieldsStage', () => {
      expect(isCountStage(createAddFieldsStage())).toBe(false)
    })
  })

  describe('handles null/undefined gracefully', () => {
    it('returns false for null', () => {
      expect(isCountStage(null as unknown as AggregationStage)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isCountStage(undefined as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows the type correctly in conditional', () => {
      const stage: AggregationStage = createCountStage()

      if (isCountStage(stage)) {
        expectTypeOf(stage).toEqualTypeOf<CountStage>()
        expect(stage.outputField).toBeDefined()
      }
    })
  })
})

// ============================================================================
// Cross-Type Testing (Comprehensive)
// ============================================================================

describe('Type Guard Cross-Testing', () => {
  describe('each type guard returns true for exactly one stage type', () => {
    it('isMatchStage returns true only for MatchStage', () => {
      const results = allStages.map(stage => isMatchStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isMatchStage(allStages[0])).toBe(true) // MatchStage is first
    })

    it('isGroupStage returns true only for GroupStage', () => {
      const results = allStages.map(stage => isGroupStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isGroupStage(allStages[1])).toBe(true) // GroupStage is second
    })

    it('isSortStage returns true only for SortStage', () => {
      const results = allStages.map(stage => isSortStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isSortStage(allStages[2])).toBe(true) // SortStage is third
    })

    it('isProjectStage returns true only for ProjectStage', () => {
      const results = allStages.map(stage => isProjectStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isProjectStage(allStages[3])).toBe(true) // ProjectStage is fourth
    })

    it('isLimitStage returns true only for LimitStage', () => {
      const results = allStages.map(stage => isLimitStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isLimitStage(allStages[4])).toBe(true) // LimitStage is fifth
    })

    it('isSkipStage returns true only for SkipStage', () => {
      const results = allStages.map(stage => isSkipStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isSkipStage(allStages[5])).toBe(true) // SkipStage is sixth
    })

    it('isUnwindStage returns true only for UnwindStage', () => {
      const results = allStages.map(stage => isUnwindStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isUnwindStage(allStages[6])).toBe(true) // UnwindStage is seventh
    })

    it('isLookupStage returns true only for LookupStage', () => {
      const results = allStages.map(stage => isLookupStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isLookupStage(allStages[7])).toBe(true) // LookupStage is eighth
    })

    it('isAddFieldsStage returns true only for AddFieldsStage', () => {
      const results = allStages.map(stage => isAddFieldsStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isAddFieldsStage(allStages[8])).toBe(true) // AddFieldsStage is ninth
    })

    it('isCountStage returns true only for CountStage', () => {
      const results = allStages.map(stage => isCountStage(stage))
      expect(results.filter(r => r === true)).toHaveLength(1)
      expect(isCountStage(allStages[9])).toBe(true) // CountStage is tenth
    })
  })

  describe('each stage matches exactly one type guard', () => {
    const typeGuards = [
      isMatchStage,
      isGroupStage,
      isSortStage,
      isProjectStage,
      isLimitStage,
      isSkipStage,
      isUnwindStage,
      isLookupStage,
      isAddFieldsStage,
      isCountStage,
    ]

    it('MatchStage matches exactly one type guard', () => {
      const stage = createMatchStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('GroupStage matches exactly one type guard', () => {
      const stage = createGroupStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('SortStage matches exactly one type guard', () => {
      const stage = createSortStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('ProjectStage matches exactly one type guard', () => {
      const stage = createProjectStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('LimitStage matches exactly one type guard', () => {
      const stage = createLimitStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('SkipStage matches exactly one type guard', () => {
      const stage = createSkipStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('UnwindStage matches exactly one type guard', () => {
      const stage = createUnwindStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('LookupStage matches exactly one type guard', () => {
      const stage = createLookupStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('AddFieldsStage matches exactly one type guard', () => {
      const stage = createAddFieldsStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })

    it('CountStage matches exactly one type guard', () => {
      const stage = createCountStage()
      const matches = typeGuards.filter(guard => guard(stage))
      expect(matches).toHaveLength(1)
    })
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  describe('handles invalid objects gracefully', () => {
    it('all guards return false for empty object', () => {
      const emptyObj = {} as AggregationStage
      expect(isMatchStage(emptyObj)).toBe(false)
      expect(isGroupStage(emptyObj)).toBe(false)
      expect(isSortStage(emptyObj)).toBe(false)
      expect(isProjectStage(emptyObj)).toBe(false)
      expect(isLimitStage(emptyObj)).toBe(false)
      expect(isSkipStage(emptyObj)).toBe(false)
      expect(isUnwindStage(emptyObj)).toBe(false)
      expect(isLookupStage(emptyObj)).toBe(false)
      expect(isAddFieldsStage(emptyObj)).toBe(false)
      expect(isCountStage(emptyObj)).toBe(false)
    })

    it('all guards return false for object with wrong type value', () => {
      const wrongType = { id: 'test', type: '$invalid', enabled: true } as unknown as AggregationStage
      expect(isMatchStage(wrongType)).toBe(false)
      expect(isGroupStage(wrongType)).toBe(false)
      expect(isSortStage(wrongType)).toBe(false)
      expect(isProjectStage(wrongType)).toBe(false)
      expect(isLimitStage(wrongType)).toBe(false)
      expect(isSkipStage(wrongType)).toBe(false)
      expect(isUnwindStage(wrongType)).toBe(false)
      expect(isLookupStage(wrongType)).toBe(false)
      expect(isAddFieldsStage(wrongType)).toBe(false)
      expect(isCountStage(wrongType)).toBe(false)
    })

    it('all guards return false for primitive values', () => {
      expect(isMatchStage('string' as unknown as AggregationStage)).toBe(false)
      expect(isGroupStage(123 as unknown as AggregationStage)).toBe(false)
      expect(isSortStage(true as unknown as AggregationStage)).toBe(false)
      expect(isProjectStage([] as unknown as AggregationStage)).toBe(false)
    })
  })

  describe('handles stages with missing optional properties', () => {
    it('isMatchStage works with minimal MatchStage', () => {
      const minimalMatch: MatchStage = {
        id: 'test',
        type: '$match',
        enabled: true,
        conditions: [],
        useRawJson: false,
        rawJson: '',
      }
      expect(isMatchStage(minimalMatch)).toBe(true)
    })

    it('isProjectStage works with undefined excludeId', () => {
      const projectWithoutExcludeId: ProjectStage = {
        id: 'test',
        type: '$project',
        enabled: true,
        fields: [],
        useRawJson: false,
        rawJson: '',
        // excludeId is optional
      }
      expect(isProjectStage(projectWithoutExcludeId)).toBe(true)
    })

    it('isLookupStage works with undefined letVariables', () => {
      const lookupWithoutLet: LookupStage = {
        id: 'test',
        type: '$lookup',
        enabled: true,
        config: {
          from: 'collection',
          localField: 'field',
          foreignField: '_id',
          as: 'result',
        },
        usePipeline: false,
        pipelineJson: '',
        // letVariables is optional
      }
      expect(isLookupStage(lookupWithoutLet)).toBe(true)
    })
  })
})
