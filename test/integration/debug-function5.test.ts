import { describe, it, expect } from 'vitest'
import { createTestDatabase, runInMondoDatabase } from '../helpers/miniflare'

describe('Debug aggregate internal v2', () => {
  it('traces aggregate execution directly in DO', async () => {
    const db = await createTestDatabase()

    await db.insertOne('products', { name: 'Widget', price: 100 })

    // Try to run SQL directly through the DO
    // First let's test the raw SQL path

    const response = await db.fetch('/internal/dump', { method: 'GET' })
    const dump = await response.json() as any
    console.log('Dump:', JSON.stringify(dump, null, 2))

    // Now try aggregate
    const aggResponse = await db.fetch('/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        pipeline: [{ $match: {} }]
      })
    })
    
    console.log('Aggregate response status:', aggResponse.status)
    const text = await aggResponse.text()
    console.log('Aggregate response body:', text)
  })
})
