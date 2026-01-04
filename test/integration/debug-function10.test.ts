import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import { AggregationExecutor } from '../../src/executor/aggregation-executor'

describe('Debug aggregate wrapper inner logic', () => {
  it('replicates aggregate method logic', async () => {
    // Create a unique ID for this test
    const id = env.MONDO_DATABASE.idFromName('inner-debug-' + Math.random())
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

    // Now use runInDurableObject to replicate the aggregate logic
    const result = await runInDurableObject(stub, async (instance: any, state: any) => {
      const sql = state.storage.sql

      // Get collection ID
      const collResult = sql.exec(
        "SELECT id FROM collections WHERE name = ?",
        'products'
      ).toArray() as { id: number }[]

      console.log('Collection query result:', collResult)

      if (collResult.length === 0) {
        console.log('No collection found')
        return []
      }

      const collectionId = collResult[0].id
      console.log('Collection ID:', collectionId)

      // Create the SQL interface like in mondo-database.ts
      const sqlInterface = {
        exec: (query: string, ...params: unknown[]) => {
          console.log('sqlInterface.exec called with:')
          console.log('  query:', query)
          console.log('  params:', params)

          // The regex replacement
          const modifiedQuery = query.replace(
            new RegExp(`FROM\\s+products\\b`, 'gi'),
            `FROM documents WHERE collection_id = ${collectionId}`
          )
          console.log('  modifiedQuery:', modifiedQuery)

          const result = sql.exec(modifiedQuery, ...params)
          const array = result.toArray()
          console.log('  result:', array)

          return {
            results: array,
            toArray: () => array
          }
        }
      }

      // Create executor and run
      const executor = new AggregationExecutor(sqlInterface, {})
      console.log('About to execute...')
      const aggResult = await executor.execute('products', [{ $match: {} }])
      console.log('Executor returned:', aggResult)

      return aggResult
    })

    console.log('Final result:', result)
  })
})
