/**
 * StageFactory Tests
 * TDD RED Phase - These tests should FAIL initially
 *
 * Tests for the StageFactory.create() utility that creates properly initialized
 * aggregation pipeline stages with default values and unique IDs.
 */

import { describe, it, expect } from 'vitest'
import { StageFactory } from '../StageFactory'
import type {
  StageType,
  MatchStage,
  GroupStage,
  ProjectStage,
  SortStage,
  LimitStage,
  SkipStage,
  UnwindStage,
  LookupStage,
  AddFieldsStage,
  CountStage,
} from '../../components/stage-editor/types'

describe('StageFactory', () => {
  describe('create()', () => {
    describe('$match stage', () => {
      it('should return a properly initialized MatchStage', () => {
        const stage = StageFactory.create('$match') as MatchStage

        expect(stage.type).toBe('$match')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.conditions).toEqual([])
        expect(stage.useRawJson).toBe(false)
        expect(stage.rawJson).toBe('')
      })

      it('should have default logicalOperator as undefined or $and', () => {
        const stage = StageFactory.create('$match') as MatchStage

        // logicalOperator should be undefined by default (or '$and' if explicitly set)
        expect(stage.logicalOperator === undefined || stage.logicalOperator === '$and').toBe(true)
      })
    })

    describe('$group stage', () => {
      it('should return a properly initialized GroupStage', () => {
        const stage = StageFactory.create('$group') as GroupStage

        expect(stage.type).toBe('$group')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.groupByField).toBe('')
        expect(stage.groupByExpression).toBe('')
        expect(stage.useCompoundKey).toBe(false)
        expect(stage.accumulators).toEqual([])
        expect(stage.useRawJson).toBe(false)
        expect(stage.rawJson).toBe('')
      })
    })

    describe('$project stage', () => {
      it('should return a properly initialized ProjectStage', () => {
        const stage = StageFactory.create('$project') as ProjectStage

        expect(stage.type).toBe('$project')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.fields).toEqual([])
        expect(stage.useRawJson).toBe(false)
        expect(stage.rawJson).toBe('')
      })

      it('should have excludeId as undefined or false', () => {
        const stage = StageFactory.create('$project') as ProjectStage

        // excludeId should be undefined by default (or false if explicitly set)
        expect(stage.excludeId === undefined || stage.excludeId === false).toBe(true)
      })
    })

    describe('$sort stage', () => {
      it('should return a properly initialized SortStage', () => {
        const stage = StageFactory.create('$sort') as SortStage

        expect(stage.type).toBe('$sort')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.fields).toEqual([])
      })
    })

    describe('$limit stage', () => {
      it('should return a properly initialized LimitStage', () => {
        const stage = StageFactory.create('$limit') as LimitStage

        expect(stage.type).toBe('$limit')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.limit).toBe(10)
      })
    })

    describe('$skip stage', () => {
      it('should return a properly initialized SkipStage', () => {
        const stage = StageFactory.create('$skip') as SkipStage

        expect(stage.type).toBe('$skip')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.skip).toBe(0)
      })
    })

    describe('$unwind stage', () => {
      it('should return a properly initialized UnwindStage', () => {
        const stage = StageFactory.create('$unwind') as UnwindStage

        expect(stage.type).toBe('$unwind')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.config).toBeDefined()
        expect(stage.config.path).toBe('')
        expect(stage.config.preserveNullAndEmptyArrays).toBe(false)
      })

      it('should have includeArrayIndex as undefined', () => {
        const stage = StageFactory.create('$unwind') as UnwindStage

        expect(stage.config.includeArrayIndex).toBeUndefined()
      })
    })

    describe('$lookup stage', () => {
      it('should return a properly initialized LookupStage', () => {
        const stage = StageFactory.create('$lookup') as LookupStage

        expect(stage.type).toBe('$lookup')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.config).toBeDefined()
        expect(stage.config.from).toBe('')
        expect(stage.config.localField).toBe('')
        expect(stage.config.foreignField).toBe('')
        expect(stage.config.as).toBe('')
        expect(stage.usePipeline).toBe(false)
        expect(stage.pipelineJson).toBe('')
      })

      it('should have letVariables as undefined', () => {
        const stage = StageFactory.create('$lookup') as LookupStage

        expect(stage.letVariables).toBeUndefined()
      })
    })

    describe('$addFields stage', () => {
      it('should return a properly initialized AddFieldsStage', () => {
        const stage = StageFactory.create('$addFields') as AddFieldsStage

        expect(stage.type).toBe('$addFields')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.fields).toEqual([])
        expect(stage.useRawJson).toBe(false)
        expect(stage.rawJson).toBe('')
      })
    })

    describe('$count stage', () => {
      it('should return a properly initialized CountStage', () => {
        const stage = StageFactory.create('$count') as CountStage

        expect(stage.type).toBe('$count')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
        expect(stage.outputField).toBe('count')
      })
    })

    describe('$vectorSearch stage', () => {
      it('should return a stage with type $vectorSearch', () => {
        const stage = StageFactory.create('$vectorSearch')

        expect(stage.type).toBe('$vectorSearch')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
      })

      it('should be a BaseStage with minimal properties', () => {
        const stage = StageFactory.create('$vectorSearch')

        // Since there's no specific VectorSearchStage interface,
        // it should at least have the base properties
        expect(stage).toHaveProperty('id')
        expect(stage).toHaveProperty('type')
        expect(stage).toHaveProperty('enabled')
      })
    })

    describe('$search stage', () => {
      it('should return a stage with type $search', () => {
        const stage = StageFactory.create('$search')

        expect(stage.type).toBe('$search')
        expect(stage.id).toBeDefined()
        expect(stage.enabled).toBe(true)
      })

      it('should be a BaseStage with minimal properties', () => {
        const stage = StageFactory.create('$search')

        // Since there's no specific SearchStage interface,
        // it should at least have the base properties
        expect(stage).toHaveProperty('id')
        expect(stage).toHaveProperty('type')
        expect(stage).toHaveProperty('enabled')
      })
    })

    describe('all supported stage types', () => {
      const supportedStageTypes: StageType[] = [
        '$match',
        '$group',
        '$project',
        '$sort',
        '$limit',
        '$skip',
        '$unwind',
        '$lookup',
        '$addFields',
        '$count',
        '$vectorSearch',
        '$search',
      ]

      it('should support all stage types from StageType union', () => {
        supportedStageTypes.forEach((stageType) => {
          const stage = StageFactory.create(stageType)

          expect(stage).toBeDefined()
          expect(stage.type).toBe(stageType)
        })
      })

      it('should create stages with enabled=true by default', () => {
        supportedStageTypes.forEach((stageType) => {
          const stage = StageFactory.create(stageType)

          expect(stage.enabled).toBe(true)
        })
      })
    })

    describe('unique IDs', () => {
      it('should generate unique IDs for each created stage', () => {
        const stage1 = StageFactory.create('$match')
        const stage2 = StageFactory.create('$match')
        const stage3 = StageFactory.create('$group')

        expect(stage1.id).not.toBe(stage2.id)
        expect(stage2.id).not.toBe(stage3.id)
        expect(stage1.id).not.toBe(stage3.id)
      })

      it('should generate IDs in a consistent format', () => {
        const stage = StageFactory.create('$match')

        // IDs should be non-empty strings
        expect(typeof stage.id).toBe('string')
        expect(stage.id.length).toBeGreaterThan(0)
      })

      it('should generate different IDs across multiple stages of different types', () => {
        const stages = [
          StageFactory.create('$match'),
          StageFactory.create('$group'),
          StageFactory.create('$project'),
          StageFactory.create('$sort'),
          StageFactory.create('$limit'),
        ]

        const ids = stages.map(s => s.id)
        const uniqueIds = new Set(ids)

        expect(uniqueIds.size).toBe(stages.length)
      })
    })

    describe('correct default values', () => {
      it('should initialize $match with empty conditions array', () => {
        const stage = StageFactory.create('$match') as MatchStage

        expect(Array.isArray(stage.conditions)).toBe(true)
        expect(stage.conditions.length).toBe(0)
      })

      it('should initialize $group with empty string for groupByField', () => {
        const stage = StageFactory.create('$group') as GroupStage

        expect(stage.groupByField).toBe('')
        expect(stage.groupByExpression).toBe('')
      })

      it('should initialize $sort with empty fields array', () => {
        const stage = StageFactory.create('$sort') as SortStage

        expect(Array.isArray(stage.fields)).toBe(true)
        expect(stage.fields.length).toBe(0)
      })

      it('should initialize $limit with sensible default value', () => {
        const stage = StageFactory.create('$limit') as LimitStage

        expect(stage.limit).toBeGreaterThan(0)
        expect(typeof stage.limit).toBe('number')
      })

      it('should initialize $skip with 0', () => {
        const stage = StageFactory.create('$skip') as SkipStage

        expect(stage.skip).toBe(0)
      })

      it('should initialize $unwind with empty path', () => {
        const stage = StageFactory.create('$unwind') as UnwindStage

        expect(stage.config.path).toBe('')
      })

      it('should initialize $lookup with empty config fields', () => {
        const stage = StageFactory.create('$lookup') as LookupStage

        expect(stage.config.from).toBe('')
        expect(stage.config.localField).toBe('')
        expect(stage.config.foreignField).toBe('')
        expect(stage.config.as).toBe('')
      })

      it('should initialize $addFields with empty fields array', () => {
        const stage = StageFactory.create('$addFields') as AddFieldsStage

        expect(Array.isArray(stage.fields)).toBe(true)
        expect(stage.fields.length).toBe(0)
      })

      it('should initialize $count with default outputField', () => {
        const stage = StageFactory.create('$count') as CountStage

        expect(stage.outputField).toBe('count')
      })

      it('should initialize useRawJson as false for stages that support it', () => {
        const matchStage = StageFactory.create('$match') as MatchStage
        const groupStage = StageFactory.create('$group') as GroupStage
        const projectStage = StageFactory.create('$project') as ProjectStage
        const addFieldsStage = StageFactory.create('$addFields') as AddFieldsStage

        expect(matchStage.useRawJson).toBe(false)
        expect(groupStage.useRawJson).toBe(false)
        expect(projectStage.useRawJson).toBe(false)
        expect(addFieldsStage.useRawJson).toBe(false)
      })

      it('should initialize rawJson as empty string for stages that support it', () => {
        const matchStage = StageFactory.create('$match') as MatchStage
        const groupStage = StageFactory.create('$group') as GroupStage
        const projectStage = StageFactory.create('$project') as ProjectStage
        const addFieldsStage = StageFactory.create('$addFields') as AddFieldsStage

        expect(matchStage.rawJson).toBe('')
        expect(groupStage.rawJson).toBe('')
        expect(projectStage.rawJson).toBe('')
        expect(addFieldsStage.rawJson).toBe('')
      })
    })

    describe('error handling', () => {
      it('should throw error for invalid stage type', () => {
        expect(() => {
          // @ts-expect-error - Testing invalid stage type
          StageFactory.create('$invalid')
        }).toThrow()
      })

      it('should throw descriptive error message for invalid stage type', () => {
        expect(() => {
          // @ts-expect-error - Testing invalid stage type
          StageFactory.create('$invalid')
        }).toThrow(/unsupported|invalid|unknown/i)
      })

      it('should throw error for null stage type', () => {
        expect(() => {
          // @ts-expect-error - Testing null stage type
          StageFactory.create(null)
        }).toThrow()
      })

      it('should throw error for undefined stage type', () => {
        expect(() => {
          // @ts-expect-error - Testing undefined stage type
          StageFactory.create(undefined)
        }).toThrow()
      })

      it('should throw error for empty string stage type', () => {
        expect(() => {
          // @ts-expect-error - Testing empty string stage type
          StageFactory.create('')
        }).toThrow()
      })

      it('should throw error for stage type without $ prefix', () => {
        expect(() => {
          // @ts-expect-error - Testing stage type without $ prefix
          StageFactory.create('match')
        }).toThrow()
      })
    })

    describe('type safety', () => {
      it('should return stages that match their respective type interfaces', () => {
        const matchStage = StageFactory.create('$match') as MatchStage
        const groupStage = StageFactory.create('$group') as GroupStage
        const projectStage = StageFactory.create('$project') as ProjectStage

        // These should not throw type errors
        expect(matchStage.conditions).toBeDefined()
        expect(groupStage.groupByField).toBeDefined()
        expect(projectStage.fields).toBeDefined()
      })

      it('should have all required BaseStage properties', () => {
        const stage = StageFactory.create('$match')

        expect(stage).toHaveProperty('id')
        expect(stage).toHaveProperty('type')
        expect(stage).toHaveProperty('enabled')
      })
    })

    describe('stage structure validation', () => {
      it('should create stages with no extraneous properties for simple stages', () => {
        const sortStage = StageFactory.create('$sort') as SortStage

        const expectedKeys = ['id', 'type', 'enabled', 'fields']
        const actualKeys = Object.keys(sortStage)

        expect(actualKeys.sort()).toEqual(expectedKeys.sort())
      })

      it('should create stages with nested config objects where appropriate', () => {
        const unwindStage = StageFactory.create('$unwind') as UnwindStage
        const lookupStage = StageFactory.create('$lookup') as LookupStage

        expect(typeof unwindStage.config).toBe('object')
        expect(unwindStage.config).not.toBeNull()

        expect(typeof lookupStage.config).toBe('object')
        expect(lookupStage.config).not.toBeNull()
      })
    })
  })
})
