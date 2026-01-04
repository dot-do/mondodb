import { describe, it, expect } from 'vitest'
import { optimizePipeline } from '../../src/translator/stages/optimizer'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'
import { AggregationExecutor } from '../../src/executor/aggregation-executor'

describe('Debug executor with empty optimized pipeline', () => {
  it('tests executor with empty pipeline after optimization', async () => {
    // What happens when we pass an empty pipeline to the translator?
    const pipeline = [{ $match: {} }]
    console.log('Original pipeline:', pipeline)

    // The executor calls translator.translate which internally optimizes
    const translator = new AggregationTranslator('products')

    try {
      const result = translator.translate(pipeline)
      console.log('Translator SQL:', result.sql)
    } catch (e) {
      console.log('Translator error:', e)
    }

    // Now let's trace what the executor does
    const mockSqlInterface = {
      exec: (query: string, ...params: unknown[]) => {
        console.log('SQL Interface exec called with:', query, params)
        return {
          results: [{ data: '{"name":"Widget","price":100}' }],
          toArray: () => [{ data: '{"name":"Widget","price":100}' }]
        }
      }
    }

    const executor = new AggregationExecutor(mockSqlInterface, {})

    try {
      const result = await executor.execute('products', pipeline)
      console.log('Executor result:', result)
    } catch (e) {
      console.log('Executor error:', e)
    }
  })

  it('tests empty optimized pipeline directly', () => {
    // The internal optimizer
    const emptyPipeline: any[] = []
    const translator = new AggregationTranslator('products', { optimize: false })

    try {
      const result = translator.translate(emptyPipeline)
      console.log('Empty pipeline result:', result)
    } catch (e) {
      console.log('Empty pipeline error:', (e as Error).message)
    }
  })
})
