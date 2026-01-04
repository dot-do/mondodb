import { describe, it, expect } from 'vitest'
import { createTestDatabase } from '../helpers/miniflare'

describe('Debug $function', () => {
  it('checks basic aggregate response', async () => {
    const db = await createTestDatabase()

    // Insert a document
    const insertResult = await db.insertOne('products', { name: 'Widget', price: 100 })
    console.log('Insert result:', insertResult)

    // Try a simple aggregate without $function
    const response1 = await db.fetch('/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        pipeline: [{ $match: {} }]
      })
    })

    const result1 = await response1.json()
    console.log('Simple aggregate result:', JSON.stringify(result1, null, 2))

    // Now try with $addFields (no $function)
    const response2 = await db.fetch('/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        pipeline: [
          {
            $addFields: {
              doubled: { $multiply: ['$price', 2] }
            }
          }
        ]
      })
    })

    const result2 = await response2.json()
    console.log('$addFields aggregate result:', JSON.stringify(result2, null, 2))

    // Now try with $function
    const response3 = await db.fetch('/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        pipeline: [
          {
            $addFields: {
              discounted: {
                $function: {
                  body: 'function(price) { return price * 0.9; }',
                  args: ['$price'],
                  lang: 'js'
                }
              }
            }
          }
        ]
      })
    })

    const result3 = await response3.json()
    console.log('$function aggregate result:', JSON.stringify(result3, null, 2))

    expect(true).toBe(true)
  })
})
