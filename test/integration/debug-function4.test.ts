import { describe, it, expect } from 'vitest'
import { createTestDatabase } from '../helpers/miniflare'

describe('Debug aggregate internal', () => {
  it('traces aggregate query execution', async () => {
    const db = await createTestDatabase()

    await db.insertOne('products', { name: 'Widget', price: 100 })

    // Look at what happens in aggregate
    // The query should be: SELECT data FROM products
    // It should become: SELECT data FROM documents WHERE collection_id = 1
    
    const testQuery = `SELECT data FROM products`
    const collectionId = 1
    const modifiedQuery = testQuery.replace(
      new RegExp(`FROM\\s+products\\b`, 'gi'),
      `FROM documents WHERE collection_id = ${collectionId}`
    )
    console.log('Original query:', testQuery)
    console.log('Modified query:', modifiedQuery)

    expect(modifiedQuery).toBe('SELECT data FROM documents WHERE collection_id = 1')
  })
})
