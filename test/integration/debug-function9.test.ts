import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'

describe('Debug aggregate wrapper', () => {
  it('traces wrapper execution', async () => {
    // Create a unique ID for this test
    const id = env.MONDO_DATABASE.idFromName('wrapper-debug-' + Math.random())
    const stub = env.MONDO_DATABASE.get(id)

    // Reset first
    await stub.fetch('http://test/internal/reset', { method: 'POST' })

    // Insert a document
    await stub.fetch('http://test/insertOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        document: { name: 'Widget', price: 100 }
      })
    })

    // Now use runInDurableObject to call aggregate directly and trace it
    const result = await runInDurableObject(stub, async (instance: any, state: any) => {
      // Call the aggregate method directly
      console.log('Calling aggregate directly...')

      // First verify the collection exists
      const sql = state.storage.sql
      const colls = sql.exec("SELECT * FROM collections WHERE name = 'products'").toArray()
      console.log('Collections found:', colls)

      const docs = sql.exec("SELECT * FROM documents").toArray()
      console.log('Documents found:', docs)

      // Now call aggregate
      const aggResult = await instance.aggregate('products', [{ $match: {} }])
      console.log('Aggregate result:', aggResult)

      return aggResult
    })

    console.log('Final result:', result)
  })
})
