import { describe, it, expect } from 'vitest'
import { optimizePipeline } from '../../src/translator/stages/optimizer'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'

describe('Debug pipeline optimization', () => {
  it('shows what happens to empty $match', () => {
    const pipeline = [{ $match: {} }]
    console.log('Original pipeline:', pipeline)

    const optimized = optimizePipeline(pipeline)
    console.log('Optimized pipeline:', optimized)
    console.log('Optimized length:', optimized.length)
  })

  it('shows what happens with non-empty $match', () => {
    const pipeline = [{ $match: { name: 'Widget' } }]
    console.log('Original pipeline:', pipeline)

    const optimized = optimizePipeline(pipeline)
    console.log('Optimized pipeline:', optimized)
  })

  it('translator with empty $match', () => {
    const translator = new AggregationTranslator('products')

    try {
      const result = translator.translate([{ $match: {} }])
      console.log('Translator result:', result)
    } catch (e) {
      console.log('Translator error:', e)
    }
  })

  it('translator with $project only', () => {
    const translator = new AggregationTranslator('products')

    try {
      const result = translator.translate([
        {
          $project: {
            name: 1,
            price: 1
          }
        }
      ])
      console.log('$project translator result:', result)
    } catch (e) {
      console.log('$project translator error:', e)
    }
  })
})
