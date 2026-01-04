import { describe, it, expect } from 'vitest'
import { createTestDatabase, runInMondoDatabase } from '../helpers/miniflare'

describe('Debug $function v2', () => {
  it('checks SQL generation and data', async () => {
    const db = await createTestDatabase()

    // Insert a document
    const insertResult = await db.insertOne('products', { name: 'Widget', price: 100 })
    console.log('Insert result:', insertResult)

    // Fetch directly
    const doc = await db.findOne('products', {})
    console.log('Direct findOne:', doc)

    // Dump database
    const dumpResponse = await db.fetch('/internal/dump', { method: 'GET' })
    const dump = await dumpResponse.json()
    console.log('Database dump:', JSON.stringify(dump, null, 2))
  })
})
