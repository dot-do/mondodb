import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'
import { AggregationExecutor } from '../../src/executor/aggregation-executor'

describe('Debug aggregate internal state', () => {
  it('replicates aggregate method exactly', async () => {
    const id = env.MONDO_DATABASE.idFromName('exact-debug-' + Math.random())
    const stub = env.MONDO_DATABASE.get(id)

    // Reset and insert
    await stub.fetch('http://test/internal/reset', { method: 'POST' })
    await stub.fetch('http://test/insertOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        document: { name: 'Widget', price: 100 }
      })
    })

    const result = await runInDurableObject(stub, async (instance: any, state: any) => {
      const sql = state.storage.sql
      const collection = 'products'
      const pipeline = [{ $match: {} }]

      console.log('=== Replicating aggregate method ===')

      // Step 1: getCollectionId
      const collResult = sql.exec(
        "SELECT id FROM collections WHERE name = ?",
        collection
      ).toArray() as { id: number }[]

      const collectionId = collResult.length > 0 ? collResult[0].id : undefined
      console.log('1. collectionId:', collectionId)

      if (collectionId === undefined) {
        console.log('Collection not found, returning []')
        return []
      }

      // Step 2: Create sqlInterface
      let sqlInterfaceCallCount = 0
      const sqlInterface = {
        exec: (query: string, ...params: unknown[]) => {
          sqlInterfaceCallCount++
          console.log(`2.${sqlInterfaceCallCount}. sqlInterface.exec called`)
          console.log('   query:', query)
          console.log('   params:', params)

          const modifiedQuery = query.replace(
            new RegExp(`FROM\\s+${collection}\\b`, 'gi'),
            `FROM documents WHERE collection_id = ${collectionId}`
          )
          console.log('   modifiedQuery:', modifiedQuery)

          const result = sql.exec(modifiedQuery, ...params)
          const array = result.toArray()
          console.log('   result array:', array)

          return {
            results: array,
            toArray: () => array
          }
        }
      }

      // Step 3: Create executor
      console.log('3. Creating AggregationExecutor with env:', (instance as any).env)
      const executor = new AggregationExecutor(sqlInterface, (instance as any).env)

      // Step 4: Execute
      console.log('4. Calling executor.execute with collection:', collection, 'pipeline:', pipeline)
      try {
        const executorResult = await executor.execute(collection, pipeline)
        console.log('5. executor.execute returned:', executorResult)
        return executorResult
      } catch (e) {
        console.log('5. executor.execute threw:', e)
        return []
      }
    })

    console.log('Final result:', result)
  })
})
