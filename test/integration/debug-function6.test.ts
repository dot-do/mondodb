import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import { createTestDatabase } from '../helpers/miniflare'

describe('Debug aggregate SQL execution', () => {
  it('runs SQL query directly in DO', async () => {
    const db = await createTestDatabase()

    await db.insertOne('products', { name: 'Widget', price: 100 })

    // Get access to the DO directly
    const id = env.MONDO_DATABASE.idFromName('debug-test-' + Math.random())
    const stub = env.MONDO_DATABASE.get(id)

    // Reset and insert
    await stub.fetch('http://test/internal/reset', { method: 'POST' })

    const insertRes = await stub.fetch('http://test/insertOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        document: { name: 'Widget', price: 100 }
      })
    })
    const insertResult = await insertRes.json()
    console.log('Insert:', insertResult)

    // Use runInDurableObject to access internal state
    await runInDurableObject(stub, async (instance: any, state: any) => {
      const sql = state.storage.sql

      // Check what tables exist
      const tables = sql.exec("SELECT name FROM sqlite_master WHERE type='table'").toArray()
      console.log('Tables:', tables)

      // Check documents
      const docs = sql.exec("SELECT * FROM documents").toArray()
      console.log('Documents:', docs)

      // Check collections
      const colls = sql.exec("SELECT * FROM collections").toArray()
      console.log('Collections:', colls)

      // Try the aggregate query directly
      if (colls.length > 0) {
        const collectionId = (colls[0] as any).id
        const query = "SELECT data FROM documents WHERE collection_id = " + collectionId
        console.log('Running query:', query)
        const results = sql.exec(query).toArray()
        console.log('Query results:', results)
      }
    })
  })
})
