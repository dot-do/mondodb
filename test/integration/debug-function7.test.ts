import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'

describe('Debug aggregate in same DO instance', () => {
  it('checks aggregate after insert in same instance', async () => {
    // Create a unique ID for this test
    const id = env.MONDO_DATABASE.idFromName('aggregate-debug-' + Math.random())
    const stub = env.MONDO_DATABASE.get(id)

    // Reset first
    await stub.fetch('http://test/internal/reset', { method: 'POST' })

    // Insert a document
    const insertRes = await stub.fetch('http://test/insertOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        document: { name: 'Widget', price: 100 }
      })
    })
    const insertResult = await insertRes.json()
    console.log('Insert result:', insertResult)

    // Now verify via findOne
    const findRes = await stub.fetch('http://test/findOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        filter: {}
      })
    })
    const findResult = await findRes.json()
    console.log('findOne result:', findResult)

    // Now try aggregate
    const aggRes = await stub.fetch('http://test/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        pipeline: [{ $match: {} }]
      })
    })
    console.log('Aggregate response status:', aggRes.status)
    const aggResult = await aggRes.text()
    console.log('Aggregate result:', aggResult)

    // Check the internal state
    await runInDurableObject(stub, async (instance: any, state: any) => {
      const sql = state.storage.sql

      const docs = sql.exec("SELECT * FROM documents").toArray()
      console.log('Documents in DB:', docs)

      const colls = sql.exec("SELECT * FROM collections").toArray()
      console.log('Collections in DB:', colls)

      if (colls.length > 0) {
        const collectionId = (colls[0] as any).id
        // Test the exact query that should be generated
        const query = "SELECT data FROM documents WHERE collection_id = " + collectionId
        console.log('Test query:', query)
        const results = sql.exec(query).toArray()
        console.log('Test query results:', results)
      }
    })
  })
})
