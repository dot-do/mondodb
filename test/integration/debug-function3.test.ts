import { describe, it, expect } from 'vitest'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'

describe('Debug SQL generation', () => {
  it('shows generated SQL for $match', () => {
    const translator = new AggregationTranslator('products')
    const result = translator.translate([{ $match: {} }])
    console.log('$match SQL:', result.sql)
    console.log('$match params:', result.params)
  })

  it('shows generated SQL for $addFields', () => {
    const translator = new AggregationTranslator('products')
    const result = translator.translate([
      {
        $addFields: {
          doubled: { $multiply: ['$price', 2] }
        }
      }
    ])
    console.log('$addFields SQL:', result.sql)
    console.log('$addFields params:', result.params)
  })

  it('shows generated SQL for $function', () => {
    const translator = new AggregationTranslator('products')
    const result = translator.translate([
      {
        $addFields: {
          discounted: {
            $function: {
              body: 'function(price) { return price * 0.9; }',
              args: ['$price'],
              lang: 'js' as const
            }
          }
        }
      }
    ])
    console.log('$function SQL:', result.sql)
    console.log('$function params:', result.params)
  })
})
