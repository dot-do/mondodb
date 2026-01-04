import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'
import { AggregationExecutor } from '../../src/executor/aggregation-executor'

describe('Debug aggregate method step by step', () => {
  it('traces every step', async () => {
    // Create a unique ID for this test
    const id = env.MONDO_DATABASE.idFromName('step-debug-' + Math.random())
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

    // Now use runInDurableObject to call the instance's aggregate method
    // and also trace what happens when we access state.storage.sql
    const result = await runInDurableObject(stub, async (instance: any, state: any) => {
      console.log('instance:', typeof instance)
      console.log('instance.aggregate:', typeof instance.aggregate)

      // Access state.storage.sql like the instance would
      console.log('state.storage:', typeof state.storage)
      console.log('state.storage.sql:', typeof state.storage.sql)

      // Check if instance has its own state
      console.log('instance.state:', typeof (instance as any).state)
      console.log('instance.state.storage:', typeof (instance as any).state?.storage)
      console.log('instance.state.storage.sql:', typeof (instance as any).state?.storage?.sql)

      // Are they the same object?
      const sameStorage = state.storage === (instance as any).state?.storage
      const sameSql = state.storage.sql === (instance as any).state?.storage?.sql
      console.log('Same storage object?', sameStorage)
      console.log('Same sql object?', sameSql)

      // Test instance storage directly
      if ((instance as any).state?.storage?.sql) {
        const instanceSql = (instance as any).state.storage.sql
        const docs = instanceSql.exec('SELECT * FROM documents').toArray()
        console.log('Documents via instance storage:', docs)
      }

      // Test runInDurableObject state directly
      const stateDocs = state.storage.sql.exec('SELECT * FROM documents').toArray()
      console.log('Documents via state storage:', stateDocs)

      // Now call aggregate
      console.log('Calling instance.aggregate...')
      const aggResult = await instance.aggregate('products', [{ $match: {} }])
      console.log('Aggregate result:', aggResult)

      return aggResult
    })

    console.log('Final result:', result)
  })
})
