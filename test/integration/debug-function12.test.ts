import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'

describe('Debug getCollectionId in aggregate', () => {
  it('tests getCollectionId directly', async () => {
    // Create a unique ID for this test
    const id = env.MONDO_DATABASE.idFromName('collid-debug-' + Math.random())
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

    // Now use runInDurableObject
    const result = await runInDurableObject(stub, async (instance: any, state: any) => {
      const sql = state.storage.sql

      // Check collections table
      const colls = sql.exec("SELECT * FROM collections").toArray()
      console.log('Collections:', colls)

      // Check documents table
      const docs = sql.exec("SELECT * FROM documents").toArray()
      console.log('Documents:', docs)

      // Try to access the private getCollectionId method
      // In JS we can access private methods
      const getCollectionId = (instance as any).getCollectionId
      console.log('getCollectionId method:', typeof getCollectionId)

      if (getCollectionId) {
        // Call it with proper `this` binding
        const collId = getCollectionId.call(instance, 'products')
        console.log('getCollectionId("products"):', collId)
      }

      // Let's also manually call what aggregate does
      const collResult = sql.exec(
        "SELECT id FROM collections WHERE name = ?",
        'products'
      ).toArray() as { id: number }[]
      console.log('Manual collection lookup:', collResult)

      // Try findOne to verify it works
      const findResult = await instance.findOne('products', {})
      console.log('findOne result:', findResult)

      // Now try aggregate
      const aggResult = await instance.aggregate('products', [{ $match: {} }])
      console.log('Aggregate result:', aggResult)

      return { findResult, aggResult }
    })

    console.log('Final result:', result)
  })
})
