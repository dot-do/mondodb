import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'
import { AggregationExecutor } from '../../src/executor/aggregation-executor'

describe('Debug AggregationExecutor directly', () => {
  it('tests executor with mock sql interface', async () => {
    // Create a mock SQL interface that returns test data
    const mockSqlInterface = {
      exec: (query: string, ...params: unknown[]) => {
        console.log('Executor called with query:', query)
        console.log('Executor called with params:', params)

        // Return mock data
        const results = [{
          data: '{"name":"Widget","price":100,"_id":"test123"}'
        }]

        return {
          results,
          toArray: () => results
        }
      }
    }

    const executor = new AggregationExecutor(mockSqlInterface, {})

    try {
      const results = await executor.execute('products', [{ $match: {} }])
      console.log('Executor results:', results)
    } catch (e) {
      console.log('Executor error:', e)
    }
  })

  it('tests translator output', () => {
    const translator = new AggregationTranslator('products')
    const result = translator.translate([{ $match: {} }])
    console.log('Translator SQL:', result.sql)
    console.log('Translator params:', result.params)
  })
})
